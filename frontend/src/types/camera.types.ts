export interface Camera {
  deviceId: string;
  label: string;
  stream: MediaStream | null;
}

export interface CapturedImage {
  id: string;
  cameraId: string;
  cameraLabel: string;
  dataUrl: string;
  timestamp: number;
  s3Key?: string;
  storageType: 's3' | 'local';
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresIn: number;
}
