export interface Language {
  code: string
  name: string
  native: string
  rtl?: boolean
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
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
