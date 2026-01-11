import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { assertAdminCanTouchRole, assertCanManageAccounts, getRequesterContext, type AccountRole } from '@/app/api/accounts/_utils'
import { assertNotLastDeveloper } from '@/app/api/accounts/_developerProtection'

type DeleteAccountRequest = {
  ids: string[]
}

export async function POST(req: Request) {
  try {
    const { requesterRole } = await getRequesterContext()
    assertCanManageAccounts(requesterRole)

    const body = (await req.json()) as DeleteAccountRequest
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'string' && x) : []
    if (ids.length === 0) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

    const admin = createSupabaseAdminClient()

    // Load target roles to enforce admin restrictions + last-developer protection.
    const { data: targets, error: targetsErr } = await admin
      .from('user_profiles')
      .select('id, role')
      .in('id', ids as any)

    if (targetsErr) return NextResponse.json({ error: targetsErr.message }, { status: 500 })

    const targetRows = (targets as any[]) ?? []
    for (const t of targetRows) {
      const id = t.id as string
      const role = t.role as AccountRole
      assertAdminCanTouchRole(requesterRole, role)
      if (role === 'developer') {
        await assertNotLastDeveloper({ targetUserId: id, action: 'delete' })
      }
    }

    // Delete auth users; profile rows cascade.
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 400
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

