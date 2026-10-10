import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
        <ClassesLink />
      </div>
    </header>
  )
}

/** There are no accounts: the right-hand corner is just the way back to the class list. */
export function ClassesLink() {
  return <ButtonLink to="/classes">All classes</ButtonLink>
}
