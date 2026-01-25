import { Router } from 'express';
import { downloadPhotosZip } from '../controllers/download.controller';
import { generateQRCode } from '../controllers/qrcode.controller';

const router = Router();

// Generate QR code for photo session
router.post('/qrcode/generate', generateQRCode);

// Download photos as ZIP
router.get('/download/:sessionId', downloadPhotosZip);

export default router;
