// The words and numbers behind the landing page's demos. The page's own text is in the section components.

/** The class shown in the demo. */
export const DEMO_CLASS = 'CS229'
export const DEMO_LECTURE = `${DEMO_CLASS} · Lecture 4`

/** The address behind the QR code on the device's "ready" screen. A made-up one, as the demo class does not
 *  exist; it is the same on every visit, so the screen always shows the same QR code. */
export const DEMO_JOIN_URL = `https://slap.example/j/${DEMO_CLASS}`

/** The languages offered by the buttons in the hero. */
export const LANG_NAMES = { ja: '日本語', vi: 'Tiếng Việt' } as const
export type CaptionLang = keyof typeof LANG_NAMES

// What the lecturer "says" in the demo, with its translation in each language. To add a language: add its
// line to every sentence and add it to LANG_NAMES. The translations were written by hand and should be
// checked by a native speaker before the page goes public.
export const LINES: ReadonlyArray<{ en: string } & Record<CaptionLang, string>> = [
  {
    en: 'So what does a Gaussian look like?',
    ja: 'では、ガウス分布はどんな形でしょうか。',
    vi: 'Vậy phân phối Gauss trông như thế nào?',
  },
  {
    en: 'The mean is its center.',
    ja: '平均がその中心です。',
    vi: 'Giá trị trung bình là tâm của nó.',
  },
  {
    en: 'With enough data, this is a pretty good model.',
    ja: 'データが十分にあれば、これはかなり良いモデルです。',
    vi: 'Khi có đủ dữ liệu, đây là một mô hình khá tốt.',
  },
  {
    en: "So it's a great place to start.",
    ja: 'ですから、出発点として最適です。',
    vi: 'Vì vậy đây là một điểm khởi đầu tuyệt vời.',
  },
]

export const TICK_MS = 250 // one new word every tick
export const PAUSE = 6 // ticks of silence after each sentence
