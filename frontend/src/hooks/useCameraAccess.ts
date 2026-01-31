import { useState, useEffect, useRef } from 'react';
import { type Camera } from '../types/camera.types';

// Generate consistent device identifier (no random numbers)
const generateDeviceFingerprint = (): string => {
  const screenInfo = `${screen.width}x${screen.height}`;
  const userAgentHash = navigator.userAgent.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const deviceId = Math.abs(userAgentHash).toString(36).substring(0, 6);
  return `${deviceId}${screenInfo.replace('x', '')}`;
};

// Generate consistent camera number based on facing mode
const getCameraNumber = (facingMode: string): number => {
  // Use a hash of facing mode + device fingerprint for consistent numbering
  const fingerprint = generateDeviceFingerprint();
  const combined = `${facingMode}-${fingerprint}`;
  const hash = combined.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return Math.abs(hash) % 900 + 100; // 3-digit number between 100-999
};

export function useCameraAccess() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [deviceId, setDeviceId] = useState<string>(''); // Persistent device ID
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());

  useEffect(() => {
    // Generate persistent device ID once
    const persistentDeviceId = generateDeviceFingerprint();
    setDeviceId(persistentDeviceId);
    
    initializeCameras(persistentDeviceId);

    return () => {
      // Cleanup: Stop all streams when component unmounts
      streamsRef.current.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      streamsRef.current.clear();
    };
  }, []);

  const initializeCameras = async (persistentDeviceId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Get permission first
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      permissionStream.getTracks().forEach((track) => track.stop());

      // Create camera with current facing mode
      await createCameraStream(persistentDeviceId, facingMode);

      setIsLoading(false);
    } catch (err: any) {
      console.error('Error accessing cameras:', err);
      setError(
        err.message || 'Failed to access cameras. Please ensure camera permissions are granted.'
      );
      setIsLoading(false);
    }
  };

  const createCameraStream = async (persistentDeviceId: string, currentFacingMode: 'user' | 'environment') => {
    try {
      // Stop existing stream
      const existingStream = streamsRef.current.get(persistentDeviceId);
      if (existingStream) {
        existingStream.getTracks().forEach((track) => track.stop());
      }

      // Create new stream with current facing mode
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamsRef.current.set(persistentDeviceId, stream);

      // Generate camera label based on current mode
      const cameraNumber = getCameraNumber(currentFacingMode);
      const cameraLabel = `Camera ${cameraNumber} - ${persistentDeviceId}`;
      const cameraDeviceId = `${currentFacingMode}-camera-${persistentDeviceId}`;

      // Update cameras array with single camera (current active camera)
      setCameras([{
        deviceId: cameraDeviceId,
        label: cameraLabel,
        stream,
      }]);

      console.log(`✅ ${currentFacingMode} camera initialized:`, cameraLabel);
    } catch (err) {
      console.error(`Failed to initialize ${currentFacingMode} camera:`, err);
      throw err;
    }
  };

  const stopCamera = (cameraDeviceId: string) => {
    // Use persistent device ID for stream management
    const stream = streamsRef.current.get(deviceId);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const restartCamera = async (cameraDeviceId: string) => {
    if (!deviceId) return;
    
    try {
      await createCameraStream(deviceId, facingMode);
    } catch (err) {
      console.error('Error restarting camera:', err);
    }
  };

  const switchCamera = async () => {
    if (!deviceId) return;
    
    // Toggle between front and rear camera
    const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacingMode);
    
    console.log(`🔄 Switching to ${newFacingMode} camera on device ${deviceId}`);
    
    // Create new camera stream with switched facing mode
    await createCameraStream(deviceId, newFacingMode);
  };

  return {
    cameras,
    isLoading,
    error,
    currentCamera: cameras[0], // Always return the current active camera
    canSwitchCamera: true, // Always allow switching between front/back
    switchCamera,
    stopCamera,
    restartCamera,
    deviceId, // Expose persistent device ID
    facingMode, // Expose current facing mode
  };
}
