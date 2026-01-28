// Utility to add ngrok headers to all fetch requests
export const fetchWithNgrokHeaders = (url: string, options: RequestInit = {}) => {
  const headers = {
    'ngrok-skip-browser-warning': 'true',
    'User-Agent': 'PhotoShootStudio/1.0',
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};
