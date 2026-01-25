import { useEffect, useState, useRef } from "react";
import { socketClient } from "../services/socket.service";
import { screenApi } from "../services/backend-api.service";
import { detectScreens, getCurrentScreenInfo } from "../utils/screenDetection";
import { type ImageData, type ScreenCaptureData } from "../types/screen.types";
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
  const [screenCaptures, setScreenCaptures] = useState<Map<string, ScreenCaptureData>>(new Map());
  const socketRef = useRef<any>(null);
  const collageCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const createCollage = async () => {
    const canvas = collageCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get all screen captures
    const captures = Array.from(screenCaptures.values());
    if (captures.length === 0) return;

    // Calculate canvas size based on positions
    let maxX = 0;
    let maxY = 0;

    captures.forEach((capture) => {
      const pos = capture.position || { x: 0, y: 0, width: 800, height: 600 };
      const right = pos.x + (pos.width || 800);
      const bottom = pos.y + (pos.height || 600);
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });

    // Set canvas size
    canvas.width = maxX || 1920;
    canvas.height = maxY || 1080;

    // Fill white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw each screen capture
    for (const capture of captures) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = () => {
            const pos = capture.position || { x: 0, y: 0, width: img.width, height: img.height };
            
            // Save current context
            ctx.save();
            
            // Move to position
            ctx.translate(pos.x, pos.y);
            
            // Apply rotation if needed
            if (capture.rotation === 90) {
              ctx.rotate((90 * Math.PI) / 180);
              ctx.drawImage(img, 0, -pos.width, pos.height, pos.width);
            } else if (capture.rotation === -90) {
              ctx.rotate((-90 * Math.PI) / 180);
              ctx.drawImage(img, -pos.height, 0, pos.height, pos.width);
            } else {
              ctx.drawImage(img, 0, 0, pos.width, pos.height);
            }
            
            // Restore context
            ctx.restore();
            resolve(null);
          };
          img.onerror = reject;
          img.src = capture.imageUrl;
        });
      } catch (error) {
        console.error('Error drawing image in collage:', error);
      }
    }

    // Upload collage to S3
    try {
      const collageImageData = canvas.toDataURL('image/jpeg', 0.9);
      await screenApi.uploadCollage(collageImageData, Date.now());
      console.log('🖼️ Collage uploaded successfully');
    } catch (error) {
      console.error('Error uploading collage:', error);
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
        isPrimary: false, // Set to false by default
      });

      console.log("✅ Screen registered with backend");
      
      // Fetch screen details to check if collage screen
      const screensDetail = await screenApi.getAll();
      const thisScreen = screensDetail.find((s: any) => s.screenId === screenInfo.screenId);
      if (thisScreen) {
        setIsCollageScreen(thisScreen?.isCollageScreen || false);
      }
      
      setIsRegistered(true);

      // Connect to socket
      const socket = socketClient.connect();
      socketRef.current = socket;

      // Register with socket server
      socket.emit("register:screen", screenInfo.screenId);

      // Listen for captured images (for regular screens)
      socket.on("image:captured", (imageData: ImageData) => {
        if (!thisScreen?.isCollageScreen) {
          console.log("📸 Received image:", imageData);
          setCurrentImage(imageData);

          // After displaying the image, capture what's shown on screen and send back
          setTimeout(() => {
            captureScreenDisplay(imageData);
          }, 100); // Small delay to ensure image is rendered
        }
      });

      // Listen for screen captures (for collage screen)
      socket.on("screen:capture-ready", (captureData: ScreenCaptureData) => {
        if (thisScreen?.isCollageScreen) {
          console.log("🖼️ Received screen capture for collage:", captureData);
          setScreenCaptures(prev => {
            const newMap = new Map(prev);
            newMap.set(captureData.screenId, captureData);
            return newMap;
          });
        }
      });

      // Listen for collage updates
      socket.on("collage:updated", ({ screenId: updatedScreenId, isCollageScreen: newCollageState }: any) => {
        if (updatedScreenId === screenInfo.screenId) {
          console.log(`🖼️ This screen is ${newCollageState ? 'now' : 'no longer'} the collage screen`);
          setIsCollageScreen(newCollageState);
          if (newCollageState) {
            setCurrentImage(null); // Clear current image when becoming collage
          } else {
            setScreenCaptures(new Map()); // Clear collage data when becoming regular screen
          }
        }
      });

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
      socket.on("screen:toggle-details", ({ show }) => {
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

  // Create collage when screen captures update
  useEffect(() => {
    if (isCollageScreen && screenCaptures.size > 0) {
      createCollage();
    }
  }, [screenCaptures, isCollageScreen]);

  if (error && !isRegistered) {
    return (
      <div className="flex flex-col items-center relative justify-center h-full w-full p-6">
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
          <img src="/logo.png" alt="" className="lg:w-54 w-32" />
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
      {/* Screen Info Overlay - Only show when toggled */}
      {showDetails && (
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
      )}

      {/* Display captured image or logo */}
      {isCollageScreen ? (
        // Collage Screen Display
        <div className="w-full relative h-full flex justify-center items-center bg-white">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
            <img src="/logo.png" alt="" className="lg:w-54 w-32" />
          </div>
          {screenCaptures.size > 0 ? (
            <canvas
              ref={collageCanvasRef}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-gray-600 text-2xl">
              Waiting for screen captures...
            </div>
          )}
        </div>
      ) : currentImage ? (
        // Regular Screen Display
        <div className="w-full relative h-full flex justify-center bg-white">
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
            <img src="/logo.png" alt="" className="lg:w-54 w-32" />
          </div>
          <img
            src={currentImage.imageUrl}
            alt={`Captured from ${currentImage.cameraLabel}`}
            className="max-w-full max-h-full object-cover origin-top"
          />

          {/* Image Info - Only show when toggled */}
          {showDetails && (
            <div className="absolute bottom-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
              <p>
                <strong>Camera:</strong> {currentImage.cameraLabel}
              </p>
              <p>
                <strong>Time:</strong>{" "}
                {new Date(currentImage.timestamp).toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>
      ) : (
        <LogoPlaceholder />
      )}
    </div>
  );
}

export default ScreensPage;
