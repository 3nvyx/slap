import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ClassLayout } from './components/ClassLayout'
import { RequireAuth } from './components/RequireAuth'
import { Spinner } from './components/ui'
import { ClassesPage } from './pages/Classes'
import { ClassHome } from './pages/ClassHome'
import { ConceptPage } from './pages/Concept'
import { ExamSheetPage } from './pages/ExamSheet'
import { ExamTopicsPage } from './pages/ExamTopics'
import { JoinPage } from './pages/Join'
import { Landing } from './pages/Landing'
import { LecturePage } from './pages/Lecture'
import { LivePage } from './pages/Live'
import { NotFound } from './pages/NotFound'
import { PartnerPage } from './pages/Partner'
import { PracticePage } from './pages/Practice'
import { PretestPage } from './pages/Pretest'
import { RecallPage } from './pages/Recall'
import { ReviewPage } from './pages/Review'
import { TodayPage } from './pages/Today'

// Heavy, rarely-first pages are split out so the caption page stays light on phones.
const LoginPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.LoginPage })))
const AuthPage = lazy(() => import('./pages/Login').then((m) => ({ default: m.AuthPage })))
const GraphPage = lazy(() => import('./pages/Graph').then((m) => ({ default: m.GraphPage })))

/** Client-side navigation keeps the scroll offset; start each new page at the top (hash links scroll themselves). */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense
        fallback={
          <div className="mx-auto max-w-md px-6 pt-24">
            <Spinner />
          </div>
        }
      >
        <Routes>
          {/* public */}
          <Route path="/" element={<Landing />} />
          <Route path="/j/:code" element={<JoinPage />} />
          <Route path="/live/:lectureId" element={<LivePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/:path" element={<AuthPage />} />

          {/* signed in */}
          <Route element={<RequireAuth />}>
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/recall/:lectureId" element={<RecallPage />} />
          </Route>

          {/* class pages: members, or guests of a class with guest access (ClassLayout sends the rest to sign in) */}
          <Route path="/c/:classId" element={<ClassLayout />}>
            <Route index element={<ClassHome />} />
            <Route path="lecture/:id" element={<LecturePage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="concept/:conceptId" element={<ConceptPage />} />
            <Route path="exam-topics" element={<ExamTopicsPage />} />
            <Route path="exam-sheet" element={<ExamSheetPage />} />
            {/* per-student pages */}
            <Route element={<RequireAuth />}>
              <Route path="review" element={<ReviewPage />} />
              <Route path="practice" element={<PracticePage />} />
              <Route path="partner" element={<PartnerPage />} />
              <Route path="pretest" element={<PretestPage />} />
              <Route path="today" element={<TodayPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
