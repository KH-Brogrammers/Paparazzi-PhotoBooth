export interface Screen {
  screenId: string;
  label: string;
  position?: {
    left: number;
    top: number;
  };
  resolution?: {
    width: number;
    height: number;
  };
  isPrimary: boolean;
  isAvailable: boolean;
  isCollageScreen: boolean;
  rotation: number; // 0, 90, -90
  collagePosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CameraMapping {
  _id: string;
  cameraId: string;
  cameraLabel: string;
  screenIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImageData {
  imageId: string;
  cameraId: string;
  cameraLabel: string;
  imageUrl: string;
  storageType: 's3' | 'local';
  timestamp: Date;
}

export interface ScreenCaptureData {
  screenId: string;
  imageUrl: string;
  rotation: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  screenLabel: string;
  timestamp: number;
}
