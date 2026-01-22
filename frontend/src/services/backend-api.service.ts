const API_BASE_URL = 'http://localhost:8800/api';

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

  update: async (cameraId: string, cameraLabel: string, screenIds: string[]) => {
    const response = await fetch(`${API_BASE_URL}/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId, cameraLabel, screenIds }),
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
};
