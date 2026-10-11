import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ClassLayout } from './components/ClassLayout'
import { Spinner } from './components/ui'
import { ClassesPage } from './pages/Classes'
import { ClassHome } from './pages/ClassHome'
import { ConceptPage } from './pages/Concept'
import { DemoPage } from './pages/Demo'
import { ExamSheetPage } from './pages/ExamSheet'
import { ExamTopicsPage } from './pages/ExamTopics'
import { JoinPage } from './pages/Join'
import { LecturePage } from './pages/Lecture'
import { LecturerPage } from './pages/Lecturer'
import { LivePage } from './pages/Live'
import { NotFound } from './pages/NotFound'
import { PartnerPage } from './pages/Partner'
import { PracticePage } from './pages/Practice'
import { PretestPage } from './pages/Pretest'
import { RecallPage } from './pages/Recall'
import { ReviewPage } from './pages/Review'
import { TodayPage } from './pages/Today'

// Heavy, rarely-first pages are split out so the caption page stays light on phones.
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
          {/* No sign-in anywhere: every page is open. */}
          {/* "/" is the landing page (website/), served ahead of this app; if it is missing, start at the class list. */}
          <Route path="/" element={<Navigate to="/classes" replace />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/j/:code" element={<JoinPage />} />
          <Route path="/live/:lectureId" element={<LivePage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/recall/:lectureId" element={<RecallPage />} />

          <Route path="/c/:classId" element={<ClassLayout />}>
            <Route index element={<ClassHome />} />
            <Route path="lecture/:id" element={<LecturePage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="concept/:conceptId" element={<ConceptPage />} />
            <Route path="exam-topics" element={<ExamTopicsPage />} />
            <Route path="exam-sheet" element={<ExamSheetPage />} />
            {/* per-student pages: progress follows this browser's id (lib/user.ts) */}
            <Route path="review" element={<ReviewPage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="partner" element={<PartnerPage />} />
            <Route path="pretest" element={<PretestPage />} />
            <Route path="lecturer" element={<LecturerPage />} />
            <Route path="today" element={<TodayPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
