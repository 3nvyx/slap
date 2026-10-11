import type { RouteConfig } from '@react-router/dev/routes'
import { flatRoutes } from '@react-router/fs-routes'

// File-based routing: each file in src/routes is a page, and its name is its address.
//   _index.tsx             /
//   courses.tsx            /courses
//   j.$code.tsx            /j/:code           ("." is "/", "$name" is a value in the address)
//   c.$classId.tsx         the frame around every /c/:classId/... page
//   c.$classId._index.tsx  /c/:classId
// An address with no file is answered with 404 and the error page in root.tsx.
export default flatRoutes() satisfies RouteConfig
