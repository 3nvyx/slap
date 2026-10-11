import { cx } from '../components/ui'
import { Reveal } from './Reveal'

export type AccordionItem = { title: string; text: string }

/** A list whose items open and close, one at a time. `open` is the open item's place in the list, or -1 for
 *  none. `required` keeps one item open; `numbered` puts 01, 02, ... in front of the titles. */
export function Accordion({
  items,
  idPrefix,
  open,
  onChange,
  required,
  numbered,
  className,
}: {
  items: readonly AccordionItem[]
  /** The answers get the ids `${idPrefix}1`, `${idPrefix}2`, ... */
  idPrefix: string
  open: number
  onChange: (open: number) => void
  required?: boolean
  numbered?: boolean
  className?: string
}) {
  return (
    <Reveal className={cx('acc', className)}>
      {items.map((item, i) => {
        const id = `${idPrefix}${i + 1}`
        const isOpen = i === open
        return (
          <div key={id} className={cx('acc-item', isOpen && 'open')}>
            <h3>
              <button
                className="acc-head"
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => {
                  if (!isOpen) onChange(i)
                  else if (!required) onChange(-1)
                }}
              >
                {numbered && <span className="acc-n">{String(i + 1).padStart(2, '0')}</span>}
                <span className="acc-t">{item.title}</span>
                <span className="acc-i" aria-hidden="true" />
              </button>
            </h3>
            <div className="acc-body" id={id}>
              <div>
                <p>{item.text}</p>
              </div>
            </div>
          </div>
        )
      })}
    </Reveal>
  )
}
