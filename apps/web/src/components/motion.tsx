import { motion, type Transition, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

// Slap's motion, in one place. Things move a short way, fast, and settle without bouncing: closer to a
// switch clicking over than to an animation. The root wraps the app in MotionConfig, so all of it stands
// still for someone who asked their system for reduced motion.

/** For things that slide to a new place (the side bar's marker, the top bar's underline). */
export const SPRING: Transition = { type: 'spring', stiffness: 560, damping: 42, mass: 0.9 }
/** For things that appear. */
export const EASE_OUT: Transition = { duration: 0.24, ease: [0.16, 1, 0.3, 1] }

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045 } } }
/** One child of <Stagger>: fades up a few pixels. Use as `variants={riseItem}` on a motion element. */
export const riseItem: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: EASE_OUT } }

/** Its motion children (each with `variants={riseItem}`) come in one after another. Only for content that
 *  arrives after the page has loaded (a fetched list): on the server it would be sent invisible. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={list} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}
