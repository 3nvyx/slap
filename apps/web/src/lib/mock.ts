// VITE_MOCK=1: typed fixture data for every endpoint in docs/api.md plus a fake caption stream,
// so every page can be visited before the API exists. State lives in memory for the tab.
import type {
  Assessment,
  Announcement,
  Attempt,
  CaptionEvent,
  CaptionWord,
  Card,
  ClassSummary,
  Concept,
  ConceptLink,
  ConceptMention,
  ExamTopic,
  LectureSummary,
  OutlineSection,
  PartnerReply,
  PartnerSession,
  PartnerTurn,
  PartnerVoice,
  Question,
  Rating,
  RecallResult,
  Segment,
  StudyBundleStatus,
  StudyPlan,
  StudyPlanDay,
  InboxLecture,
} from '@slap/contracts'
import sample from '../fixtures/lecture_sample.txt?raw'
import { ApiError } from './api'
import type { ClassDetail, ClassDocument, ConceptDetail, DeviceSummary, Graph, JoinInfo, LectureDetail, PublicLecture, Today } from './types'

const delay = (ms = 180 + Math.random() * 220) => new Promise((r) => setTimeout(r, ms))
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

// ---------- transcript ----------
const LINES = sample
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)

function wordsFor(text: string, start: number, end: number): CaptionWord[] {
  const toks = text.split(/\s+/).filter(Boolean)
  const step = (end - start) / Math.max(1, toks.length)
  return toks.map((t, i) => ({
    word: t.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase() || t,
    punctuated: t,
    start: +(start + i * step).toFixed(2),
    end: +(start + (i + 1) * step).toFixed(2),
    confidence: 0.92,
  }))
}

// Diarization fixture: one student question in the sample ("Is it because the error is y minus the variance?").
interface Unit { text: string; speaker: number }
function diarizedUnits(lines: string[]): Unit[] {
  const out: Unit[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l === 'Is it because' && lines[i + 1]?.startsWith('the error is y minus the variance?')) {
      const q = 'the error is y minus the variance?'
      out.push({ text: `Is it because ${q}`, speaker: 1 })
      out.push({ text: lines[i + 1].slice(q.length).trim(), speaker: 0 })
      i++
    } else out.push({ text: l, speaker: 0 })
  }
  return out
}

/** Groups up to `perSegment` consecutive units from the same speaker into one segment. */
function buildSegments(units: Unit[], perSegment = 2): Segment[] {
  const segs: Segment[] = []
  let t = 12
  for (let i = 0; i < units.length; ) {
    const group = [units[i]]
    while (group.length < perSegment && units[i + group.length]?.speaker === units[i].speaker) group.push(units[i + group.length])
    i += group.length
    const text = group.map((u) => u.text).join(' ')
    const dur = Math.max(3, text.split(/\s+/).length * 0.38)
    segs.push({ id: 1000 + segs.length, idx: segs.length, start: +t.toFixed(1), end: +(t + dur).toFixed(1), text, words: wordsFor(text, t, t + dur), speaker: group[0].speaker })
    t += dur + 0.6
  }
  return segs
}

// ---------- class + lectures ----------
const CLASS_ID = 'cls_cs229'
const CLASS2_ID = 'cls_stats116'
const EXAM_DATE = iso(daysFromNow(12))

const classes: ClassSummary[] = [
  { id: CLASS_ID, name: 'CS229 Machine Learning', code: 'CS229', lectureCount: 4, nextExam: EXAM_DATE },
  { id: CLASS2_ID, name: 'STATS116 Probability', code: 'STAT116', lectureCount: 1, nextExam: null },
  { id: 'cls_occ', name: 'OCC Hacks', code: 'OCCHACKS', lectureCount: 0, nextExam: null, description: 'Live demo course. Slap the device and the captions for whatever is said next appear here.' },
]

// Dates entered by hand (the "Exams and quizzes" panel).
const assessments: Assessment[] = [
  { id: 'as_quiz1', classId: CLASS_ID, kind: 'quiz', name: 'Quiz 1', date: iso(daysFromNow(5)), topics: [] },
  { id: 'as_mid', classId: CLASS_ID, kind: 'exam', name: 'Midterm', date: EXAM_DATE, topics: [] },
]

const lectures: LectureSummary[] = [
  { id: 'lec_live', classId: CLASS_ID, title: 'Lecture 4: Generalized linear models', date: iso(new Date()), status: 'live' },
  { id: 'lec_proc', classId: CLASS_ID, title: 'Lecture 3: Logistic regression', date: iso(daysFromNow(-2)), status: 'processing', durationS: 4410 },
  { id: 'lec_gauss', classId: CLASS_ID, title: 'Lecture 2: Linear regression as a probabilistic model', date: iso(daysFromNow(-5)), status: 'ready', durationS: 4680 },
  { id: 'lec_intro', classId: CLASS_ID, title: 'Lecture 1: What is learning?', date: iso(daysFromNow(-9)), status: 'ready', durationS: 4320 },
  { id: 'lec_prob1', classId: CLASS2_ID, title: 'Lecture 1: Sample spaces', date: iso(daysFromNow(-3)), status: 'ready', durationS: 3000 },
]

const documents: ClassDocument[] = [{ id: 'doc_syl', kind: 'syllabus', title: 'CS229 syllabus, autumn' }]
// The demo device: online, its recording already put into a course.
const devices: DeviceSummary[] = [
  { id: 'dev_slap01', name: 'Slap on the desk', activeClass: { id: CLASS_ID, name: 'CS229 Machine Learning', code: 'CS229' }, state: 'recording', lectureId: 'lec_live' },
]
// A finished device recording that nobody has put into a course yet.
const inbox: InboxLecture[] = [
  { id: 'rec_new1', title: 'Recording 9 Oct 14:02', date: iso(daysFromNow(-1)), startedAt: daysFromNow(-1).toISOString(), status: 'ended', durationS: 2534, preview: 'So what does a Gaussian look like? It is a bell curve centred on the mean. With enough data, this is a pretty good model.', deviceName: 'Slap on the desk' },
]
const activeOf = (c: ClassSummary) => ({ id: c.id, name: c.name, code: c.code })
const deviceIn = (classId: string) => devices.find((d) => d.activeClass?.id === classId)
const isLive = (classId: string) => lectures.some((l) => l.classId === classId && l.status === 'live')
function pointAt(d: DeviceSummary, classId: string) {
  const cls = classes.find((c) => c.id === classId)
  if (!cls) throw new ApiError(404, 'class not found')
  if (d.state === 'recording' && d.activeClass?.id !== classId) throw new ApiError(409, 'the device is recording another course; stop that lecture first')
  d.activeClass = activeOf(cls)
  if (d.state !== 'recording') d.state = 'idle'
}

const SEGMENTS = buildSegments(diarizedUnits(LINES))
const lastEnd = SEGMENTS[SEGMENTS.length - 1].end
const OUTLINE: OutlineSection[] = [
  { title: 'When is a Gaussian model good enough?', start: 0, end: lastEnd * 0.2, summary: 'The Gaussian is a sliding-scale choice: judge it by the accuracy you need. With enough data it is a strong default.', conceptSlugs: ['gaussian', 'law-of-large-numbers', 'central-limit-theorem'] },
  { title: 'Errors, variance and the distribution of y', start: lastEnd * 0.2, end: lastEnd * 0.42, summary: 'A student question links the error term to the variance of y given theta; the mean of the error is zero.', conceptSlugs: ['error-term', 'variance', 'mean'] },
  { title: 'Normal distribution notation', start: lastEnd * 0.42, end: lastEnd * 0.62, summary: 'z ~ N(mu, sigma squared): what "distributed as" means, mean, variance and standard deviation.', conceptSlugs: ['normal-distribution', 'standard-deviation', 'covariance'] },
  { title: 'Reading the Gaussian density', start: lastEnd * 0.62, end: lastEnd + 1, summary: 'Normalizing constant, the exponential, and why the squared distance to the mean hints at least squares.', conceptSlugs: ['normalizing-constant', 'exponential-family', 'least-squares', 'likelihood'] },
]

// ---------- concepts ----------
type Seed = [slug: string, name: string, definition: string, emphasis: number, examFlag: boolean, mastery: number | null, source: Concept['source'], examQuote?: string]
const SEEDS: Seed[] = [
  ['gaussian', 'Gaussian', 'The bell-shaped continuous distribution N(mu, sigma^2), fully described by its mean and variance; the default model for noise.', 0.95, true, 0.42, 'both', 'If you understand what each piece of the Gaussian is doing, you are in good shape for the midterm.'],
  ['normal-distribution', 'Normal distribution', 'Another name for the Gaussian; z ~ N(mu, sigma^2) reads "z is distributed as a normal with mean mu and variance sigma squared".', 0.7, false, 0.66, 'both'],
  ['variance', 'Variance', 'Expected squared distance from the mean, sigma^2. Sets the width of the distribution.', 0.82, true, 0.3, 'both', 'Know why the error variance is the variance of y given x.'],
  ['mean', 'Mean', 'The expected value of a random variable; the centre of a Gaussian.', 0.5, false, 0.9, 'lecture'],
  ['standard-deviation', 'Standard deviation', 'Square root of the variance, sigma; in the same units as the data.', 0.45, false, 0.74, 'lecture'],
  ['covariance', 'Covariance', 'How two variables vary together; in one dimension there is only variance.', 0.3, false, null, 'book'],
  ['error-term', 'Error term', 'epsilon_i: the stochastic part of y_i = theta^T x_i + epsilon_i, assumed zero-mean Gaussian.', 0.78, true, 0.22, 'lecture', 'This is the assumption the whole derivation hangs on, so expect it.'],
  ['law-of-large-numbers', 'Law of large numbers', 'Sample averages converge to the expected value as the sample grows.', 0.4, false, 0.55, 'both'],
  ['central-limit-theorem', 'Central limit theorem', 'Sums of many bounded independent effects are approximately Gaussian; why Gaussian noise is a good default.', 0.55, false, null, 'book'],
  ['normalizing-constant', 'Normalizing constant', 'The factor 1/sqrt(2 pi sigma^2) that makes the density integrate to one; drops out when minimizing.', 0.35, false, 0.8, 'lecture'],
  ['probability-distribution', 'Probability distribution', 'A function giving how likely each value of a random variable is.', 0.3, false, 0.95, 'both'],
  ['exponential-family', 'Exponential family', 'Distributions written as an exponential of a linear function of parameters; the basis of GLMs.', 0.6, false, null, 'book'],
  ['generalized-linear-models', 'Generalized linear models', 'GLMs: linear models whose output distribution is in the exponential family (linear, logistic, Poisson regression).', 0.72, true, null, 'both', 'GLMs come next lecture and they are fair game on the exam.'],
  ['least-squares', 'Least squares', 'Fitting by minimizing the sum of squared residuals; equals maximum likelihood under Gaussian noise.', 0.88, true, 0.48, 'both', 'Be able to show that least squares falls out of the Gaussian likelihood.'],
  ['likelihood', 'Likelihood', 'The probability of the observed data as a function of the parameters theta.', 0.8, false, 0.36, 'both'],
  ['maximum-likelihood', 'Maximum likelihood estimation', 'Choose theta to maximize the likelihood (equivalently the log-likelihood) of the data.', 0.76, true, 0.18, 'book', 'Derive the MLE for linear regression.'],
  ['linear-regression', 'Linear regression', 'Predict y as theta^T x; the probabilistic view adds Gaussian errors.', 0.66, false, 0.7, 'both'],
  ['gradient-descent', 'Gradient descent', 'Iteratively move parameters against the gradient of the loss.', 0.5, false, 0.6, 'book'],
]

const concepts: Concept[] = SEEDS.map(([slug, name, definition, emphasis, examFlag, mastery, source, examQuote]) => ({
  id: `c_${slug}`, classId: CLASS_ID, slug, name, definition, emphasis, examFlag, examQuote: examQuote ?? null, mentionCount: 0, source, mastery,
}))
const byId = (id: string) => concepts.find((c) => c.id === id)

const nameRegex = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
const mentions: ConceptMention[] = []
for (const seg of SEGMENTS) {
  for (const c of concepts) {
    const m = seg.text.match(nameRegex(c.name))
    if (m) mentions.push({ conceptId: c.id, lectureId: 'lec_gauss', segmentId: seg.id, excerpt: seg.text.slice(Math.max(0, (m.index ?? 0) - 50), (m.index ?? 0) + 90) })
  }
}
for (const c of concepts) {
  const n = mentions.filter((m) => m.conceptId === c.id).length
  c.mentionCount = n + Math.round(c.emphasis * 6) + (c.source === 'book' ? 1 : 0)
}

const L = (a: string, b: string, relation: string): ConceptLink => ({ from: `c_${a}`, to: `c_${b}`, relation })
const links: ConceptLink[] = [
  L('gaussian', 'normal-distribution', 'same as'),
  L('gaussian', 'variance', 'parameterised by'),
  L('gaussian', 'mean', 'parameterised by'),
  L('gaussian', 'normalizing-constant', 'has'),
  L('gaussian', 'exponential-family', 'member of'),
  L('gaussian', 'probability-distribution', 'is a'),
  L('variance', 'standard-deviation', 'square of'),
  L('variance', 'covariance', 'special case of'),
  L('error-term', 'gaussian', 'modelled as'),
  L('error-term', 'variance', 'has'),
  L('error-term', 'linear-regression', 'part of'),
  L('central-limit-theorem', 'gaussian', 'justifies'),
  L('law-of-large-numbers', 'mean', 'converges to'),
  L('law-of-large-numbers', 'central-limit-theorem', 'related to'),
  L('likelihood', 'maximum-likelihood', 'maximised by'),
  L('likelihood', 'probability-distribution', 'built from'),
  L('maximum-likelihood', 'least-squares', 'equals under Gaussian noise'),
  L('least-squares', 'linear-regression', 'fits'),
  L('linear-regression', 'generalized-linear-models', 'special case of'),
  L('exponential-family', 'generalized-linear-models', 'basis of'),
  L('gradient-descent', 'least-squares', 'minimises'),
  L('normal-distribution', 'standard-deviation', 'uses'),
]

const neighbours = (id: string) =>
  links.flatMap((l) => (l.from === id ? [l.to] : l.to === id ? [l.from] : [])).map(byId).filter((c): c is Concept => !!c)

// ---------- cards + questions ----------
let cardSeq = 0
const cards: Card[] = concepts.flatMap((c) => {
  const out: Card[] = [{ id: `card_${++cardSeq}`, conceptId: c.id, front: `What is ${c.name.toLowerCase()}?`, back: c.definition, due: iso(new Date()), state: 0 }]
  if (c.examFlag) out.push({ id: `card_${++cardSeq}`, conceptId: c.id, front: `Why does ${c.name.toLowerCase()} matter for the exam?`, back: c.examQuote ?? c.definition, due: iso(new Date()), state: 1 })
  return out
})
const reviewed = new Set<string>()

const questions: Question[] = [
  { id: 'q1', conceptId: 'c_error-term', kind: 'mcq', prompt: 'In y = theta^T x + epsilon, what do we assume about epsilon?', options: ['It is zero-mean Gaussian with variance sigma^2', 'It equals the residual of the best fit exactly', 'It is uniform on [-1, 1]', 'It depends on theta'], styleSource: 'lecture' },
  { id: 'q2', conceptId: 'c_least-squares', kind: 'short', prompt: 'Explain in two sentences why minimizing squared error is maximum likelihood under Gaussian noise.', styleSource: 'lecture' },
  { id: 'q3', conceptId: 'c_variance', kind: 'relate', prompt: 'How are variance and the standard deviation related?', relateTo: 'c_standard-deviation', styleSource: 'book' },
  { id: 'q4', conceptId: 'c_normalizing-constant', kind: 'mcq', prompt: 'Why can we ignore the normalizing constant when fitting theta?', options: ['It does not depend on theta, so it drops out of the argmax', 'It is always equal to one', 'It only matters for discrete data', 'It cancels the exponential'], styleSource: 'lecture' },
  { id: 'q5', conceptId: 'c_maximum-likelihood', kind: 'short', prompt: 'Write the log-likelihood of n i.i.d. Gaussian observations and name the term that depends on theta.', styleSource: 'book' },
  { id: 'q6', conceptId: 'c_central-limit-theorem', kind: 'relate', prompt: 'How does the central limit theorem relate to the Gaussian noise assumption?', relateTo: 'c_gaussian', styleSource: 'lecture' },
  { id: 'q7', conceptId: 'c_gaussian', kind: 'mcq', prompt: 'Which two numbers fully describe a one-dimensional Gaussian?', options: ['Mean and variance', 'Mode and range', 'Median and skew', 'Mean and kurtosis'], styleSource: 'lecture' },
  { id: 'q8', conceptId: 'c_likelihood', kind: 'short', prompt: 'What is the difference between a probability and a likelihood?', styleSource: 'book' },
  { id: 'q9', conceptId: 'c_generalized-linear-models', kind: 'relate', prompt: 'How is linear regression related to generalized linear models?', relateTo: 'c_linear-regression', styleSource: 'lecture' },
]
const MCQ_ANSWER: Record<string, number> = { q1: 0, q4: 0, q7: 0 }

// ---------- bundle status (advances on each poll) ----------
const STEPS = ['outline', 'concepts', 'cards', 'questions', 'translations']
const bundlePolls: Record<string, number> = {}
function bundleFor(lectureId: string): StudyBundleStatus {
  const lec = lectures.find((l) => l.id === lectureId)
  if (!lec || lec.status === 'ready') return { lectureId, status: 'done', steps: Object.fromEntries(STEPS.map((s) => [s, 'done'])) }
  if (lec.status === 'live') return { lectureId, status: 'queued', steps: Object.fromEntries(STEPS.map((s) => [s, 'queued'])) }
  const n = (bundlePolls[lectureId] = (bundlePolls[lectureId] ?? 0) + 1)
  const steps = Object.fromEntries(STEPS.map((s, i) => [s, i < n - 1 ? 'done' : i === n - 1 ? 'running' : 'queued'])) as StudyBundleStatus['steps']
  if (n > STEPS.length) {
    lec.status = 'ready'
    return { lectureId, status: 'done', steps: Object.fromEntries(STEPS.map((s) => [s, 'done'])) }
  }
  return { lectureId, status: 'running', steps }
}

// ---------- derived ----------
function examTopics(): ExamTopic[] {
  return concepts
    .map((c) => ({ conceptId: c.id, name: c.name, emphasis: c.emphasis, examFlag: c.examFlag, mastery: c.mastery ?? null, score: +(c.emphasis * (c.examFlag ? 1.4 : 1) * (1 - (c.mastery ?? 0.3))).toFixed(3) }))
    .sort((a, b) => b.score - a.score)
}

function weakConcepts(): Concept[] {
  return [...concepts].filter((c) => c.mastery != null).sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0) || b.emphasis - a.emphasis).slice(0, 5)
}

function plan(): StudyPlanDay[] {
  const top = examTopics()
  return Array.from({ length: 7 }, (_, i) => {
    const day = top.slice((i * 2) % top.length, ((i * 2) % top.length) + 2)
    return {
      date: iso(daysFromNow(i)),
      cardsDue: Math.max(2, 14 - i * 2),
      concepts: day.map((t) => t.conceptId),
      questions: questions.filter((q) => day.some((t) => t.conceptId === q.conceptId)).map((q) => q.id),
      reason: i === 0 ? 'Cards due today plus your two weakest exam-flagged concepts.' : i === 6 ? 'Mixed review across lectures, 5 days before the midterm.' : `Interleaved practice on high-emphasis topics; ${12 - i} days to the midterm.`,
    }
  })
}

let studyPlanSeq = 0
function studyPlan(fresh = false): StudyPlan {
  if (fresh) studyPlanSeq++
  const today = iso(new Date())
  const examDays = 12
  const horizon = examDays + 1
  const ranked = [...concepts].sort((a, b) => Number(b.examFlag) - Number(a.examFlag) || (a.mastery ?? 0) - (b.mastery ?? 0) || b.emphasis - a.emphasis)
  const weakest = ranked.slice(0, 3)
  const days = Array.from({ length: horizon }, (_, i) => {
    const date = iso(daysFromNow(i))
    const cardsDue = Math.max(2, 14 - i * 2)
    const pick = i === examDays ? ranked.filter((c) => c.examFlag).slice(0, 2) : i === examDays - 1 ? weakest : [0, 1, 2].map((j) => ranked[((i + studyPlanSeq) * 3 + j) % ranked.length])
    const reason = i === examDays ? 'Midterm today: light review of flagged concepts only.' : i === examDays - 1 ? 'Day before the midterm: retrieval practice on your weakest flagged concepts.' : i >= examDays - 2 ? `${examDays - i} days to the midterm: no new material, mixed review.` : `${examDays - i} days to the midterm: three concepts mixed across lectures, keeping pace with two lectures a week.`
    return {
      date,
      focus: pick[0]?.name ?? 'Review',
      concepts: pick.map((c) => ({ id: c.id, name: c.name })),
      tasks: [`Review ${cardsDue} cards`, ...pick.slice(0, 2).map((c) => `Practice: 3 questions on ${c.name}`), ...(pick[2] ? [`Re-read the notes on ${pick[2].name}`] : [])],
      minutes: 20 + 15 * pick.length + Math.min(30, cardsDue),
      cardsDue,
      reason,
    }
  })
  return {
    date: today,
    generatedAt: new Date().toISOString(),
    horizonDays: horizon,
    overview: 'Twelve days to the midterm: cover its topics first, interleaved across the four lectures, and finish new material two days early so the last stretch is retrieval practice.',
    pace: 'Four lectures in two weeks, about two a week; the syllabus is in week 5 of 10 and your notes cover every topic so far.',
    paceData: { lecturesHeld: 4, lecturesPerWeek: 2, currentWeek: 5, totalWeeks: 10, lastLectureDate: iso(daysFromNow(-2)) },
    nextExam: { name: 'Midterm', date: EXAM_DATE, daysLeft: examDays },
    keyDates: [
      { date: iso(daysFromNow(3)), daysLeft: 3, name: 'Lecture: Exponential family', kind: 'lecture', note: 'Preview the syllabus topics the day before.' },
      { date: iso(daysFromNow(6)), daysLeft: 6, name: 'Problem set 2', kind: 'deadline', note: 'Keep the day before light and get it in early.' },
      { date: EXAM_DATE, daysLeft: examDays, name: 'Midterm', kind: 'exam', note: 'Covers lectures 1-6; finish new material two days before.' },
    ],
    days,
  }
}

function lectureDetail(id: string): LectureDetail {
  const lecture = lectures.find((l) => l.id === id)
  if (!lecture) throw new ApiError(404, 'lecture not found')
  const ready = lecture.status === 'ready'
  const segs = lecture.status === 'live' ? SEGMENTS.slice(0, 8) : SEGMENTS
  const announcements: Announcement[] = ready
    ? [
        { kind: 'exam', text: 'Midterm covers lectures 1 to 5, including GLMs.', when: EXAM_DATE, segmentId: SEGMENTS[2]?.id },
        { kind: 'deadline', text: 'Problem set 1 is due Friday at 11:59 pm.', when: iso(daysFromNow(3)), segmentId: SEGMENTS[5]?.id },
        { kind: 'opportunity', text: 'Office hours moved to Gates 104 this week.', when: null },
      ]
    : []
  return {
    lecture,
    segments: segs,
    outline: ready ? OUTLINE : [],
    summary: ready
      ? 'Why a Gaussian noise model is a reasonable default for linear regression, how the error term determines the distribution of y given theta, normal-distribution notation, and a tour of the Gaussian density that hints at least squares and likelihood.'
      : '',
    announcements,
    concepts: ready ? concepts.filter((c) => c.source !== 'book') : [],
    mentions: ready ? mentions : [],
    questionsAsked: ready
      ? SEGMENTS.filter((sg) => (sg.speaker ?? 0) >= 1).map((sg) => ({ segmentId: sg.id, text: sg.text, start: sg.start }))
      : undefined,
  }
}

// ---------- learning partner ----------
const VOICES: PartnerVoice[] = [
  { id: 'fish-ella', name: 'Ella', style: 'Warm, unhurried tutor', default: true },
  { id: 'fish-marcus', name: 'Marcus', style: 'Crisp exam coach' },
  { id: 'fish-ines', name: 'Inés', style: 'Bilingual, patient' },
  { id: 'fish-kai', name: 'Kai', style: 'Upbeat study buddy' },
]

/** A short "babble" of sine blips as a 16 kHz mono WAV data URL, so the audio player path runs without TTS. */
const wavCache = new Map<string, string>()
export function beepWav(text: string, intent: string): string {
  const key = `${intent}:${text.length}`
  const hit = wavCache.get(key)
  if (hit) return hit
  const rate = 16000
  const blips = Math.max(3, Math.min(12, Math.round(text.length / 22)))
  const tone = 0.085
  const gap = 0.045
  const n = Math.floor((blips * (tone + gap) + 0.08) * rate)
  const v = new DataView(new ArrayBuffer(44 + n * 2))
  const str = (o: number, x: string) => [...x].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  const base = intent === 'feedback' ? 520 : intent === 'explanation' ? 440 : 600
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const k = Math.floor(t / (tone + gap))
    const local = t - k * (tone + gap)
    let x = 0
    if (k < blips && local < tone) {
      const f = base * (1 + 0.14 * Math.sin(k * 1.7))
      x = 0.22 * Math.sin((Math.PI * local) / tone) * Math.sin(2 * Math.PI * f * local)
    }
    v.setInt16(44 + i * 2, Math.round(x * 0x7fff), true)
  }
  const bytes = new Uint8Array(v.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const url = `data:audio/wav;base64,${btoa(bin)}`
  wavCache.set(key, url)
  return url
}

interface MockPartner { session: PartnerSession; qi: number; answers: number }
const partnerSessions = new Map<string, MockPartner>()
let partnerSeq = 0

const spoken = (q: Question) => q.prompt
function partnerReply(p: MockPartner, text: string, intent: PartnerReply['intent'], extra: Partial<PartnerReply> = {}): PartnerReply {
  const q = questions[p.qi % questions.length]
  const said = p.session.lang === 'en' ? text : `[${p.session.lang}] ${text}`
  return { text: said, intent, conceptId: q.conceptId, questionId: q.id, grade: null, audioUrl: beepWav(said, intent), ...extra }
}

function partnerSession(classId: string, body: { lectureId?: string; voiceId?: string; lang?: string }): PartnerSession {
  if (!classes.some((c) => c.id === classId)) throw new ApiError(404, 'class not found')
  const voiceId = body.voiceId || VOICES[0].id
  if (!VOICES.some((x) => x.id === voiceId) && !/^[a-z0-9_-]{8,}$/i.test(voiceId)) throw new ApiError(400, `Fish voice "${voiceId}" not found`)
  const lec = body.lectureId ? lectures.find((l) => l.id === body.lectureId) : undefined
  if (body.lectureId && !lec) throw new ApiError(404, 'lecture not found')
  const p: MockPartner = {
    session: { sessionId: `ps_${(++partnerSeq).toString(36)}_${Date.now().toString(36)}`, classId, lectureId: lec?.id ?? null, voiceId, lang: body.lang || 'en', opening: null as unknown as PartnerReply },
    qi: partnerSeq * 3,
    answers: 0,
  }
  const q = questions[p.qi % questions.length]
  const intro = lec ? `Hi! Let's go over ${lec.title.replace(/^Lecture \d+:\s*/, '')}.` : "Hi! Let's warm up across your lectures."
  p.session.opening = partnerReply(p, `${intro} ${spoken(q)}`, 'question')
  partnerSessions.set(p.session.sessionId, p)
  return p.session
}

function partnerTurn(sessionId: string, form: FormData): PartnerTurn {
  const p = partnerSessions.get(sessionId)
  if (!p) throw new ApiError(404, 'partner session not found or expired')
  const text = (form.get('text') as string | null)?.trim() ?? ''
  const audio = form.get('audio') as Blob | null
  if (!text && !audio) throw new ApiError(400, 'send audio or text')
  if (audio && audio.size === 0) throw new ApiError(400, 'the recording was empty')
  const cur = questions[p.qi % questions.length]
  const concept = byId(cur.conceptId)
  const transcript = text || `I think it's about the ${concept?.name.toLowerCase() ?? 'mean'}, and the variance of the noise.`
  const lower = transcript.toLowerCase()
  // Typed test hooks: "error" → 500, "expire" → the session vanishes (as after an API restart) → 404.
  if (lower === 'error') throw new ApiError(500, 'mock: Fish ASR timed out')
  if (lower === 'expire') {
    partnerSessions.delete(sessionId)
    throw new ApiError(404, 'partner session not found or expired')
  }
  if (/^(skip|next)\b/.test(lower)) {
    p.qi++
    return { transcript, reply: partnerReply(p, `Okay, let's skip that one. ${spoken(questions[p.qi % questions.length])}`, 'question') }
  }
  if (/\b(explain|what is|what's|don't know|no idea)\b/.test(lower)) {
    const def = concept?.definition ?? 'That one comes from the lecture.'
    const explanation = `Sure. ${concept?.name ?? 'It'}: ${def}`
    return {
      transcript,
      reply: partnerReply(p, `${explanation} Want to try the question again? ${spoken(cur)}`, 'explanation', {
        conceptId: cur.conceptId,
        feedbackAudioUrl: beepWav(explanation, 'explanation'),
        audioUrl: beepWav(`Want to try the question again? ${spoken(cur)}`, 'question'),
      }),
    }
  }
  p.answers++
  const correct = p.answers % 2 === 1
  p.qi++
  const next = questions[p.qi % questions.length]
  const feedback = correct ? `Yes, that's it. ${concept?.definition ?? ''}` : `Not yet. The key idea: ${concept?.definition ?? ''}`
  const said = correct ? 'Yes, that’s it. Nice.' : `Not quite. The key idea: ${concept?.definition ?? ''}`
  return {
    transcript,
    // Two clips like the real API: the grade first, then the next question.
    reply: partnerReply(p, `${said} Next one: ${spoken(next)}`, 'feedback', {
      grade: { correct, feedback },
      feedbackAudioUrl: beepWav(said, 'feedback'),
      audioUrl: beepWav(`Next one: ${spoken(next)}`, 'question'),
    }),
  }
}

// ---------- pretest ----------
let pretestQs: Array<{ id: string; topic: string; kind: 'mcq' | 'short'; prompt: string; options: string[] | null }> = []
let pretestSeq = 0
function mockPretest(fresh = false) {
  if (fresh || pretestQs.length === 0) {
    const n = ++pretestSeq
    pretestQs = [
      { id: `pre_${n}_1`, topic: 'Exponential family', kind: 'mcq', prompt: 'Week 5 covers the exponential family. Which idea from the course so far is it most closely built on?', options: ['Gaussian', 'Least squares', 'Law of large numbers', 'Normalizing constant'] },
      { id: `pre_${n}_2`, topic: 'Generalized linear models', kind: 'short', prompt: 'Before the lecture on generalized linear models: what do you already know about them, and how might they connect to linear regression?', options: null },
      { id: `pre_${n}_3`, topic: 'Softmax regression', kind: 'short', prompt: 'Softmax regression handles more than two classes. What would you expect it to generalise from logistic regression?', options: null },
    ]
  }
  return { week: { week: 5, topics: ['Exponential family', 'Generalized linear models', 'Softmax regression'], date: iso(daysFromNow(3)) }, questions: pretestQs }
}

// ---------- router ----------
type Handler = (m: RegExpMatchArray, body: unknown, q: URLSearchParams) => unknown
const routes: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/api\/health\/ready$/, () => ({ ok: true, mode: 'demo', backends: { db: 'mock', stt: 'mock', llm: 'mock', translate: 'mock' } })],
  ['GET', /^\/api\/join\/([^/]+)$/, (m): JoinInfo => {
    const code = decodeURIComponent(m[1]).toUpperCase()
    const cls = classes.find((c) => c.code.toUpperCase() === code)
    if (!cls) throw new ApiError(404, 'unknown class code')
    const live = lectures.find((l) => l.classId === cls.id && l.status === 'live')
    return { classId: cls.id, className: cls.name, lectureId: live?.id ?? null, live: !!live }
  }],
  ['GET', /^\/api\/lectures\/([^/]+)\/public$/, (m): PublicLecture => {
    const lec = lectures.find((l) => l.id === m[1])
    if (!lec) throw new ApiError(404, 'lecture not found')
    const cls = classes.find((c) => c.id === lec.classId)!
    return { title: lec.title, className: cls.name, classId: cls.id, status: lec.status, finals: [] }
  }],
  ['POST', /^\/api\/lectures\/([^/]+)\/replay$/, (m): LectureSummary => {
    const lec = lectures.find((l) => l.id === m[1])
    if (!lec) throw new ApiError(404, 'lecture not found')
    if (lec.status === 'live') throw new ApiError(409, `"${lec.title}" is live in this class; stop it first`)
    // The mock caption stream is the same for every id; point at the live fixture lecture.
    return { ...lectures.find((l) => l.status === 'live')!, title: `Replay · ${lec.title}` }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/announcements$/, (m) =>
    lectures
      .filter((l) => l.classId === m[1] && l.status === 'ready')
      .flatMap((l) => lectureDetail(l.id).announcements.map((a) => ({ ...a, lectureId: l.id, lectureTitle: l.title, lectureDate: l.date })))
      .sort((a, b) => (a.when && b.when ? a.when.localeCompare(b.when) : a.when ? -1 : b.when ? 1 : 0))],
  ['GET', /^\/api\/classes$/, (): ClassSummary[] => classes],
  ['POST', /^\/api\/classes$/, (_m, body): ClassSummary => {
    const { name, code } = body as { name: string; code: string }
    if (!name || !code) throw new ApiError(400, 'name and code are required')
    if (classes.some((c) => c.code.toUpperCase() === code.toUpperCase())) throw new ApiError(400, 'code already in use')
    const cls: ClassSummary = { id: `cls_${code.toLowerCase()}`, name, code: code.toUpperCase(), lectureCount: 0, nextExam: null }
    classes.push(cls)
    return cls
  }],
  ['GET', /^\/api\/classes\/([^/]+)$/, (m): ClassDetail => {
    const cls = classes.find((c) => c.id === m[1])
    if (!cls) throw new ApiError(404, 'class not found')
    const ls = lectures.filter((l) => l.classId === cls.id)
    return {
      class: { ...cls, lectureCount: ls.length },
      lectures: ls,
      device: (() => {
        const d = deviceIn(cls.id)
        return d ? { id: d.id, name: d.name, state: d.state } : null
      })(),
      live: (() => {
        const live = ls.find((l) => l.status === 'live')
        return live ? { lectureId: live.id, title: live.title, replay: false, viewers: 23, languages: ['en', 'es', 'zh'] } : null
      })(),
      nextExam: cls.id === CLASS_ID ? { name: 'Midterm', date: EXAM_DATE } : null,
      documents: cls.id === CLASS_ID ? documents : [],
    }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/assessments$/, (m) => assessments.filter((a) => a.classId === m[1]).sort((a, b) => a.date.localeCompare(b.date))],
  ['POST', /^\/api\/classes\/([^/]+)\/assessments$/, (m, body): Assessment => {
    const a = { id: `as_${Date.now().toString(36)}`, classId: m[1], topics: [], ...(body as Pick<Assessment, 'kind' | 'name' | 'date'>) }
    assessments.push(a)
    return a
  }],
  ['DELETE', /^\/api\/assessments\/([^/]+)$/, (m) => {
    const i = assessments.findIndex((a) => a.id === m[1])
    if (i < 0) throw new ApiError(404, 'not found')
    assessments.splice(i, 1)
    return { ok: true }
  }],
  ['GET', /^\/api\/devices$/, () => devices],
  ['POST', /^\/api\/devices\/([^/]+)\/active-class$/, (m, body) => {
    const d = devices.find((x) => x.id === m[1])
    if (!d) throw new ApiError(404, 'device is not online')
    pointAt(d, String((body as { classId?: string }).classId ?? ''))
    return d
  }],
  ['GET', /^\/api\/inbox$/, () => inbox],
  ['POST', /^\/api\/lectures\/([^/]+)\/assign$/, (m, body): LectureSummary => {
    const i = inbox.findIndex((x) => x.id === m[1])
    const classId = String((body as { classId?: string }).classId ?? '')
    if (i < 0 || !classes.some((c) => c.id === classId)) throw new ApiError(404, 'not found')
    const [rec] = inbox.splice(i, 1)
    const lec: LectureSummary = { id: rec.id, classId, title: `Lecture ${lectures.filter((l) => l.classId === classId).length + 1}`, date: rec.date, status: 'processing', durationS: rec.durationS }
    lectures.unshift(lec)
    bundlePolls[lec.id] = 0
    return lec
  }],
  ['DELETE', /^\/api\/inbox\/([^/]+)$/, (m) => {
    const i = inbox.findIndex((x) => x.id === m[1])
    if (i < 0) throw new ApiError(404, 'not found')
    inbox.splice(i, 1)
    return { ok: true }
  }],
  ['POST', /^\/api\/classes\/([^/]+)\/sessions\/start$/, (m, body): LectureSummary => {
    if (lectures.some((l) => l.classId === m[1] && l.status === 'live')) throw new ApiError(400, 'a session is already live')
    const n = lectures.filter((l) => l.classId === m[1]).length + 1
    const lec: LectureSummary = { id: `lec_${Date.now().toString(36)}`, classId: m[1], title: (body as { title?: string })?.title || `Lecture ${n}`, date: iso(new Date()), status: 'live' }
    // The web start records with an online device, switching it to this course first.
    const d = deviceIn(m[1]) ?? devices.find((x) => x.state !== 'recording')
    if (!deviceIn(m[1]) && !d && devices.length) throw new ApiError(409, 'the device is recording another course; stop that lecture first')
    lectures.unshift(lec)
    if (d) {
      pointAt(d, m[1])
      d.state = 'recording'
    }
    return lec
  }],
  ['POST', /^\/api\/lectures\/([^/]+)\/stop$/, (m): LectureSummary => {
    const lec = lectures.find((l) => l.id === m[1])
    if (!lec) throw new ApiError(404, 'lecture not found')
    lec.status = 'processing'
    lec.durationS = 3600
    bundlePolls[lec.id] = 0
    const d = deviceIn(lec.classId)
    if (d && !isLive(lec.classId)) d.state = 'idle'
    return lec
  }],
  ['POST', /^\/api\/classes\/([^/]+)\/lectures\/import$/, (m, body): LectureSummary => {
    const { title, date } = body as { title: string; date: string; transcript: string }
    const lec: LectureSummary = { id: `lec_imp_${Date.now().toString(36)}`, classId: m[1], title: title || 'Imported lecture', date: date || iso(new Date()), status: 'processing' }
    lectures.push(lec)
    return lec
  }],
  ['GET', /^\/api\/lectures\/([^/]+)\/translations$/, (_m, _b, q) => Object.fromEntries(SEGMENTS.map((s) => [String(s.id), `[${q.get('lang') ?? 'es'}] ${s.text}`]))],
  ['GET', /^\/api\/lectures\/([^/]+)\/bundle$/, (m) => bundleFor(m[1])],
  ['POST', /^\/api\/lectures\/([^/]+)\/bundle$/, (m) => {
    const lec = lectures.find((l) => l.id === m[1])
    if (lec) lec.status = 'processing'
    bundlePolls[m[1]] = 0
    return bundleFor(m[1])
  }],
  ['POST', /^\/api\/lectures\/([^/]+)\/recall$/, (_m, body): RecallResult => {
    const text = String((body as { text: string }).text ?? '').toLowerCase()
    const lecConcepts = concepts.filter((c) => c.source !== 'book')
    const got = lecConcepts.filter((c) => text.includes(c.name.toLowerCase())).map((c) => c.name)
    const missed = lecConcepts.filter((c) => !got.includes(c.name)).slice(0, 8).map((c) => c.name)
    const wrong = text.includes('uniform') ? ['Error term'] : text.length > 40 ? ['Normalizing constant'] : []
    return { got, missed, wrong, score: +(got.length / Math.max(1, got.length + missed.length)).toFixed(2) }
  }],
  ['GET', /^\/api\/lectures\/([^/]+)$/, (m) => lectureDetail(m[1])],
  ['GET', /^\/api\/classes\/([^/]+)\/concepts$/, (): Concept[] => concepts],
  ['GET', /^\/api\/classes\/([^/]+)\/graph$/, (): Graph => ({ nodes: concepts, links })],
  ['GET', /^\/api\/concepts\/([^/]+)$/, (m): ConceptDetail => {
    const concept = byId(m[1])
    if (!concept) throw new ApiError(404, 'concept not found')
    const lec = lectures.find((l) => l.id === 'lec_gauss')!
    return {
      concept,
      related: neighbours(concept.id),
      mentions: mentions.filter((x) => x.conceptId === concept.id).slice(0, 8).map((x) => ({
        lectureId: x.lectureId, lectureTitle: lec.title, segmentId: x.segmentId, excerpt: x.excerpt, start: SEGMENTS.find((s) => s.id === x.segmentId)?.start ?? 0,
      })),
      cards: cards.filter((c) => c.conceptId === concept.id),
      questionCount: questions.filter((q) => q.conceptId === concept.id).length,
    }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/review\/due$/, (_m, _b, q) => cards.filter((c) => !reviewed.has(c.id)).slice(0, Number(q.get('limit') ?? 20))],
  ['POST', /^\/api\/cards\/([^/]+)\/review$/, (m, body) => {
    const rating = (body as { rating: Rating }).rating
    reviewed.add(m[1])
    const days = [0, 1, 3, 7, 14][rating]
    const card = cards.find((c) => c.id === m[1])
    const concept = card && byId(card.conceptId)
    if (concept) concept.mastery = Math.max(0, Math.min(1, (concept.mastery ?? 0.4) + (rating - 2.5) * 0.08))
    return { due: daysFromNow(days).toISOString(), state: rating === 1 ? 3 : 2 }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/practice$/, (_m, _b, q) => {
    const n = Number(q.get('n') ?? 5)
    const focus = q.get('conceptId')
    const shuffled = [...questions].sort(() => Math.random() - 0.5)
    const first = focus ? shuffled.filter((x) => x.conceptId === focus || x.relateTo === focus) : []
    return [...first, ...shuffled.filter((x) => !first.includes(x))].slice(0, n)
  }],
  ['POST', /^\/api\/questions\/([^/]+)\/attempt$/, (m, body): Attempt => {
    const answer = String((body as { answer: string }).answer ?? '')
    const q = questions.find((x) => x.id === m[1])
    if (!q) throw new ApiError(404, 'question not found')
    let correct: boolean
    if (q.kind === 'mcq') correct = q.options?.[MCQ_ANSWER[q.id] ?? 0] === answer
    else correct = answer.trim().split(/\s+/).length >= 8
    const concept = byId(q.conceptId)
    if (concept) concept.mastery = Math.max(0, Math.min(1, (concept.mastery ?? 0.4) + (correct ? 0.1 : -0.12)))
    return {
      questionId: q.id, answer, correct,
      feedback: correct
        ? `Right. ${concept?.definition ?? ''}`
        : q.kind === 'mcq'
          ? `Not quite: the answer is "${q.options?.[MCQ_ANSWER[q.id] ?? 0]}". ${concept?.definition ?? ''}`
          : `Partly there. Mention the key idea: ${concept?.definition ?? ''} A card was added for review.`,
    }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/exam-topics$/, () => examTopics()],
  ['GET', /^\/api\/classes\/([^/]+)\/today$/, (): Today => ({
    date: iso(new Date()),
    cardsDue: cards.filter((c) => !reviewed.has(c.id)),
    weakConcepts: weakConcepts(),
    practice: questions.slice(0, 5),
    plan: plan(),
    nextExam: { name: 'Midterm', date: EXAM_DATE },
  })],
  ['POST', /^\/api\/lectures\/([^/]+)\/ask$/, (_m, body) => {
    const q = String((body as { question: string }).question ?? '').toLowerCase()
    const words = q.split(/\W+/).filter((w) => w.length > 3)
    const hits = SEGMENTS.map((s) => ({ s, n: words.filter((w) => s.text.toLowerCase().includes(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).sort((a, b) => a.s.idx - b.s.idx)
    if (!hits.length) return { answer: 'The lecture does not seem to cover that; nothing in the transcript matches the question.', citations: [], notInLecture: true }
    return {
      answer: `From the lecture: ${hits.map((h) => `“${h.s.text.slice(0, 160)}”`).join(' … ')}`,
      citations: hits.map((h) => ({ segmentId: h.s.id, start: h.s.start, excerpt: h.s.text.slice(0, 160) })),
      notInLecture: false,
    }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/study-plan$/, () => studyPlan()],
  ['POST', /^\/api\/classes\/([^/]+)\/study-plan$/, () => studyPlan(true)],
  ['GET', /^\/api\/classes\/([^/]+)\/pretest$/, () => mockPretest()],
  ['POST', /^\/api\/classes\/([^/]+)\/pretest$/, () => mockPretest(true)],
  ['POST', /^\/api\/classes\/([^/]+)\/pretest\/([^/]+)\/attempt$/, (m, body) => {
    const answer = String((body as { answer: string }).answer ?? '')
    const q = pretestQs.find((x) => x.id === m[2])
    if (!q) throw new ApiError(404, 'that pretest question has expired; load the pretest again')
    const correct = q.kind === 'mcq' ? answer === q.options?.[0] : answer.trim().split(/\s+/).length >= 8
    return { questionId: q.id, answer, correct, feedback: correct ? 'Yes: that is the connection to look for in the lecture.' : `Listen for this in the lecture: ${q.topic} builds on what the course has covered so far.` }
  }],
  ['GET', /^\/api\/classes\/([^/]+)\/mastery$/,() => Object.fromEntries(concepts.filter((c) => c.mastery != null).map((c) => [c.id, c.mastery]))],
  ['POST', /^\/api\/classes\/([^/]+)\/documents$/, (_m, body) => {
    const form = body as FormData
    const file = form.get('file') as File | null
    const doc: ClassDocument = { id: `doc_${Date.now().toString(36)}`, kind: (form.get('kind') as 'book' | 'syllabus') ?? 'book', title: file?.name ?? 'Upload' }
    documents.push(doc)
    return { id: doc.id, jobId: `job_${doc.id}` }
  }],
  ['GET', /^\/api\/documents\/([^/]+)$/, (m) => {
    const doc = documents.find((d) => d.id === m[1])
    if (!doc) throw new ApiError(404, 'document not found')
    return { ...doc, parsed: null }
  }],
  ['GET', /^\/api\/partner\/voices$/, () => VOICES],
  ['POST', /^\/api\/classes\/([^/]+)\/partner\/session$/, (m, body) => partnerSession(m[1], (body ?? {}) as { lectureId?: string; voiceId?: string; lang?: string })],
  ['POST', /^\/api\/partner\/([^/]+)\/turn$/, (m, body) => partnerTurn(m[1], body as FormData)],
  ['DELETE', /^\/api\/partner\/([^/]+)$/, (m) => {
    partnerSessions.delete(m[1])
    return { ok: true }
  }],
]

export async function mockRequest<T>(method: string, path: string, body: unknown): Promise<T> {
  const url = new URL(path, 'http://mock')
  // The partner's ASR + LLM + TTS round trip is slow; keep "thinking" visible.
  await delay(method === 'POST' && url.pathname.startsWith('/api/partner/') ? 900 + Math.random() * 600 : undefined)
  for (const [m, re, handler] of routes) {
    if (m !== method) continue
    const match = url.pathname.match(re)
    if (match) return structuredClone(handler(match, body, url.searchParams)) as T
  }
  throw new ApiError(404, `mock: no handler for ${method} ${url.pathname}`)
}

// ---------- fake caption stream ----------
const MOCK_ES: Record<number, string> = {
  0: 'Quieres saber si el modelo gaussiano es lo bastante bueno para lo que te importa.',
  1: 'Si el modelo gaussiano se ajusta muy mal a tus datos,',
  2: 'y necesitas modelar los errores con más precisión para lograr la exactitud que buscas,',
  3: 'el gaussiano no es para ti. Pero es una escala móvil, relativa a lo que quieras obtener.',
  4: 'Algo interesante y sorprendente es que, si tienes suficientes datos,',
  5: 'por la ley de los grandes números y otras cosas, mientras esté acotado, los TCL y todo eso,',
  6: 'resulta que este es un modelo bastante bueno. Así que es un gran punto de partida.',
}

/** Replays the fixture lecture as interim → final → translation events. Returns a stop function. */
export function startMockCaptionStream(lang: string, emit: (ev: CaptionEvent) => void): () => void {
  let seq = 0
  let line = 0
  let t = 0
  const timers: ReturnType<typeof setTimeout>[] = []
  let stopped = false
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !stopped && fn(), ms))

  // Snapshot: the last few lines already "said".
  const pre = LINES.slice(0, 3).map((text, i) => {
    const start = i * 5
    return { segmentId: i, text, start, end: start + 4.5, translation: lang === 'en' ? undefined : MOCK_ES[i] && lang === 'es' ? MOCK_ES[i] : `[${lang}] ${text}` }
  })
  line = 3
  t = 15
  emit({ type: 'snapshot', seq: ++seq, finals: pre })
  emit({ type: 'status', state: 'recording', viewers: 23, languages: ['en', 'es', 'zh', 'vi'], latencyMs: 280 })

  const speakLine = () => {
    if (stopped) return
    const idx = line % LINES.length
    const text = LINES[idx]
    const toks = text.split(/\s+/).filter(Boolean)
    const start = t
    const words = wordsFor(text, start, start + toks.length * 0.32)
    const segId = line
    toks.forEach((_, i) => {
      at(i * 300, () => {
        const w = words.slice(0, i + 1)
        emit({ type: 'interim', seq: ++seq, text: w.map((x) => x.punctuated ?? x.word).join(' '), words: w, start, end: w[w.length - 1].end })
      })
    })
    const endMs = toks.length * 300 + 250
    at(endMs, () => emit({ type: 'final', seq: ++seq, segmentId: segId, text, words, start, end: words[words.length - 1]?.end ?? start }))
    if (lang !== 'en') {
      at(endMs + 650, () =>
        emit({ type: 'translation', seq: ++seq, segmentId: segId, lang, text: lang === 'es' && MOCK_ES[idx] ? MOCK_ES[idx] : `[${lang}] ${text}` }),
      )
    }
    at(endMs + 500, () => {
      line++
      t = (words[words.length - 1]?.end ?? t) + 0.4
      speakLine()
    })
  }
  at(600, speakLine)

  const statusTimer = setInterval(() => {
    emit({ type: 'status', state: 'recording', viewers: 20 + Math.floor(Math.random() * 8), languages: ['en', 'es', 'zh', 'vi'], latencyMs: 220 + Math.floor(Math.random() * 160) })
  }, 5000)

  return () => {
    stopped = true
    timers.forEach(clearTimeout)
    clearInterval(statusTimer)
  }
}
