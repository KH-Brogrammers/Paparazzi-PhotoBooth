import { useRef, useState, useEffect } from "react";
import { useCameraAccess } from "../hooks/useCameraAccess";
import { useImageCapture } from "../hooks/useImageCapture";
import { screenApi, imageApi, mappingApi } from "../services/backend-api.service";
import { socketClient } from "../services/socket.service";
import CameraGrid from "../components/CameraGrid";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import { type CameraCardRef } from "../components/CameraCard";

function CameraPage() {
  const {
    cameras,
    isLoading,
    error,
    currentCamera,
    canSwitchCamera,
    switchCamera,
    deviceId,
    facingMode,
  } = useCameraAccess();
  const { captureImage, isCapturing } = useImageCapture();
  const cameraRefs = useRef<(CameraCardRef | null)[]>([]);
  const [captureCounts, setCaptureCounts] = useState<Record<string, number>>(
    {},
  );
  const [isPrimaryCamera, setIsPrimaryCamera] = useState(false);
  const [socket, setSocket] = useState<any>(null);
  const [showCapturedMessage, setShowCapturedMessage] = useState(false);
  const [totalCameraCount, setTotalCameraCount] = useState(1);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showCameraDetails, setShowCameraDetails] = useState(false);
  const [connectedScreensData, setConnectedScreensData] = useState<Record<string, Array<{screenId: string, label: string, serialNumber: number}>>>({});
  const adminRequestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load capture counts from database on mount
  useEffect(() => {
    const loadCaptureCounts = async () => {
      try {
        const response = await imageApi.getCaptureCounts();
        if (response.counts) {
          setCaptureCounts(response.counts);
        }
      } catch (error) {
        console.error("Error loading capture counts:", error);
      }
    };

    loadCaptureCounts();
  }, []);

  // Load connected screens data when camera details are shown
  useEffect(() => {
    const loadConnectedScreensData = async () => {
      if (!showCameraDetails || cameras.length === 0) {
        setConnectedScreensData({});
        return;
      }

      try {
        const [mappings, screens] = await Promise.all([
          mappingApi.getAll(),
          screenApi.getAll()
        ]);

        // Filter built-in screens
        const filterBuiltInScreens = (screens: any[]) => {
          return screens.filter(screen => 
            !screen.label?.toLowerCase().includes('built-in') && 
            !screen.label?.toLowerCase().includes('internal')
          );
        };

        const filteredScreens = filterBuiltInScreens(screens);
        
        const connectedData: Record<string, Array<{screenId: string, label: string, serialNumber: number}>> = {};
        
        cameras.forEach(camera => {
          const mapping = mappings.find((m: any) => m.cameraId === camera.deviceId);
          if (mapping && mapping.screenIds) {
            connectedData[camera.deviceId] = mapping.screenIds
              .map((screenId: string) => {
                const screen = filteredScreens.find((s: any) => s.screenId === screenId);
                if (screen) {
                  const serialNumber = filteredScreens.findIndex((s: any) => s.screenId === screenId) + 1;
                  return {
                    screenId: screen.screenId,
                    label: screen.label,
                    serialNumber
                  };
                }
                return null;
              })
              .filter(Boolean);
          } else {
            connectedData[camera.deviceId] = [];
          }
        });

        setConnectedScreensData(connectedData);
      } catch (error) {
        console.error("Error loading connected screens data:", error);
      }
    };

    loadConnectedScreensData();
  }, [showCameraDetails, cameras]);

  // Determine if this is primary camera based on device fingerprint order
  useEffect(() => {
    if (cameras.length > 0 && deviceId) {
      const socketConnection = socketClient.connect();
      setSocket(socketConnection);

      // Register as camera with actual camera device ID (not device fingerprint)
      const cameraDeviceId = cameras[0]?.deviceId || "camera-device";
      console.log("📷 Registering camera:", cameraDeviceId);
      socketConnection.emit("register:camera", cameraDeviceId);

      // Listen for primary/secondary status from backend
      socketConnection.on(
        "camera:status",
        ({ isPrimary }: { isPrimary: boolean }) => {
          setIsPrimaryCamera(isPrimary);
          console.log(
            `📷 Camera status: ${isPrimary ? "PRIMARY" : "SECONDARY"}`,
          );
        },
      );

      // Listen for camera registrations to get total count
      socketConnection.on("cameras:registered", (camerasData: any[]) => {
        console.log("📷 Total cameras in system:", camerasData.length);
        setTotalCameraCount(camerasData.length);
      });

      // Listen for capture commands from primary
      socketConnection.on("camera:execute-capture", () => {
        console.log("📸 Executing capture command");
        setShowCapturedMessage(true);
        setTimeout(() => setShowCapturedMessage(false), 2000);
        handleCaptureAll();
      });

      // Listen for refresh commands from primary
      socketConnection.on("camera:execute-refresh", () => {
        console.log("🔄 Executing refresh command");
        handleClearScreens();
      });

      // Register current camera with admin panel
      console.log("📷 Registering current camera with admin panel:", cameras);
      socketConnection.emit("cameras:register", cameras);

      // Listen for admin requests for camera info with debounce
      socketConnection.on("admin:request-cameras", () => {
        // Only respond if we have cameras
        if (cameras.length === 0) {
          return;
        }
        
        // Clear existing timeout
        if (adminRequestTimeoutRef.current) {
          clearTimeout(adminRequestTimeoutRef.current);
        }
        
        // Debounce admin requests to prevent spam
        adminRequestTimeoutRef.current = setTimeout(() => {
          console.log("📋 Admin requested cameras, sending:", cameras);
          socketConnection.emit("cameras:register", cameras);
        }, 100);
      });

      // Listen for QR code generation
      socketConnection.on("qr_code_generated", (data: any) => {
        console.log("📱 QR Code received:", data);
        setQrCode(data.qrCode);
        setShowQrCode(true);
      });

      // Listen for hide QR code command
      socketConnection.on("camera:hide-qr-code", () => {
        console.log("🏠 Hide QR code command received");
        setShowQrCode(false);
      });

      // Listen for camera details toggle from admin
      socketConnection.on(
        "admin:toggle-camera-details",
        ({ show }: { show: boolean }) => {
          console.log(
            `👁️ Camera details ${show ? "shown" : "hidden"} from admin`,
          );
          setShowCameraDetails(show);
        },
      );

      // Emit cameras detected event for global button
      window.dispatchEvent(
        new CustomEvent("cameras-detected", {
          detail: { cameras },
        }),
      );

      return () => {
        // Clear admin request timeout
        if (adminRequestTimeoutRef.current) {
          clearTimeout(adminRequestTimeoutRef.current);
        }
        socketConnection.disconnect();
      };
    }
  }, [cameras, deviceId]);

  // Update admin panel when camera details change (after switching)
  useEffect(() => {
    if (socket && socket.connected && cameras.length > 0) {
      const timer = setTimeout(() => {
        console.log("📷 Camera details updated, notifying admin:", cameras);
        socket.emit("cameras:register", cameras);
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [cameras.map(c => c.label).join(','), socket]); // Only trigger when camera labels change

  // Listen for global camera switch events
  useEffect(() => {
    const handleSwitchCamera = (event: CustomEvent) => {
      console.log("🔄 Global switch camera event received");
      if (canSwitchCamera) {
        console.log("🔄 Switching camera...");
        switchCamera();
      } else {
        console.log("⚠️ Cannot switch camera - only one available");
      }
    };

    window.addEventListener(
      "switch-camera",
      handleSwitchCamera as EventListener,
    );

    return () => {
      window.removeEventListener(
        "switch-camera",
        handleSwitchCamera as EventListener,
      );
    };
  }, [canSwitchCamera, switchCamera]);

  const handleCaptureAll = async () => {
    if (isCapturing || cameras.length === 0) return;

    // If primary camera, send command to all cameras
    if (isPrimaryCamera && socket) {
      setShowCapturedMessage(true);
      setTimeout(() => setShowCapturedMessage(false), 2000);
      socket.emit("camera:capture-all");
      return;
    }

    // Execute capture (for both primary and secondary when commanded)
    cameraRefs.current[0]?.showFlash();

    try {
      const ref = cameraRefs.current[0];
      if (!ref) return;

      const cameraData = await ref.capture();
      if (!cameraData) return;

      const result = await captureImage(
        cameraData.videoElement,
        cameraData.cameraId,
        cameraData.cameraLabel,
      );

      if (result) {
        setCaptureCounts((prev) => ({
          ...prev,
          [result.cameraId]: (prev[result.cameraId] || 0) + 1,
        }));
      }
    } catch (error) {
      console.error("Error capturing image:", error);
    }
  };

  const handleClearScreens = async () => {
    // If primary camera, send command to all cameras
    if (isPrimaryCamera && socket) {
      socket.emit("camera:refresh-all");
      return;
    }

    // Execute refresh (for both primary and secondary when commanded)
    try {
      await screenApi.clearAll();
    } catch (error) {
      console.error("Error clearing screens:", error);
    }
  };

  const handleSwitchCamera = async () => {
    if (canSwitchCamera) {
      console.log("🔄 Switching camera...");
      await switchCamera();
      
      // Update admin panel with new camera details
      if (socket && cameras.length > 0) {
        setTimeout(() => {
          console.log("📷 Sending updated camera details to admin:", cameras);
          socket.emit("cameras:register", cameras);
        }, 500);
      }
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative">
      {/* Header - Hidden on mobile */}
      <header className="hidden md:block absolute w-full top-0 z-50">
        <div className="mx-auto w-full">
          <div className="flex items-center justify-between w-full pr-4">
            {/* <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                Photo Shoot Studio
              </h1>
              <p className="text-gray-400 text-lg">
                {cameras.length} {cameras.length === 1 ? "camera" : "cameras"}{" "}
                detected and online
              </p>
            </div> */}
            <div className="p-4 w-full h-fit">
              <img src="/logo.png" alt="" className="lg:w-54 w-32" />
            </div>
            {showCameraDetails && (
              <div
                className={`px-4 py-2 text-nowrap rounded-full text-sm font-bold ${
                  isPrimaryCamera
                    ? "bg-green-600 text-white"
                    : "bg-gray-600 text-gray-300"
                }`}
              >
                {isPrimaryCamera ? "🎯 PRIMARY CAMERA" : "📷 SECONDARY CAMERA"}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Camera Grid */}
      <main className="flex flex-1 flex-col items-center overflow-hidden min-h-0">
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
              cameras={currentCamera ? [currentCamera] : cameras}
              cameraRefs={cameraRefs}
              captureCounts={captureCounts}
              showCameraDetails={showCameraDetails}
              connectedScreensData={connectedScreensData}
            />

            {/* Global Capture Button - Only show for primary camera */}
            {isPrimaryCamera && (
              <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
                <button
                  onClick={handleCaptureAll}
                  disabled={isCapturing}
                  className={`
                    px-8 py-4 rounded-full font-bold text-white text-lg
                    transition-all duration-200 transform
                    ${
                      isCapturing
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 hover:scale-110 active:scale-95"
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-2xl hover:shadow-blue-500/50
                    flex items-center space-x-3
                  `}
                >
                  <svg
                    className={`w-8 h-8 ${isCapturing ? "animate-spin" : ""}`}
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
                  {/* <span>{isCapturing ? 'Capturing...' : `Capture`}</span> */}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Camera Switch button - Only show if can switch */}
      {canSwitchCamera && (
        <button
          onClick={handleSwitchCamera}
          className="fixed bottom-4 left-4 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors z-50"
          title="Switch Camera"
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
              d="M3 9a2 2 0 012-2h.93l.82-1.23A2 2 0 018.17 5h7.66a2 2 0 011.42.77L18.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      )}

      {/* Refresh button - Only show for primary camera */}
      {isPrimaryCamera && (
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
      )}

      {/* Screen Captured Message */}
      {showCapturedMessage && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none">
          <div className="bg-green-600 text-white px-8 py-4 rounded-xl text-2xl font-bold shadow-2xl animate-bounce">
            📸 Screen Captured!
          </div>
        </div>
      )}

      {/* QR Code Display */}
      {showQrCode && qrCode && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] bg-black bg-opacity-75">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm mx-4 text-center">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              📱 Scan to Download Photos
            </h3>
            <div className="mb-4">
              <img
                src={qrCode}
                alt="QR Code for photo download"
                className="mx-auto w-64 h-64"
              />
            </div>
            <p className="text-gray-600 mb-4">
              Scan this QR code with your phone to download all photos from this
              session
            </p>
            {isPrimaryCamera && (
              <button
                onClick={() => {
                  setShowQrCode(false);
                  // Emit to all cameras to hide QR code
                  if (socket) {
                    socket.emit("camera:hide-qr-code");
                  }
                }}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-lg"
              >
                🏠 Home - Take New Photo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraPage;
