import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env.config';

class LocalStorageService {
  private basePath: string;

  constructor() {
    this.basePath = config.imageStoragePath;
    this.ensureBaseDirectoryExists();
  }

  private ensureBaseDirectoryExists(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
      console.log(`📁 Created base storage directory: ${this.basePath}`);
    }
  }

  private ensureCameraDirectoryExists(cameraId: string): string {
    const cameraPath = path.join(this.basePath, cameraId);
    if (!fs.existsSync(cameraPath)) {
      fs.mkdirSync(cameraPath, { recursive: true });
      console.log(`📁 Created camera directory: ${cameraPath}`);
    }
    return cameraPath;
  }

  async saveImage(
    base64Data: string,
    cameraId: string,
    timestamp: number
  ): Promise<{ localPath: string; relativePath: string }> {
    try {
      // Ensure camera directory exists
      const cameraPath = this.ensureCameraDirectoryExists(cameraId);

      // Generate filename
      const filename = `${timestamp}.jpg`;
      const filePath = path.join(cameraPath, filename);

      // Remove data:image/xxx;base64, prefix if present
      const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');

      // Convert base64 to buffer and save
      const buffer = Buffer.from(base64Image, 'base64');
      fs.writeFileSync(filePath, buffer);

      const relativePath = `${cameraId}/${filename}`;
      
      console.log(`💾 Image saved locally: ${relativePath}`);

      return {
        localPath: filePath,
        relativePath,
      };
    } catch (error) {
      console.error('Error saving image to local storage:', error);
      throw error;
    }
  }

  getImagePath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }

  imageExists(relativePath: string): boolean {
    const fullPath = this.getImagePath(relativePath);
    return fs.existsSync(fullPath);
  }

  async uploadToS3(
    base64Data: string,
    cameraId: string,
    timestamp: number,
    filename: string
  ): Promise<{ s3Url: string; s3Key: string } | null> {
    try {
      // Import S3 service
      const { s3Service } = await import('./s3.service');

      if (!s3Service.isConfigured()) {
        console.warn('⚠️ S3 not configured, skipping upload');
        return null;
      }

      const key = `photos/${cameraId}/${timestamp}-${filename}`;
      
      // Remove data:image/xxx;base64, prefix if present
      const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Image, 'base64');

      // Upload to S3 (you'll need to implement direct upload in s3.service.ts)
      const s3Url = await s3Service.uploadBuffer(buffer, key, 'image/jpeg');

      console.log(`☁️ Image uploaded to S3: ${key}`);

      return {
        s3Url,
        s3Key: key,
      };
    } catch (error) {
      console.error('Error uploading to S3:', error);
      return null;
    }
  }
}

export const localStorageService = new LocalStorageService();
