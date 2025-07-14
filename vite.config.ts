/// <reference types="vitest" />
// import { defineConfig } from 'vite';
import { defineConfig } from 'vitest/config'
import { configDefaults } from 'vitest/config';
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tsconfigPaths(),
  ],
  appType: 'spa',
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
