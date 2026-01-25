import { useState, useEffect, useRef } from 'react';
import { type Camera } from '../types/camera.types';

export function useCameraAccess() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

      // Force rear camera for ALL devices - no front camera support
      console.log('🎯 Forcing REAR camera only for ALL devices');
      
      // Always use rear camera regardless of device type
      const rearCameraDevices = [
        {
          deviceId: 'rear-camera', 
          label: 'Rear Camera',
          kind: 'videoinput' as MediaDeviceKind,
          groupId: 'rear-only'
        }
      ];

      videoDevices = rearCameraDevices;
      console.log('✅ All devices forced to use REAR camera only');

      // Initialize cameras with streams one by one
      const initializedCameras: Camera[] = [];

      for (const device of videoDevices) {
        try {
          console.log(`Initializing camera: ${device.label || device.deviceId}`);
          
          let constraints;
          
          // Always force rear camera for all devices
          constraints = {
            video: {
              facingMode: 'environment', // Force rear camera
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          };

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
          facingMode: 'environment', // Always rear camera
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

  return {
    cameras,
    isLoading,
    error,
    stopCamera,
    restartCamera,
  };
}
