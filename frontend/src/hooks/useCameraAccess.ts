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

      // On mobile/tablet, force rear camera only
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        console.log('📱 Mobile/Tablet detected - forcing REAR camera only');
        
        // Only use rear camera for mobile/tablet devices
        const mobileDevices = [
          {
            deviceId: 'rear-camera', 
            label: 'Rear Camera',
            kind: 'videoinput' as MediaDeviceKind,
            groupId: 'mobile-cameras'
          }
        ];

        videoDevices = mobileDevices;
        console.log('✅ Mobile cameras forced: REAR ONLY');
      } else {
        // For desktop, prioritize rear-facing cameras if available
        console.log('🖥️ Desktop detected - using available cameras, prioritizing rear-facing');
        
        // Sort cameras to prioritize rear-facing ones
        videoDevices.sort((a, b) => {
          const aIsRear = a.label.toLowerCase().includes('back') || a.label.toLowerCase().includes('rear') || a.label.toLowerCase().includes('environment');
          const bIsRear = b.label.toLowerCase().includes('back') || b.label.toLowerCase().includes('rear') || b.label.toLowerCase().includes('environment');
          
          if (aIsRear && !bIsRear) return -1;
          if (!aIsRear && bIsRear) return 1;
          return 0;
        });
      }

      // Initialize cameras with streams one by one
      const initializedCameras: Camera[] = [];

      for (const device of videoDevices) {
        try {
          console.log(`Initializing camera: ${device.label || device.deviceId}`);
          
          let constraints;
          
          // Use facingMode for mobile virtual cameras, deviceId for desktop
          if (device.deviceId === 'rear-camera') {
            constraints = {
              video: {
                facingMode: 'environment', // Force rear camera
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            };
          } else {
            // For desktop cameras, try to prefer rear-facing if possible
            const isRearFacing = device.label.toLowerCase().includes('back') || 
                               device.label.toLowerCase().includes('rear') || 
                               device.label.toLowerCase().includes('environment');
            
            constraints = {
              video: {
                deviceId: device.deviceId ? { exact: device.deviceId } : undefined,
                facingMode: isRearFacing ? 'environment' : undefined,
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
