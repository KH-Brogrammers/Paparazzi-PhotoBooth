import { useState } from 'react';
import { type CapturedImage } from '../types/camera.types';
import { apiService } from '../services/api.service';
import { storageService } from '../services/storage.service';
import { imageApi } from '../services/backend-api.service';
import { dataURLtoBlob, generateId, sanitizeFileName } from '../utils/helpers';

export function useImageCapture() {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureImage = async (
    videoElement: HTMLVideoElement,
    cameraId: string,
    cameraLabel: string
  ): Promise<CapturedImage | null> => {
    try {
      setIsCapturing(true);

      // Create canvas to capture the frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Draw the current video frame
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Convert to WebP format
      const dataUrl = canvas.toDataURL('image/webp', 0.95);
      const blob = dataURLtoBlob(dataUrl);

      const imageId = generateId();
      const timestamp = Date.now();
      const fileName = `${sanitizeFileName(cameraLabel)}_${timestamp}.webp`;

      // Try to upload to S3 first
      const presignedData = await apiService.generatePresignedUrl({
        fileName,
        fileType: 'image/webp',
        cameraId,
      });

      let capturedImage: CapturedImage;

      if (presignedData) {
        // Upload to S3
        const uploadSuccess = await apiService.uploadToS3(
          presignedData.url,
          blob
        );

        if (uploadSuccess) {
          capturedImage = {
            id: imageId,
            cameraId,
            cameraLabel,
            dataUrl,
            timestamp,
            s3Key: presignedData.key,
            storageType: 's3',
          };
        } else {
          // S3 upload failed, fallback to local storage
          capturedImage = {
            id: imageId,
            cameraId,
            cameraLabel,
            dataUrl,
            timestamp,
            storageType: 'local',
          };
        }
      } else {
        // Presigned URL generation failed, use local storage
        capturedImage = {
          id: imageId,
          cameraId,
          cameraLabel,
          dataUrl,
          timestamp,
          storageType: 'local',
        };
      }

      // Save to IndexedDB for local access
      await storageService.saveImage(capturedImage);

      // Save to MongoDB via backend API
      try {
        const s3Url = capturedImage.storageType === 's3' 
          ? `https://${import.meta.env.VITE_API_AWS_S3_BUCKET_NAME || 'your-bucket'}.s3.amazonaws.com/${capturedImage.s3Key}`
          : undefined;

        await imageApi.save({
          imageId,
          cameraId,
          cameraLabel,
          s3Url,
          s3Key: capturedImage.s3Key,
          localUrl: capturedImage.storageType === 'local' ? capturedImage.dataUrl : undefined,
          storageType: capturedImage.storageType,
          timestamp,
        });

        console.log('✅ Image saved to MongoDB and socket emitted');
      } catch (mongoError) {
        console.error('Failed to save to MongoDB:', mongoError);
        // Don't fail the whole capture if MongoDB save fails
      }

      setIsCapturing(false);
      return capturedImage;
    } catch (error) {
      console.error('Error capturing image:', error);
      setIsCapturing(false);
      return null;
    }
  };

  return {
    captureImage,
    isCapturing,
  };
}
