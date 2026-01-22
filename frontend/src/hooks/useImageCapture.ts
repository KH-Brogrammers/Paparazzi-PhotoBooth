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

      // Save to backend (which handles both S3 and local storage)
      try {
        await imageApi.save({
          imageId,
          cameraId,
          cameraLabel,
          imageData: dataUrl, // Send base64 data to backend
          timestamp,
        });

        console.log('✅ Image saved to backend (S3 + local storage)');

        // Still save to IndexedDB for local preview
        const capturedImage: CapturedImage = {
          id: imageId,
          cameraId,
          cameraLabel,
          dataUrl,
          timestamp,
          storageType: 's3', // Backend will determine actual storage
        };

        await storageService.saveImage(capturedImage);

        setIsCapturing(false);
        return capturedImage;
      } catch (error) {
        console.error('Failed to save image to backend:', error);
        
        // Fallback: save only to IndexedDB if backend fails
        const capturedImage: CapturedImage = {
          id: imageId,
          cameraId,
          cameraLabel,
          dataUrl,
          timestamp,
          storageType: 'local',
        };

        await storageService.saveImage(capturedImage);
        
        setIsCapturing(false);
        return capturedImage;
      }
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
