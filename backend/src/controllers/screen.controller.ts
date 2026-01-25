import { Request, Response } from 'express';
import { Screen } from '../models/screen.model';
import { CameraMapping } from '../models/cameraMapping.model';
import { CapturedImage } from '../models/capturedImage.model';
import { getSocketService } from '../services/socket.service';
import { localStorageService } from '../services/localStorage.service';
import { s3Service } from '../services/s3.service';

export class ScreenController {
  // Register or update a screen
  async registerScreen(req: Request, res: Response): Promise<void> {
    try {
      const { screenId, label, position, resolution, isPrimary } = req.body;

      if (!screenId || !label) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'screenId and label are required',
        });
        return;
      }

      const screen = await Screen.findOneAndUpdate(
        { screenId },
        {
          screenId,
          label,
          position,
          resolution,
          isPrimary: isPrimary || false,
          isAvailable: true,
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      );

      res.status(200).json(screen);
    } catch (error) {
      console.error('Error registering screen:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to register screen',
      });
    }
  }

  // Get all screens (including disconnected ones from database)
  async getAllScreens(req: Request, res: Response): Promise<void> {
    try {
      // Get all screens from database (both connected and disconnected)
      const allScreens = await Screen.find().sort({ createdAt: 1 });
      
      // Get currently connected screens from socket service
      const socketService = getSocketService();
      const connectedScreenIds = socketService.getConnectedScreens();
      
      // Mark which screens are currently connected
      const screensWithStatus = allScreens.map(screen => ({
        ...screen.toObject(),
        isConnected: connectedScreenIds.includes(screen.screenId)
      }));
      
      res.status(200).json(screensWithStatus);
    } catch (error) {
      console.error('Error fetching screens:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch screens',
      });
    }
  }

  // Update screen label
  async updateScreenLabel(req: Request, res: Response): Promise<void> {
    try {
      const { screenId } = req.params;
      const { label } = req.body;

      if (!label) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'label is required',
        });
        return;
      }

      const screen = await Screen.findOneAndUpdate(
        { screenId },
        { label },
        { new: true }
      );

      if (!screen) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Screen not found',
        });
        return;
      }

      res.status(200).json(screen);
    } catch (error) {
      console.error('Error updating screen label:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update screen label',
      });
    }
  }

  // Delete screen
  async deleteScreen(req: Request, res: Response): Promise<void> {
    try {
      const { screenId } = req.params;

      const screen = await Screen.findOneAndDelete({ screenId });

      if (!screen) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Screen not found',
        });
        return;
      }

      // Remove this screen from all camera mappings
      await CameraMapping.updateMany(
        { screenIds: screenId },
        { $pull: { screenIds: screenId } }
      );

      // Broadcast mapping update
      const socketService = getSocketService();
      const allMappings = await CameraMapping.find();
      socketService.broadcastMappingUpdate(allMappings);

      res.status(200).json({ message: 'Screen deleted successfully' });
    } catch (error) {
      console.error('Error deleting screen:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete screen',
      });
    }
  }

  // Save screen capture (what's displayed on screen)
  async saveScreenCapture(req: Request, res: Response): Promise<void> {
    try {
      const {
        screenId,
        originalImageId,
        cameraId,
        screenImageData,
        timestamp,
      } = req.body;

      if (!screenId || !originalImageId || !cameraId || !screenImageData || !timestamp) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'screenId, originalImageId, cameraId, screenImageData, and timestamp are required',
        });
        return;
      }

      const timestampNum = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;

      // Get screen number from mapping
      const mapping = await CameraMapping.findOne({ cameraId });
      if (!mapping) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Camera mapping not found',
        });
        return;
      }

      const screenIndex = mapping.screenIds.indexOf(screenId);
      const screenNumber = screenIndex + 1;

      // Create folder structure: HH:MM:SS_DD/MM/YYYY/cameraId
      const date = new Date(timestampNum);
      const timeFolder = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      const folderName = `${timeFolder}/${cameraId}`;

      // Save screen capture to storage
      const { relativePath } = await localStorageService.saveImageWithFolder(
        screenImageData,
        folderName,
        screenNumber,
        timestampNum
      );

      const localUrl = `${process.env.BACKEND_URL || 'http://localhost:8800'}/api/images/local/${relativePath}`;

      let s3Url: string | undefined;
      let s3Key: string | undefined;
      let finalStorageType: 's3' | 'local' = 'local';

      // Try to upload to S3
      if (s3Service.isConfigured()) {
        try {
          const s3Result = await localStorageService.uploadToS3WithFolder(
            screenImageData,
            folderName,
            screenNumber,
            timestampNum
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

      // Save metadata to MongoDB
      const screenCapture = await CapturedImage.create({
        imageId: `${originalImageId}_screen_${screenNumber}_display`,
        cameraId,
        cameraLabel: `Screen ${screenNumber} Display`,
        s3Url,
        s3Key,
        localUrl,
        storageType: finalStorageType,
        timestamp: new Date(timestampNum),
      });

      console.log(`📸 Screen ${screenNumber} display captured and saved`);

      // Broadcast screen capture to collage screen
      const socketService = getSocketService();
      const screen = await Screen.findOne({ screenId });
      socketService.broadcastScreenCapture(screenId, {
        imageUrl: s3Url || localUrl,
        rotation: screen?.rotation || 0,
        position: screen?.collagePosition,
        screenLabel: screen?.label,
        timestamp: timestampNum,
      });

      res.status(201).json(screenCapture);
    } catch (error) {
      console.error('Error saving screen capture:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to save screen capture',
      });
    }
  }

  // Delete all screens
  async deleteAllScreens(req: Request, res: Response): Promise<void> {
    try {
      await Screen.deleteMany({});

      // Clear all screen mappings
      await CameraMapping.updateMany(
        {},
        { $set: { screenIds: [] } }
      );

      // Broadcast mapping update
      const socketService = getSocketService();
      const allMappings = await CameraMapping.find();
      socketService.broadcastMappingUpdate(allMappings);

      res.status(200).json({ message: 'All screens deleted successfully' });
    } catch (error) {
      console.error('Error deleting all screens:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete all screens',
      });
    }
  }

  // Toggle collage screen
  async toggleCollageScreen(req: Request, res: Response): Promise<void> {
    try {
      const { screenId } = req.params;
      const { isCollageScreen } = req.body;

      // If setting as collage screen, unset other collage screens first
      if (isCollageScreen) {
        await Screen.updateMany(
          { screenId: { $ne: screenId } },
          { $set: { isCollageScreen: false } }
        );
      }

      const screen = await Screen.findOneAndUpdate(
        { screenId },
        { isCollageScreen },
        { new: true }
      );

      if (!screen) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Screen not found',
        });
        return;
      }

      // Notify all screens about collage change
      const socketService = getSocketService();
      socketService.broadcastCollageUpdate(screenId, isCollageScreen);

      res.status(200).json(screen);
    } catch (error) {
      console.error('Error toggling collage screen:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to toggle collage screen',
      });
    }
  }

  // Update screen rotation
  async updateScreenRotation(req: Request, res: Response): Promise<void> {
    try {
      const { screenId } = req.params;
      const { rotation } = req.body;

      if (![0, 90, -90].includes(rotation)) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Rotation must be 0, 90, or -90',
        });
        return;
      }

      const screen = await Screen.findOneAndUpdate(
        { screenId },
        { rotation },
        { new: true }
      );

      if (!screen) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Screen not found',
        });
        return;
      }

      res.status(200).json(screen);
    } catch (error) {
      console.error('Error updating screen rotation:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update screen rotation',
      });
    }
  }

  // Update screen collage position
  async updateScreenCollagePosition(req: Request, res: Response): Promise<void> {
    try {
      const { screenId } = req.params;
      const { x, y, width, height } = req.body;

      const screen = await Screen.findOneAndUpdate(
        { screenId },
        { collagePosition: { x, y, width, height } },
        { new: true }
      );

      if (!screen) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Screen not found',
        });
        return;
      }

      res.status(200).json(screen);
    } catch (error) {
      console.error('Error updating screen collage position:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update screen collage position',
      });
    }
  }

  // Upload collage to S3
  async uploadCollage(req: Request, res: Response): Promise<void> {
    try {
      const { collageImageData, timestamp } = req.body;

      if (!collageImageData) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'collageImageData is required',
        });
        return;
      }

      const timestampNum = timestamp || Date.now();
      const folderName = localStorageService.generateFolderName(timestampNum);

      let s3Url = '';
      let s3Key = '';
      let localUrl = '';
      let finalStorageType: 's3' | 'local' = 'local';

      // Save locally first (failsafe)
      localUrl = await localStorageService.saveImageLocally(
        collageImageData,
        folderName,
        'collage',
        timestampNum
      );

      // Try to upload to S3
      if (s3Service.isConfigured()) {
        try {
          const s3Result = await localStorageService.uploadToS3WithFolder(
            collageImageData,
            folderName,
            'collage',
            timestampNum
          );

          if (s3Result) {
            s3Url = s3Result.s3Url;
            s3Key = s3Result.s3Key;
            finalStorageType = 's3';
          }
        } catch (s3Error) {
          console.error('S3 upload error for collage:', s3Error);
        }
      }

      // Save metadata to MongoDB
      const collageImage = await CapturedImage.create({
        imageId: `collage_${timestampNum}`,
        cameraId: 'collage',
        cameraLabel: 'Collage Display',
        s3Url,
        s3Key,
        localUrl,
        storageType: finalStorageType,
        timestamp: new Date(timestampNum),
      });

      console.log('🖼️ Collage uploaded successfully');

      res.status(201).json(collageImage);
    } catch (error) {
      console.error('Error uploading collage:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to upload collage',
      });
    }
  }
}

export const screenController = new ScreenController();
