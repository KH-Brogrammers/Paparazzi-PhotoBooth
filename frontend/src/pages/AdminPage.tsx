import { useEffect, useState } from 'react';
import { screenApi, mappingApi } from '../services/backend-api.service';
import { socketClient } from '../services/socket.service';
import { type Screen, type CameraMapping } from '../types/screen.types';

function AdminPage() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [mappings, setMappings] = useState<CameraMapping[]>([]);
  const [allCameras, setAllCameras] = useState<any[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showScreenDetails, setShowScreenDetails] = useState(false);

  
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
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    // Connect to socket for real-time updates
    const socket = socketClient.connect();
    
    // Listen for screen registration/disconnection
    socket.on('screen:registered', () => {
      console.log('📺 Screen registered - refreshing admin panel');
      loadData();
    });
    
    socket.on('screen:disconnected', () => {
      console.log('📺 Screen disconnected - refreshing admin panel');
      loadData();
    });
    
    // Listen for mapping updates
    socket.on('mappings:updated', () => {
      console.log('🔄 Mappings updated - refreshing admin panel');
      loadData();
    });
    
    // Listen for camera registrations from all devices
    socket.on('cameras:registered', (camerasData: any[]) => {
      console.log('📷 Cameras registered from device:', camerasData);
      setAllCameras(prev => {
        // Merge cameras from different devices, avoiding duplicates
        const merged = [...prev];
        camerasData.forEach(newCamera => {
          if (!merged.find(cam => cam.deviceId === newCamera.deviceId)) {
            merged.push(newCamera);
          }
        });
        return merged;
      });
    });
    
    // Request cameras from all connected devices
    socket.emit('admin:request-cameras');
    
    return () => {
      socket.disconnect();
    };
  }, []);

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
      socket.emit('screen:refresh', { screenId });
      console.log(`🔄 Refresh signal sent to screen: ${screenId}`);
      
      // Also show visual feedback
      alert(`Refresh signal sent to screen: ${screenId.substring(0, 20)}...`);
    } catch (error) {
      console.error('Error refreshing screen:', error);
      alert('Failed to send refresh signal');
    }
  };

  const handleSaveMappings = async () => {
    try {
      setSaving(true);

      // Save all mappings
      const savePromises = allCameras.map((camera) => {
        const screenIds = selectedMappings[camera.deviceId] || [];
        return mappingApi.update(camera.deviceId, camera.label, screenIds);
      });

      await Promise.all(savePromises);
      await loadData(); // Reload to get updated data
      
      alert('Mappings saved successfully!');
      setSaving(false);
    } catch (error) {
      console.error('Error saving mappings:', error);
      alert('Failed to save mappings');
      setSaving(false);
    }
  };

  const handleUpdateScreenLabel = async (screenId: string) => {
    const newLabel = prompt('Enter new label for this screen:');
    if (newLabel) {
      try {
        await screenApi.updateLabel(screenId, newLabel);
        await loadData();
      } catch (error) {
        console.error('Error updating screen label:', error);
        alert('Failed to update screen label');
      }
    }
  };

  const handleDeleteScreen = async (screenId: string, screenLabel: string) => {
    if (confirm(`Are you sure you want to delete "${screenLabel}"? This will also remove it from all camera mappings.`)) {
      try {
        await screenApi.delete(screenId);
        await loadData();
        alert('Screen deleted successfully!');
      } catch (error) {
        console.error('Error deleting screen:', error);
        alert('Failed to delete screen');
      }
    }
  };

  const handleDeleteAllScreens = async () => {
    if (confirm(`Are you sure you want to delete ALL ${screens.length} screens? This will also clear all camera mappings.`)) {
      try {
        await screenApi.deleteAll();
        await loadData();
        alert('All screens deleted successfully!');
      } catch (error) {
        console.error('Error deleting all screens:', error);
        alert('Failed to delete all screens');
      }
    }
  };

  const handleHardRefresh = () => {
    window.location.reload();
  };

  const handleToggleScreenDetails = () => {
    const newState = !showScreenDetails;
    setShowScreenDetails(newState);
    
    // Emit to all screens via socket
    const socket = socketClient.connect();
    socket.emit('admin:toggle-screen-details', { show: newState });
    console.log(`📺 Screen details ${newState ? 'shown' : 'hidden'} on all screens`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
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
              All Screens ({screens.length})
            </h2>
            <div className="flex space-x-3">
              <button
                onClick={handleToggleScreenDetails}
                className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                  showScreenDetails 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {showScreenDetails ? '👁️‍🗨️ Hide Screen Details' : '👁️ Show Screen Details'}
              </button>
              <button
                onClick={handleHardRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                🔄 Hard Refresh
              </button>
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
            {screens.map((screen) => (
              <div
                key={screen.screenId}
                className="bg-gray-800 border-2 border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold text-lg">
                      {screen.label}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      (screen as any).isConnected 
                        ? 'bg-green-600 text-white' 
                        : 'bg-red-600 text-white'
                    }`}>
                      {(screen as any).isConnected ? '● Online' : '○ Offline'}
                    </span>
                  </div>
                  {screen.isPrimary && (
                    <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-gray-400 text-sm mb-1">
                  ID: {screen.screenId.substring(0, 20)}...
                </p>
                {screen.resolution && (
                  <p className="text-gray-400 text-sm">
                    {screen.resolution.width} × {screen.resolution.height}
                  </p>
                )}
                <div className="flex space-x-2 mt-3">
                  <button
                    onClick={() => handleRefreshScreen(screen.screenId)}
                    className="text-green-400 hover:text-green-300 text-sm"
                    title="Refresh this screen"
                  >
                    🔄 Refresh
                  </button>
                  <button
                    onClick={() => handleUpdateScreenLabel(screen.screenId)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteScreen(screen.screenId, screen.label)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {screens.length === 0 && (
              <div className="col-span-full bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">
                  No screens connected. Open /screens on different displays to register them.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Mapping Section */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">
            Camera to Screen Mapping
          </h2>
          
          {allCameras.length === 0 ? (
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-400">
                No cameras detected. Please go to the home page to initialize cameras.
              </p>
            </div>
          ) : screens.length === 0 ? (
            <div className="bg-gray-800 border-2 border-gray-700 rounded-lg p-8 text-center">
              <p className="text-gray-400">
                No screens available for mapping. Open /screens on displays first.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {allCameras.map((camera) => (
                <div
                  key={camera.deviceId}
                  className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-semibold text-xl">
                      📷 {camera.label}
                    </h3>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${
                      camera.role === 'PRIMARY' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-gray-600 text-gray-300'
                    }`}>
                      {camera.role === 'PRIMARY' ? '🎯 PRIMARY' : '📷 SECONDARY'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-4">
                    Select which screens should display images from this camera:
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {screens.map((screen) => (
                      <label
                        key={screen.screenId}
                        className="flex items-center space-x-3 bg-gray-700/50 p-4 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={
                            selectedMappings[camera.deviceId]?.includes(screen.screenId) || false
                          }
                          onChange={() =>
                            handleCheckboxChange(camera.deviceId, screen.screenId)
                          }
                          className="w-5 h-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-white">{screen.label}</span>
                      </label>
                    ))}
                  </div>
                  
                  <p className="text-sm text-gray-500 mt-3">
                    {selectedMappings[camera.deviceId]?.length || 0} screen(s) selected
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Save Button */}
        {allCameras.length > 0 && screens.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={handleSaveMappings}
              disabled={saving}
              className={`
                px-8 py-4 rounded-lg font-bold text-white text-lg
                transition-all duration-200 transform
                ${
                  saving
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'
                }
                shadow-xl
              `}
            >
              {saving ? 'Saving...' : 'Save All Mappings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPage;
