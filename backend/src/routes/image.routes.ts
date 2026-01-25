import { Router } from 'express';
import { imageController } from '../controllers/image.controller';

const router = Router();

router.post('/', (req, res) => imageController.saveImage(req, res));
router.get('/', (req, res) => imageController.getAllImages(req, res));
router.get('/counts', (req, res) => imageController.getCaptureCounts(req, res));
router.get('/local/:timeFolder/:cameraId/:filename', (req, res) => imageController.serveLocalImage(req, res));
router.get('/collage/:folderPath(*)', (req, res) => imageController.serveCollage(req, res));
router.post('/generate-collages', (req, res) => imageController.generateMissingCollages(req, res));
router.get('/:imageId', (req, res) => imageController.getImageById(req, res));
router.delete('/:imageId', (req, res) => imageController.deleteImage(req, res));

export const imageRoutes = router;
