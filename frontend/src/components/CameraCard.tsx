import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { type Camera } from "../types/camera.types";
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

    useEffect(() => {
      if (videoRef.current && camera.stream) {
        videoRef.current.srcObject = camera.stream;
      }
    }, [camera.stream]);

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
            {/* {captureCount > 0 && (
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {captureCount} captured
            </div>
          )} */}
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

          {/* Flash Effect */}
          {showFlash && <CaptureFlash />}

          {/* Online Indicator */}
          <div className="absolute lg:top-9 top-6 right-4 z-50 flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            {/* <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
              Live
            </span> */}
          </div>
        </div>
      </div>
    );
  },
);

CameraCard.displayName = "CameraCard";

export default CameraCard;
