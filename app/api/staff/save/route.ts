import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase/server'
import { assertCanManageAccounts, getRequesterContext } from '@/app/api/accounts/_utils'
import { type StaffEditDialogSavePayload } from '@/lib/utils/staffEditDrafts'

export async function POST(request: NextRequest) {
  try {
    const { requesterRole } = await getRequesterContext()
    assertCanManageAccounts(requesterRole)

    const supabase = await createServerComponentClient()
    const body = (await request.json()) as StaffEditDialogSavePayload
    const { data, error } = await supabase.rpc('save_staff_edit_dialog_v2', {
      p_payload: body,
    })
    if (error) throw error

    return NextResponse.json({ staff: data }, { status: body.staffId ? 200 : 201 })
  } catch (error) {
    console.error('[POST /api/staff/save]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save staff edit dialog data' },
      { status: 500 }
    )
  }
}
