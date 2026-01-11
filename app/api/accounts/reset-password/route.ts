import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { assertDeveloper, getRequesterContext } from '@/app/api/accounts/_utils'

type ResetPasswordRequest = {
  id: string
  newPassword: string
}

export async function POST(req: Request) {
  try {
    const { requesterRole } = await getRequesterContext()
    assertDeveloper(requesterRole)

    const body = (await req.json()) as ResetPasswordRequest
    const id = typeof body?.id === 'string' ? body.id : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    if (!newPassword) return NextResponse.json({ error: 'Missing new password' }, { status: 400 })

    const admin = createSupabaseAdminClient()
    const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 400
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

