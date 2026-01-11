import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

type ResolveLoginRequest = {
  identifier: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ResolveLoginRequest
    const identifierRaw = body?.identifier
    const identifier = typeof identifierRaw === 'string' ? identifierRaw.trim() : ''

    if (!identifier) {
      return NextResponse.json({ error: 'Missing identifier' }, { status: 400 })
    }

    // If already looks like an email, just echo it back (login page can also handle this client-side).
    if (identifier.includes('@')) {
      return NextResponse.json({ email: identifier })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('username', identifier)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    if (!profile?.id) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id)
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    const email = userData.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    return NextResponse.json({ email })
  } catch (e) {
    return NextResponse.json(
      { error: (e as any)?.message || 'Unexpected error' },
      { status: 500 }
    )
  }
}

