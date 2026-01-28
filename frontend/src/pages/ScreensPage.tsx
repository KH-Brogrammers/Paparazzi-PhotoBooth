import { useEffect, useState, useRef } from "react";
import { socketClient } from "../services/socket.service";
import { screenApi } from "../services/backend-api.service";
import { detectScreens, getCurrentScreenInfo, generateScreenId } from "../utils/screenDetection";
import { generateId } from "../utils/helpers";
import { type ImageData } from "../types/screen.types";
import LogoPlaceholder from "../components/LogoPlaceholder";

function ScreensPage() {
  const [screenId, setScreenId] = useState<string>("");
  const [screenLabel, setScreenLabel] = useState<string>("");
  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isCollageScreen, setIsCollageScreen] = useState(false);
  const socketRef = useRef<any>(null);

  const captureScreenDisplay = async (originalImageData: ImageData) => {
    try {
      // Capture the current screen content
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      // Set canvas size to screen size
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Use html2canvas to capture the screen content
      const html2canvas = (await import("html2canvas")).default;
      const screenCanvas = await html2canvas(document.body, {
        width: window.innerWidth,
        height: window.innerHeight,
        useCORS: true,
        allowTaint: true,
      });

      // Convert to base64
      const screenImageData = screenCanvas.toDataURL("image/jpeg", 0.9);

      // Send the screen capture back to server for storage
      await screenApi.saveScreenCapture({
        screenId,
        originalImageId: originalImageData.imageId,
        cameraId: originalImageData.cameraId,
        screenImageData,
        timestamp: Date.now(),
      });

      console.log("📸 Screen display captured and saved");
    } catch (error) {
      console.error("Error capturing screen display:", error);
    }
  };

  const initializeScreen = async () => {
    if (isInitialized) return; // Prevent double initialization
    setIsInitialized(true);

    try {
      // Try to detect screen using Window Placement API
      const screens = await detectScreens();

      let screenInfo;
      if (screens.length > 0) {
        // Window Placement API is available, but use unique ID for each tab
        const detectedScreen = screens[0];
        screenInfo = {
          ...detectedScreen,
          screenId: generateScreenId(), // Always use unique ID for each tab
          label: `${detectedScreen.label} - Tab ${generateId().slice(-3)}` // Add tab identifier
        };
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
        isPrimary: false, // Set to false by default
      });

      console.log("✅ Screen registered with backend");

      // Fetch screen details to check if collage screen
      const screensDetail = await screenApi.getAll();
      const thisScreen = screensDetail.find(
        (s: any) => s.screenId === screenInfo.screenId,
      );
      if (thisScreen) {
        const isCollage = thisScreen?.isCollageScreen || false;
        setIsCollageScreen(isCollage);
        console.log(
          `🖼️ Screen ${screenInfo.screenId} is collage screen: ${isCollage}`,
        );
      }

      setIsRegistered(true);

      // Connect to socket
      const socket = socketClient.connect();
      socketRef.current = socket;

      // Register with socket server
      socket.emit("register:screen", screenInfo.screenId);

      // Listen for collage updates
      socket.on(
        "collage:updated",
        ({
          screenId: updatedScreenId,
          isCollageScreen: newCollageState,
        }: any) => {
          if (updatedScreenId === screenInfo.screenId) {
            console.log(
              `🖼️ This screen is ${newCollageState ? "now" : "no longer"} the collage screen`,
            );
            setIsCollageScreen(newCollageState); // Update the state
            if (!newCollageState) {
              setCurrentImage(null); // Clear current image when no longer collage screen
            }
          }
        },
      );

      // Listen for mapping updates
      socket.on("mappings:updated", () => {
        console.log("🔄 Mappings updated");
      });

      // Listen for clear screens event
      socket.on("screens:clear", () => {
        console.log("🧹 Clearing screen display");
        setCurrentImage(null);
      });

      // Listen for screen refresh event
      socket.on("screen:refresh", () => {
        console.log("🔄 Screen refresh requested - reloading page");
        alert("Screen refresh requested - page will reload in 2 seconds");
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      });

      // Listen for screen details toggle
      socket.on("admin:toggle-screen-details", ({ show }) => {
        console.log(`📺 Screen details toggle: ${show ? "show" : "hide"}`);
        setShowDetails(show);
      });
    } catch (err) {
      console.error("Error initializing screen:", err);
      setError("Failed to initialize screen. Please refresh the page.");
      setIsInitialized(false); // Reset on error
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

  // Re-setup socket listeners when isCollageScreen changes
  useEffect(() => {
    if (socketRef.current && isRegistered) {
      // Remove old listener
      socketRef.current.off("image:captured");

      // Add new listener with current state
      const handleImageCaptured = (imageData: ImageData) => {
        console.log("📸 Received image:", imageData);
        console.log("🖼️ Current screen isCollageScreen:", isCollageScreen);
        console.log("🖼️ Image isCollage:", imageData.isCollage);

        if (imageData.isCollage) {
          if (isCollageScreen) {
            setCurrentImage(imageData);
            console.log(
              `🖼️ Displaying collage (${imageData.orientation}) on collage screen`,
            );
          } else {
            console.log(
              `🖼️ Ignoring collage image - this is not a collage screen`,
            );
          }
        } else {
          if (!isCollageScreen) {
            setCurrentImage(imageData);
            setTimeout(() => {
              captureScreenDisplay(imageData);
            }, 100);
          } else {
            console.log(`📸 Ignoring regular image - this is a collage screen`);
          }
        }
      };

      socketRef.current.on("image:captured", handleImageCaptured);
    }
  }, [isCollageScreen, isRegistered]);

  if (error && !isRegistered) {
    return (
      <div className="flex flex-col items-center relative justify-center h-full w-full p-6">
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
          <img src="/logo1.png" alt="" className="lg:w-54 w-32" />
        </div>
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
      {/* Collage Screen Indicator */}
      {isCollageScreen && showDetails && (
        <div className="absolute top-4 left-4 bg-purple-600 text-white px-4 py-2 rounded-lg text-lg font-bold z-50">
          🖼️ COLLAGE SCREEN
        </div>
      )}

      {/* Screen Info Overlay - Only show when toggled */}
      {showDetails && (
        <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-50">
          <p>
            <strong>Screen ID:</strong> {screenId}
          </p>
          <p>
            <strong>Label:</strong> {screenLabel}
          </p>
          <p>
            <strong>Type:</strong>{" "}
            {isCollageScreen ? "Collage Screen" : "Regular Screen"}
          </p>
          <p className={`${currentImage ? "text-green-400" : "text-gray-400"}`}>
            {currentImage ? "● Active" : "○ Waiting"}
          </p>
        </div>
      )}

      {/* Display captured image or logo */}
      {currentImage ? (
        <div className="w-full relative h-full flex justify-center items-start bg-white">
          <img
            src={currentImage.imageUrl}
            alt={`${currentImage.isCollage ? "Collage" : `Captured from ${currentImage.cameraLabel}`}`}
            className={`w-fit h-fit ${currentImage.isCollage ? "object-contain" : "object-cover"}`}
            onLoad={() => {
              console.log("Image loaded successfully:", currentImage.imageUrl);
            }}
          />
          
          {/* Logo overlay on top-center */}
          <img
            src="/logo1.png"
            alt="Logo"
            className="absolute top-4 left-1/2 transform -translate-x-1/2 w-48 lg:w-68 z-10"
          />
          
          {/* Bottom logo only for collage screens */}
          {currentImage.isCollage && (
            <img
              src="/logo.png"
              alt="Logo"
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-32 lg:w-48 z-10"
            />
          )}

          {/* Image Info - Only show when toggled */}
          {showDetails && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
              <p>
                <strong>Type:</strong>{" "}
                {currentImage.isCollage ? "Collage" : "Camera Image"}
              </p>
              {!currentImage.isCollage && (
                <p>
                  <strong>Camera:</strong> {currentImage.cameraLabel}
                </p>
              )}
              {currentImage.isCollage && currentImage.orientation && (
                <p>
                  <strong>Orientation:</strong> {currentImage.orientation}
                </p>
              )}
              <p>
                <strong>Time:</strong>{" "}
                {new Date(currentImage.timestamp).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      ) : isCollageScreen ? (
        <div className="w-full relative h-full flex justify-center items-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
            <img src="/logo.png" alt="" className="lg:w-54 w-32" />
          </div>
          <div className="text-gray-600 text-2xl">Waiting for collage...</div>
        </div>
      ) : (
        <LogoPlaceholder />
      )}
    </div>
  );
}

export default ScreensPage;
