import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const DEV_ROLE_COOKIE = 'devRole'
const VALID_ROLES = ['developer', 'admin', 'user'] as const

function isLocalhostHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase()
  return h.startsWith('localhost') || h.startsWith('127.0.0.1')
}

function guardDev(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  if (!isLocalhostHost(host)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

/** GET — returns the currently active devRole (or null if not impersonating) */
export async function GET(req: NextRequest) {
  const guard = guardDev(req)
  if (guard) return guard

  const cookieStore = await cookies()
  const current = cookieStore.get(DEV_ROLE_COOKIE)?.value ?? null
  return NextResponse.json({ devRole: current })
}

/** POST { role: 'admin' | 'user' | 'developer' | null } — set or clear the devRole cookie */
export async function POST(req: NextRequest) {
  const guard = guardDev(req)
  if (guard) return guard

  const body = await req.json().catch(() => ({}))
  const role = body?.role ?? null

  const res = NextResponse.json({ ok: true, devRole: role })

  if (role === null || !VALID_ROLES.includes(role)) {
    res.cookies.delete(DEV_ROLE_COOKIE)
  } else {
    res.cookies.set(DEV_ROLE_COOKIE, role, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // No maxAge — session cookie; cleared on browser close
    })
  }

  return res
}
