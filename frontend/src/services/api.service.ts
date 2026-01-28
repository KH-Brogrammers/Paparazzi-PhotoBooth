const API_BASE_URL = import.meta.env.VITE_PUBLIC_BACKEND_URL + '/api' || 'http://localhost:8800/api'; 

export interface GeneratePresignedUrlRequest {
  fileName: string;
  fileType: string;
  cameraId: string;
}

export interface GeneratePresignedUrlResponse {
  url: string;
  key: string;
  expiresIn: number;
}

class ApiService {
  async generatePresignedUrl(
    request: GeneratePresignedUrlRequest
  ): Promise<GeneratePresignedUrlResponse | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/presigned-url/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to generate presigned URL:', error);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error calling presigned URL API:', error);
      return null;
    }
  }

  async uploadToS3(url: string, file: Blob): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'ngrok-skip-browser-warning': 'true',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Error uploading to S3:', error);
      return false;
    }
  }
}

export const apiService = new ApiService();
