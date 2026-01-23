import './App.css'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router'
import { useState, useEffect } from 'react'
import CameraPage from './pages/CameraPage'
import ScreensPage from './pages/ScreensPage'
import AdminPage from './pages/AdminPage'

function GlobalCameraSwitchButton() {
  const location = useLocation();
  const [cameras, setCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  
  // Only show on camera page (/)
  if (location.pathname !== '/') {
    return null;
  }

  useEffect(() => {
    // Listen for camera detection from the camera page
    const handleCamerasDetected = (event: CustomEvent) => {
      setCameras(event.detail.cameras);
    };

    window.addEventListener('cameras-detected', handleCamerasDetected as EventListener);
    
    return () => {
      window.removeEventListener('cameras-detected', handleCamerasDetected as EventListener);
    };
  }, []);

  const switchCamera = () => {
    if (cameras.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      
      // Emit event to camera page to switch camera
      window.dispatchEvent(new CustomEvent('switch-camera', { 
        detail: { cameraIndex: nextIndex } 
      }));
    }
  };

  if (cameras.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <button
        onClick={switchCamera}
        className="flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
        title={cameras.length > 1 ? `Switch Camera (${cameras.length} available)` : `Camera Switch (${cameras.length} detected)`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CameraPage />} />
        <Route path="/screens" element={<ScreensPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      <GlobalCameraSwitchButton />
    </BrowserRouter>
  )
}

export default App
