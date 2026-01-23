import { Request, Response } from "express";
import { CapturedImage } from "../models/capturedImage.model";
import { CameraMapping } from "../models/cameraMapping.model";
import { getSocketService } from "../services/socket.service";
import { localStorageService } from "../services/localStorage.service";
import { s3Service } from "../services/s3.service";

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

      // Get mapped screens for this camera to determine screen count
      const mapping = await CameraMapping.findOne({ cameraId });
      const screenCount = mapping ? mapping.screenIds.length : 0;

      // Create folder structure: HH:MM:SS_DD/MM/YYYY/cameraId
      const date = new Date(timestampNum);
      const timeFolder = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      const folderName = `${timeFolder}/${cameraId}`;

      // ALWAYS save to local storage with new folder structure
      const { relativePath } = await localStorageService.saveImageWithFolder(
        imageData,
        folderName,
        screenCount,
        timestampNum
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
            screenCount,
            timestampNum
          );

          if (s3Result) {
            s3Url = s3Result.s3Url;
            s3Key = s3Result.s3Key;
            finalStorageType = 's3';
            console.log(`✅ Image saved to both S3 and local storage`);
          } else {
            console.log(`⚠️ S3 upload failed, using local storage only`);
          }
        } catch (s3Error) {
          console.error('S3 upload error:', s3Error);
          console.log(`⚠️ S3 upload failed, using local storage only`);
        }
      } else {
        console.log(`ℹ️ S3 not configured, using local storage only`);
      }

      // Save metadata to MongoDB
      const image = await CapturedImage.create({
        imageId,
        cameraId,
        cameraLabel,
        s3Url,
        s3Key,
        localUrl,
        storageType: finalStorageType,
        timestamp: new Date(timestampNum),
      });

      if (mapping && mapping.screenIds.length > 0) {
        // Emit image to mapped screens via socket (prefer S3 URL if available)
        const socketService = getSocketService();
        socketService.emitImageToScreens(mapping.screenIds, {
          imageId,
          cameraId,
          cameraLabel,
          imageUrl: s3Url || localUrl,
          storageType: finalStorageType,
          timestamp: timestampNum,
        });
      }

      res.status(201).json(image);
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
}

export const imageController = new ImageController();
