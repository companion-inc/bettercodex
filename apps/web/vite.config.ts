import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {"@": path.resolve(__dirname, "src")},
  },
  build: {
    outDir: "out",
    emptyOutDir: true,
  },
  server: {
    // In dev there is no Worker, so proxy the catalog API to the deployed one.
    proxy: {
      "/api": {
        target: "https://bettercodex-web.companion-inc.workers.dev",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
