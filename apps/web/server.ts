// How the API serves this app's pages (apps/api/src/server.ts imports this file). It pairs a server build
// (build/server/index.js, from `pnpm build`) with this package's own copy of React Router, and returns a
// function that turns a browser request into a rendered page.
import { createRequestHandler, type ServerBuild } from 'react-router'

export function pageHandler(build: ServerBuild): (request: Request) => Promise<Response> {
  return createRequestHandler(build, process.env.NODE_ENV === 'development' ? 'development' : 'production')
}
