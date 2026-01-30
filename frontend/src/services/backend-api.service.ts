const API_BASE_URL = (import.meta.env.VITE_API_BACKEND_URL || 'http://localhost:8800') + '/api';

console.log('🔗 Backend API URL:', API_BASE_URL);

// Screen APIs
export const screenApi = {
  register: async (screenData: any) => {
    const response = await fetch(`${API_BASE_URL}/screens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(screenData),
    });
    return response.json();
  },

  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/screens`);
    return response.json();
  },

  updateLabel: async (screenId: string, label: string) => {
    const response = await fetch(`${API_BASE_URL}/screens/${screenId}/label`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    return response.json();
  },

  delete: async (screenId: string) => {
    const response = await fetch(`${API_BASE_URL}/screens/${screenId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw { status: response.status, message: `HTTP ${response.status}` };
    }
    return response.json();
  },

  deleteAll: async () => {
    const response = await fetch(`${API_BASE_URL}/screens/all`, {
      method: 'DELETE',
    });
    return response.json();
  },

  clearAll: async () => {
    const response = await fetch(`${API_BASE_URL}/screens/clear`, {
      method: 'POST',
    });
    return response.json();
  },

  saveScreenCapture: async (captureData: any) => {
    const response = await fetch(`${API_BASE_URL}/screens/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(captureData),
    });
    return response.json();
  },

  toggleCollageScreen: async (screenId: string, isCollageScreen: boolean) => {
    const response = await fetch(`${API_BASE_URL}/screens/${screenId}/collage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCollageScreen }),
    });
    return response.json();
  },

  updateRotation: async (screenId: string, rotation: number) => {
    const response = await fetch(`${API_BASE_URL}/screens/${screenId}/rotation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation }),
    });
    return response.json();
  },

  updateCollagePosition: async (screenId: string, position: { x: number; y: number; width: number; height: number }) => {
    const response = await fetch(`${API_BASE_URL}/screens/${screenId}/collage-position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(position),
    });
    return response.json();
  },

  uploadCollage: async (collageImageData: string, timestamp: number) => {
    const response = await fetch(`${API_BASE_URL}/screens/upload-collage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collageImageData, timestamp }),
    });
    return response.json();
  },
};

// Mapping APIs
export const mappingApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/mappings`);
    return response.json();
  },

  getByCamera: async (cameraId: string) => {
    const response = await fetch(`${API_BASE_URL}/mappings/${cameraId}`);
    return response.json();
  },

  update: async (cameraId: string, cameraLabel: string, screenIds: string[], groupId?: string) => {
    const response = await fetch(`${API_BASE_URL}/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId, cameraLabel, screenIds, groupId }),
    });
    return response.json();
  },

  delete: async (cameraId: string) => {
    const response = await fetch(`${API_BASE_URL}/mappings/${cameraId}`, {
      method: 'DELETE',
    });
    return response.json();
  },
};

// Image APIs
export const imageApi = {
  save: async (imageData: any) => {
    const response = await fetch(`${API_BASE_URL}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imageData),
    });
    return response.json();
  },

  getAll: async (cameraId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (limit) params.append('limit', limit.toString());
    
    const response = await fetch(`${API_BASE_URL}/images?${params}`);
    return response.json();
  },

  getById: async (imageId: string) => {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}`);
    return response.json();
  },

  delete: async (imageId: string) => {
    const response = await fetch(`${API_BASE_URL}/images/${imageId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  getCaptureCounts: async () => {
    const response = await fetch(`${API_BASE_URL}/images/counts`);
    return response.json();
  },
};
