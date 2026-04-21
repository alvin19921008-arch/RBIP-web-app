import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Dev vs prod: In **production**, this file returns `NextResponse.next` immediately — no
 * Supabase client and no `getUser()`. In **development** only, we create an SSR Supabase
 * client and call `getUser()` (with a short TTL cache keyed by auth-cookie fingerprint) so
 * local work does not hammer Supabase. Do not “fix” dev slowness by moving auth work into
 * the production branch; prod intentionally stays light here.
 */
export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  // All Supabase + dev-only getUser TTL cache runs here; production never calls this path.
  return handleDevProxyRequest(request)
}

async function handleDevProxyRequest(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const fingerprint = getSupabaseAuthCookieFingerprint(request)
  const now = Date.now()
  if (fingerprint && shouldSkipDevGetUser(fingerprint, now)) {
    return response
  }

  await supabase.auth.getUser()

  recordDevGetUserVerified(fingerprint, now)

  return response
}

/** Sorted `sb-*` cookie pairs; empty if no Supabase browser cookies on the request. */
function getSupabaseAuthCookieFingerprint(request: NextRequest): string {
  const pairs: string[] = []
  for (const { name, value } of request.cookies.getAll()) {
    if (name.startsWith('sb-')) {
      pairs.push(`${name}=${value}`)
    }
  }
  pairs.sort()
  return pairs.join('|')
}

const DEV_GET_USER_CACHE_TTL_MS = 10_000
const DEV_GET_USER_CACHE_MAX_ENTRIES = 256

const devGetUserVerifiedAt = new Map<string, number>()

function shouldSkipDevGetUser(fingerprint: string, now: number): boolean {
  const last = devGetUserVerifiedAt.get(fingerprint)
  if (last === undefined) return false
  return now - last < DEV_GET_USER_CACHE_TTL_MS
}

function recordDevGetUserVerified(fingerprint: string, now: number): void {
  if (!fingerprint) return
  devGetUserVerifiedAt.set(fingerprint, now)

  while (devGetUserVerifiedAt.size > DEV_GET_USER_CACHE_MAX_ENTRIES) {
    const oldest = devGetUserVerifiedAt.keys().next().value
    if (oldest === undefined) break
    devGetUserVerifiedAt.delete(oldest)
  }

  for (const [key, verifiedAt] of devGetUserVerifiedAt) {
    if (now - verifiedAt > DEV_GET_USER_CACHE_TTL_MS * 2) {
      devGetUserVerifiedAt.delete(key)
    }
  }
}

/**
 * Exclude obvious static / discovery paths so `proxy` runs less often in every environment.
 * In production the handler is still a no-op (early return above); skipping the matcher only
 * saves invocations. Do not add `dashboard` or other protected segments — avoid suffix rules
 * like `*.js` / `*.json` that could match future authenticated routes. Keep `_next/static`
 * and `_next/image` excluded.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|manifest\\.webmanifest$|site\\.webmanifest$|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|woff2?|ttf|otf|mp4|webm|pdf)$).*)',
  ],
}
