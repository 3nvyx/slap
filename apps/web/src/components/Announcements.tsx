import { Link } from 'react-router-dom'
import { daysUntil, fmtDate } from '../lib/format'
import type { ClassAnnouncement } from '../lib/types'
import { cx } from './ui'

/** Deadlines, exams and schedule changes the lecturer mentioned, across lectures. Dated ones first (the API sorts). */
export function AnnouncementList({ items, classId, limit, upcomingOnly = false }: { items: ClassAnnouncement[]; classId: string; limit?: number; upcomingOnly?: boolean }) {
  const list = (upcomingOnly ? items.filter((a) => a.when && (daysUntil(a.when) ?? -1) >= 0) : items).slice(0, limit)
  if (list.length === 0) return <p className="text-sm text-muted">{upcomingOnly ? 'Nothing dated is coming up.' : 'No announcements yet.'}</p>
  return (
    <ul className="space-y-2">
      {list.map((a, i) => {
        const days = a.when ? daysUntil(a.when) : null
        const urgent = a.when && days != null && days >= 0 && days <= 7 && (a.kind === 'deadline' || a.kind === 'exam')
        return (
          <li key={`${a.lectureId}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-line bg-panel px-4 py-3 text-sm">
            <span className={cx('font-mono text-[10px] uppercase tracking-wider', a.kind === 'exam' || a.kind === 'deadline' ? 'text-accent' : 'text-muted')}>{a.kind}</span>
            <span className="min-w-0 flex-[1_1_14rem]">{a.text}</span>
            {a.when && (
              <span className={cx('font-mono text-xs', urgent ? 'font-semibold text-accent' : 'text-muted')}>
                {fmtDate(a.when)}
                {days != null && days >= 0 && days <= 14 ? ` · ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`}` : ''}
              </span>
            )}
            <Link
              to={`/c/${classId}/lecture/${a.lectureId}${a.segmentId != null ? `#seg-${a.segmentId}` : ''}`}
              className="text-xs text-muted underline hover:text-ink"
              title={a.lectureTitle}
            >
              {fmtDate(a.lectureDate)}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
