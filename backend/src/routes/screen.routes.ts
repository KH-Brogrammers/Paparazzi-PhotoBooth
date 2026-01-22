import { Router } from 'express';
import { screenController } from '../controllers/screen.controller';
import { screenActionController } from '../controllers/screenAction.controller';

const router = Router();

router.post('/register', (req, res) => screenController.registerScreen(req, res));
router.get('/', (req, res) => screenController.getAllScreens(req, res));
router.patch('/:screenId/label', (req, res) => screenController.updateScreenLabel(req, res));
router.delete('/all', (req, res) => screenController.deleteAllScreens(req, res));
router.delete('/:screenId', (req, res) => screenController.deleteScreen(req, res));
router.post('/clear', (req, res) => screenActionController.clearAllScreens(req, res));

export const screenRoutes = router;
