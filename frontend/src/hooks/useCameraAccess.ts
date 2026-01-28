import { useState, useEffect, useRef } from 'react';
import { type Camera } from '../types/camera.types';
import { getDeviceType, getOptimalVideoConstraints, getCameraErrorMessage, requestCameraPermission } from '../utils/camera-utils';

// Generate unique device identifier (without timestamp for consistency)
const generateDeviceFingerprint = async (): Promise<string> => {
  // Use a combination of screen resolution and user agent hash (no timestamp)
  const screenInfo = `${screen.width}x${screen.height}`;
  const userAgentHash = navigator.userAgent.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const deviceId = Math.abs(userAgentHash).toString(36).substring(0, 6);
  
  return `${deviceId}${screenInfo.replace('x', '')}`;
};

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

      const deviceType = getDeviceType();
      console.log(`🔍 Detected device type: ${deviceType}`);

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Request permission first with device-specific approach
      console.log('📱 Requesting camera permission...');
      const hasPermission = await requestCameraPermission(deviceType);
      if (!hasPermission) {
        throw new Error('Camera permission denied');
      }

      // Get all video input devices
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      );

      console.log(`Found ${videoDevices.length} camera device(s):`, videoDevices);

      if (videoDevices.length === 0) {
        setError('No cameras found on this device');
        setIsLoading(false);
        return;
      }

      // Create unique device identifier
      const deviceFingerprint = await generateDeviceFingerprint();
      const deviceIndex = Math.floor(Math.random() * 999) + 1;
      
      // Always use rear camera regardless of device type
      const rearCameraDevices = [
        {
          deviceId: `rear-camera-${deviceFingerprint}`, 
          label: `Camera ${deviceIndex} - ${deviceFingerprint}`,
          kind: 'videoinput' as MediaDeviceKind,
          groupId: 'rear-only'
        }
      ];

      console.log(`🎯 Forcing REAR camera only for ${deviceType.toUpperCase()} device`);

      // Initialize cameras with device-specific constraints
      const initializedCameras: Camera[] = [];

      for (const device of rearCameraDevices) {
        try {
          console.log(`📷 Initializing camera: ${device.label}`);
          
          // Get optimal constraints for this device type
          const videoConstraints = getOptimalVideoConstraints(deviceType);
          
          const constraints = {
            video: videoConstraints
          };

          console.log(`📋 Using constraints for ${deviceType}:`, constraints);

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamsRef.current.set(device.deviceId, stream);

          initializedCameras.push({
            deviceId: device.deviceId,
            label: device.label,
            stream,
          });

          console.log(`✅ Successfully initialized: ${device.label}`);
        } catch (err: any) {
          console.error(`❌ Failed to initialize camera ${device.label}:`, err);
          
          // For iOS, try fallback constraints if the optimal ones fail
          if (deviceType === 'ios') {
            try {
              console.log('🔄 Trying iOS fallback constraints...');
              const fallbackConstraints = {
                video: {
                  facingMode: 'environment',
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              };
              
              const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
              streamsRef.current.set(device.deviceId, stream);

              initializedCameras.push({
                deviceId: device.deviceId,
                label: device.label,
                stream,
              });

              console.log(`✅ iOS fallback successful: ${device.label}`);
            } catch (fallbackErr) {
              console.error(`❌ iOS fallback also failed:`, fallbackErr);
            }
          }
        }
      }

      if (initializedCameras.length === 0) {
        throw new Error('Failed to initialize any cameras');
      }

      setCameras(initializedCameras);
      setIsLoading(false);
    } catch (err: any) {
      console.error('❌ Error accessing cameras:', err);
      const deviceType = getDeviceType();
      setError(getCameraErrorMessage(err, deviceType));
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

      const deviceType = getDeviceType();
      const videoConstraints = getOptimalVideoConstraints(deviceType);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints
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
