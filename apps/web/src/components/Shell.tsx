import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, useAuth } from '../lib/auth'
import { MOCK } from '../lib/env'
import { ButtonLink, Logo } from './ui'

/** Top bar used on non-class pages (classes list, recall). */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 md:px-6">
        <Link to="/" aria-label="Slap home">
          <Logo className="text-lg" />
        </Link>
        {MOCK && <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-bg">mock</span>}
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <UserMenu />
      </div>
    </header>
  )
}

export function UserMenu() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return <ButtonLink to="/login">Sign in</ButtonLink>
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <span className="grid size-6 place-items-center rounded-sm bg-ink font-mono text-[11px] uppercase text-bg">
          {(user.name || user.email).slice(0, 1)}
        </span>
        <span className="hidden max-w-[16ch] truncate sm:inline">{user.name || user.email}</span>
      </summary>
      <div className="absolute right-0 mt-2 w-60 rounded-md border border-line bg-panel p-2 shadow-lg">
        <div className="px-2 py-1.5">
          <div className="label">Signed in</div>
          <div className="truncate text-sm">{user.email}</div>
        </div>
        <Link className="block rounded-sm px-2 py-1.5 text-sm hover:bg-panel-2" to="/classes">
          My classes
        </Link>
        <button
          className="block w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm hover:bg-panel-2"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          Sign out
        </button>
      </div>
    </details>
  )
}
