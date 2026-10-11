import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The API the dev server proxies to: :8787 by default (VITE_API_PROXY overrides it, e.g. for a second API instance).
const API = process.env.VITE_API_PROXY ?? 'http://localhost:8787'

// The landing page (website/, plain files) owns "/" and its own files, as it does on the API server
// (apps/api/src/server.ts). Everything else is the web app.
const SITE = path.resolve(import.meta.dirname, '../../website')
const SITE_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function landingPage(): Plugin {
  return {
    name: 'slap-landing-page',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const { pathname } = new URL(req.url ?? '/', 'http://localhost')
        let rel: string
        try {
          rel = decodeURIComponent(pathname)
        } catch {
          return next()
        }
        const file = path.join(SITE, rel === '/' ? 'index.html' : rel)
        const type = SITE_TYPES[path.extname(file)]
        if (!type || !file.startsWith(SITE + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', type)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(readFileSync(file))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [landingPage(), react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/ws': { target: API, ws: true, changeOrigin: true },
    },
  },
})
