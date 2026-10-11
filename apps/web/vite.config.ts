import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The API the dev server proxies to: :8787 by default (VITE_API_PROXY overrides it, e.g. for a second API instance).
const API = process.env.VITE_API_PROXY ?? 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // "@/..." is src/ (tsconfig.app.json has the same alias); the shadcn components import each other this way.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/ws': { target: API, ws: true, changeOrigin: true },
    },
  },
})
