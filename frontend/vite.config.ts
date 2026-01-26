import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,       // listen on all interfaces
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'janella-triumphant-roastingly.ngrok-free.dev', // or dynamic
    },
  },
});
