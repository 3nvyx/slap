import type { Concept, ExamTopic } from '@slap/contracts'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { Async, Button, ButtonLink, ExamBadge, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { examInfo, fmtDate, masteryColor, pct } from '../lib/format'
import { useApi } from '../lib/useApi'

const SHEET_SIZE = 14

/** One-page exam sheet: the top exam topics with their definitions and the lecturer's own words, weak spots first.
 *  Built from exam topics + concept notes + graph links; a re-reading aid, printable. */
export function ExamSheetPage() {
  const { classId, detail, guest } = useClass()
  const topics = useApi(() => api.examTopics(classId), [classId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const graph = useApi(() => api.graph(classId), [classId])
  const exam = examInfo(detail.nextExam)

  const byId = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c])), [concepts.data])
  const related = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const l of graph.data?.links ?? []) {
      ;(m.get(l.from) ?? m.set(l.from, new Set()).get(l.from)!).add(l.to)
      ;(m.get(l.to) ?? m.set(l.to, new Set()).get(l.to)!).add(l.from)
    }
    return m
  }, [graph.data])

  const state = {
    data: topics.data && concepts.data ? { topics: topics.data, concepts: concepts.data } : undefined,
    error: topics.error ?? concepts.error,
    reload: () => {
      void topics.reload()
      void concepts.reload()
    },
  }

  return (
    <div className="max-w-3xl print:max-w-none">
      <div className="print:hidden">
        <PageTitle kicker="Re-reading aid · one page" title="Exam sheet">
          <div className="flex gap-2">
            <Button onClick={() => window.print()}>Print</Button>
            <ButtonLink to={`/c/${classId}/exam-topics`}>Exam topics</ButtonLink>
          </div>
        </PageTitle>
        <p className="mb-6 max-w-2xl text-sm text-ink-2">
          The {SHEET_SIZE} topics the lecturer stressed most, {guest ? 'in emphasis order' : 'your weakest first'}, each with its definition, the lecturer’s own words and what it connects to. Read it the night before; it is not a substitute for practice.
        </p>
      </div>

      <Async state={state} label="Building the sheet">
        {({ topics: list }) => {
          const sheet = [...list].sort((a, b) => b.score - a.score).slice(0, SHEET_SIZE)
          if (sheet.length === 0) return <p className="text-sm text-muted">No concepts yet.</p>
          return (
            <article className="rounded-md border border-line bg-panel p-6 print:border-0 print:p-0">
              <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                <h2 className="text-xl font-bold tracking-tight">
                  {detail.class.code} · {detail.class.name}
                </h2>
                <span className="font-mono text-xs text-muted">{exam ? `${exam.name} · ${fmtDate(exam.date, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'next exam: date unknown'}</span>
              </header>
              <ol className="columns-1 gap-8 md:columns-2 print:columns-2">
                {sheet.map((t: ExamTopic, i) => {
                  const c = byId.get(t.conceptId)
                  const rel = [...(related.get(t.conceptId) ?? [])].map((id) => byId.get(id)).filter((x): x is Concept => !!x).slice(0, 4)
                  return (
                    <li key={t.conceptId} className="mb-5 break-inside-avoid">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                        <Link to={`/c/${classId}/concept/${t.conceptId}`} className="font-bold tracking-tight hover:underline print:no-underline">
                          {t.name}
                        </Link>
                        {t.examFlag && <ExamBadge />}
                        {!guest && <span className="ml-auto size-2 shrink-0 rounded-full print:hidden" style={{ background: masteryColor(t.mastery) }} title={`Mastery ${pct(t.mastery)}`} />}
                      </div>
                      {c?.definition && <p className="mt-1 text-sm leading-relaxed">{c.definition}</p>}
                      {c?.examQuote && <p className="mt-1 border-l-2 border-accent pl-2 text-sm italic text-ink-2">“{c.examQuote}”</p>}
                      {rel.length > 0 && (
                        <p className="mt-1 text-xs text-muted">
                          <span className="label mr-1">Links</span>
                          {rel.map((r) => r.name).join(' · ')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            </article>
          )
        }}
      </Async>
    </div>
  )
}
