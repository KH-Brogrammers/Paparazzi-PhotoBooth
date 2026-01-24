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

      // On mobile, only initialize the first camera (usually back camera)
      // Desktop can handle multiple streams
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const camerasToInitialize = isMobile ? [videoDevices[0]] : videoDevices;
      
      // Store all available devices for switching
      const allCameras: Camera[] = videoDevices.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
        stream: null as any, // Will be populated on demand
      }));

      // Initialize streams for selected cameras
      const initializedCameras: Camera[] = [];

      for (const device of camerasToInitialize) {
        try {
          console.log(`Initializing camera: ${device.label || device.deviceId}`);
          
          const constraints = {
            video: {
              deviceId: device.deviceId ? { exact: device.deviceId } : undefined,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: isMobile ? { ideal: 'environment' } : undefined, // Prefer back camera on mobile
            },
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamsRef.current.set(device.deviceId, stream);

          const cameraIndex = allCameras.findIndex(cam => cam.deviceId === device.deviceId);
          if (cameraIndex !== -1) {
            allCameras[cameraIndex].stream = stream;
          }

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
      
      // Use all cameras for desktop, or the list with placeholders for mobile
      const finalCameras = isMobile ? allCameras : initializedCameras;

      if (initializedCameras.length === 0) {
        throw new Error('Failed to initialize any cameras');
      }

      setCameras(isMobile ? allCameras : initializedCameras);
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

  const switchCamera = async () => {
    if (cameras.length <= 1) return;

    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];

    // If the next camera doesn't have a stream yet, initialize it
    if (!nextCamera.stream) {
      try {
        console.log(`Initializing camera on switch: ${nextCamera.label}`);
        
        const constraints = {
          video: {
            deviceId: { exact: nextCamera.deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Stop the current camera stream to free resources (mobile)
        const currentCamera = cameras[currentCameraIndex];
        if (currentCamera && currentCamera.stream) {
          currentCamera.stream.getTracks().forEach(track => track.stop());
          streamsRef.current.delete(currentCamera.deviceId);
        }

        streamsRef.current.set(nextCamera.deviceId, stream);

        // Update the cameras array with the new stream
        setCameras(prev =>
          prev.map(cam =>
            cam.deviceId === nextCamera.deviceId
              ? { ...cam, stream }
              : cam.deviceId === currentCamera.deviceId
              ? { ...cam, stream: null as any }
              : cam
          )
        );
        
        console.log(`Successfully switched to: ${nextCamera.label}`);
      } catch (err) {
        console.error('Error switching camera:', err);
        return; // Don't switch if initialization failed
      }
    }

    setCurrentCameraIndex(nextIndex);
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
