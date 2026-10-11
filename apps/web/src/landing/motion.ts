/** Whether "reduce motion" is switched on. Browser only: call it from an effect or an event handler,
 *  never while rendering (the server has no such setting, and the first picture must match the server's). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
