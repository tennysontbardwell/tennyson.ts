/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  appType: "spa",
  test: {
    exclude: [...configDefaults.exclude, "**/build/**"],
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "localhost",
    port: 2300,
    watch: {
      ignored: ["**/build/**"],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
