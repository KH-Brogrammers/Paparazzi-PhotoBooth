import { Request, Response } from "express";
import { CapturedImage } from "../models/capturedImage.model";
import { CameraMapping } from "../models/cameraMapping.model";
import { Screen } from "../models/screen.model";
import { getSocketService } from "../services/socket.service";
import { localStorageService } from "../services/localStorage.service";
import { s3Service } from "../services/s3.service";
import { collageService } from "../services/collage.service";
import { SessionService } from "../services/session.service";
import QRCode from "qrcode";
import * as fs from "fs";
import * as path from "path";

export class ImageController {
  // Get or create group session
  private getGroupSession(groupId: string): {
    timestamp: number;
    folder: string;
  } {
    return SessionService.getGroupSession(groupId);
  }

  // Save captured image with both S3 and local storage
  async saveImage(req: Request, res: Response): Promise<void> {
    try {
      const {
        imageId,
        cameraId,
        cameraLabel,
        imageData,
        timestamp, // This will be ignored - we use group session timestamp
      } = req.body;

      if (!imageId || !cameraId || !cameraLabel || !imageData) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "imageId, cameraId, cameraLabel, and imageData are required",
        });
        return;
      }

      // Get mapped screens for this camera
      const mapping = await CameraMapping.findOne({ cameraId });
      if (!mapping || mapping.screenIds.length === 0) {
        res.status(400).json({
          error: "NO_SCREENS_MAPPED",
          message: "No screens mapped to this camera",
        });
        return;
      }

      const groupId = mapping.groupId || "Group 1";

      // ALWAYS use group session (no fallback to original timestamp)
      const session = this.getGroupSession(groupId);
      const timestampNum = session.timestamp;
      const timeFolder = session.folder;
      const folderName = `${timeFolder}/${cameraId}`;

      console.log(`📁 Using group session for ${cameraId}: ${timeFolder}`);

      // Filter to only connected screens and exclude collage screens
      const socketService = getSocketService();
      const connectedScreenIds = socketService.getConnectedScreens();

      // Get all collage screens to exclude them from regular image distribution
      const collageScreens = await Screen.find({ isCollageScreen: true });
      const collageScreenIds = collageScreens.map((screen) => screen.screenId);

      const activeScreenIds = mapping.screenIds.filter(
        (screenId) =>
          connectedScreenIds.includes(screenId) &&
          !collageScreenIds.includes(screenId),
      );

      if (activeScreenIds.length === 0) {
        res.status(400).json({
          error: "NO_ACTIVE_SCREENS",
          message: "No connected screens mapped to this camera",
        });
        return;
      }

      const savedImages: any[] = [];

      // Save one image per connected mapped screen
      for (let i = 0; i < activeScreenIds.length; i++) {
        const screenNumber = i; // 0-based indexing
        const screenId = activeScreenIds[i];
        const screenImageId = `${imageId}_screen_${screenNumber}`;

        // Get screen data to determine orientation
        const screen = await Screen.findOne({ screenId });
        let screenOrientation = "";
        let screenResolution: { width: number; height: number } | undefined;

        if (screen?.resolution?.width && screen?.resolution?.height) {
          screenOrientation =
            screen.resolution.width >= screen.resolution.height
              ? "landscape"
              : "portrait";
          screenResolution = {
            width: screen.resolution.width,
            height: screen.resolution.height,
          };
        }

        // ALWAYS save to local storage with new folder structure
        const { relativePath } = await localStorageService.saveImageWithFolder(
          imageData,
          folderName,
          screenNumber,
          timestampNum,
          screenOrientation,
          screenResolution,
        );

        const localUrl = `${process.env.BACKEND_URL || "http://localhost:8800"}/api/images/local/${relativePath}`;

        let s3Url: string | undefined;
        let s3Key: string | undefined;
        let finalStorageType: "s3" | "local" = "local";

        // Try to upload to S3 with new folder structure
        if (s3Service.isConfigured()) {
          try {
            const s3Result = await localStorageService.uploadToS3WithFolder(
              imageData,
              folderName,
              screenNumber,
              timestampNum,
              screenOrientation,
              screenResolution,
            );

            if (s3Result) {
              s3Url = s3Result.s3Url;
              s3Key = s3Result.s3Key;
              finalStorageType = "s3";
            }
          } catch (s3Error) {
            console.error("S3 upload error:", s3Error);
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
        const sessionId = `${timestampNum}-${timeFolder.replace(/[/:]/g, "-")}`;

        // Create download URL using the frontend URL
        // const frontendUrl = 'https://8d2mn5x3-5173.inc1.devtunnels.ms';
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8800";
        const downloadUrl = `${backendUrl}/api/download/${sessionId}`;

        // Generate QR code
        qrCodeDataUrl = await QRCode.toDataURL(downloadUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        });

        console.log("✅ QR Code generated for session:", sessionId);
        console.log("🔗 Download URL:", downloadUrl);
      } catch (qrError) {
        console.error("Error generating QR code:", qrError);
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
          type: "qr_code_generated",
          qrCode: qrCodeDataUrl,
          sessionFolder: timeFolder,
          timestamp: timestampNum,
        });
      }

      console.log(
        `✅ Saved ${savedImages.length} images for ${activeScreenIds.length} connected screens`,
      );

      // Generate collage after saving all images - use group-based approach
      try {
        await this.generateGroupCollage(groupId, timeFolder, timestampNum);
      } catch (collageError) {
        console.error("Error generating group collage:", collageError);
        // Don't fail the request if collage generation fails
      }

      res.status(201).json({
        message: `Successfully saved ${savedImages.length} images`,
        images: savedImages,
        screenCount: activeScreenIds.length,
        qrCode: qrCodeDataUrl,
        sessionFolder: timeFolder,
      });
    } catch (error) {
      console.error("Error saving image:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to save image",
      });
    }
  }

  // Generate group-based collage - only after ALL cameras finish storing photos
  private async generateGroupCollage(
    groupId: string,
    timeFolder: string,
    timestampNum: number,
  ): Promise<void> {
    // Wait for all cameras to finish, then check multiple times
    const checkAndGenerate = async (attempt: number = 1): Promise<void> => {
      try {
        // Get all cameras in this group
        const groupCameras = await CameraMapping.find({ groupId });
        const groupCameraIds = groupCameras.map((cam) => cam.cameraId);

        console.log(
          `🎯 Checking group ${groupId} with ${groupCameraIds.length} cameras (attempt ${attempt})`,
        );

        const basePath = localStorageService.getBasePath();
        const groupFolderPath = path.join(basePath, timeFolder);

        if (!fs.existsSync(groupFolderPath)) {
          console.log(`⏳ Group folder not ready yet: ${timeFolder}`);
          if (attempt < 3) {
            setTimeout(() => checkAndGenerate(attempt + 1), 2000);
          }
          return;
        }

        // Check which cameras have saved images
        const availableCameras = fs
          .readdirSync(groupFolderPath)
          .filter((item) =>
            fs.statSync(path.join(groupFolderPath, item)).isDirectory(),
          )
          .filter((cameraId) => groupCameraIds.includes(cameraId));

        // Count total images from all available cameras
        let totalImages = 0;
        for (const cameraId of availableCameras) {
          const cameraPath = path.join(groupFolderPath, cameraId);
          if (fs.existsSync(cameraPath)) {
            const imageFiles = fs.readdirSync(cameraPath).filter(file => 
              file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
            );
            totalImages += imageFiles.length;
          }
        }

        console.log(
          `📸 Found ${availableCameras.length}/${groupCameraIds.length} cameras with ${totalImages} total images in ${timeFolder}`,
        );

        // Only generate collage if we have ALL cameras OR if this is the final attempt
        const allCamerasReady = availableCameras.length === groupCameraIds.length;
        const shouldGenerate = allCamerasReady || attempt >= 3;

        if (totalImages > 0 && shouldGenerate) {
          // Delete existing collages to force regeneration with all current images
          const landscapePath = path.join(groupFolderPath, "collage_landscape.jpg");
          const portraitPath = path.join(groupFolderPath, "collage_portrait.jpg");
          
          if (fs.existsSync(landscapePath)) {
            fs.unlinkSync(landscapePath);
            console.log(`🗑️ Deleted existing landscape collage to regenerate with ${totalImages} images`);
          }
          if (fs.existsSync(portraitPath)) {
            fs.unlinkSync(portraitPath);
            console.log(`🗑️ Deleted existing portrait collage to regenerate with ${totalImages} images`);
          }

          const collageResult = await collageService.generateCollageWithS3Upload(timeFolder);
          console.log(
            `🎨 Group ${groupId} collage generated with ${totalImages} images from ${availableCameras.length} cameras`,
          );

          // Emit collage to collage screens
          const socketService = getSocketService();
          const connectedScreenIds = socketService.getConnectedScreens();
          const collageScreens = await Screen.find({ isCollageScreen: true });
          const connectedCollageScreens = collageScreens.filter((screen) =>
            connectedScreenIds.includes(screen.screenId),
          );

          if (connectedCollageScreens.length > 0) {
            for (const screen of connectedCollageScreens) {
              const isLandscape =
                screen.resolution &&
                screen.resolution.width >= screen.resolution.height;
              const orientation = isLandscape ? "landscape" : "portrait";

              const backendUrl = process.env.BACKEND_URL || "http://localhost:8800";
              const collageUrl = `${backendUrl}/api/images/collage/${encodeURIComponent(timeFolder)}?orientation=${orientation}`;

              socketService.emitImageToScreens([screen.screenId], {
                imageId: `collage_${timestampNum}`,
                cameraId: "collage",
                cameraLabel: `${groupId} Collage`,
                imageUrl: collageUrl,
                storageType: "local",
                timestamp: timestampNum,
                isCollage: true,
                orientation,
              });

              console.log(
                `🖼️ Group ${groupId} collage (${orientation}) with ${totalImages} images sent to screen: ${screen.screenId}`,
              );
            }
          }
        } else if (!shouldGenerate) {
          // Wait and try again if not all cameras are ready
          console.log(`⏳ Waiting for more cameras... (${availableCameras.length}/${groupCameraIds.length})`);
          setTimeout(() => checkAndGenerate(attempt + 1), 7000);
        }
      } catch (error) {
        console.error(`Error generating group ${groupId} collage:`, error);
      }
    };

    // Start checking after initial delay
    setTimeout(() => checkAndGenerate(1), 5000);
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
            _id: "$cameraId",
            count: { $sum: 1 },
          },
        },
      ]);

      const countsMap: Record<string, number> = {};
      counts.forEach((item) => {
        countsMap[item._id] = item.count;
      });

      res.status(200).json({ counts: countsMap });
    } catch (error) {
      console.error("Error fetching capture counts:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch capture counts",
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
          error: "NOT_FOUND",
          message: "Image not found",
        });
        return;
      }

      const imagePath = localStorageService.getImagePath(relativePath);
      res.sendFile(imagePath);
    } catch (error) {
      console.error("Error serving local image:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to serve image",
      });
    }
  }

  // Serve collage image
  async serveCollage(req: Request, res: Response): Promise<void> {
    try {
      const { folderPath } = req.params;
      const { orientation = "landscape" } = req.query;
      const decodedFolderPath = decodeURIComponent(folderPath);
      const targetOrientation = orientation as "landscape" | "portrait";

      console.log(`🖼️ Serving collage for folder: ${decodedFolderPath}, orientation: ${targetOrientation}`);

      // Get the collage path first
      const collagePath = collageService.getCollagePath(
        decodedFolderPath,
        targetOrientation,
      );
      
      console.log(`🖼️ Collage path: ${collagePath}`);
      console.log(`🖼️ Collage exists: ${fs.existsSync(collagePath)}`);

      // Check if collage exists directly
      if (!fs.existsSync(collagePath)) {
        console.log(`🖼️ Collage not found, trying to generate...`);
        // Try to generate collage if it doesn't exist
        try {
          await collageService.generateCollage(decodedFolderPath);
        } catch (generateError) {
          res.status(404).json({
            error: "NOT_FOUND",
            message: "Collage not found and could not be generated",
          });
          return;
        }
      } else {
        console.log(`🖼️ Using existing collage: ${collagePath}`);
      }

      res.sendFile(collagePath);
    } catch (error) {
      console.error("Error serving collage:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to serve collage",
      });
    }
  }

  // Generate missing collages for all folders
  async generateMissingCollages(req: Request, res: Response): Promise<void> {
    try {
      await collageService.generateMissingCollages();
      res.status(200).json({
        message: "Missing collages generation completed",
      });
    } catch (error) {
      console.error("Error generating missing collages:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate missing collages",
      });
    }
  }
}

export const imageController = new ImageController();
