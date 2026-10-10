import { ButtonLink, Logo } from '../components/ui'

export function NotFound() {
  return (
    <div className="dotgrid grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <Logo className="text-xl" />
        <div className="mt-8 font-mono text-6xl font-bold">404</div>
        <p className="mt-2 text-ink-2">This page isn’t here.</p>
        <ButtonLink className="mt-6" variant="ink" to="/">
          Home
        </ButtonLink>
      </div>
    </div>
  )
}
