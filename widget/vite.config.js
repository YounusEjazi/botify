import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

// Builds a single-file IIFE: widget.v1.js
// Customers embed with one <script src=...> tag.
export default defineConfig({
  plugins: [vue()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/main.ce.js",
      name: "ChatbotWidget",
      formats: ["iife"],
      fileName: () => "widget.v1.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    target: "es2019",
    cssCodeSplit: false,
  },
  server: { port: 4173, strictPort: true },
})
