import type { Config } from '@react-router/dev/config'

// Framework mode: every file in src/routes is a page (see src/routes.ts), and pages are rendered on the
// server first, then taken over by the browser.
export default {
  appDirectory: 'src',
  ssr: true,
  // React Router 8's behaviour, switched on now so the later upgrade changes nothing.
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config
