// Utility for standard fetch requests
export const fetchWithHeaders = (url: string, options: RequestInit = {}) => {
  const headers = {
    'User-Agent': 'PhotoShootStudio/1.0',
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};
