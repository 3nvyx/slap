import { LOGO_PATH, LOGO_VIEWBOX } from '../lib/logo'

/** The logo drawing (see lib/logo.ts). It takes the colour of the text around it; the class sets its size. */
export function LogoArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={LOGO_VIEWBOX} fill="currentColor" aria-hidden="true">
      <path d={LOGO_PATH} />
    </svg>
  )
}
