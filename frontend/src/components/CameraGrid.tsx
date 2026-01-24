import { forwardRef } from 'react';
import { type Camera } from '../types/camera.types';
import CameraCard, { type CameraCardRef } from './CameraCard';

interface CameraGridProps {
  cameras: Camera[];
  cameraRefs: React.MutableRefObject<(CameraCardRef | null)[]>;
  captureCounts: Record<string, number>;
}

const CameraGrid = forwardRef<HTMLDivElement, CameraGridProps>(({ cameras, cameraRefs, captureCounts }, ref) => {
  const getGridClass = () => {
    const count = cameras.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2';
    if (count <= 6) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  return (
    <div ref={ref} className={`grid ${getGridClass()} gap-6 w-full`}>
      {cameras.map((camera, index) => (
        <CameraCard
          key={camera.deviceId}            key={camera.deviceId}          ref={(el) => (cameraRefs.current[index] = el)}
          camera={camera}
          captureCount={captureCounts[camera.deviceId] || 0}
        />
      ))}
    </div>
  );
});

CameraGrid.displayName = 'CameraGrid';

export default CameraGrid;
