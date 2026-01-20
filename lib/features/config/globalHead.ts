import type { GlobalHeadAtCreation } from '@/types/schedule'

export async function fetchGlobalHeadAtCreation(supabase: any): Promise<GlobalHeadAtCreation | null> {
  try {
    const { data, error } = await supabase
      .from('config_global_head')
      .select(
        'global_version, global_updated_at, category_versions, category_updated_at, drift_notification_threshold'
      )
      .eq('id', true)
      .maybeSingle()

    if (error || !data) return null

    const raw = data as any
    const category_versions =
      raw.category_versions && typeof raw.category_versions === 'object' ? raw.category_versions : {}
    const category_updated_at =
      raw.category_updated_at && typeof raw.category_updated_at === 'object' ? raw.category_updated_at : {}

    const threshold = raw.drift_notification_threshold
    const drift_notification_threshold =
      threshold && typeof threshold === 'object'
        ? {
            value:
              typeof (threshold as any).value === 'number'
                ? (threshold as any).value
                : Number((threshold as any).value ?? 30),
            unit:
              (threshold as any).unit === 'days' ||
              (threshold as any).unit === 'weeks' ||
              (threshold as any).unit === 'months'
                ? (threshold as any).unit
                : 'days',
          }
        : null

    return {
      global_version: typeof raw.global_version === 'number' ? raw.global_version : Number(raw.global_version ?? 0),
      global_updated_at: String(raw.global_updated_at ?? ''),
      category_versions: category_versions as Record<string, number>,
      category_updated_at: category_updated_at as Record<string, string>,
      drift_notification_threshold,
    }
  } catch {
    return null
  }
}

