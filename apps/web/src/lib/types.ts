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
  status: LectureSummary['status']
  /** A saved lecture being played back, not live audio. */
  replay?: boolean
  finals: PublicFinal[]
}

export interface ClassDocument {
  id: string
  kind: 'book' | 'syllabus'
  title: string
}

/** `GET /api/classes/:id` device: an online device whose active class is this class; null if none. */
export type ClassDevice = { id: string; name: string | null; state: DeviceState } | null

/** Who is watching the live lecture (or replay) right now; null when nothing is live. */
export interface ClassLive {
  lectureId: string
  title: string
  replay: boolean
  viewers: number
  languages: string[]
}

/** Replay window and rate for `POST /api/lectures/:id/replay`. */
export interface ReplayOpts {
  from?: number
  to?: number
  speed?: number
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

/** A device that is online now (`GET /api/devices`). There is no pairing: it is listed as soon as it connects
 *  and records into its active class. */
export interface DeviceSummary {
  id: string
  name: string | null
  activeClass: { id: string; name: string; code: string } | null
  state: DeviceState
}
