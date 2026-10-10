import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters'
import { AUTH_URL, MOCK } from './env'

export const authClient = createAuthClient(AUTH_URL || 'http://localhost/auth-not-configured', {
  adapter: BetterAuthReactAdapter(),
})

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

const MOCK_USER: SessionUser = { id: 'usr_demo', email: 'demo@slap.dev', name: 'Demo Student' }

function useMockAuth(): { user: SessionUser | null; isPending: boolean } {
  return { user: MOCK_USER, isPending: false }
}

function useNeonAuth(): { user: SessionUser | null; isPending: boolean } {
  const session = authClient.useSession()
  const user = session.data?.user
  return {
    user: user ? { id: user.id, email: user.email, name: user.name, image: user.image } : null,
    isPending: session.isPending,
  }
}

/** Session from Neon Auth (mock mode: a fixed demo user, so every page is reachable). */
export const useAuth = MOCK ? useMockAuth : useNeonAuth

// ---- JWT for the API: 15-minute expiry, cached until ~60 s before it runs out ----
let cached: { token: string; exp: number } | null = null
let inflight: Promise<string | null> | null = null

function jwtExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export async function getToken(): Promise<string | null> {
  if (MOCK) return 'mock-token'
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token
  inflight ??= (async () => {
    try {
      // Depending on the SDK version, token() returns { token } or { session: { token }, user }.
      const { data, error } = await authClient.token()
      const raw = (data as { token?: string; session?: { token?: string } } | null)?.token
        ?? (data as { session?: { token?: string } } | null)?.session?.token
        ?? null
      const token = !error && raw && raw.split('.').length === 3 ? raw : null
      cached = token ? { token, exp: jwtExpiryMs(token) ?? Date.now() + 14 * 60_000 } : null
      return token
    } catch {
      cached = null
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function clearToken() {
  cached = null
}

export async function signOut() {
  clearToken()
  if (!MOCK) await authClient.signOut()
}
