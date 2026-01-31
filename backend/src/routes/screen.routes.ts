import { Router } from 'express';
import { screenController } from '../controllers/screen.controller';
import { screenActionController } from '../controllers/screenAction.controller';

const router = Router();

router.post('/register', (req, res) => screenController.registerScreen(req, res));
router.get('/', (req, res) => screenController.getAllScreens(req, res));
router.patch('/:screenId/label', (req, res) => screenController.updateScreenLabel(req, res));
router.patch('/:screenId/collage', (req, res) => screenController.toggleCollageScreen(req, res));
router.patch('/:screenId/rotation', (req, res) => screenController.updateScreenRotation(req, res));
router.patch('/:screenId/collage-position', (req, res) => screenController.updateScreenCollagePosition(req, res));
router.delete('/all', (req, res) => screenController.deleteAllScreens(req, res));
router.delete('/:screenId', (req, res) => screenController.deleteScreen(req, res));
router.post('/clear', (req, res) => screenActionController.clearAllScreens(req, res));
// router.post('/capture', (req, res) => screenController.saveScreenCapture(req, res)); // DISABLED - using original images instead
// router.post('/upload-collage', (req, res) => screenController.uploadCollage(req, res)); // DEPRECATED

export const screenRoutes = router;
