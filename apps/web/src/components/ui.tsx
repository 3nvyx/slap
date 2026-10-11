import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { errorMessage } from '../lib/api'
import { masteryColor } from '../lib/format'
import { cn } from '../lib/utils'
import { LogoArt } from './LogoArt'
import { Badge } from './shadcn/badge'
import { Button as BaseButton } from './shadcn/button'
import { Card } from './shadcn/card'

// Slap's own building blocks. The pages import from here; underneath, the button, panel and tags are the
// shadcn/ui components in ./shadcn, already styled for Slap.

/** Joins class names. A later Tailwind class wins over an earlier one for the same property. */
export const cx = cn

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('label', className)}>{children}</div>
}

type Variant = 'ink' | 'accent' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export function Button({ variant = 'outline', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <BaseButton variant={variant} size={size} {...props} />
}

export function ButtonLink({ to, variant = 'outline', size = 'md', className, children }: { to: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <BaseButton asChild variant={variant} size={size} className={className}>
      <Link to={to}>{children}</Link>
    </BaseButton>
  )
}

/** Dark mode: a white hairline and a soft white glow so a card stands out from the page. Panels and the course cards share it. */
export const glowCls = 'border-2 dark:border-white/40 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(255,255,255,0.10)]'

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <Card className={cx('block gap-0 p-5', glowCls, className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-3 dark:border-white/20">
          {title ? <Label className="text-sm font-medium text-ink dark:text-white">{title}</Label> : <span />}
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}

export function Dot({ live, className }: { live?: boolean; className?: string }) {
  return <span className={cx('inline-block size-2 rounded-full', live ? 'bg-accent pulse' : 'bg-muted', className)} />
}

const PILL: Record<string, string> = {
  live: 'bg-accent text-accent-ink',
  recording: 'bg-accent text-accent-ink',
  replay: 'bg-yellow-400 text-black',
  processing: 'bg-panel-2 text-ink',
  running: 'bg-panel-2 text-ink',
  queued: 'bg-panel-2 text-muted',
  ready: 'bg-ink text-bg',
  done: 'bg-ink text-bg',
  idle: 'bg-panel-2 text-ink',
  ended: 'bg-panel-2 text-muted',
  offline: 'border border-line text-muted',
  error: 'bg-bad text-white',
  failed: 'bg-bad text-white',
}

export function Pill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <Badge className={PILL[status] ?? 'bg-panel-2 text-ink'}>
      {(status === 'live' || status === 'recording' || status === 'replay') && <span className="pulse inline-block size-1.5 rounded-full bg-white mix-blend-difference" />}
      {children ?? status}
    </Badge>
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
  return <Badge className="border-accent bg-transparent text-accent">Exam</Badge>
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
  return <div className="dotgrid rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-muted">{children}</div>
}

export function PageTitle({ kicker, title, children }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <Label className="mb-2">{kicker}</Label>}
        <h1 className="text-3xl font-bold tracking-[-0.035em] md:text-4xl">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <LogoArt className="h-[1.6em] w-auto flex-none" />
      slap
    </span>
  )
}

// For plain <input> and <textarea>; the same look as the shadcn Input and Textarea.
export const inputCls =
  'h-9 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink outline-none transition-[color,border-color,box-shadow] placeholder:text-muted hover:border-ink/30 focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-accent/25'
export const textareaCls =
  'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-[color,border-color,box-shadow] placeholder:text-muted hover:border-ink/30 focus-visible:border-ink focus-visible:ring-[3px] focus-visible:ring-accent/25'
