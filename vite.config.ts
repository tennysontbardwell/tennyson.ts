/// <reference types="vitest" />
// import { defineConfig } from 'vite';
import { defineConfig } from 'vitest/config'
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()], // Add the React plugin
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/build/**',
    ],
  },
  server: {
    watch: {
      ignored: ['**/build/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
