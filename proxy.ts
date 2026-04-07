import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Avoid multi-minute hangs when Supabase is unreachable (VPN/firewall/TLS drops). */
const DEV_SUPABASE_FETCH_TIMEOUT_MS = 12_000

function devBoundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(DEV_SUPABASE_FETCH_TIMEOUT_MS)
  const userSignal = init?.signal
  const signal =
    userSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([userSignal, timeout])
      : (userSignal ?? timeout)
  return fetch(input, { ...init, signal })
}

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: devBoundedFetch },
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

  try {
    await supabase.auth.getUser()
  } catch (err) {
    console.warn('[proxy] supabase.auth.getUser() skipped:', err)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

