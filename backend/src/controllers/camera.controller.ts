import { Request, Response } from 'express';
import { Camera } from '../models/camera.model';

export class CameraController {
  // Register or update a camera
  static async registerCamera(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId, cameraLabel } = req.body;

      if (!cameraId || !cameraLabel) {
        res.status(400).json({ error: 'Camera ID and label are required' });
        return;
      }

      // Check if camera already exists
      let camera = await Camera.findOne({ cameraId });

      if (camera) {
        // Update existing camera
        camera.cameraLabel = cameraLabel;
        camera.lastSeen = new Date();
        camera.isActive = true;
        await camera.save();
      } else {
        // Create new camera with next available serial number
        const maxSerialNumber = await Camera.findOne({}, {}, { sort: { serialNumber: -1 } });
        const nextSerialNumber = maxSerialNumber ? maxSerialNumber.serialNumber + 1 : 1;

        camera = new Camera({
          cameraId,
          cameraLabel,
          serialNumber: nextSerialNumber,
          isActive: true,
          lastSeen: new Date()
        });

        await camera.save();
      }

      res.json({
        success: true,
        camera: {
          cameraId: camera.cameraId,
          cameraLabel: camera.cameraLabel,
          serialNumber: camera.serialNumber,
          isActive: camera.isActive,
          lastSeen: camera.lastSeen
        }
      });
    } catch (error) {
      console.error('Error registering camera:', error);
      res.status(500).json({ error: 'Failed to register camera' });
    }
  }

  // Get all cameras
  static async getAllCameras(req: Request, res: Response): Promise<void> {
    try {
      const cameras = await Camera.find({ isActive: true }).sort({ serialNumber: 1 });
      res.json(cameras);
    } catch (error) {
      console.error('Error fetching cameras:', error);
      res.status(500).json({ error: 'Failed to fetch cameras' });
    }
  }

  // Get camera by ID
  static async getCameraById(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId } = req.params;
      const camera = await Camera.findOne({ cameraId, isActive: true });

      if (!camera) {
        res.status(404).json({ error: 'Camera not found' });
        return;
      }

      res.json(camera);
    } catch (error) {
      console.error('Error fetching camera:', error);
      res.status(500).json({ error: 'Failed to fetch camera' });
    }
  }

  // Update camera label
  static async updateCameraLabel(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId } = req.params;
      const { cameraLabel } = req.body;

      if (!cameraLabel) {
        res.status(400).json({ error: 'Camera label is required' });
        return;
      }

      const camera = await Camera.findOneAndUpdate(
        { cameraId, isActive: true },
        { cameraLabel, lastSeen: new Date() },
        { new: true }
      );

      if (!camera) {
        res.status(404).json({ error: 'Camera not found' });
        return;
      }

      res.json({
        success: true,
        camera: {
          cameraId: camera.cameraId,
          cameraLabel: camera.cameraLabel,
          serialNumber: camera.serialNumber,
          isActive: camera.isActive,
          lastSeen: camera.lastSeen
        }
      });
    } catch (error) {
      console.error('Error updating camera:', error);
      res.status(500).json({ error: 'Failed to update camera' });
    }
  }

  // Delete camera (mark as inactive)
  static async deleteCamera(req: Request, res: Response): Promise<void> {
    try {
      const { cameraId } = req.params;

      const camera = await Camera.findOneAndUpdate(
        { cameraId },
        { isActive: false },
        { new: true }
      );

      if (!camera) {
        res.status(404).json({ error: 'Camera not found' });
        return;
      }

      res.json({ success: true, message: 'Camera deleted successfully' });
    } catch (error) {
      console.error('Error deleting camera:', error);
      res.status(500).json({ error: 'Failed to delete camera' });
    }
  }
}
