import { Request, Response } from 'express';
import { Screen } from '../models/screen.model';
import { CameraMapping } from '../models/cameraMapping.model';
import { CapturedImage } from '../models/capturedImage.model';
import { getSocketService } from '../services/socket.service';
import { localStorageService } from '../services/localStorage.service';
import { s3Service } from '../services/s3.service';
import { SessionService } from '../services/session.service';

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
      const { screenId, originalImageId, cameraId, timestamp } = req.body;

      if (!screenId || !originalImageId || !cameraId || !timestamp) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'screenId, originalImageId, cameraId, and timestamp are required',
        });
        return;
      }

      // Skip saving screen capture to avoid duplicates
      // Just broadcast the event for collage updates
      const socketService = getSocketService();
      const screen = await Screen.findOne({ screenId });
      
      console.log(`📸 Screen display captured and broadcasted (not saved to avoid duplicates)`);
      
      socketService.broadcastScreenCapture(screenId, {
        imageUrl: '', // Empty since we're not saving
        rotation: screen?.rotation || 0,
        position: screen?.collagePosition,
        screenLabel: screen?.label,
        timestamp: typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp,
      });

      res.status(201).json({ message: 'Screen capture broadcasted' });
    } catch (error) {
      console.error('Error broadcasting screen capture:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to broadcast screen capture',
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
}

export const screenController = new ScreenController();
