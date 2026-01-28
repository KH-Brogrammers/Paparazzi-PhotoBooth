import { useState } from 'react';
import { type CapturedImage } from '../types/camera.types';
import { apiService } from '../services/api.service';
import { storageService } from '../services/storage.service';
import { imageApi } from '../services/backend-api.service';
import { dataURLtoBlob, generateId, sanitizeFileName } from '../utils/helpers';
import { isIOS } from '../utils/camera-utils';

export function useImageCapture() {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureImage = async (
    videoElement: HTMLVideoElement,
    cameraId: string,
    cameraLabel: string
  ): Promise<CapturedImage | null> => {
    try {
      setIsCapturing(true);

      // Validate video element
      if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        console.error('Invalid video element or dimensions');
        setIsCapturing(false);
        return null;
      }

      console.log('📸 Capturing from video:', videoElement.videoWidth, 'x', videoElement.videoHeight);

      // Create canvas to capture the frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // iOS-specific canvas handling
      if (isIOS()) {
        // Ensure canvas is properly sized for iOS
        canvas.style.width = `${videoElement.videoWidth}px`;
        canvas.style.height = `${videoElement.videoHeight}px`;
        
        // Set canvas attributes for better iOS compatibility
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
      }

      // Draw the current video frame
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Convert to WebP format with fallback for iOS
      let dataUrl: string;
      let format = 'image/webp';
      
      try {
        dataUrl = canvas.toDataURL('image/webp', 0.95);
        // Check if WebP is actually supported (some iOS versions don't support it)
        if (dataUrl.startsWith('data:image/webp')) {
          format = 'image/webp';
        } else {
          throw new Error('WebP not supported');
        }
      } catch (webpError) {
        console.warn('WebP not supported, falling back to JPEG');
        dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        format = 'image/jpeg';
      }

      // Validate the captured data
      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error('Failed to capture image data');
      }

      const blob = dataURLtoBlob(dataUrl);
      const imageId = generateId();
      const timestamp = Date.now();
      const fileExtension = format === 'image/webp' ? 'webp' : 'jpg';
      const fileName = `${sanitizeFileName(cameraLabel)}_${timestamp}.${fileExtension}`;

      console.log(`📸 Captured image: ${canvas.width}x${canvas.height}, format: ${format}, size: ${Math.round(blob.size / 1024)}KB`);

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
