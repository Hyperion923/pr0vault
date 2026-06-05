import { defineConfig } from "vite";
import { resolve } from "node:path";

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
