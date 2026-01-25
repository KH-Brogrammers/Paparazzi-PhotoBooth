import { Router } from 'express';
import { presignedUrlRoutes } from './presignedUrl.routes';
import { screenRoutes } from './screen.routes';
import { mappingRoutes } from './mapping.routes';
import { imageRoutes } from './image.routes';
import downloadRoutes from './download.routes';

const router = Router();

router.use('/presigned-url', presignedUrlRoutes);
router.use('/screens', screenRoutes);
router.use('/mappings', mappingRoutes);
router.use('/images', imageRoutes);
router.use('/', downloadRoutes);

export const routes = router;
