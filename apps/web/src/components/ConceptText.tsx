import type { Concept } from '@slap/contracts'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { masteryColor, pct } from '../lib/format'
import { ExamBadge } from './ui'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One regex for all concept names, longest first, case-insensitive, on word boundaries. */
export function useConceptMatcher(concepts: Concept[]) {
  return useMemo(() => {
    const named = concepts.filter((c) => c.name.trim().length > 1)
    if (named.length === 0) return null
    const sorted = [...named].sort((a, b) => b.name.length - a.name.length)
    const byName = new Map(sorted.map((c) => [c.name.toLowerCase(), c]))
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((c) => escape(c.name)).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
    return { re, byName }
  }, [concepts])
}

export function ConceptText({ text, matcher, classId }: { text: string; matcher: ReturnType<typeof useConceptMatcher>; classId: string }) {
  if (!matcher) return <>{text}</>
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(matcher.re)) {
    const idx = m.index ?? 0
    const c = matcher.byName.get(m[0].toLowerCase())
    if (!c) continue
    if (idx > last) out.push(<Fragment key={`t${last}`}>{text.slice(last, idx)}</Fragment>)
    out.push(<ConceptTerm key={`c${idx}`} concept={c} classId={classId} label={m[0]} />)
    last = idx + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>)
  return <>{out}</>
}

function ConceptTerm({ concept, classId, label }: { concept: Concept; classId: string; label: string }) {
  // Flip the card to the left edge when the term sits near the right side of the viewport.
  const [alignRight, setAlignRight] = useState(false)
  const place = (el: HTMLElement) => setAlignRight(el.getBoundingClientRect().left + 336 > window.innerWidth)
  return (
    <span className="group/term relative inline" onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>
      <Link
        to={`/c/${classId}/concept/${concept.id}`}
        className="rounded-[3px] bg-accent/15 px-0.5 font-medium text-ink underline decoration-accent/60 decoration-2 underline-offset-[3px] hover:bg-accent/25 focus:bg-accent/25"
      >
        {label}
      </Link>
      <span
        role="tooltip"
        className={`absolute ${alignRight ? 'right-0' : 'left-0'} top-full z-40 hidden w-80 max-w-[80vw] rounded-md border border-line bg-panel p-4 text-left text-sm font-normal leading-snug shadow-xl group-focus-within/term:block group-hover/term:block`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-bold tracking-tight">{concept.name}</span>
          {concept.examFlag && <ExamBadge />}
        </span>
        <span className="mt-2 block text-ink-2">{concept.definition}</span>
        {concept.examQuote && <span className="mt-2 block border-l-2 border-accent pl-2 italic text-ink-2">“{concept.examQuote}”</span>}
        <span className="mt-3 grid grid-cols-2 gap-3">
          <span>
            <span className="label block">Emphasis</span>
            <span className="mt-1 block h-1.5 rounded-full bg-panel-2">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${concept.emphasis * 100}%` }} />
            </span>
          </span>
          <span>
            <span className="label block">Mastery {pct(concept.mastery)}</span>
            <span className="mt-1 block h-1.5 rounded-full bg-panel-2">
              <span className="block h-full rounded-full" style={{ width: `${(concept.mastery ?? 0) * 100}%`, background: masteryColor(concept.mastery) }} />
            </span>
          </span>
        </span>
        <Link to={`/c/${classId}/concept/${concept.id}`} className="mt-3 inline-block text-xs font-medium underline">
          Open note →
        </Link>
      </span>
    </span>
  )
}
