import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load env file from the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,       
      port: 5173,
      strictPort: true,
      hmr: {
        host: env.VITE_API_BACKEND_URL 
                ? env.VITE_API_BACKEND_URL.replace(/^https?:\/\//, '') 
                : '13.233.215.148',
        
        // Use 'ws' for IP/HTTP or 'wss' for Domain/HTTPS
        protocol: env.VITE_API_BACKEND_URL?.startsWith('https') ? 'wss' : 'ws',
        
        // If hitting through Nginx (port 80), the browser thinks the port is 80
        clientPort: env.VITE_API_BACKEND_URL?.startsWith('https') ? 443 : 80,
      },
    },
  };
});