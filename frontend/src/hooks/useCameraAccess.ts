import { useState, useEffect, useRef } from 'react';
import { type Camera } from '../types/camera.types';

export function useCameraAccess() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());

  useEffect(() => {
    initializeCameras();

    return () => {
      // Cleanup: Stop all streams when component unmounts
      streamsRef.current.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      streamsRef.current.clear();
    };
  }, []);

  const initializeCameras = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Get all video input devices first
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      );

      // If no devices found or labels are empty, request permission first
      if (videoDevices.length === 0 || !videoDevices[0].label) {
        console.log('Requesting camera permission...');
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

        // Stop the permission stream
        permissionStream.getTracks().forEach((track) => track.stop());

        // Re-enumerate devices to get labels
        devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(
          (device) => device.kind === 'videoinput'
        );
      }

      if (videoDevices.length === 0) {
        setError('No cameras found on this device');
        setIsLoading(false);
        return;
      }

      console.log(`Found ${videoDevices.length} camera(s):`, videoDevices);

      // On mobile, try to detect front and rear cameras specifically
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        console.log('📱 Mobile detected - forcing front and rear camera detection');
        
        // Always create both front and rear camera options for mobile
        const mobileDevices = [
          {
            deviceId: 'front-camera',
            label: 'Front Camera',
            kind: 'videoinput' as MediaDeviceKind,
            groupId: 'mobile-cameras'
          },
          {
            deviceId: 'rear-camera', 
            label: 'Rear Camera',
            kind: 'videoinput' as MediaDeviceKind,
            groupId: 'mobile-cameras'
          }
        ];

        videoDevices = mobileDevices;
        console.log('✅ Mobile cameras forced: Front + Rear');
      }

      // Initialize cameras with streams one by one
      const initializedCameras: Camera[] = [];

      for (const device of videoDevices) {
        try {
          console.log(`Initializing camera: ${device.label || device.deviceId}`);
          
          let constraints;
          
          // Use facingMode for mobile virtual cameras
          if (device.deviceId === 'front-camera') {
            constraints = {
              video: {
                facingMode: 'user',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            };
          } else if (device.deviceId === 'rear-camera') {
            constraints = {
              video: {
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            };
          } else {
            constraints = {
              video: {
                deviceId: device.deviceId ? { exact: device.deviceId } : undefined,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            };
          }

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamsRef.current.set(device.deviceId, stream);

          initializedCameras.push({
            deviceId: device.deviceId,
            label: device.label || `Camera ${initializedCameras.length + 1}`,
            stream,
          });

          console.log(`Successfully initialized: ${device.label || device.deviceId}`);
        } catch (err) {
          console.error(`Failed to initialize camera ${device.label || device.deviceId}:`, err);
        }
      }

      if (initializedCameras.length === 0) {
        throw new Error('Failed to initialize any cameras');
      }

      setCameras(initializedCameras);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error accessing cameras:', err);
      setError(
        err.message || 'Failed to access cameras. Please ensure camera permissions are granted.'
      );
      setIsLoading(false);
    }
  };

  const stopCamera = (deviceId: string) => {
    const stream = streamsRef.current.get(deviceId);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamsRef.current.delete(deviceId);
    }
  };

  const restartCamera = async (deviceId: string) => {
    try {
      stopCamera(deviceId);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamsRef.current.set(deviceId, stream);

      setCameras((prev) =>
        prev.map((cam) =>
          cam.deviceId === deviceId ? { ...cam, stream } : cam
        )
      );
    } catch (err) {
      console.error('Error restarting camera:', err);
    }
  };

  const switchCamera = () => {
    console.log('🔄 switchCamera called, current cameras:', cameras.length);
    if (cameras.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      console.log('🔄 Switching from index', currentCameraIndex, 'to', nextIndex);
      setCurrentCameraIndex(nextIndex);
    } else {
      console.log('⚠️ Cannot switch - only', cameras.length, 'camera(s) available');
    }
  };

  const getCurrentCamera = () => {
    return cameras[currentCameraIndex] || cameras[0];
  };

  return {
    cameras,
    isLoading,
    error,
    currentCamera: getCurrentCamera(),
    canSwitchCamera: cameras.length > 1,
    switchCamera,
    stopCamera,
    restartCamera,
  };
}
