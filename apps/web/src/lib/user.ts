// There is no sign-in. Each browser keeps a random id and sends it to the API as X-Slap-User, so cards,
// practice and mastery are this browser's own. Another browser, or cleared site data, starts fresh.
const KEY = 'slap.user'
const VALID = /^[A-Za-z0-9_-]{8,64}$/

let cached: string | null = null

function randomId(): string {
  // Not crypto.randomUUID: that needs a secure context, and phones often open the dev server over plain http.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function userId(): string {
  if (cached) return cached
  let id: string | null = null
  try {
    id = localStorage.getItem(KEY)
  } catch {
    /* storage blocked: the id lasts for this page load */
  }
  if (!id || !VALID.test(id)) {
    id = randomId()
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* see above */
    }
  }
  cached = id
  return id
}
