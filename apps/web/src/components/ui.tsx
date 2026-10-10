import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../lib/api'
import { masteryColor } from '../lib/format'

export function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('label', className)}>{children}</div>
}

type Variant = 'ink' | 'accent' | 'outline' | 'ghost'
const VARIANTS: Record<Variant, string> = {
  ink: 'bg-ink text-bg hover:opacity-90',
  accent: 'bg-accent text-accent-ink hover:brightness-105 shadow-[0_2px_0_rgba(0,0,0,0.25)]',
  outline: 'border border-line bg-panel text-ink hover:bg-panel-2',
  ghost: 'text-ink-2 hover:bg-panel-2',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition select-none disabled:opacity-45 disabled:pointer-events-none cursor-pointer',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-14 px-6 text-base font-semibold tracking-tight',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function ButtonLink({ to, variant = 'outline', className, children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx('inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition', VARIANTS[variant], className)}>
      {children}
    </Link>
  )
}

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-md border border-line bg-panel p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <Label>{title}</Label> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Dot({ live, className }: { live?: boolean; className?: string }) {
  return <span className={cx('inline-block size-2 rounded-full', live ? 'bg-accent pulse' : 'bg-muted', className)} />
}

const PILL: Record<string, string> = {
  live: 'bg-accent text-accent-ink',
  recording: 'bg-accent text-accent-ink',
  processing: 'bg-panel-2 text-ink',
  running: 'bg-panel-2 text-ink',
  queued: 'bg-panel-2 text-muted',
  ready: 'bg-ink text-bg',
  done: 'bg-ink text-bg',
  idle: 'bg-panel-2 text-ink',
  ended: 'bg-panel-2 text-muted',
  unpaired: 'border border-line text-muted',
  error: 'bg-bad text-white',
  failed: 'bg-bad text-white',
}

export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={cx('inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 font-mono text-[10px] uppercase tracking-wider', PILL[status] ?? 'bg-panel-2 text-ink')}>
      {(status === 'live' || status === 'recording') && <span className="pulse inline-block size-1.5 rounded-full bg-white" />}
      {children ?? status}
    </span>
  )
}

export function Bar({ value, color, className, label }: { value: number | null | undefined; color?: string; className?: string; label?: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value ?? undefined}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v * 100}%`, background: color ?? 'var(--ink)' }} />
    </div>
  )
}

export function MasteryBar({ value }: { value: number | null | undefined }) {
  return <Bar value={value ?? 0} color={masteryColor(value)} label="mastery" />
}

export function ExamBadge() {
  return <span className="inline-flex h-5 items-center rounded-sm border border-accent px-1.5 font-mono text-[10px] uppercase tracking-wider text-accent">Exam</span>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted" role="status">
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="pulse inline-block size-1.5 rounded-full bg-ink" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
      <span className="label">{label}</span>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bad/50 bg-bad/10 px-4 py-3 text-sm" role="alert">
      <span>
        <span className="label mr-2 !text-bad">Error</span>
        {errorMessage(error)}
      </span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

/** Standard loading / error / content switch. */
export function Async<T>({ state, children, label }: { state: { data: T | undefined; error: unknown; reload: () => void }; children: (data: T) => ReactNode; label?: string }) {
  if (state.data !== undefined) return <>{children(state.data)}</>
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />
  return <Spinner label={label} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="dotgrid rounded-md border border-dashed border-line px-5 py-8 text-center text-sm text-muted">{children}</div>
}

export function PageTitle({ kicker, title, children }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <Label className="mb-2">{kicker}</Label>}
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <span className="relative inline-flex h-5 w-7 items-center rounded-[4px] bg-ink">
        <span className="ml-1 h-2 w-3 rounded-[1px] bg-bg" />
        <span className="ml-auto mr-1 size-1.5 rounded-full bg-accent" />
      </span>
      slap
    </span>
  )
}

export const inputCls =
  'h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none'
export const textareaCls =
  'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-muted focus:border-ink focus:outline-none'
