import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getRequesterContext, type AccountRole } from '@/app/api/accounts/_utils'

type AccountRow = {
  id: string
  username: string
  email: string | null
  role: AccountRole
  created_at: string | null
  authEmail?: string
}

export async function GET() {
  try {
    const { requesterRole } = await getRequesterContext()
    const admin = createSupabaseAdminClient()

    let query = admin
      .from('user_profiles')
      .select('id, username, email, role, created_at')
      .order('created_at', { ascending: false })

    if (requesterRole !== 'developer') {
      query = query.neq('role', 'developer')
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows: AccountRow[] = (data as any[])?.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email ?? null,
      role: r.role,
      created_at: r.created_at ?? null,
    })) ?? []

    if (requesterRole === 'developer') {
      const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

      const authEmailById = new Map<string, string>()
      ;(usersData.users || []).forEach((u) => {
        if (u.id && u.email) authEmailById.set(u.id, u.email)
      })

      rows.forEach((r) => {
        r.authEmail = authEmailById.get(r.id) ?? undefined
      })
    }

    return NextResponse.json({ accounts: rows })
  } catch (e) {
    const message = (e as any)?.message || 'Unexpected error'
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500
    return NextResponse.json({ error: message.replace(/^FORBIDDEN:\s*/, '') }, { status })
  }
}

