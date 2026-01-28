import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { type Camera } from "../types/camera.types";
import { isIOS } from "../utils/camera-utils";
import CaptureFlash from "./CaptureFlash";

interface CameraCardProps {
  camera: Camera;
  captureCount: number;
  showCameraDetails?: boolean;
}

export interface CameraCardRef {
  capture: () => Promise<{
    videoElement: HTMLVideoElement;
    cameraId: string;
    cameraLabel: string;
  } | null>;
  showFlash: () => void;
}

const CameraCard = forwardRef<CameraCardRef, CameraCardProps>(
  ({ camera, captureCount, showCameraDetails = false }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [showFlash, setShowFlash] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
      if (videoRef.current && camera.stream) {
        const video = videoRef.current;
        video.srcObject = camera.stream;
        
        // iOS-specific handling
        if (isIOS()) {
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          
          // Force play on iOS
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn('iOS video play failed:', error);
              // Retry after a short delay
              setTimeout(() => {
                video.play().catch(e => console.warn('iOS video retry failed:', e));
              }, 100);
            });
          }
        }

        // Handle video ready state
        const handleLoadedMetadata = () => {
          console.log('📹 Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
          setVideoReady(true);
        };

        const handleCanPlay = () => {
          console.log('📹 Video can play');
          setVideoReady(true);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('canplay', handleCanPlay);

        return () => {
          video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          video.removeEventListener('canplay', handleCanPlay);
        };
      }
    }, [camera.stream]);

    useImperativeHandle(ref, () => ({
      capture: async () => {
        if (!videoRef.current || !videoReady) {
          console.warn('Video not ready for capture');
          return null;
        }

        const video = videoRef.current;
        
        // Ensure video has valid dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.warn('Video has invalid dimensions:', video.videoWidth, 'x', video.videoHeight);
          return null;
        }

        return {
          videoElement: video,
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
      <div className="relative w-full h-full bg-white overflow-hidden flex justify-center flex-col min-h-0">
        {/* Camera Label */}
        {showCameraDetails && (
          <div className="absolute left-0 p-4 right-0 bottom-0 z-10 ">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-lg truncate">
                  {camera.label}
                </h3>
                <p className="text-gray-300 text-sm">
                  {camera.deviceId.substring(0, 8)}...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Video Preview */}
        <div className="relative h-full w-full bg-white flex justify-center items-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            webkit-playsinline="true"
            className="object-cover h-full w-full max-h-full"
          />

          {/* Loading indicator for video */}
          {!videoReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <p className="text-sm">Loading camera...</p>
              </div>
            </div>
          )}

          {/* Flash Effect */}
          {showFlash && <CaptureFlash />}

          {/* Online Indicator */}
          <div className="absolute lg:top-9 top-6 right-4 z-50 flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${videoReady ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
          </div>
        </div>
      </div>
    );
  },
);

CameraCard.displayName = "CameraCard";

export default CameraCard;
