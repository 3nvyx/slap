import { useNavigate } from 'react-router'
import { CourseGrid, CreateCourseForm } from '../components/Courses'
import { TopBar } from '../components/Shell'
import { Async, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'

/** Every course, and the form that adds one. Home shows the same cards under the dashboard. */
export default function CoursesPage() {
  const courses = useApi(() => api.classes(), [])
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <PageTitle title="Courses" />
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <Async state={courses} label="Loading courses">
            {(data) => <CourseGrid courses={data} />}
          </Async>
          <div className="space-y-4">
            <CreateCourseForm onDone={(id) => navigate(`/c/${id}`)} />
          </div>
        </div>
      </main>
    </div>
  )
}
