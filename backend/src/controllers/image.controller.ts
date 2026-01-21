import { Request, Response } from "express";
import { CapturedImage } from "../models/capturedImage.model";
import { CameraMapping } from "../models/cameraMapping.model";
import { getSocketService } from "../services/socket.service";

export class ImageController {
  // Save captured image
  async saveImage(req: Request, res: Response): Promise<void> {
    try {
      const {
        imageId,
        cameraId,
        cameraLabel,
        s3Url,
        s3Key,
        localUrl,
        storageType,
        timestamp,
      } = req.body;

      if (!imageId || !cameraId || !cameraLabel || !storageType || !timestamp) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message:
            "imageId, cameraId, cameraLabel, storageType, and timestamp are required",
        });
        return;
      }

      const image = await CapturedImage.create({
        imageId,
        cameraId,
        cameraLabel,
        s3Url,
        s3Key,
        localUrl,
        storageType,
        timestamp: new Date(timestamp),
      });

      // Get mapped screens for this camera
      const mapping = await CameraMapping.findOne({ cameraId });

      if (mapping && mapping.screenIds.length > 0) {
        // Emit image to mapped screens via socket
        const socketService = getSocketService();
        socketService.emitImageToScreens(mapping.screenIds, {
          imageId,
          cameraId,
          cameraLabel,
          imageUrl: s3Url || localUrl,
          storageType,
          timestamp,
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
}

export const imageController = new ImageController();
