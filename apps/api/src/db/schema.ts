// Slap database schema (Drizzle, Postgres on Neon). Users live in Neon Auth's
// `neon_auth.user`; we reference them by their id (text) only.
import { pgTable, text, uuid, timestamp, integer, real, boolean, jsonb, date, serial, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),          // short join code, e.g. CS229
  ownerUserId: text("owner_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const enrollments = pgTable("enrollments", {
  userId: text("user_id").notNull(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "student"] }).notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.classId] })]);

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceKey: text("device_key").notNull().unique(),   // shared secret flashed into firmware
  pairCode: text("pair_code").unique(),                // 6 chars shown on OLED until paired
  ownerUserId: text("owner_user_id"),                  // the user it is paired to; null = unpaired (legacy rows: the active class's owner)
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),   // ACTIVE class: where a start records; null = none picked
  name: text("name"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
}, (t) => [index("devices_owner").on(t.ownerUserId)]);

export const lectures = pgTable("lectures", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  date: date("date").notNull(),
  status: text("status", { enum: ["live", "ended", "processing", "ready"] }).notNull().default("live"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  source: text("source", { enum: ["device", "browser", "import"] }).notNull().default("device"),
}, (t) => [index("lectures_class_date").on(t.classId, t.date)]);

export const segments = pgTable("segments", {
  id: serial("id").primaryKey(),
  lectureId: uuid("lecture_id").notNull().references(() => lectures.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  startS: real("start_s").notNull(),
  endS: real("end_s").notNull(),
  text: text("text").notNull(),
  words: jsonb("words"),              // CaptionWord[]
  speaker: integer("speaker"),
}, (t) => [index("segments_lecture_idx").on(t.lectureId, t.idx)]);

export const translations = pgTable("translations", {
  segmentId: integer("segment_id").notNull().references(() => segments.id, { onDelete: "cascade" }),
  lang: text("lang").notNull(),
  text: text("text").notNull(),
}, (t) => [primaryKey({ columns: [t.segmentId, t.lang] })]);

export const concepts = pgTable("concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  definition: text("definition").notNull().default(""),
  emphasis: real("emphasis").notNull().default(0),      // lecturer emphasis score
  examFlag: boolean("exam_flag").notNull().default(false),
  examQuote: text("exam_quote"),
  mentionCount: integer("mention_count").notNull().default(0),
  source: text("source", { enum: ["lecture", "book", "both"] }).notNull().default("lecture"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("concepts_class_slug").on(t.classId, t.slug)]);

export const conceptLinks = pgTable("concept_links", {
  fromId: uuid("from_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  toId: uuid("to_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  relation: text("relation").notNull().default("related"),
}, (t) => [primaryKey({ columns: [t.fromId, t.toId] })]);

export const conceptMentions = pgTable("concept_mentions", {
  id: serial("id").primaryKey(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  lectureId: uuid("lecture_id").notNull().references(() => lectures.id, { onDelete: "cascade" }),
  segmentId: integer("segment_id").references(() => segments.id, { onDelete: "set null" }),
  excerpt: text("excerpt").notNull(),
}, (t) => [index("mentions_concept").on(t.conceptId), index("mentions_lecture").on(t.lectureId)]);

export const outlines = pgTable("outlines", {
  lectureId: uuid("lecture_id").primaryKey().references(() => lectures.id, { onDelete: "cascade" }),
  summary: text("summary").notNull().default(""),
  sections: jsonb("sections").notNull().default([]),          // OutlineSection[]
  announcements: jsonb("announcements").notNull().default([]), // Announcement[]
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["book", "syllabus"] }).notNull(),
  title: text("title").notNull(),
  text: text("text"),                 // extracted text, if any
  parsed: jsonb("parsed"),            // syllabus: {exams:[{name,date}], weeks:[...], deadlines:[...]}; book: {concepts:[...], exercises:[...]}
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  lectureId: uuid("lecture_id").references(() => lectures.id, { onDelete: "set null" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
}, (t) => [index("cards_class").on(t.classId)]);

// Per-student FSRS state (ts-fsrs Card fields).
export const cardState = pgTable("card_state", {
  userId: text("user_id").notNull(),
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  due: timestamp("due", { withTimezone: true }).notNull(),
  stability: real("stability").notNull().default(0),
  difficulty: real("difficulty").notNull().default(0),
  elapsedDays: integer("elapsed_days").notNull().default(0),
  scheduledDays: integer("scheduled_days").notNull().default(0),
  learningSteps: integer("learning_steps").notNull().default(0),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  state: integer("state").notNull().default(0),      // 0 new, 1 learning, 2 review, 3 relearning
  lastReview: timestamp("last_review", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index("card_state_due").on(t.userId, t.due)]);

export const reviewLogs = pgTable("review_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  cardId: uuid("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  log: jsonb("log"),                   // ts-fsrs ReviewLog
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  lectureId: uuid("lecture_id").references(() => lectures.id, { onDelete: "set null" }),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["mcq", "short", "relate"] }).notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options"),           // string[] for mcq
  answer: text("answer").notNull(),    // mcq: option text; short: model answer; relate: expected relation
  explanation: text("explanation").notNull().default(""),
  styleSource: text("style_source", { enum: ["lecture", "book"] }).notNull().default("lecture"),
  relateToId: uuid("relate_to_id").references(() => concepts.id, { onDelete: "set null" }),
}, (t) => [index("questions_class").on(t.classId)]);

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  correct: boolean("correct").notNull(),
  feedback: text("feedback").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("attempts_user").on(t.userId)]);

export const recallChecks = pgTable("recall_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  lectureId: uuid("lecture_id").notNull().references(() => lectures.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  result: jsonb("result"),             // RecallResult
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),         // "study_bundle" | "document_parse" | ...
  refId: uuid("ref_id").notNull(),      // lecture or document id
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  steps: jsonb("steps").notNull().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("jobs_ref").on(t.refId)]);
