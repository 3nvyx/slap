import type { Config } from '@react-router/dev/config'
import { vercelPreset } from '@vercel/react-router/vite'

// Framework mode: every file in src/routes is a page (see src/routes.ts), and pages are rendered on the
// server first, then taken over by the browser.
export default {
  appDirectory: 'src',
  ssr: true,
  // On Vercel (it sets VERCEL=1) the build also writes .vercel/output: the client files as static assets and
  // the page renderer as a serverless function. Elsewhere build/ is unchanged and the API serves it.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
  // React Router 8's behaviour, switched on now so the later upgrade changes nothing.
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config
