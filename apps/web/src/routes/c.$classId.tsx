// The frame around every /c/:classId/... page: the side bar (course switch and the course's tabs) and its data.
import type { Route } from './+types/c.$classId'

export { ClassLayout as default } from '../components/ClassLayout'

// The side bar remembers whether it was folded in a cookie (components/shadcn/sidebar.tsx writes it). Reading
// it here lets the server send the page with the side bar already in that state, so it does not jump on load.
export function loader({ request }: Route.LoaderArgs) {
  return { sidebarOpen: !/(?:^|;\s*)sidebar_state=false(?:;|$)/.test(request.headers.get('cookie') ?? '') }
}

// Nothing on the server changes between the course's pages, so the loader runs once per visit.
export function shouldRevalidate() {
  return false
}
