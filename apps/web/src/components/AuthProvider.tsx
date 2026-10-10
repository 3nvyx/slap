import { NeonAuthUIProvider } from '@neondatabase/auth-ui'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authClient, clearToken } from '../lib/auth'

function RouterLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) => navigate(href)}
      replace={(href) => navigate(href, { replace: true })}
      onSessionChange={() => clearToken()}
      Link={RouterLink}
      social={{ providers: ['google'] }}
      credentials
      basePath="/auth"
      redirectTo="/classes"
      defaultTheme="system"
    >
      {children}
    </NeonAuthUIProvider>
  )
}
