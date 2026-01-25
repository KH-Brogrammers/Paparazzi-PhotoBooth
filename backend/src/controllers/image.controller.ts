import { Request, Response } from "express";
import { CapturedImage } from "../models/capturedImage.model";
import { CameraMapping } from "../models/cameraMapping.model";
import { Screen } from "../models/screen.model";
import { getSocketService } from "../services/socket.service";
import { localStorageService } from "../services/localStorage.service";
import { s3Service } from "../services/s3.service";
import { collageService } from "../services/collage.service";
import QRCode from 'qrcode';

export class ImageController {
  // Save captured image with both S3 and local storage
  async saveImage(req: Request, res: Response): Promise<void> {
    try {
      const {
        imageId,
        cameraId,
        cameraLabel,
        imageData,
        timestamp,
      } = req.body;

      if (!imageId || !cameraId || !cameraLabel || !imageData || !timestamp) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "imageId, cameraId, cameraLabel, imageData, and timestamp are required",
        });
        return;
      }

      const timestampNum = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;

      // Get mapped screens for this camera
      const mapping = await CameraMapping.findOne({ cameraId });
      if (!mapping || mapping.screenIds.length === 0) {
        res.status(400).json({
          error: "NO_SCREENS_MAPPED",
          message: "No screens mapped to this camera",
        });
        return;
      }

      // Filter to only connected screens
      const socketService = getSocketService();
      const connectedScreenIds = socketService.getConnectedScreens();
      const activeScreenIds = mapping.screenIds.filter(screenId => 
        connectedScreenIds.includes(screenId)
      );

      if (activeScreenIds.length === 0) {
        res.status(400).json({
          error: "NO_ACTIVE_SCREENS",
          message: "No connected screens mapped to this camera",
        });
        return;
      }

      // Create folder structure: HH:MM:SS_DD/MM/YYYY/cameraId
      const date = new Date(timestampNum);
      const timeFolder = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      const folderName = `${timeFolder}/${cameraId}`;

      const savedImages: any[] = [];

      // Save one image per connected mapped screen
      for (let i = 0; i < activeScreenIds.length; i++) {
        const screenNumber = i + 1;
        const screenId = activeScreenIds[i];
        const screenImageId = `${imageId}_screen_${screenNumber}`;

        // Get screen data to determine orientation
        const screen = await Screen.findOne({ screenId });
        let screenOrientation = '';
        let screenResolution: { width: number; height: number } | undefined;
        
        if (screen?.resolution?.width && screen?.resolution?.height) {
          screenOrientation = screen.resolution.width >= screen.resolution.height ? 'landscape' : 'portrait';
          screenResolution = {
            width: screen.resolution.width,
            height: screen.resolution.height
          };
        }

        // ALWAYS save to local storage with new folder structure
        const { relativePath } = await localStorageService.saveImageWithFolder(
          imageData,
          folderName,
          screenNumber,
          timestampNum,
          screenOrientation,
          screenResolution
        );

        const localUrl = `${process.env.BACKEND_URL || 'http://localhost:8800'}/api/images/local/${relativePath}`;

        let s3Url: string | undefined;
        let s3Key: string | undefined;
        let finalStorageType: 's3' | 'local' = 'local';

        // Try to upload to S3 with new folder structure
        if (s3Service.isConfigured()) {
          try {
            const s3Result = await localStorageService.uploadToS3WithFolder(
              imageData,
              folderName,
              screenNumber,
              timestampNum,
              screenOrientation,
              screenResolution
            );

            if (s3Result) {
              s3Url = s3Result.s3Url;
              s3Key = s3Result.s3Key;
              finalStorageType = 's3';
            }
          } catch (s3Error) {
            console.error('S3 upload error:', s3Error);
          }
        }

        // Save metadata to MongoDB for each screen image
        const image = await CapturedImage.create({
          imageId: screenImageId,
          cameraId,
          cameraLabel,
          s3Url,
          s3Key,
          localUrl,
          storageType: finalStorageType,
          timestamp: new Date(timestampNum),
        });

        savedImages.push(image);
      }

      // Generate QR Code for download
      let qrCodeDataUrl: string | undefined;
      try {
        // Create session ID from timestamp for download
        const sessionId = `${timestampNum}-${timeFolder.replace(/[/:]/g, '-')}`;
        
        // Create download URL using the frontend URL
        const frontendUrl = 'https://8d2mn5x3-5173.inc1.devtunnels.ms';
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8800';
        const downloadUrl = `${backendUrl}/api/download/${sessionId}`;

        // Generate QR code
        qrCodeDataUrl = await QRCode.toDataURL(downloadUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        console.log('✅ QR Code generated for session:', sessionId);
        console.log('🔗 Download URL:', downloadUrl);
      } catch (qrError) {
        console.error('Error generating QR code:', qrError);
      }

      // Emit image to connected mapped screens via socket
      activeScreenIds.forEach((screenId, index) => {
        const screenImage = savedImages[index];
        socketService.emitImageToScreens([screenId], {
          imageId: screenImage.imageId,
          cameraId,
          cameraLabel,
          imageUrl: screenImage.s3Url || screenImage.localUrl,
          storageType: screenImage.storageType,
          timestamp: timestampNum,
          qrCode: qrCodeDataUrl, // Include QR code in the emission
        });
      });

      // Also emit QR code to all camera screens (primary and secondary)
      if (qrCodeDataUrl) {
        socketService.emitToAllCameras({
          type: 'qr_code_generated',
          qrCode: qrCodeDataUrl,
          sessionFolder: timeFolder,
          timestamp: timestampNum,
        });
      }

      console.log(`✅ Saved ${savedImages.length} images for ${activeScreenIds.length} connected screens`);

      // Generate collage after saving all images
      try {
        const collageResult = await collageService.generateCollageWithS3Upload(folderName);
        console.log(`🎨 Collage generated for folder: ${folderName}`);
        if (collageResult.s3Urls && collageResult.s3Urls.length > 0) {
          console.log(`☁️ Collages uploaded to S3`);
        }
      } catch (collageError) {
        console.error('Error generating collage:', collageError);
        // Don't fail the request if collage generation fails
      }

      res.status(201).json({
        message: `Successfully saved ${savedImages.length} images`,
        images: savedImages,
        screenCount: activeScreenIds.length,
        qrCode: qrCodeDataUrl,
        sessionFolder: timeFolder
      });
    } catch (error) {
      console.error("Error saving image:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to save image",
      });
    }
  }

  // Get all images
  async getAllImages(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId, limit = 50 } = req.query;

      const query = cameraId ? { cameraId } : {};
      const images = await CapturedImage.find(query)
        .sort({ timestamp: -1 })
        .limit(Number(limit));

      res.status(200).json(images);
    } catch (error) {
      console.error("Error fetching images:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch images",
      });
    }
  }

  // Get image by ID
  async getImageById(req: Request, res: Response): Promise<void> {
    try {
      const { imageId } = req.params;

      const image = await CapturedImage.findOne({ imageId });

      if (!image) {
        res.status(404).json({
          error: "NOT_FOUND",
          message: "Image not found",
        });
        return;
      }

      res.status(200).json(image);
    } catch (error) {
      console.error("Error fetching image:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch image",
      });
    }
  }

  // Delete image
  async deleteImage(req: Request, res: Response): Promise<void> {
    try {
      const { imageId } = req.params;

      const image = await CapturedImage.findOneAndDelete({ imageId });

      if (!image) {
        res.status(404).json({
          error: "NOT_FOUND",
          message: "Image not found",
        });
        return;
      }

      res.status(200).json({ message: "Image deleted successfully" });
    } catch (error) {
      console.error("Error deleting image:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete image",
      });
    }
  }

  // Get capture counts per camera
  async getCaptureCounts(req: Request, res: Response): Promise<void> {
    try {
      const counts = await CapturedImage.aggregate([
        {
          $group: {
            _id: '$cameraId',
            count: { $sum: 1 }
          }
        }
      ]);

      const countsMap: Record<string, number> = {};
      counts.forEach((item) => {
        countsMap[item._id] = item.count;
      });

      res.status(200).json({ counts: countsMap });
    } catch (error) {
      console.error('Error fetching capture counts:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch capture counts',
      });
    }
  }

  // Serve local image file
  async serveLocalImage(req: Request, res: Response): Promise<void> {
    try {
      const { timeFolder, cameraId, filename } = req.params;
      const relativePath = `${timeFolder}/${cameraId}/${filename}`;

      if (!localStorageService.imageExists(relativePath)) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Image not found',
        });
        return;
      }

      const imagePath = localStorageService.getImagePath(relativePath);
      res.sendFile(imagePath);
    } catch (error) {
      console.error('Error serving local image:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to serve image',
      });
    }
  }

  // Serve collage image
  async serveCollage(req: Request, res: Response): Promise<void> {
    try {
      const { folderPath } = req.params;
      const { orientation = 'landscape' } = req.query;
      const decodedFolderPath = decodeURIComponent(folderPath);
      const targetOrientation = orientation as 'landscape' | 'portrait';

      // Check if collage exists
      if (!collageService.collageExists(decodedFolderPath, targetOrientation)) {
        // Try to generate collage if it doesn't exist
        try {
          await collageService.generateCollage(decodedFolderPath);
        } catch (generateError) {
          res.status(404).json({
            error: 'NOT_FOUND',
            message: 'Collage not found and could not be generated',
          });
          return;
        }
      }

      const collagePath = collageService.getCollagePath(decodedFolderPath, targetOrientation);
      res.sendFile(collagePath);
    } catch (error) {
      console.error('Error serving collage:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to serve collage',
      });
    }
  }

  // Generate missing collages for all folders
  async generateMissingCollages(req: Request, res: Response): Promise<void> {
    try {
      await collageService.generateMissingCollages();
      res.status(200).json({
        message: 'Missing collages generation completed',
      });
    } catch (error) {
      console.error('Error generating missing collages:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate missing collages',
      });
    }
  }
}

export const imageController = new ImageController();
