import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.config';
import { PresignedUrlRequest, PresignedUrlResponse } from '../types/api.types';

class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.bucketName = config.aws.s3BucketName;
    
    this.s3Client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }

  async generatePresignedUrl(
    request: PresignedUrlRequest
  ): Promise<PresignedUrlResponse> {
    const timestamp = Date.now();
    const key = `photos/${request.cameraId}/${timestamp}-${request.fileName}`;
    const expiresIn = 3600; // 1 hour

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: request.fileType,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      url,
      key,
      expiresIn,
    };
  }

  isConfigured(): boolean {
    return !!(
      config.aws.accessKeyId &&
      config.aws.secretAccessKey &&
      config.aws.s3BucketName
    );
  }
}

export const s3Service = new S3Service();
