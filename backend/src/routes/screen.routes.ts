import { Router } from 'express';
import { screenController } from '../controllers/screen.controller';

const router = Router();

router.post('/register', (req, res) => screenController.registerScreen(req, res));
router.get('/', (req, res) => screenController.getAllScreens(req, res));
router.patch('/:screenId/label', (req, res) => screenController.updateScreenLabel(req, res));
router.delete('/:screenId', (req, res) => screenController.deleteScreen(req, res));

export const screenRoutes = router;
