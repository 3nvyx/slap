// Response shapes from docs/api.md that are not named in @slap/contracts.
import type {
  Announcement,
  Card,
  ClassSummary,
  Concept,
  ConceptLink,
  ConceptMention,
  DeviceState,
  LectureSummary,
  OutlineSection,
  Question,
  Segment,
  StudyPlanDay,
} from '@slap/contracts'

/** The spec leaves the exam shape open: an ISO date string, or a syllabus exam `{ name, date }`. */
export type NextExam = string | { name?: string | null; title?: string | null; date: string } | null | undefined

export interface JoinInfo {
  classId: string
  className: string
  lectureId: string | null
  live: boolean
  /** The class can be browsed (notes, graph, exam topics) without signing in. */
  guestAccess: boolean
}

export interface PublicFinal {
  segmentId: number
  text: string
  start: number
  end: number
  translation?: string
}

export interface PublicLecture {
  title: string
  className: string
  classId: string
  guestAccess: boolean
  status: LectureSummary['status']
  finals: PublicFinal[]
}

export interface Me {
  userId: string
  email: string
  classes: ClassSummary[]
}

export interface ClassDocument {
  id: string
  kind: 'book' | 'syllabus'
  title: string
}

/** `GET /api/classes/:id` device: one whose active class is this class (the caller's first). `paired: false` if none. */
export interface ClassDevice {
  paired: boolean
  state: DeviceState | 'offline' | null
  name?: string | null
}

/** Who is watching the live lecture right now; null when nothing is live. */
export interface ClassLive {
  lectureId: string
  viewers: number
  languages: string[]
}

export interface ClassDetail {
  class: ClassSummary
  lectures: LectureSummary[]
  device: ClassDevice
  live?: ClassLive | null
  nextExam: NextExam
  documents: ClassDocument[]
}

/** One announcement with the lecture it was made in (`GET /api/classes/:id/announcements`, dated ones first). */
export interface ClassAnnouncement extends Announcement {
  lectureId: string
  lectureTitle: string
  lectureDate: string
}

export interface LectureDetail {
  lecture: LectureSummary
  segments: Segment[]
  outline: OutlineSection[]
  summary: string
  announcements: Announcement[]
  concepts: Concept[]
  mentions: ConceptMention[]
  /** Diarization pass: student questions, top-level next to `announcements`. Absent when diarization is off. */
  questionsAsked?: QuestionAsked[]
}

export interface QuestionAsked {
  segmentId: number
  text: string
  start: number
}

export interface Graph {
  nodes: Concept[]
  links: ConceptLink[]
}

export interface ConceptDetailMention {
  lectureId: string
  lectureTitle: string
  segmentId: number
  excerpt: string
  start: number
}

export interface ConceptDetail {
  concept: Concept
  related: Concept[]
  mentions: ConceptDetailMention[]
  cards: Card[]
  questionCount: number
}

export interface Today {
  date: string
  cardsDue: Card[]
  weakConcepts: Concept[]
  practice: Question[]
  plan: StudyPlanDay[]
  nextExam: NextExam
}

export interface ReviewResult {
  due: string
  state: number
}

export interface UploadResult {
  id: string
  jobId: string
}

export interface DocumentDetail {
  id: string
  kind: 'book' | 'syllabus'
  title: string
  parsed: unknown
}

/** A device belongs to a user and records into its active class (`GET /api/devices`). */
export interface DeviceSummary {
  id: string
  name: string | null
  pairCode: string | null
  activeClass: { id: string; name: string; code: string } | null
  connected: boolean
  state: DeviceState | 'offline'
  lastSeenAt: string | null
}

export interface PairResult {
  deviceId: string
  ownerUserId: string
  activeClassId: string | null
  connected: boolean
  state: DeviceState | 'offline'
}
