import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import type { AccessControlSettingsV1, AccessRole } from '@/lib/access/types'
import { DEFAULT_ACCESS_CONTROL_SETTINGS } from '@/lib/access/defaults'
import { normalizeAccessControlSettings } from '@/lib/access/normalize'
import { cookies } from 'next/headers'

const SETTINGS_KEY = 'global'
const VALID_ROLES: AccessRole[] = ['developer', 'admin', 'user']

async function fetchGlobalSettings(supabase: Awaited<ReturnType<typeof createSupabaseAdminClient>>): Promise<AccessControlSettingsV1> {
  const { data: settingsData } = await supabase
    .from('access_control_settings')
    .select('settings')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()
  return normalizeAccessControlSettings((settingsData as any)?.settings)
}

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
  const realRole: AccessRole =
    roleRaw === 'developer' || roleRaw === 'admin' || roleRaw === 'user'
      ? roleRaw
      : roleRaw === 'regular'
        ? 'user'
        : 'user'

  // Dev-only: allow role impersonation via cookie (only honoured for developer accounts)
  if (process.env.NODE_ENV !== 'production' && realRole === 'developer') {
    const cookieStore = await cookies()
    const devRoleCookie = cookieStore.get('devRole')?.value
    if (devRoleCookie && VALID_ROLES.includes(devRoleCookie as AccessRole)) {
      const impersonatedRole = devRoleCookie as AccessRole
      const settings = await fetchGlobalSettings(supabase)
      return { role: impersonatedRole, settings }
    }
  }

  const settings = await fetchGlobalSettings(supabase)
  return { role: realRole, settings }
}
