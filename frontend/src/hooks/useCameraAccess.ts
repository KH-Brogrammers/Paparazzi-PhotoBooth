import { useState, useEffect, useRef } from 'react';
import { type Camera } from '../types/camera.types';

// Enhanced iOS detection utility
const detectDevice = () => {
  const userAgent = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isWebKit = /webkit/i.test(userAgent);
  
  // Detect specific iOS versions for compatibility
  const iosVersion = isIOS ? parseFloat(
    (userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/) || [])[1] + '.' + 
    ((userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/) || [])[2] || '0')
  ) : null;

  return {
    isIOS,
    isSafari,
    isWebKit,
    iosVersion,
    needsWebkitPlaysinline: isIOS && iosVersion && iosVersion < 10
  };
};

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

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Detect iOS/iPhone/iPad for enhanced compatibility
      const deviceInfo = detectDevice();
      console.log(`📱 Device detection:`, deviceInfo);

      // Get all video input devices first
      let devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(
        (device) => device.kind === 'videoinput'
      );

      // If no devices found or labels are empty, request permission first
      if (videoDevices.length === 0 || !videoDevices[0].label) {
        console.log('Requesting camera permission...');
        
        // iOS-specific permission request with multiple fallbacks
        let permissionStream;
        if (deviceInfo.isIOS) {
          try {
            // Try with specific iOS constraints first
            permissionStream = await navigator.mediaDevices.getUserMedia({
              video: { 
                facingMode: 'environment',
                width: { min: 640, ideal: 1280, max: 1920 },
                height: { min: 480, ideal: 720, max: 1080 }
              }
            });
          } catch (iosErr) {
            console.log('📱 iOS specific constraints failed, trying basic...');
            // Fallback to basic constraints
            permissionStream = await navigator.mediaDevices.getUserMedia({
              video: true
            });
          }
        } else {
          permissionStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
        }

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
      
      // Create unique device identifier
      const deviceFingerprint = await generateDeviceFingerprint();
      const deviceIndex = Math.floor(Math.random() * 999) + 1; // Random 3-digit number
      
      // Always use rear camera regardless of device type
      const rearCameraDevices = [
        {
          deviceId: `rear-camera-${deviceFingerprint}`, 
          label: `Camera ${deviceIndex} - ${deviceFingerprint}`,
          kind: 'videoinput' as MediaDeviceKind,
          groupId: 'rear-only'
        }
      ];

      videoDevices = rearCameraDevices;
      console.log('✅ All devices forced to use REAR camera only with unique ID:', deviceFingerprint);

      // Initialize cameras with streams one by one
      const initializedCameras: Camera[] = [];

      for (const device of videoDevices) {
        try {
          console.log(`Initializing camera: ${device.label || device.deviceId}`);
          
          let constraints;
          let stream;
          
          // iOS/iPhone specific constraints with multiple fallbacks
          if (deviceInfo.isIOS) {
            console.log('📱 Using iOS-optimized camera constraints');
            
            // Try multiple constraint configurations for iOS
            const iosConstraints = [
              // First attempt: High quality with exact rear camera
              {
                video: {
                  facingMode: { exact: 'environment' },
                  width: { min: 640, ideal: 1280, max: 1920 },
                  height: { min: 480, ideal: 720, max: 1080 },
                  frameRate: { ideal: 30, max: 60 }
                }
              },
              // Second attempt: Medium quality with preferred rear camera
              {
                video: {
                  facingMode: 'environment',
                  width: { ideal: 1280 },
                  height: { ideal: 720 }
                }
              },
              // Third attempt: Basic rear camera
              {
                video: {
                  facingMode: 'environment'
                }
              },
              // Fourth attempt: Any rear camera (for older iOS)
              {
                video: {
                  facingMode: { ideal: 'environment' }
                }
              },
              // Final fallback: Any camera
              {
                video: true
              }
            ];

            let lastError;
            for (const constraint of iosConstraints) {
              try {
                console.log('📱 Trying iOS constraint:', constraint);
                stream = await navigator.mediaDevices.getUserMedia(constraint);
                console.log('📱 iOS constraint successful!');
                break;
              } catch (err) {
                console.log('📱 iOS constraint failed, trying next...', err);
                lastError = err;
              }
            }

            if (!stream) {
              throw lastError || new Error('All iOS camera constraints failed');
            }
          } else {
            // Standard constraints for other devices
            constraints = {
              video: {
                facingMode: 'environment', // Force rear camera
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
          }

          streamsRef.current.set(device.deviceId, stream);

          initializedCameras.push({
            deviceId: device.deviceId,
            label: device.label || `Camera ${initializedCameras.length + 1}`,
            stream,
          });

          console.log(`✅ Successfully initialized: ${device.label || device.deviceId}`);
        } catch (err) {
          console.error(`❌ Failed to initialize camera ${device.label || device.deviceId}:`, err);
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

      // Detect iOS for enhanced compatibility
      const deviceInfo = detectDevice();
      let stream;

      if (deviceInfo.isIOS) {
        console.log('📱 Restarting camera with iOS-optimized constraints');
        
        // Try multiple constraint configurations for iOS
        const iosConstraints = [
          {
            video: {
              facingMode: { exact: 'environment' },
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 },
              frameRate: { ideal: 30, max: 60 }
            }
          },
          {
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          {
            video: {
              facingMode: 'environment'
            }
          },
          {
            video: {
              facingMode: { ideal: 'environment' }
            }
          },
          {
            video: true
          }
        ];

        let lastError;
        for (const constraint of iosConstraints) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraint);
            break;
          } catch (err) {
            lastError = err;
          }
        }

        if (!stream) {
          throw lastError || new Error('All iOS camera restart constraints failed');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Always rear camera
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
      }

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
