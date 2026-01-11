import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createServerComponentClient } from '@/lib/supabase/server'
import { computeAuthEmail, normalizeEmail, normalizeUsername } from '@/app/api/accounts/_validation'

type SelfUpdateRequest = {
  username: string
  email?: string | null
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = (await req.json()) as SelfUpdateRequest

    const username = normalizeUsername(body.username)
    const email = normalizeEmail(body.email ?? null)

    // Update profile row (RLS allows users to update their own profile).
    const supabase = await createServerComponentClient()
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .update({ username, email } as any)
      .eq('id', user.id)

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 })
    }

    // Keep auth email aligned (internal email changes with username if public email is null).
    // Use service role so we don't rely on email-confirm flows for this internal app.
    const admin = createSupabaseAdminClient()
    const authEmail = computeAuthEmail(username, email)
    const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
      email: authEmail,
      email_confirm: true,
    })
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

