/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

const SERVER_PORT = parseInt(process.env.VITE_PORT || "2300", 10);
const API_PORT = parseInt(process.env.VITE_API_PORT || "3000", 10);
console.log(process.env.VITE_PORT)

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
    port: SERVER_PORT,
    watch: {
      ignored: ["**/build/**"],
    },
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
