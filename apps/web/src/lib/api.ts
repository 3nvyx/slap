import type {
  Assessment,
  AssessmentKind,
  Attempt,
  Card,
  ClassSummary,
  Concept,
  ExamTopic,
  Health,
  LectureAnswer,
  LectureSummary,
  PartnerSession,
  PartnerTurn,
  PartnerVoice,
  Pretest,
  PretestAttempt,
  Question,
  Rating,
  RecallResult,
  StudyBundleStatus,
  StudyPlan,
  InboxLecture,
} from '@slap/contracts'
import { API_BASE, MOCK } from './env'
import type {
  ClassAnnouncement,
  ClassDetail,
  ConceptDetail,
  DeviceSummary,
  DocumentDetail,
  Graph,
  JoinInfo,
  LectureDetail,
  PublicLecture,
  ReplayOpts,
  ReviewResult,
  Today,
  UploadResult,
} from './types'
import { userId } from './user'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Method = 'GET' | 'POST' | 'DELETE'

interface RequestOptions {
  body?: unknown
}

async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  if (MOCK) {
    const { mockRequest } = await import('./mock')
    return mockRequest<T>(method, path, opts.body)
  }
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Slap-User': userId() }
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  let res: Response
  try {
    res = await fetch(API_BASE + path, { method, headers, body })
  } catch {
    throw new ApiError(0, 'Network error: is the API running?')
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new ApiError(res.status, (data as { error: string }).error)
  }
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText || 'Request failed'}`)
  return data as T
}

const get = <T>(path: string) => request<T>('GET', path)
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} })
const enc = encodeURIComponent

export const api = {
  health: () => get<Health>('/api/health/ready'),

  // join link and caption page
  join: (code: string) => get<JoinInfo>(`/api/join/${enc(code)}`),
  publicLecture: (id: string, lang: string) => get<PublicLecture>(`/api/lectures/${enc(id)}/public?lang=${enc(lang)}`),

  // classes
  /** Every class; there is no sign-in, so the list is the same for everyone. */
  classes: () => get<ClassSummary[]>('/api/classes'),
  createClass: (name: string, code: string) => post<ClassSummary>('/api/classes', { name, code }),
  classDetail: (classId: string) => get<ClassDetail>(`/api/classes/${enc(classId)}`),
  announcements: (classId: string) => get<ClassAnnouncement[]>(`/api/classes/${enc(classId)}/announcements`),
  startSession: (classId: string, title?: string) =>
    post<LectureSummary>(`/api/classes/${enc(classId)}/sessions/start`, title ? { title } : {}),
  /** Stops a live lecture or a running replay (the replay's own id). */
  stopLecture: (lectureId: string) => post<LectureSummary>(`/api/lectures/${enc(lectureId)}/stop`),
  /** Plays a saved lecture back through the caption page; returns the new (in-memory) lecture to open at /live/:id. */
  replay: (lectureId: string, opts: ReplayOpts = {}) => post<LectureSummary>(`/api/lectures/${enc(lectureId)}/replay`, opts),
  importLecture: (classId: string, input: { title: string; date: string; transcript: string }) =>
    post<LectureSummary>(`/api/classes/${enc(classId)}/lectures/import`, input),
  /** Exam, quiz and assignment dates entered by hand; they count next to the dates read from a syllabus. */
  assessments: (classId: string) => get<Assessment[]>(`/api/classes/${enc(classId)}/assessments`),
  addAssessment: (classId: string, input: { kind: AssessmentKind; name: string; date: string }) =>
    post<Assessment>(`/api/classes/${enc(classId)}/assessments`, input),
  removeAssessment: (id: string) => request<{ ok: true }>('DELETE', `/api/assessments/${enc(id)}`),
  /** Devices that are online now. */
  devices: () => get<DeviceSummary[]>('/api/devices'),
  /** Puts what the device is recording into a course. */
  setActiveClass: (deviceId: string, classId: string) =>
    post<DeviceSummary>(`/api/devices/${enc(deviceId)}/active-class`, { classId }),
  /** Device recordings that are not in a course yet. */
  inbox: () => get<InboxLecture[]>('/api/inbox'),
  /** Puts a recording into a course; a finished one then gets its notes and cards. */
  assignLecture: (lectureId: string, classId: string) => post<LectureSummary>(`/api/lectures/${enc(lectureId)}/assign`, { classId }),
  discardRecording: (lectureId: string) => request<{ ok: true }>('DELETE', `/api/inbox/${enc(lectureId)}`),
  lecture: (id: string) => get<LectureDetail>(`/api/lectures/${enc(id)}`),
  translations: (id: string, lang: string) =>
    get<Record<string, string>>(`/api/lectures/${enc(id)}/translations?lang=${enc(lang)}`),
  concepts: (classId: string) => get<Concept[]>(`/api/classes/${enc(classId)}/concepts`),
  graph: (classId: string) => get<Graph>(`/api/classes/${enc(classId)}/graph`),
  concept: (id: string) => get<ConceptDetail>(`/api/concepts/${enc(id)}`),

  // study
  bundle: (lectureId: string) => get<StudyBundleStatus>(`/api/lectures/${enc(lectureId)}/bundle`),
  rerunBundle: (lectureId: string) => post<StudyBundleStatus>(`/api/lectures/${enc(lectureId)}/bundle`),
  due: (classId: string, limit = 20) => get<Card[]>(`/api/classes/${enc(classId)}/review/due?limit=${limit}`),
  review: (cardId: string, rating: Rating) => post<ReviewResult>(`/api/cards/${enc(cardId)}/review`, { rating }),
  /** `conceptId` puts that concept's questions first; `lectureId` then prefers that lecture's. */
  practice: (classId: string, n = 5, focus: { conceptId?: string; lectureId?: string } = {}) =>
    get<Question[]>(
      `/api/classes/${enc(classId)}/practice?n=${n}${focus.conceptId ? `&conceptId=${enc(focus.conceptId)}` : ''}${focus.lectureId ? `&lectureId=${enc(focus.lectureId)}` : ''}`,
    ),
  attempt: (questionId: string, answer: string) => post<Attempt>(`/api/questions/${enc(questionId)}/attempt`, { answer }),
  recall: (lectureId: string, text: string) => post<RecallResult>(`/api/lectures/${enc(lectureId)}/recall`, { text }),
  /** A question answered from the transcript only, with the segments it rests on. */
  ask: (lectureId: string, question: string) => post<LectureAnswer>(`/api/lectures/${enc(lectureId)}/ask`, { question }),
  /** Before the next lecture: questions on the syllabus's upcoming week (generated once a day; not stored). */
  pretest: (classId: string) => get<Pretest>(`/api/classes/${enc(classId)}/pretest`),
  regeneratePretest: (classId: string) => post<Pretest>(`/api/classes/${enc(classId)}/pretest`),
  pretestAttempt: (classId: string, questionId: string, answer: string) =>
    post<PretestAttempt>(`/api/classes/${enc(classId)}/pretest/${enc(questionId)}/attempt`, { answer }),
  examTopics: (classId: string) => get<ExamTopic[]>(`/api/classes/${enc(classId)}/exam-topics`),
  today: (classId: string) => get<Today>(`/api/classes/${enc(classId)}/today`),
  studyPlan: (classId: string) => get<StudyPlan>(`/api/classes/${enc(classId)}/study-plan`),
  regenerateStudyPlan: (classId: string) => post<StudyPlan>(`/api/classes/${enc(classId)}/study-plan`),
  mastery: (classId: string) => get<Record<string, number>>(`/api/classes/${enc(classId)}/mastery`),
  uploadDocument: (classId: string, kind: 'book' | 'syllabus', file: File) => {
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', file)
    return request<UploadResult>('POST', `/api/classes/${enc(classId)}/documents`, { body: form })
  },
  document: (id: string) => get<DocumentDetail>(`/api/documents/${enc(id)}`),

  // learning partner (spoken practice)
  partnerVoices: () => get<PartnerVoice[]>('/api/partner/voices'),
  partnerSession: (classId: string, input: { lectureId?: string; voiceId?: string; lang?: string }) =>
    post<PartnerSession>(`/api/classes/${enc(classId)}/partner/session`, input),
  /** Multipart: `audio` (the recorded blob) or `text` (typed answer or a chip like "skip"). */
  partnerTurn: (sessionId: string, input: { audio?: Blob; filename?: string; text?: string }) => {
    const form = new FormData()
    if (input.audio) form.append('audio', input.audio, input.filename ?? 'answer.webm')
    if (input.text != null) form.append('text', input.text)
    return request<PartnerTurn>('POST', `/api/partner/${enc(sessionId)}/turn`, { body: form })
  },
  endPartner: (sessionId: string) => request<unknown>('DELETE', `/api/partner/${enc(sessionId)}`),
}

/** Downloads a file with the caller's id (an `<a href>` cannot send the header): fetch → blob → save. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = { 'X-Slap-User': userId() }
  let res: Response
  try {
    res = await fetch(API_BASE + path, { headers })
  } catch {
    throw new ApiError(0, 'Network error: is the API running?')
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText || 'Request failed'}`
    try {
      const data = (await res.json()) as { error?: string }
      if (typeof data.error === 'string') message = data.error
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Obsidian vault of the class's notes. */
export const exportVault = (classId: string, code: string) => downloadFile(`/api/classes/${enc(classId)}/export`, `${code}-vault.zip`)

/** Partner audio URLs come back as `/api/partner/audio/:id`. Resolve against the API origin. */
export function audioSrc(url: string): string {
  return url.startsWith('/') ? API_BASE + url : url
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Not found.'
    if (err.status >= 502 && err.status <= 504) return 'The Slap API is not reachable right now.'
    return err.message
  }
  return err instanceof Error ? err.message : String(err)
}
