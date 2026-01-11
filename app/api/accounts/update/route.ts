import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  assertAdminCanTouchRole,
  assertAdminRoleAssignment,
  assertCanManageAccounts,
  getRequesterContext,
  type AccountRole,
} from '@/app/api/accounts/_utils'
import { assertNotLastDeveloper } from '@/app/api/accounts/_developerProtection'
import { computeAuthEmail, normalizeEmail, normalizeRole, normalizeUsername } from '@/app/api/accounts/_validation'

type UpdateAccountRequest = {
  id: string
  username: string
  email?: string | null
  role: AccountRole
}

export async function POST(req: Request) {
  try {
    const { requesterRole } = await getRequesterContext()
    assertCanManageAccounts(requesterRole)

    const body = (await req.json()) as UpdateAccountRequest
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const username = normalizeUsername(body.username)
    const email = normalizeEmail(body.email ?? null)
    const nextRole = normalizeRole(body.role)

    assertAdminRoleAssignment(requesterRole, nextRole)

    const admin = createSupabaseAdminClient()
    const { data: existing, error: existingErr } = await admin
      .from('user_profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle()

    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })
    if (!existing?.id) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

    const currentRole = (existing as any).role as AccountRole
    assertAdminCanTouchRole(requesterRole, currentRole)

    if (currentRole === 'developer' && nextRole !== 'developer') {
      await assertNotLastDeveloper({ targetUserId: id, action: 'demote' })
    }

    // Keep auth email aligned:
    // - if public email is provided, auth email = that
    // - if public email is null, auth email = username@rbip.local
    const authEmail = computeAuthEmail(username, email)
    const { error: authErr } = await admin.auth.admin.updateUserById(id, {
      email: authEmail,
      email_confirm: true,
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    const { error: profileErr } = await admin
      .from('user_profiles')
      .update({ username, email, role: nextRole } as any)
      .eq('id', id)
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 400
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

