export interface PresignedUrlRequest {
  fileName: string;
  fileType: string;
  cameraId: string;
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresIn: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
