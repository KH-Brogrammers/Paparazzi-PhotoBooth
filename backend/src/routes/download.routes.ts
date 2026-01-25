import { Router } from 'express';
import { downloadPhotosZip, downloadSingleCollage } from '../controllers/download.controller';
import { generateQRCode } from '../controllers/qrcode.controller';

const router = Router();

// Generate QR code for photo session
router.post('/qrcode/generate', generateQRCode);

// Download collages (shows HTML page that triggers both downloads)
router.get('/download/:sessionId', downloadPhotosZip);

// Download individual collage files
router.get('/download/:sessionId/:orientation', downloadSingleCollage);

export default router;
