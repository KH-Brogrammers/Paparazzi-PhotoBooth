import { generateId } from './helpers';

// Declare Window Placement API types
declare global {
  interface Window {
    getScreenDetails?: () => Promise<{
      screens: Array<{
        availHeight: number;
        availWidth: number;
        availLeft: number;
        availTop: number;
        left: number;
        top: number;
        width: number;
        height: number;
        isPrimary: boolean;
        isInternal: boolean;
        devicePixelRatio: number;
        label: string;
      }>;
      currentScreen: any;
    }>;
  }
}

export interface DetectedScreen {
  screenId: string;
  label: string;
  position: {
    left: number;
    top: number;
  };
  resolution: {
    width: number;
    height: number;
  };
  isPrimary: boolean;
}

export async function detectScreens(): Promise<DetectedScreen[]> {
  try {
    // Check if Window Placement API is available
    if ('getScreenDetails' in window) {
      const screenDetails = await window.getScreenDetails!();
      
      return screenDetails.screens.map((screen, index) => ({
        screenId: `screen-${screen.left}-${screen.top}-${screen.width}-${screen.height}`,
        label: screen.label || `Screen ${index + 1}`,
        position: {
          left: screen.left,
          top: screen.top,
        },
        resolution: {
          width: screen.width,
          height: screen.height,
        },
        isPrimary: screen.isPrimary,
      }));
    } else {
      // Fallback: Generate unique ID
      console.warn('Window Placement API not available, using fallback');
      return [];
    }
  } catch (error) {
    console.error('Error detecting screens:', error);
    return [];
  }
}

export function generateScreenId(): string {
  // Generate unique screen ID for each tab/window instance
  return `screen-${generateId()}-${Date.now()}`;
}

export function getCurrentScreenInfo(): DetectedScreen {
  // Fallback screen info with unique ID for each tab
  const screenId = generateScreenId();
  const screenNumber = screenId.split('-')[1].slice(-3); // Last 3 digits for display
  
  return {
    screenId,
    label: `Screen ${screenNumber}`,
    position: {
      left: window.screenX,
      top: window.screenY,
    },
    resolution: {
      width: window.screen.width,
      height: window.screen.height,
    },
    isPrimary: true,
  };
}
