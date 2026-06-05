import { defineConfig } from "vite";
import { resolve } from "node:path";

// IIFE bundle for the Isolated-World content script.
// page-hook.ts is built by vite.page-hook.config.ts (separate IIFE for MAIN world).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content.ts"),
      output: {
        entryFileNames: "src/content.js",
        format: "iife",
      },
    },
  },
});

