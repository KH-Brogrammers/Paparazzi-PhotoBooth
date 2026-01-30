import { Router } from 'express';
import { CameraController } from '../controllers/camera.controller';

const router = Router();

// Register or update a camera
router.post('/register', CameraController.registerCamera);

// Get all cameras
router.get('/', CameraController.getAllCameras);

// Get camera by ID
router.get('/:cameraId', CameraController.getCameraById);

// Update camera label
router.patch('/:cameraId/label', CameraController.updateCameraLabel);

// Delete camera
router.delete('/:cameraId', CameraController.deleteCamera);

export default router;
