import { lazy, Suspense } from 'react'
import { Spinner } from '../components/ui'
import { useHydrated } from '../lib/useHydrated'

// The graph library draws on a canvas and needs a browser, so the page is loaded and drawn there only.
// It is also the heaviest page; loading it apart keeps the others light.
const GraphPage = lazy(() => import('../components/GraphPage').then((m) => ({ default: m.GraphPage })))

export default function GraphRoute() {
  const hydrated = useHydrated()
  return <Suspense fallback={<Spinner />}>{hydrated ? <GraphPage /> : <Spinner />}</Suspense>
}
