import { Request, Response } from 'express';
import { CameraMapping } from '../models/cameraMapping.model';
import { getSocketService } from '../services/socket.service';

export class MappingController {
  // Get all camera mappings
  async getAllMappings(req: Request, res: Response): Promise<void> {
    try {
      const mappings = await CameraMapping.find().sort({ createdAt: 1 });
      res.status(200).json(mappings);
    } catch (error) {
      console.error('Error fetching mappings:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch mappings',
      });
    }
  }

  // Get mapping for specific camera
  async getMappingByCamera(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId } = req.params;

      const mapping = await CameraMapping.findOne({ cameraId });

      if (!mapping) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Mapping not found',
        });
        return;
      }

      res.status(200).json(mapping);
    } catch (error) {
      console.error('Error fetching mapping:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch mapping',
      });
    }
  }

  // Update camera to screen mapping
  async updateMapping(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId, cameraLabel, screenIds } = req.body;

      if (!cameraId || !cameraLabel || !Array.isArray(screenIds)) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'cameraId, cameraLabel, and screenIds (array) are required',
        });
        return;
      }

      const mapping = await CameraMapping.findOneAndUpdate(
        { cameraId },
        {
          cameraId,
          cameraLabel,
          screenIds,
          isActive: true,
        },
        { upsert: true, new: true }
      );

      // Broadcast mapping update to all clients
      const socketService = getSocketService();
      const allMappings = await CameraMapping.find();
      socketService.broadcastMappingUpdate(allMappings);

      res.status(200).json(mapping);
    } catch (error) {
      console.error('Error updating mapping:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update mapping',
      });
    }
  }

  // Delete mapping
  async deleteMapping(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId } = req.params;

      const mapping = await CameraMapping.findOneAndDelete({ cameraId });

      if (!mapping) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Mapping not found',
        });
        return;
      }

      // Broadcast mapping update
      const socketService = getSocketService();
      const allMappings = await CameraMapping.find();
      socketService.broadcastMappingUpdate(allMappings);

      res.status(200).json({ message: 'Mapping deleted successfully' });
    } catch (error) {
      console.error('Error deleting mapping:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete mapping',
      });
    }
  }
}

export const mappingController = new MappingController();
