import { Request, Response } from 'express';
import { Screen } from '../models/screen.model';

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
      const screens = await Screen.find().sort({ createdAt: 1 });
      res.status(200).json(screens);
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

      res.status(200).json({ message: 'Screen deleted successfully' });
    } catch (error) {
      console.error('Error deleting screen:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete screen',
      });
    }
  }
}

export const screenController = new ScreenController();
