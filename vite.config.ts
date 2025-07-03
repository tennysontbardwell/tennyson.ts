import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()], // Add the React plugin
  server: {
    proxy: {
      // Proxy requests from /api to your backend server
      '/api': {
        target: 'http://localhost:3000', // The address of your API server
        changeOrigin: true, // Recommended for virtual hosts
        // You can also rewrite the path if needed, but not necessary here
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
