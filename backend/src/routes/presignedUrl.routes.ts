import { Router } from 'express';
import { presignedUrlController } from '../controllers/presignedUrl.controller';

const router = Router();

router.post('/generate', (req, res) =>
  presignedUrlController.generatePresignedUrl(req, res)
);

export const presignedUrlRoutes = router;
