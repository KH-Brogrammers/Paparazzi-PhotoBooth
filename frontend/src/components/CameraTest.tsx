
+import React, { useState, useEffect } from 'react';
import { testCameraAccess, getDeviceType } from '../utils/camera-utils';

interface CameraTestProps {
  onTestComplete?: (success: boolean) => void;
}

const CameraTest: React.FC<CameraTestProps> = ({ onTestComplete }) => {
  const [isTestingCamera, setIsTestingCamera] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
    deviceType: string;
  } | null>(null);

  const runCameraTest = async () => {
    setIsTestingCamera(true);
    setTestResult(null);

    try {
      const result = await testCameraAccess();
      setTestResult(result);
      onTestComplete?.(result.success);
    } catch (error) {
      setTestResult({
        success: false,
        error: 'Camera test failed unexpectedly',
        deviceType: getDeviceType()
      });
      onTestComplete?.(false);
    } finally {
      setIsTestingCamera(false);
    }
  };

  useEffect(() => {
    // Auto-run test on mount
    runCameraTest();
  }, []);

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'ios': return '📱';
      case 'android': return '🤖';
      default: return '💻';
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? '✅' : '❌';
  };

  return (
    <div className="bg-gray-800 border-2 border-gray-700 rounded-xl p-6 max-w-md mx-auto">
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold text-white mb-2">
          📷 Camera Compatibility Test
        </h3>
        {testResult && (
          <div className="flex items-center justify-center space-x-2 text-lg">
            <span>{getDeviceIcon(testResult.deviceType)}</span>
            <span className="text-gray-300 capitalize">{testResult.deviceType}</span>
            <span>{getStatusIcon(testResult.success)}</span>
          </div>
        )}
      </div>

      {isTestingCamera && (
        <div className="text-center py-4">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-gray-300">Testing camera access...</p>
        </div>
      )}

      {testResult && !isTestingCamera && (
        <div className="space-y-4">
          {testResult.success ? (
            <div className="bg-green-900/50 border border-green-600 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-green-400 text-xl">✅</span>
                <span className="text-green-300 font-semibold">Camera Ready!</span>
              </div>
              <p className="text-green-200 text-sm">
                Your {testResult.deviceType} device camera is working properly and ready to capture photos.
              </p>
            </div>
          ) : (
            <div className="bg-red-900/50 border border-red-600 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-red-400 text-xl">❌</span>
                <span className="text-red-300 font-semibold">Camera Issue</span>
              </div>
              <p className="text-red-200 text-sm mb-3">
                {testResult.error}
              </p>
              
              {testResult.deviceType === 'ios' && (
                <div className="bg-blue-900/30 border border-blue-600 rounded p-3 text-sm">
                  <p className="text-blue-200 font-medium mb-1">📱 iOS Tips:</p>
                  <ul className="text-blue-300 text-xs space-y-1">
                    <li>• Use Safari or Chrome browser</li>
                    <li>• Check Settings → Safari → Camera</li>
                    <li>• Try refreshing the page</li>
                    <li>• Ensure no other apps are using the camera</li>
                  </ul>
                </div>
              )}
              
              {testResult.deviceType === 'android' && (
                <div className="bg-green-900/30 border border-green-600 rounded p-3 text-sm">
                  <p className="text-green-200 font-medium mb-1">🤖 Android Tips:</p>
                  <ul className="text-green-300 text-xs space-y-1">
                    <li>• Allow camera permission when prompted</li>
                    <li>• Check browser settings for camera access</li>
                    <li>• Try Chrome or Firefox browser</li>
                    <li>• Close other camera apps</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <button
            onClick={runCameraTest}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            🔄 Test Again
          </button>
        </div>
      )}
    </div>
  );
};

export default CameraTest;
