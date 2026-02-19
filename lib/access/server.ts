import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import type { AccessControlSettingsV1, AccessRole } from '@/lib/access/types'
import { DEFAULT_ACCESS_CONTROL_SETTINGS } from '@/lib/access/defaults'
import { normalizeAccessControlSettings } from '@/lib/access/normalize'

const SETTINGS_KEY = 'global'

export async function getAccessSettings(): Promise<{ role: AccessRole; settings: AccessControlSettingsV1 }> {
  const user = await getCurrentUser()

  if (!user) {
    return { role: 'user', settings: normalizeAccessControlSettings(DEFAULT_ACCESS_CONTROL_SETTINGS) }
  }

  const supabase = await createSupabaseAdminClient()

  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const roleRaw = (profileData as any)?.role
  const role: AccessRole =
    roleRaw === 'developer' || roleRaw === 'admin' || roleRaw === 'user'
      ? roleRaw
      : roleRaw === 'regular'
        ? 'user'
        : 'user'

  const { data: settingsData } = await supabase
    .from('access_control_settings')
    .select('settings')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  const settings = normalizeAccessControlSettings((settingsData as any)?.settings)

  return { role, settings }
}
