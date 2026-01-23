import { Request, Response } from 'express';
import { Screen } from '../models/screen.model';
import { CameraMapping } from '../models/cameraMapping.model';
import { getSocketService } from '../services/socket.service';

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

  // Get all screens
  async getAllScreens(req: Request, res: Response): Promise<void> {
    try {
      // Get all screens from database
      const allScreens = await Screen.find().sort({ createdAt: 1 });
      
      // Get currently connected screens from socket service
      const socketService = getSocketService();
      const connectedScreenIds = socketService.getConnectedScreens();
      
      // Filter to only show connected screens
      const connectedScreens = allScreens.filter(screen => 
        connectedScreenIds.includes(screen.screenId)
      );
      
      res.status(200).json(connectedScreens);
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
}

export const screenController = new ScreenController();
