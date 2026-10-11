// Lectures are spoken in English; captions are shown in English or live-translated to Vietnamese.
export interface Language {
  code: string
  name: string
  native: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
]

const KEY = 'slap.lang'

export function storedLang(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && LANGUAGES.some((l) => l.code === v)) return v
  } catch {
    /* storage blocked */
  }
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase()
  return LANGUAGES.some((l) => l.code === nav) ? nav : 'en'
}

export function storeLang(code: string) {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    /* storage blocked */
  }
}
