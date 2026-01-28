// Camera utility functions for cross-platform compatibility

export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isAndroid = (): boolean => {
  return /Android/.test(navigator.userAgent);
};

export const isMobile = (): boolean => {
  return isIOS() || isAndroid() || /Mobile|Tablet/.test(navigator.userAgent);
};

export const getDeviceType = (): 'ios' | 'android' | 'desktop' => {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
};

export const getCameraErrorMessage = (error: Error, deviceType: string): string => {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('permission')) {
    if (deviceType === 'ios') {
      return 'Camera permission denied. Please go to Settings > Safari > Camera and allow camera access, then refresh this page.';
    } else if (deviceType === 'android') {
      return 'Camera permission denied. Please allow camera access when prompted, or check your browser settings and refresh this page.';
    } else {
      return 'Camera permission denied. Please allow camera access when prompted and refresh this page.';
    }
  }
  
  if (errorMessage.includes('not found') || errorMessage.includes('no device')) {
    return 'No camera found on this device. Please ensure your device has a camera and try again.';
  }
  
  if (errorMessage.includes('in use') || errorMessage.includes('busy')) {
    return 'Camera is currently being used by another application. Please close other camera apps and try again.';
  }
  
  if (errorMessage.includes('not supported')) {
    return 'Camera is not supported in this browser. Please try using a modern browser like Chrome, Safari, or Firefox.';
  }
  
  if (deviceType === 'ios') {
    return `Camera access failed on iOS. Please ensure you're using Safari or Chrome, camera permissions are enabled, and try refreshing the page. Error: ${error.message}`;
  }
  
  return `Camera access failed. Please check your camera permissions and try refreshing the page. Error: ${error.message}`;
};

export const getOptimalVideoConstraints = (deviceType: 'ios' | 'android' | 'desktop') => {
  const baseConstraints = {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  };

  if (deviceType === 'ios') {
    // iOS works better with specific constraints and ideal instead of exact
    return {
      ...baseConstraints,
      facingMode: { ideal: 'environment' }, // Use ideal instead of exact for iOS
      // iOS sometimes needs these specific settings
      aspectRatio: { ideal: 16/9 },
      // Reduce resolution for better iOS compatibility
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 }
    };
  } else if (deviceType === 'android') {
    // Android is more flexible and can handle exact constraints
    return {
      ...baseConstraints,
      facingMode: { exact: 'environment' }
    };
  } else {
    // Desktop - usually more capable, no facing mode needed
    return baseConstraints;
  }
};

export const requestCameraPermission = async (deviceType: 'ios' | 'android' | 'desktop'): Promise<boolean> => {
  try {
    // Request permission with device-appropriate constraints
    const constraints = deviceType === 'ios' 
      ? { video: { facingMode: 'environment' } }
      : { video: true };
      
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Immediately stop the stream - we just wanted permission
    stream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (error) {
    console.error('Permission request failed:', error);
    return false;
  }
};

export const testCameraAccess = async (): Promise<{ success: boolean; error?: string; deviceType: string }> => {
  const deviceType = getDeviceType();
  
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not supported');
    }

    // Test basic camera access
    const hasPermission = await requestCameraPermission(deviceType);
    if (!hasPermission) {
      throw new Error('Camera permission denied');
    }

    // Test actual camera stream
    const constraints = getOptimalVideoConstraints(deviceType);
    const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
    
    // Clean up
    stream.getTracks().forEach(track => track.stop());
    
    return { success: true, deviceType };
  } catch (error: any) {
    return { 
      success: false, 
      error: getCameraErrorMessage(error, deviceType),
      deviceType 
    };
  }
};
