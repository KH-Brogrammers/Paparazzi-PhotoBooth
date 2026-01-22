import { Request, Response } from 'express';
import { getSocketService } from '../services/socket.service';

export class ScreenActionController {
  // Clear all screens
  async clearAllScreens(req: Request, res: Response): Promise<void> {
    try {
      const socketService = getSocketService();
      socketService.clearAllScreens();

      res.status(200).json({ message: 'All screens cleared successfully' });
    } catch (error) {
      console.error('Error clearing screens:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to clear screens',
      });
    }
  }
}

export const screenActionController = new ScreenActionController();
