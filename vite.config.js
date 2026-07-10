import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/memories": "http://localhost:3001",
      "/login": "http://localhost:3001",
      "/logout": "http://localhost:3001",
    },
  },
});
