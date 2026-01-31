import { forwardRef } from "react";
import { type Camera } from "../types/camera.types";
import CameraCard, { type CameraCardRef } from "./CameraCard";

interface CameraGridProps {
  cameras: Camera[];
  cameraRefs: React.MutableRefObject<(CameraCardRef | null)[]>;
  captureCounts: Record<string, number>;
  showCameraDetails?: boolean;
  connectedScreensData?: Record<string, Array<{screenId: string, label: string, serialNumber: number}>>;
}

const CameraGrid = forwardRef<HTMLDivElement, CameraGridProps>(
  ({ cameras, cameraRefs, captureCounts, showCameraDetails = false, connectedScreensData = {} }, ref) => {
    const getGridClass = () => {
      const count = cameras.length;
      if (count === 1) return "grid-cols-1";
      if (count === 2) return "grid-cols-1 md:grid-cols-2";
      if (count <= 4) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-2";
      if (count <= 6) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    };

    return (
      // <div ref={ref} className={`grid ${getGridClass()} w-full h-full border-2 border-red-500`}>
      <div
        ref={ref}
        className={`flex flex-col w-full h-full overflow-hidden min-h-0`}
      >
        {cameras.map((camera, index) => (
          <CameraCard
            key={camera.deviceId}
            ref={(el) => (cameraRefs.current[index] = el)}
            camera={camera}
            captureCount={captureCounts[camera.deviceId] || 0}
            showCameraDetails={showCameraDetails}
            cameraIndex={index}
            connectedScreens={connectedScreensData[camera.deviceId] || []}
          />
        ))}
      </div>
    );
  },
);

CameraGrid.displayName = "CameraGrid";

export default CameraGrid;
