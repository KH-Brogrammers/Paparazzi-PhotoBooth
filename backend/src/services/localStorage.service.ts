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

  generateFolderName(timestamp: number): string {
    // Create folder structure: HH:MM:SS_DD-MM-YYYY
    const date = new Date(timestamp);
    const timeFolder = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
    return timeFolder;
  }

  async saveImageWithFolder(
    base64Data: string,
    folderName: string,
    screenNumber: number,
    timestamp: number,
    screenOrientation?: string,
    screenResolution?: { width: number; height: number }
  ): Promise<{ localPath: string; relativePath: string }> {
    try {
      // Create folder structure: folderName/screen_X_photo_orientation.jpg
      const folderPath = path.join(this.basePath, folderName);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`📁 Created folder: ${folderPath}`);
      }

      // Generate filename: screen_1_photo_landscape.jpg, screen_2_photo_portrait.jpg, etc.
      const orientationSuffix = screenOrientation ? `_${screenOrientation}` : '';
      const filename = `screen_${screenNumber}_photo${orientationSuffix}.jpg`;
      const filePath = path.join(folderPath, filename);

      // Remove data:image/xxx;base64, prefix if present
      const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
      let buffer = Buffer.from(base64Image, 'base64');

      const sharp = require('sharp');
      
      // Resize image to match screen resolution if provided
      if (screenResolution?.width && screenResolution?.height) {
        buffer = await sharp(buffer)
          .resize(screenResolution.width, screenResolution.height, {
            fit: 'contain',
            position: 'center',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .jpeg({ quality: 90 })
          .toBuffer();
      }

      // Add logo to the image
      try {
        const logoPath = path.join(process.cwd(), '../frontend/public/logo.png');
        if (fs.existsSync(logoPath)) {
          const imageMetadata = await sharp(buffer).metadata();
          const imageWidth = imageMetadata.width || screenResolution?.width || 1920;
          const imageHeight = imageMetadata.height || screenResolution?.height || 1080;
          
          // Calculate logo size and position (bottom center)
          const logoMaxWidth = Math.min(200, imageWidth * 0.15);
          const logoMaxHeight = Math.min(80, imageHeight * 0.08);
          
          const logoBuffer = await sharp(logoPath)
            .resize(logoMaxWidth, logoMaxHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .toBuffer();

          const logoMetadata = await sharp(logoBuffer).metadata();
          const logoX = Math.floor((imageWidth - (logoMetadata.width || 0)) / 2);
          const logoY = imageHeight - (logoMetadata.height || 0) - 20; // 20px from bottom

          buffer = await sharp(buffer)
            .composite([{
              input: logoBuffer,
              top: logoY,
              left: logoX
            }])
            .jpeg({ quality: 90 })
            .toBuffer();
            
          console.log(`🏷️ Logo added to image at position (${logoX}, ${logoY})`);
        }
      } catch (logoError) {
        console.error('Error adding logo to image:', logoError);
        // Continue without logo if there's an error
      }

      fs.writeFileSync(filePath, buffer);

      const relativePath = `${folderName}/${filename}`;
      
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

  async uploadToS3WithFolder(
    base64Data: string,
    folderName: string,
    screenNumber: number,
    timestamp: number,
    screenOrientation?: string,
    screenResolution?: { width: number; height: number }
  ): Promise<{ s3Url: string; s3Key: string } | null> {
    try {
      // Import S3 service
      const { s3Service } = await import('./s3.service');

      if (!s3Service.isConfigured()) {
        console.warn('⚠️ S3 not configured, skipping upload');
        return null;
      }

      const orientationSuffix = screenOrientation ? `_${screenOrientation}` : '';
      const filename = `screen_${screenNumber}_photo${orientationSuffix}.jpg`;
      const key = `photos/${folderName}/${filename}`;
      
      // Remove data:image/xxx;base64, prefix if present
      const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
      let buffer = Buffer.from(base64Image, 'base64');

      // Resize image to match screen resolution if provided
      if (screenResolution?.width && screenResolution?.height) {
        const sharp = require('sharp');
        
        buffer = await sharp(buffer)
          .resize(screenResolution.width, screenResolution.height, {
            fit: 'contain',
            position: 'center',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .jpeg({ quality: 90 })
          .toBuffer();
      }

      // Upload to S3
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
