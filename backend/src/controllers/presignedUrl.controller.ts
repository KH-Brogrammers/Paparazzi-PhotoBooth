import { Request, Response } from 'express';
import { s3Service } from '../services/s3.service';
import { PresignedUrlRequest } from '../types/api.types';

export class PresignedUrlController {
  async generatePresignedUrl(req: Request, res: Response): Promise<void> {
    try {
      // Check if S3 is configured
      if (!s3Service.isConfigured()) {
        res.status(503).json({
          error: 'S3_NOT_CONFIGURED',
          message: 'AWS S3 credentials are not configured',
        });
        return;
      }

      const { fileName, fileType, cameraId } = req.body as PresignedUrlRequest;

      // Validate request
      if (!fileName || !fileType || !cameraId) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'fileName, fileType, and cameraId are required',
        });
        return;
      }

      // Generate presigned URL
      const result = await s3Service.generatePresignedUrl({
        fileName,
        fileType,
        cameraId,
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      res.status(500).json({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate presigned URL',
      });
    }
  }
}

export const presignedUrlController = new PresignedUrlController();
