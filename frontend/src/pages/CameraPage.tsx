import { useRef, useState, useEffect } from 'react';
import { useCameraAccess } from '../hooks/useCameraAccess';
import { useImageCapture } from '../hooks/useImageCapture';
import { screenApi, imageApi } from '../services/backend-api.service';
import CameraGrid from '../components/CameraGrid';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { type CameraCardRef } from '../components/CameraCard';

function CameraPage() {
  const { cameras, isLoading, error } = useCameraAccess();
  const { captureImage, isCapturing } = useImageCapture();
  const cameraRefs = useRef<(CameraCardRef | null)[]>([]);
  const [captureCounts, setCaptureCounts] = useState<Record<string, number>>({});

  // Load capture counts from database on mount
  useEffect(() => {
    const loadCaptureCounts = async () => {
      try {
        const response = await imageApi.getCaptureCounts();
        if (response.counts) {
          setCaptureCounts(response.counts);
        }
      } catch (error) {
        console.error('Error loading capture counts:', error);
      }
    };

    loadCaptureCounts();
  }, []);

  const handleCaptureAll = async () => {
    if (isCapturing || cameras.length === 0) return;

    // Show flash on all cameras
    cameraRefs.current.forEach((ref) => {
      ref?.showFlash();
    });

    // Capture from all cameras
    const capturePromises = cameraRefs.current.map(async (ref) => {
      if (!ref) return null;

      const cameraData = await ref.capture();
      if (!cameraData) return null;

      return captureImage(
        cameraData.videoElement,
        cameraData.cameraId,
        cameraData.cameraLabel
      );
    });

    const results = await Promise.all(capturePromises);

    // Update capture counts for successful captures
    const newCounts = { ...captureCounts };
    results.forEach((result) => {
      if (result) {
        newCounts[result.cameraId] = (newCounts[result.cameraId] || 0) + 1;
      }
    });
    setCaptureCounts(newCounts);
  };

  const handleClearScreens = async () => {
    try {
      await screenApi.clearAll();
    } catch (error) {
      console.error('Error clearing screens:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      {/* Header */}
      <header className="mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-2">
            Photo Shoot Studio
          </h1>
          <p className="text-gray-400 text-lg">
            {cameras.length} {cameras.length === 1 ? 'camera' : 'cameras'}{' '}
            detected and online
          </p>
        </div>
      </header>

      {/* Camera Grid */}
      <main className="max-w-7xl mx-auto">
        {cameras.length === 0 ? (
          <div className="bg-gray-800 border-2 border-gray-700 rounded-xl p-12 text-center">
            <svg
              className="w-16 h-16 text-gray-600 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
            </svg>
            <h2 className="text-white text-2xl font-bold mb-2">
              No Cameras Found
            </h2>
            <p className="text-gray-400">
              Please connect a camera to get started
            </p>
          </div>
        ) : (
          <>
            <CameraGrid 
              cameras={cameras} 
              cameraRefs={cameraRefs}
              captureCounts={captureCounts}
            />
            
            {/* Global Capture Button */}
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
              <button
                onClick={handleCaptureAll}
                disabled={isCapturing}
                className={`
                  px-8 py-4 rounded-full font-bold text-white text-lg
                  transition-all duration-200 transform
                  ${
                    isCapturing
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 hover:scale-110 active:scale-95'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-2xl hover:shadow-blue-500/50
                  flex items-center space-x-3
                `}
              >
                <svg
                  className={`w-8 h-8 ${isCapturing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isCapturing ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  ) : (
                    <>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </>
                  )}
                </svg>
                <span>{isCapturing ? 'Capturing...' : `Capture All Cameras (${cameras.length})`}</span>
              </button>
            </div>
          </>
        )}
      </main>

      {/* Refresh button - Global */}
      <button
        onClick={handleClearScreens}
        className="fixed bottom-4 right-4 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-colors z-50"
        title="Clear all screens"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-6 w-6" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
          />
        </svg>
      </button>
    </div>
  );
}

export default CameraPage;
