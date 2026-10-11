import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import type { Route } from './+types/root'
import { ButtonLink, Logo } from './components/ui'
import { LOGO_ICON_HREF } from './lib/logo'
import './index.css'

export const meta: Route.MetaFunction = () => [
  { title: 'Slap' },
  { name: 'description', content: 'Slap: live captions in your language, then a knowledge graph, flashcards and practice from every lecture.' },
]

/** The HTML document around every page. The server sends it; the browser then takes it over. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#d8d8d8" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f0f10" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/svg+xml" href={LOGO_ICON_HREF} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        {/* New pages start at the top; back and forward return to where the page was scrolled. */}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  // "user": animations stand still for someone whose system asks for reduced motion.
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
    </MotionConfig>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <div className="dotgrid grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <Logo className="text-xl" />
        <div className="mt-8 font-mono text-6xl font-bold">{notFound ? '404' : 'Error'}</div>
        <p className="mt-2 text-ink-2">{notFound ? 'This page isn’t here.' : 'Something went wrong on this page.'}</p>
        <ButtonLink className="mt-6" variant="ink" to="/home">
          Home
        </ButtonLink>
      </div>
    </div>
  )
}
