import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { MOCK } from '../lib/env'
import { SPRING } from './motion'
import { cx, Logo } from './ui'

/** Top bar of the pages outside a course (home, courses, recall, demo). Inside a course the side bar takes its place. */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-4 px-4 md:px-6">
        <Link to="/" aria-label="Slap home">
          <Logo className="text-[17px]" />
        </Link>
        {MOCK && <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-bg">mock</span>}
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <HomeLinks />
      </div>
    </header>
  )
}

/** There are no accounts: the right-hand corner is just the way back to the dashboard and the course list. */
export function HomeLinks() {
  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      <TopLink to="/home">Home</TopLink>
      <TopLink to="/courses">Courses</TopLink>
    </nav>
  )
}

/** One link of the top bar. The orange line under the open page slides across when the page changes. */
function TopLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cx('relative flex h-12 items-center px-2.5 text-[13px] font-medium transition-colors', isActive ? 'text-ink' : 'text-muted hover:text-ink')}
    >
      {({ isActive }) => (
        <>
          {children}
          {isActive && <motion.span layoutId="top-bar-marker" transition={SPRING} className="absolute inset-x-2.5 -bottom-px h-0.5 bg-accent" />}
        </>
      )}
    </NavLink>
  )
}
