import { Request, Response } from 'express';
import QRCode from 'qrcode';

export const generateQRCode = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    console.log('🔄 QR Code generation request for session:', sessionId);
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Create download URL
    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 8800}`;
    const downloadUrl = `${baseUrl}/api/download/${sessionId}`;

    console.log('🔗 Download URL:', downloadUrl);

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    console.log('✅ QR Code generated successfully');

    res.json({
      qrCode: qrCodeDataUrl,
      downloadUrl,
      sessionId
    });

  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
};
