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
