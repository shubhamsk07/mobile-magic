import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  server: {
    // 0.0.0.0 makes the dev server listen on all addresses, 
    // or you could specify a particular IP or hostname.
    host: '0.0.0.0', 
    port: 8081,
    allowedHosts: true
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
