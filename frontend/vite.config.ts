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
      allowedHosts: ['magictap.app'],
      hmr: {
        host: 'magictap.app',
        protocol: 'wss',
        clientPort: 443,
      },
    },
  };
});