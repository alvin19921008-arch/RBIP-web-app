import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function assertNotLastDeveloper(args: {
  targetUserId: string
  action: 'delete' | 'demote'
}) {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, role')
    .eq('role', 'developer')

  if (error) throw new Error(error.message)
  const devs = (data as any[]) ?? []
  const devCount = devs.length
  const isTargetDeveloper = devs.some((d) => d.id === args.targetUserId)

  if (isTargetDeveloper && devCount <= 1) {
    throw new Error('FORBIDDEN: cannot remove the last Developer account')
  }
}

