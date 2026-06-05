import { defineConfig } from "vite";
import { resolve } from "node:path";

// IIFE bundle that runs in pr0gramm.com's MAIN world (page context).
// No chrome.* APIs available here — uses postMessage to talk to content.js.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/page-hook.ts"),
      output: {
        entryFileNames: "src/page-hook.js",
        format: "iife",
      },
    },
  },
});
