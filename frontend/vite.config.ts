// import { defineConfig, loadEnv } from "vite";
// import react from "@vitejs/plugin-react";
// import tailwindcss from "@tailwindcss/vite";

// export default defineConfig(({ mode }) => {
//   // Load env file from the current directory
//   const env = loadEnv(mode, process.cwd(), '');

//   return {
//     plugins: [react(), tailwindcss()],
//     server: {
//       host: true,
//       port: 5173,
//       strictPort: true,
//       hmr: {
//         host: env.VITE_API_BACKEND_URL
//                 ? env.VITE_API_BACKEND_URL.replace(/^https?:\/\//, '')
//                 : '13.233.215.148',
//         // Use 'ws' for IP/HTTP or 'wss' for Domain/HTTPS
//         protocol: env.VITE_API_BACKEND_URL?.startsWith('https') ? 'wss' : 'ws',

//         // If hitting through Nginx (port 80), the browser thinks the port is 80
//         clientPort: env.VITE_API_BACKEND_URL?.startsWith('https') ? 443 : 80,
//       },
//     },
//   };
// });



import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load env variables
  const env = loadEnv(mode, process.cwd(), '');

  // Derive backend host safely
  const backendHost = env.VITE_API_BACKEND_URL
    ? env.VITE_API_BACKEND_URL.replace(/^https?:\/\//, '').split(':')[0]
    : '13.233.215.148';

  const isHttps = env.VITE_API_BACKEND_URL?.startsWith('https');

  return {
    plugins: [react(), tailwindcss()],

    server: {
      host: true,
      port: 5173,
      strictPort: true,

      // ✅ REQUIRED to fix "Blocked request" on magictap.app
      allowedHosts: [
        'magictap.app',
        'pap.magictap.app',
        '13.233.215.148',
        'localhost',
      ],

      // ✅ Correct HMR when behind Nginx + HTTPS
      hmr: {
        host: 'magictap.app',     // domain users access
        protocol: isHttps ? 'wss' : 'ws',
        clientPort: isHttps ? 443 : 80,
      },
    },
  };
});
