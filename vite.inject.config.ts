import { defineConfig } from "vite";

// Gera um único IIFE que o Rust embute com include_str! e injeta no web.whatsapp.com.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-inject",
    emptyOutDir: true,
    target: "safari16",
    minify: true,
    sourcemap: false,
    lib: {
      entry: "inject/index.ts",
      formats: ["iife"],
      name: "WaNativeInject",
      fileName: () => "inject.js",
    },
  },
});
