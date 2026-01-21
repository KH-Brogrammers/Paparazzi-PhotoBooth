import { useEffect, useState } from 'react';
import { screenApi, mappingApi } from '../services/backend-api.service';
import { useCameraAccess } from '../hooks/useCameraAccess';
import { type Screen, type CameraMapping } from '../types/screen.types';

function AdminPage() {
  const { cameras } = useCameraAccess();
  const [screens, setScreens] = useState<Screen[]>([]);
  const [mappings, setMappings] = useState<CameraMapping[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  
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

  const handleSaveMappings = async () => {
    try {
      setSaving(true);

      // Save all mappings
      const savePromises = cameras.map((camera) => {
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
          <h2 className="text-2xl font-bold text-white mb-4">
            Connected Screens ({screens.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {screens.map((screen) => (
              <div
                key={screen.screenId}
                className="bg-gray-800 border-2 border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-white font-semibold text-lg">
                    {screen.label}
                  </h3>
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
                <button
                  onClick={() => handleUpdateScreenLabel(screen.screenId)}
                  className="mt-3 text-blue-400 hover:text-blue-300 text-sm"
                >
                  Rename
                </button>
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
          
          {cameras.length === 0 ? (
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
              {cameras.map((camera) => (
                <div
                  key={camera.deviceId}
                  className="bg-gray-800 border-2 border-gray-700 rounded-lg p-6"
                >
                  <h3 className="text-white font-semibold text-xl mb-4">
                    📷 {camera.label}
                  </h3>
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
        {cameras.length > 0 && screens.length > 0 && (
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
