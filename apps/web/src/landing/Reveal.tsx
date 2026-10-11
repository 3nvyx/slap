import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../components/ui'

/** A block that fades up the first time it scrolls into view. With "reduce motion" on, or without
 *  JavaScript, landing.css shows it straight away. */
export function Reveal({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'figure' | 'dl'
  className?: string
  children: ReactNode
  'aria-hidden'?: boolean
}) {
  const [el, setEl] = useState<Element | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setSeen(true)
        io.disconnect()
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [el])

  return (
    <Tag ref={setEl} className={cx('reveal', seen && 'in', className)} {...rest}>
      {children}
    </Tag>
  )
}
