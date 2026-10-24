import { defineConfig } from "vite";

// Standalone entry: neither the live web app nor its build imports this package.
export default defineConfig({ base: "./", server: { fs: { strict: true } } });
