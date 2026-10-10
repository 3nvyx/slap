import '@neondatabase/auth-ui/css'
import { AuthView } from '@neondatabase/auth-ui'
import { AuthProvider } from '../components/AuthProvider'
import type { ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Label, Logo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { MOCK } from '../lib/env'

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/classes'
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="dotgrid grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 inline-block">
            <Logo className="text-xl" />
          </Link>
          {children}
          <p className="mt-6 text-center text-xs text-muted">Live captions never need an account. Sign in for notes, cards and practice.</p>
        </div>
      </div>
    </AuthProvider>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user } = useAuth()
  if (user && !MOCK) return <Navigate to={next} replace />
  return (
    <AuthFrame>
      {MOCK && (
        <div className="mb-4 rounded-md border border-line bg-panel p-4 text-sm">
          <Label>Mock mode</Label>
          <p className="mt-1">
            You are signed in as the demo user. <Link className="underline" to={next}>Continue</Link>
          </p>
        </div>
      )}
      <AuthView path="sign-in" redirectTo={next} />
    </AuthFrame>
  )
}

/** Other Neon Auth views: sign-up, forgot-password, callback (OAuth return), sign-out… */
export function AuthPage() {
  const { path = 'sign-in' } = useParams()
  const [params] = useSearchParams()
  return (
    <AuthFrame>
      <AuthView path={path} redirectTo={safeNext(params.get('redirectTo') ?? params.get('next'))} />
    </AuthFrame>
  )
}
