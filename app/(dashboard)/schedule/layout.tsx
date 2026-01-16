import type { ReactNode } from 'react'

export default function ScheduleLayout({ children }: { children: ReactNode }) {
  // Keep this layout intentionally minimal so the route-level `loading.tsx`
  // can provide the primary navigation skeleton while existing in-page
  // loading (gridLoading + top bar) remains as a fallback.
  return <div className="min-h-[calc(100vh-64px)]">{children}</div>
}

