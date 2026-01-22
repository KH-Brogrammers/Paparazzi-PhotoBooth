import { useEffect, useState, useRef } from "react";
import { socketClient } from "../services/socket.service";
import { screenApi } from "../services/backend-api.service";
import { detectScreens, getCurrentScreenInfo } from "../utils/screenDetection";
import { type ImageData } from "../types/screen.types";
import LogoPlaceholder from "../components/LogoPlaceholder";

function ScreensPage() {
  const [screenId, setScreenId] = useState<string>("");
  const [screenLabel, setScreenLabel] = useState<string>("");
  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const socketRef = useRef<any>(null);

  const initializeScreen = async () => {
    try {
      // Try to detect screen using Window Placement API
      const screens = await detectScreens();

      let screenInfo;
      if (screens.length > 0) {
        // Window Placement API is available
        screenInfo = screens[0]; // Use first detected screen for now
        console.log(
          "✅ Screen detected using Window Placement API:",
          screenInfo,
        );
      } else {
        // Fallback to unique ID generation
        screenInfo = getCurrentScreenInfo();
        setError(
          "Window Placement API not available. Using fallback mode. You can label this screen in the admin panel.",
        );
        console.warn("⚠️ Using fallback screen detection");
      }

      setScreenId(screenInfo.screenId);
      setScreenLabel(screenInfo.label);

      // Register screen with backend
      await screenApi.register({
        screenId: screenInfo.screenId,
        label: screenInfo.label,
        position: screenInfo.position,
        resolution: screenInfo.resolution,
        isPrimary: screenInfo.isPrimary,
      });

      console.log("✅ Screen registered with backend");
      setIsRegistered(true);

      // Connect to socket
      const socket = socketClient.connect();
      socketRef.current = socket;

      // Register with socket server
      socket.emit("register:screen", screenInfo.screenId);

      // Listen for captured images
      socket.on("image:captured", (imageData: ImageData) => {
        console.log("📸 Received image:", imageData);
        setCurrentImage(imageData);
      });

      // Listen for mapping updates
      socket.on("mappings:updated", () => {
        console.log("🔄 Mappings updated");
      });
    } catch (err) {
      console.error("Error initializing screen:", err);
      setError("Failed to initialize screen. Please refresh the page.");
    }
  };

  useEffect(() => {
    initializeScreen();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  if (error && !isRegistered) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-xl p-8 max-w-2xl">
          <div className="flex items-center justify-center w-16 h-16 bg-yellow-500 rounded-full mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-white text-xl font-bold text-center mb-2">
            Screen Detection Warning
          </h2>
          <p className="text-gray-300 text-center mb-4">{error}</p>
          <div className="bg-gray-800 p-4 rounded-lg text-sm text-gray-400">
            <p className="mb-2">
              <strong className="text-white">Screen ID:</strong> {screenId}
            </p>
            <p>
              <strong className="text-white">Label:</strong> {screenLabel}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-white">
      {/* Screen Info Overlay (Hidden in production) */}
      <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-50">
        <p>
          <strong>Screen ID:</strong> {screenId}
        </p>
        <p>
          <strong>Label:</strong> {screenLabel}
        </p>
        <p className={`${currentImage ? "text-green-400" : "text-gray-400"}`}>
          {currentImage ? "● Active" : "○ Waiting"}
        </p>
      </div>

      {/* Display captured image or logo */}
      {currentImage ? (
        <div className="w-full h-full flex justify-center bg-white">
          <img
            src={currentImage.imageUrl}
            alt={`Captured from ${currentImage.cameraLabel}`}
            className="max-w-full max-h-full object-cover origin-top"
          />

          {/* Image Info */}
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
            <p>
              <strong>Camera:</strong> {currentImage.cameraLabel}
            </p>
            <p>
              <strong>Time:</strong>{" "}
              {new Date(currentImage.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ) : (
        <LogoPlaceholder />
      )}
    </div>
  );
}

export default ScreensPage;
