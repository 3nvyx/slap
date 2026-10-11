import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** False while the server renders and while the browser takes the page over; true after that.
 *  For parts that only work in a browser (a canvas library, values kept in localStorage). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
