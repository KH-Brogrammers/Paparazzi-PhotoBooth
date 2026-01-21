import { Router } from 'express';
import { mappingController } from '../controllers/mapping.controller';

const router = Router();

router.get('/', (req, res) => mappingController.getAllMappings(req, res));
router.get('/:cameraId', (req, res) => mappingController.getMappingByCamera(req, res));
router.post('/', (req, res) => mappingController.updateMapping(req, res));
router.delete('/:cameraId', (req, res) => mappingController.deleteMapping(req, res));

export const mappingRoutes = router;
