import { redirect } from 'react-router'

// The class list used to live here. Old links and bookmarks land on Home, which took its place.
export function loader() {
  return redirect('/home')
}
