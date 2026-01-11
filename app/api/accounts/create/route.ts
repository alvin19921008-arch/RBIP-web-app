import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { assertCanManageAccounts, assertAdminRoleAssignment, getRequesterContext } from '@/app/api/accounts/_utils'
import { computeAuthEmail, normalizeEmail, normalizePassword, normalizeRole, normalizeUsername } from '@/app/api/accounts/_validation'

type CreateAccountRequest = {
  username: string
  email?: string | null
  password: string
  role: 'user' | 'admin' | 'developer'
}

export async function POST(req: Request) {
  try {
    const { requesterRole } = await getRequesterContext()
    assertCanManageAccounts(requesterRole)

    const body = (await req.json()) as CreateAccountRequest
    const username = normalizeUsername(body.username)
    const email = normalizeEmail(body.email ?? null)
    const password = normalizePassword(body.password)
    const role = normalizeRole(body.role)

    assertAdminRoleAssignment(requesterRole, role)

    const admin = createSupabaseAdminClient()
    const authEmail = computeAuthEmail(username, email)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
    })

    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 400 })
    }

    const userId = created.user.id
    const { error: profileError } = await admin.from('user_profiles').insert({
      id: userId,
      username,
      email,
      role,
    } as any)

    if (profileError) {
      // Best-effort rollback to avoid orphan auth users
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: userId })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 400
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

