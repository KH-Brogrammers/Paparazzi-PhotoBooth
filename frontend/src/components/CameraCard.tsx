import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { type Camera } from '../types/camera.types';
import CaptureFlash from './CaptureFlash';

interface CameraCardProps {
  camera: Camera;
  captureCount: number;
}

export interface CameraCardRef {
  capture: () => Promise<{ videoElement: HTMLVideoElement; cameraId: string; cameraLabel: string } | null>;
  showFlash: () => void;
}

const CameraCard = forwardRef<CameraCardRef, CameraCardProps>(({ camera, captureCount }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Set the new stream
    if (camera.stream) {
      // Clear any existing stream first
      if (videoElement.srcObject) {
        const oldStream = videoElement.srcObject as MediaStream;
        if (oldStream !== camera.stream) {
          oldStream.getTracks().forEach(track => {
            // Don't stop tracks here, they're managed by the hook
          });
        }
      }
      
      videoElement.srcObject = camera.stream;
      
      // Ensure video plays
      videoElement.play().catch(err => {
        console.error('Error playing video:', err);
      });
    }

    return () => {
      // Cleanup when component unmounts
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
    };
  }, [camera.stream, camera.deviceId]);

  useImperativeHandle(ref, () => ({
    capture: async () => {
      if (!videoRef.current) return null;
      
      return {
        videoElement: videoRef.current,
        cameraId: camera.deviceId,
        cameraLabel: camera.label,
      };
    },
    showFlash: () => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    },
  }));

  return (
    <div className="relative bg-gray-900 md:rounded-xl overflow-hidden shadow-2xl border-2 border-gray-800 hover:border-blue-500 transition-all duration-300 group h-screen md:h-auto">
      {/* Camera Label */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-lg truncate">
              {camera.label}
            </h3>
            <p className="text-gray-300 text-sm">
              {camera.deviceId.substring(0, 8)}...
            </p>
          </div>
          {captureCount > 0 && (
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {captureCount} captured
            </div>
          )}
        </div>
      </div>

      {/* Video Preview */}
      <div className="relative h-full md:aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        
        {/* Flash Effect */}
        {showFlash && <CaptureFlash />}

        {/* Online Indicator */}
        <div className="absolute top-4 right-4 flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
            Live
          </span>
        </div>
      </div>
    </div>
  );
});

CameraCard.displayName = 'CameraCard';

export default CameraCard;
