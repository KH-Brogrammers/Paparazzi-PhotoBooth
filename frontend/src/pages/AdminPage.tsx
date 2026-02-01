import { useEffect, useState, useRef } from "react";
import { screenApi, mappingApi } from "../services/backend-api.service";
import { socketClient } from "../services/socket.service";
import { type Screen, type CameraMapping } from "../types/screen.types";

function AdminPage() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [mappings, setMappings] = useState<CameraMapping[]>([]);
  const [allCameras, setAllCameras] = useState<any[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<
    Record<string, string[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScreenDetails, setShowScreenDetails] = useState(false);
  const [showCameraDetails, setShowCameraDetails] = useState(false);
  const [cameraGroups, setCameraGroups] = useState<Record<string, string>>({});
  const adminRequestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cameraUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Group cameras by device fingerprint
  const groupCamerasByDevice = (cameras: any[]) => {
    const deviceGroups: Record<string, {
      deviceFingerprint: string;
      cameras: any[];
      primaryCamera: any | null;
    }> = {};

    cameras.forEach(camera => {
      // Extract device fingerprint from camera label (e.g., "Camera 456 - ymm81f393876" -> "ymm81f393876")
      const match = camera.label.match(/Camera \d+ - (.+)$/);
      const deviceFingerprint = match ? match[1] : camera.deviceId;
      
      if (!deviceGroups[deviceFingerprint]) {
        deviceGroups[deviceFingerprint] = {
          deviceFingerprint,
          cameras: [],
          primaryCamera: null
        };
      }
      
      // Check if this camera already exists in the group (by deviceId)
      const existingIndex = deviceGroups[deviceFingerprint].cameras.findIndex(
        existingCamera => existingCamera.deviceId === camera.deviceId
      );
      
      if (existingIndex >= 0) {
        // Update existing camera
        deviceGroups[deviceFingerprint].cameras[existingIndex] = camera;
      } else {
        // Add new camera
        deviceGroups[deviceFingerprint].cameras.push(camera);
      }
      
      if (camera.role === 'PRIMARY') {
        deviceGroups[deviceFingerprint].primaryCamera = camera;
      }
    });

    // Clean up disconnected cameras - only keep cameras that are in the current cameras list
    Object.values(deviceGroups).forEach(group => {
      group.cameras = group.cameras.filter(camera => 
        cameras.some(currentCamera => currentCamera.deviceId === camera.deviceId)
      );
      
      // Update primary camera if it was removed
      if (group.primaryCamera && !group.cameras.some(camera => camera.deviceId === group.primaryCamera.deviceId)) {
        group.primaryCamera = group.cameras.find(camera => camera.role === 'PRIMARY') || null;
      }
    });

    // Remove empty groups
    Object.keys(deviceGroups).forEach(fingerprint => {
      if (deviceGroups[fingerprint].cameras.length === 0) {
        delete deviceGroups[fingerprint];
      }
    });

    return Object.values(deviceGroups);
  };
  const [availableGroups] = useState(['Group 1', 'Group 2', 'Group 3', 'Group 4', 'Group 5']);

  // Helper function to filter out built-in displays
  const filterBuiltInScreens = (screens: Screen[]) => {
    return screens.filter(screen => {
      const isBuiltIn = screen.label?.toLowerCase().includes('built-in') || 
                       screen.label?.toLowerCase().includes('internal');
      return !isBuiltIn;
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [screensData, mappingsData] = await Promise.all([
        screenApi.getAll(),
        mappingApi.getAll(),
      ]);

      setScreens(screensData);
      setMappings(mappingsData);

      // Initialize selected mappings
      const initialMappings: Record<string, string[]> = {};
      mappingsData.forEach((mapping: CameraMapping) => {
        initialMappings[mapping.cameraId] = mapping.screenIds;
      });
      setSelectedMappings(initialMappings);

      setLoading(false);
    } catch (error) {
      console.error("Error loading data:", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Connect to socket for real-time updates
    const socket = socketClient.connect();

    // Listen for screen registration/disconnection
    socket.on("screen:registered", () => {
      console.log("📺 Screen registered - refreshing admin panel");
      setTimeout(() => loadData(), 500); // Small delay to ensure socket registration is complete
    });

    socket.on("screen:disconnected", () => {
      console.log("📺 Screen disconnected - refreshing admin panel");
      setTimeout(() => loadData(), 500);
    });

    // Listen for camera disconnections
    socket.on("camera:disconnected", (deviceId: string) => {
      console.log("📷 Camera disconnected:", deviceId);
      setAllCameras((prev) => prev.filter(camera => camera.deviceId !== deviceId));
    });

    // Listen for mapping updates
    socket.on("mappings:updated", () => {
      console.log("🔄 Mappings updated - refreshing admin panel");
      loadData();
    });

    // Listen for camera registrations from all devices (debounced)
    socket.on("cameras:registered", (camerasData: any[]) => {
      console.log("📷 Cameras registered from device:", camerasData);
      
      // Debounce camera updates to prevent spam
      if (cameraUpdateTimeoutRef.current) {
        clearTimeout(cameraUpdateTimeoutRef.current);
      }
      
      cameraUpdateTimeoutRef.current = setTimeout(() => {
        setAllCameras((prev) => {
          // Merge cameras from different devices, avoiding duplicates
          const merged = [...prev];
          camerasData.forEach((newCamera) => {
            // Remove any existing camera with same deviceId to avoid duplicates
            const existingIndex = merged.findIndex(
              (cam) => cam.deviceId === newCamera.deviceId,
            );
            if (existingIndex >= 0) {
              merged[existingIndex] = newCamera; // Update existing
            } else {
              merged.push(newCamera); // Add new
            }
          });
          console.log("📷 Updated cameras list:", merged);
          return merged;
        });
      }, 100);
    });

    // Listen for direct camera list from backend (active cameras only)
    socket.on("admin:cameras-list", (activeCameras: any[]) => {
      console.log("📷 Active cameras from backend:", activeCameras);
      setAllCameras(activeCameras.map(camera => ({
        ...camera,
        role: camera.isPrimary ? "PRIMARY" : "SECONDARY"
      })));
    });

    // Listen for individual camera registrations (for real-time updates)
    socket.on("camera:registered", (cameraData: any) => {
      console.log("📷 Single camera registered:", cameraData);
      setAllCameras((prev) => {
        const merged = [...prev];
        const existingIndex = merged.findIndex(
          (cam) => cam.deviceId === cameraData.deviceId,
        );
        if (existingIndex >= 0) {
          merged[existingIndex] = cameraData; // Update existing
        } else {
          merged.push(cameraData); // Add new
        }
        console.log("📷 Updated cameras list (single):", merged);
        return merged;
      });
    });

    // Listen for primary status updates
    socket.on(
      "camera:primary-updated",
      ({ deviceId, isPrimary }: { deviceId: string; isPrimary: boolean }) => {
        console.log("📷 Primary status updated:", deviceId, isPrimary);
        setAllCameras((prev) =>
          prev.map((camera) =>
            camera.deviceId === deviceId
              ? { ...camera, role: isPrimary ? "PRIMARY" : "SECONDARY" }
              : {
                  ...camera,
                  role:
                    camera.deviceId === deviceId ? camera.role : "SECONDARY",
                },
          ),
        );
      },
    );

    // Clear existing cameras and request fresh data (only once)
    setAllCameras([]);
    
    // Request cameras only once on mount
    socket.emit("admin:request-cameras");

    return () => {
      if (adminRequestTimeoutRef.current) {
        clearTimeout(adminRequestTimeoutRef.current);
      }
      if (cameraUpdateTimeoutRef.current) {
        clearTimeout(cameraUpdateTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, []);

  const handleDeleteOldCameras = async () => {
    if (
      confirm(
        "Remove old generic camera entries (Front Camera, Rear Camera) from mappings?",
      )
    ) {
      try {
        // Delete old generic camera mappings
        await mappingApi.delete("front-camera");
        await mappingApi.delete("rear-camera");

        // Refresh data
        loadData();

        // Clear and refresh cameras
        setAllCameras([]);
        const socket = socketClient.connect();
        socket.emit("admin:request-cameras");

        alert("Old camera entries removed successfully!");
      } catch (error) {
        console.error("Error removing old cameras:", error);
        alert("Error removing old cameras. Check console for details.");
      }
    }
  };

  const handleCheckboxChange = (cameraId: string, screenId: string) => {
    setSelectedMappings((prev) => {
      const current = prev[cameraId] || [];
      const updated = current.includes(screenId)
        ? current.filter((id) => id !== screenId)
        : [...current, screenId];

      return {
        ...prev,
        [cameraId]: updated,
      };
    });
  };

  const handleRefreshScreen = async (screenId: string) => {
    try {
      // Emit refresh event to specific screen via socket
      const socket = socketClient.connect();
      socket.emit("screen:refresh", { screenId });
      console.log(`🔄 Refresh signal sent to screen: ${screenId}`);

      // Also show visual feedback
      alert(`Refresh signal sent to screen: ${screenId.substring(0, 20)}...`);
    } catch (error) {
      console.error("Error refreshing screen:", error);
      alert("Failed to send refresh signal");
    }
  };

  const handleSaveMappings = async () => {
    try {
      setSaving(true);

      // Get current camera IDs
      const currentCameraIds = allCameras
        .filter(camera => 
          !["front-camera", "rear-camera"].includes(camera.deviceId) &&
          !["Front Camera", "Rear Camera"].includes(camera.label)
        )
        .map(camera => camera.deviceId);

      // First, clean up mappings for cameras that no longer exist
      const existingMappings = await mappingApi.getAll();
      const cleanupPromises = existingMappings
        .filter(mapping => !currentCameraIds.includes(mapping.cameraId))
        .map(mapping => mappingApi.delete(mapping.cameraId));
      
      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
        console.log(`🧹 Cleaned up ${cleanupPromises.length} old camera mappings`);
      }

      // Save all current mappings with group information
      const savePromises = allCameras
        .filter(camera => 
          !["front-camera", "rear-camera"].includes(camera.deviceId) &&
          !["Front Camera", "Rear Camera"].includes(camera.label)
        )
        .map((camera) => {
          const screenIds = selectedMappings[camera.deviceId] || [];
          const groupId = cameraGroups[camera.deviceId] || 'Group 1';
          return mappingApi.update(camera.deviceId, camera.label, screenIds, groupId);
        });

      await Promise.all(savePromises);
      await loadData(); // Reload to get updated data

      console.log(`💾 Saved ${savePromises.length} camera mappings to database`);
      alert("Mappings saved successfully!");
      setSaving(false);
    } catch (error) {
      console.error("Error saving mappings:", error);
      alert("Failed to save mappings");
      setSaving(false);
    }
  };

  const handleUpdateScreenLabel = async (screenId: string) => {
    const newLabel = prompt("Enter new label for this screen:");
    if (newLabel) {
      try {
        await screenApi.updateLabel(screenId, newLabel);
        
        // Update local state instead of refetching
        setScreens((prevScreens) =>
          prevScreens.map((screen) =>
            screen.screenId === screenId
              ? { ...screen, label: newLabel }
              : screen
          )
        );
      } catch (error) {
        console.error("Error updating screen label:", error);
        alert("Failed to update screen label");
      }
    }
  };

  const handleDeleteScreen = async (screenId: string, screenLabel: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${screenLabel}"? This will also remove it from all camera mappings.`,
      )
    ) {
      try {
        await screenApi.delete(screenId);
        await loadData();
        alert("Screen deleted successfully!");
      } catch (error) {
        console.error("Error deleting screen:", error);
        alert("Failed to delete screen");
      }
    }
  };

  const handleDeleteAllScreens = async () => {
    if (
      confirm(
        `Are you sure you want to delete ALL ${screens.length} screens? This will also clear all camera mappings.`,
      )
    ) {
      try {
        await screenApi.deleteAll();
        await loadData();
        alert("All screens deleted successfully!");
      } catch (error) {
        console.error("Error deleting all screens:", error);
        alert("Failed to delete all screens");
      }
    }
  };

  const handleDeleteOfflineScreens = async () => {
    const offlineScreens = filterBuiltInScreens(screens).filter((screen) => !(screen as any).isConnected);

    if (offlineScreens.length === 0) {
      alert("No offline screens to delete.");
      return;
    }

    if (
      confirm(
        `Are you sure you want to delete ${offlineScreens.length} offline screens? This will also remove them from all camera mappings.`,
      )
    ) {
      try {
        for (const screen of offlineScreens) {
          await screenApi.delete(screen.screenId);
        }
        await loadData();
        alert(`${offlineScreens.length} offline screens deleted successfully!`);
      } catch (error) {
        console.error("Error deleting offline screens:", error);
        alert("Failed to delete offline screens");
      }
    }
  };

  const handleRenameCamera = (cameraId: string, currentLabel: string) => {
    const newLabel = prompt("Enter new camera name:", currentLabel);
    if (newLabel && newLabel !== currentLabel) {
      setAllCameras((prev) =>
        prev.map((camera) =>
          camera.deviceId === cameraId
            ? { ...camera, label: newLabel }
            : camera,
        ),
      );
    }
  };

  const handleRemoveCamera = async (cameraId: string, cameraLabel: string) => {
    if (confirm(`Remove "${cameraLabel}" from mappings?`)) {
      try {
        await mappingApi.delete(cameraId);
        setAllCameras((prev) =>
          prev.filter((camera) => camera.deviceId !== cameraId),
        );
        await loadData();
        alert("Camera removed successfully!");
      } catch (error) {
        console.error("Error removing camera:", error);
        alert("Failed to remove camera");
      }
    }
  };

  // Handle making a camera primary
  const handleMakePrimary = async (cameraId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8800'}/api/cameras/make-primary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cameraId }),
      });

      if (response.ok) {
        // Update local state immediately
        setAllCameras(prevCameras =>
          prevCameras.map(camera => ({
            ...camera,
            role: camera.deviceId === cameraId ? 'PRIMARY' : 'SECONDARY'
          }))
        );
        
        console.log(`✅ Camera ${cameraId} is now PRIMARY`);
      } else {
        console.error('Failed to make camera primary');
      }
    } catch (error) {
      console.error('Error making camera primary:', error);
    }
  };

  const handleSelectAllScreens = (cameraId: string) => {
    const allScreenIds = filterBuiltInScreens(screens)
      .filter((screen) => !screen.isCollageScreen) // Exclude collage screens
      .map((screen) => screen.screenId);
    setSelectedMappings((prev) => ({
      ...prev,
      [cameraId]: allScreenIds,
    }));
  };

  const handleDeselectAllScreens = (cameraId: string) => {
    setSelectedMappings((prev) => ({
      ...prev,
      [cameraId]: [],
    }));
  };

  const handleHardRefresh = () => {
    window.location.reload();
  };

  const handleToggleCollageScreen = async (
    screenId: string,
    currentState: boolean,
  ) => {
    try {
      const newState = !currentState;
      await screenApi.toggleCollageScreen(screenId, newState);
      
      // Update local state instead of refetching
      setScreens((prevScreens) =>
        prevScreens.map((screen) =>
          screen.screenId === screenId
            ? { ...screen, isCollageScreen: newState }
            : screen.isCollageScreen && newState
            ? { ...screen, isCollageScreen: false } // Turn off other collage screens
            : screen
        )
      );
      
      alert(
        newState ? "Screen set as collage screen" : "Collage screen removed",
      );
    } catch (error) {
      console.error("Error toggling collage screen:", error);
      alert("Failed to toggle collage screen");
    }
  };

  const handleUpdateRotation = async (screenId: string, rotation: number) => {
    try {
      await screenApi.updateRotation(screenId, rotation);
      
      // Update local state instead of refetching
      setScreens((prevScreens) =>
        prevScreens.map((screen) =>
          screen.screenId === screenId
            ? { ...screen, rotation }
            : screen
        )
      );
    } catch (error) {
      console.error("Error updating rotation:", error);
      alert("Failed to update rotation");
    }
  };

  const handleUpdateCollagePosition = async (
    screenId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    try {
      await screenApi.updateCollagePosition(screenId, { x, y, width, height });
      
      // Update local state instead of refetching
      setScreens((prevScreens) =>
        prevScreens.map((screen) =>
          screen.screenId === screenId
            ? { ...screen, collagePosition: { x, y, width, height } }
            : screen
        )
      );
    } catch (error) {
      console.error("Error updating collage position:", error);
      alert("Failed to update collage position");
    }
  };

  const handleCameraGroupChange = (cameraId: string, groupName: string) => {
    setCameraGroups(prev => ({
      ...prev,
      [cameraId]: groupName
    }));
  };

  // Initialize camera groups when cameras are loaded
  useEffect(() => {
    if (allCameras.length > 0) {
      const newGroups: Record<string, string> = {};
      allCameras.forEach(camera => {
        if (!cameraGroups[camera.deviceId]) {
          newGroups[camera.deviceId] = 'Group 1'; // Default to Group 1
        }
      });
      if (Object.keys(newGroups).length > 0) {
        setCameraGroups(prev => ({ ...prev, ...newGroups }));
      }
    }
  }, [allCameras]);

  const handleToggleScreenDetails = () => {
    const newState = !showScreenDetails;
    setShowScreenDetails(newState);

    // Emit to all screens via socket
    const socket = socketClient.connect();
    socket.emit("admin:toggle-screen-details", { show: newState });
    console.log(
      `📺 Screen details ${newState ? "shown" : "hidden"} on all screens`,
    );
  };

  const handleToggleCameraDetails = () => {
    const newState = !showCameraDetails;
    setShowCameraDetails(newState);

    // Emit to camera page via socket
    const socket = socketClient.connect();
    socket.emit("admin:toggle-camera-details", { show: newState });
    console.log(
      `📷 Camera details ${newState ? "shown" : "hidden"} on camera page`,
    );
  };

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="overflow-auto w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-gray-400 text-lg">
            Map cameras to screens for display
          </p>
        </header>

        {/* Screens Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">
              All Screens ({filterBuiltInScreens(screens).length})
            </h2>
            <div className="flex space-x-3">
              <button
                onClick={handleToggleScreenDetails}
                className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                  showScreenDetails
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {showScreenDetails
                  ? "👁️‍🗨️ Hide Screen Details"
                  : "👁️ Show Screen Details"}
              </button>
              <button
                onClick={handleHardRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                🔄 Hard Refresh
              </button>
              {filterBuiltInScreens(screens).filter((screen) => !(screen as any).isConnected).length > 0 && (
                <button
                  onClick={handleDeleteOfflineScreens}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors"
                >
                  🗑️ Delete Offline (
                  {filterBuiltInScreens(screens).filter((screen) => !(screen as any).isConnected).length}
                  )
                </button>
              )}
              {screens.length > 0 && (
                <button
                  onClick={handleDeleteAllScreens}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  🗑️ Delete All Screens
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filterBuiltInScreens(screens).map((screen, index) => (
              <div
                key={screen.screenId}
                className={`bg-gray-800 border-2 rounded-lg p-4 ${
                  screen.isCollageScreen
                    ? "border-purple-500"
                    : "border-gray-700"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded font-bold">
                      #{index + 1}
                    </span>
                    <h3 className="text-white font-semibold text-lg">
                      {screen.label}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        (screen as any).isConnected
                          ? "bg-green-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      {(screen as any).isConnected ? "● Online" : "○ Offline"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {screen.isPrimary && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
                        Primary
                      </span>
                    )}
                    {screen.isCollageScreen && (
                      <span className="bg-purple-500 text-white text-xs px-2 py-1 rounded">
                        Collage
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-1">
                  ID: {screen.screenId.substring(screen.screenId.length - 6)}
                </p>
                {screen.resolution && (
                  <p className="text-gray-400 text-sm mb-2">
                    {screen.resolution.width} × {screen.resolution.height}
                  </p>
                )}

                {/* Collage Toggle */}
                <div className="mb-3 flex items-center justify-between bg-gray-700/50 p-2 rounded">
                  <label className="text-white text-sm">Collage:</label>
                  <button
                    onClick={() =>
                      handleToggleCollageScreen(
                        screen.screenId,
                        screen.isCollageScreen,
                      )
                    }
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      screen.isCollageScreen
                        ? "bg-purple-600 text-white"
                        : "bg-gray-600 text-gray-300"
                    }`}
                  >
                    {screen.isCollageScreen ? "ON" : "OFF"}
                  </button>
                </div>

                {/* Rotation Dropdown */}
                <div className="mb-3 flex items-center justify-between bg-gray-700/50 p-2 rounded">
                  <label className="text-white text-sm">Rotation:</label>
                  <select
                    value={screen.rotation}
                    onChange={(e) =>
                      handleUpdateRotation(
                        screen.screenId,
                        parseInt(e.target.value),
                      )
                    }
                    className="bg-gray-600 text-white text-sm px-2 py-1 rounded"
                  >
                    <option value={0}>0°</option>
                    <option value={90}>90°</option>
                    <option value={-90}>-90°</option>
                  </select>
                </div>

                {/* Collage Position (only if collage screen) */}
                {screen.isCollageScreen && (
                  <div className="mb-3 bg-gray-700/50 p-2 rounded">
                    <p className="text-white text-xs mb-2">Position (px):</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="X"
                        value={screen.collagePosition?.x || 0}
                        onChange={(e) =>
                          handleUpdateCollagePosition(
                            screen.screenId,
                            parseInt(e.target.value) || 0,
                            screen.collagePosition?.y || 0,
                            screen.collagePosition?.width || 0,
                            screen.collagePosition?.height || 0,
                          )
                        }
                        className="bg-gray-600 text-white text-xs px-2 py-1 rounded"
                      />
                      <input
                        type="number"
                        placeholder="Y"
                        value={screen.collagePosition?.y || 0}
                        onChange={(e) =>
                          handleUpdateCollagePosition(
                            screen.screenId,
                            screen.collagePosition?.x || 0,
                            parseInt(e.target.value) || 0,
                            screen.collagePosition?.width || 0,
                            screen.collagePosition?.height || 0,
                          )
                        }
                        className="bg-gray-600 text-white text-xs px-2 py-1 rounded"
                      />
                    </div>
                  </div>
                )}

                <div className="flex space-x-2 mt-3">
                  <button
                    onClick={() => handleUpdateScreenLabel(screen.screenId)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() =>
                      handleDeleteScreen(screen.screenId, screen.label)
                    }
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filterBuiltInScreens(screens).length === 0 && (
              <div className="col-span-full bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">
                  No screens connected. Open /screens on different displays to
                  register them.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Mapping Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">
              Camera to Screen Mapping
            </h2>
            <div className="flex space-x-3">
              <button
                onClick={handleToggleCameraDetails}
                className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                  showCameraDetails
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {showCameraDetails
                  ? "👁️🗨️ Hide Camera Details"
                  : "👁️ Show Camera Details"}
              </button>
              <button
                onClick={() => {
                  setAllCameras([]);
                  const socket = socketClient.connect();
                  socket.emit("admin:request-cameras");
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                🔄 Refresh Cameras
              </button>
              <button
                onClick={handleDeleteOldCameras}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                🗑️ Clean Old Cameras
              </button>
            </div>
          </div>

          {allCameras.length === 0 ? (
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-400">
                No cameras detected. Please go to the home page to initialize
                cameras.
              </p>
            </div>
          ) : filterBuiltInScreens(screens).length === 0 ? (
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-400">
                No screens available for mapping. Open /screens on displays
                first.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupCamerasByDevice(allCameras
                .filter(
                  (camera) =>
                    // Filter out old generic cameras
                    !["front-camera", "rear-camera"].includes(
                      camera.deviceId,
                    ) &&
                    !["Front Camera", "Rear Camera"].includes(camera.label),
                )
              ).map((deviceGroup, index) => (
                <div
                  key={deviceGroup.deviceFingerprint}
                  className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-white font-semibold text-xl">
                        <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded font-bold mr-2">
                          #{index + 1}
                        </span>
                        📱 Device {deviceGroup.deviceFingerprint}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-400 text-sm">Group:</span>
                        <select
                          value={cameraGroups[deviceGroup.deviceFingerprint] || 'Group 1'}
                          onChange={(e) => handleCameraGroupChange(deviceGroup.deviceFingerprint, e.target.value)}
                          className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                        >
                          {availableGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span
                        className={`px-3 py-1 text-sm font-bold rounded-full ${
                          deviceGroup.primaryCamera
                            ? "bg-green-600 text-white"
                            : "bg-gray-600 text-gray-300"
                        }`}
                      >
                        {deviceGroup.primaryCamera
                          ? "🎯 PRIMARY DEVICE"
                          : "📱 SECONDARY DEVICE"}
                      </span>
                      <button
                        onClick={() =>
                          handleRenameCamera(deviceGroup.deviceFingerprint, `Device ${deviceGroup.deviceFingerprint}`)
                        }
                        className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 rounded"
                      >
                        ✏️ Rename
                      </button>
                      <button
                        onClick={() =>
                          handleRemoveCamera(deviceGroup.deviceFingerprint, `Device ${deviceGroup.deviceFingerprint}`)
                        }
                        className="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  </div>

                  {/* Show available cameras for this device */}
                  <div className="mb-4 p-4 bg-gray-700 rounded-lg">
                    <h4 className="text-white font-medium mb-2">Available Cameras:</h4>
                    <div className="space-y-2">
                      {deviceGroup.cameras.map(camera => {
                        const cameraType = camera.deviceId.includes('user-camera') ? 'Front' : 'Back';
                        const cameraNumber = camera.label.match(/Camera (\d+)/)?.[1] || '???';
                        return (
                          <div key={camera.deviceId} className="flex items-center justify-between">
                            <span className="text-gray-300 flex items-center">
                              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                              📷 {cameraType} Camera {cameraNumber}
                              {camera.role === 'PRIMARY' && <span className="ml-2 text-green-400 text-xs">(Active)</span>}
                            </span>
                            {camera.role !== 'PRIMARY' && (
                              <button
                                onClick={() => handleMakePrimary(camera.deviceId)}
                                className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                              >
                                Make Active
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-white font-medium">
                      Select which screens should display images from this device:
                    </h4>
                    <div className="flex space-x-4 mb-4">
                      <button
                        onClick={() => handleSelectAllScreens(deviceGroup.primaryCamera?.deviceId || deviceGroup.cameras[0]?.deviceId)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                      >
                        ✓ Select All
                      </button>
                      <button
                        onClick={() => handleDeselectAllScreens(deviceGroup.primaryCamera?.deviceId || deviceGroup.cameras[0]?.deviceId)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                      >
                        ✗ Deselect All
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filterBuiltInScreens(screens)
                        .filter((screen) => !screen.isCollageScreen) // Exclude collage screens from mapping
                        .map((screen) => {
                        const activeCameraId = deviceGroup.primaryCamera?.deviceId || deviceGroup.cameras[0]?.deviceId;
                        const isSelected = selectedMappings[activeCameraId]?.includes(screen.screenId) || false;
                        return (
                          <div
                            key={screen.screenId}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-900/30"
                                : "border-gray-600 bg-gray-700 hover:border-gray-500"
                            }`}
                            onClick={() =>
                              handleCheckboxChange(activeCameraId, screen.screenId)
                            }
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="text-white font-medium">
                                  Screen {screen.label}
                                </h5>
                                <p className="text-gray-400 text-sm">
                                  ID: {screen.screenId}
                                </p>
                              </div>
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                  isSelected
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-gray-400"
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-4 h-4 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-gray-400 text-sm">
                      {(selectedMappings[deviceGroup.primaryCamera?.deviceId || deviceGroup.cameras[0]?.deviceId] || []).length} screen(s) selected
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Save Button */}
        {allCameras.length > 0 && filterBuiltInScreens(screens).length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleSaveMappings}
              disabled={saving}
              className={`
                px-8 py-4 rounded-lg font-bold text-white text-lg
                transition-all duration-200 transform
                ${
                  saving
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95"
                }
                shadow-xl
              `}
            >
              {saving ? "Saving..." : "Save All Mappings"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPage;
