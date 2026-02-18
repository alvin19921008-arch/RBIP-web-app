'use client'

import { HELP_FAQ_SECTIONS } from '@/lib/help/faq'
import type { AccessRole } from '@/lib/access/types'
import { Building2, CalendarDays, LayoutList, Settings } from 'lucide-react'
import { DashboardSyncPublishAnswer } from '@/components/help/answers/DashboardSyncPublishAnswer'
import { StaffCardColorGuideAnswer } from '@/components/help/answers/StaffCardColorGuideAnswer'

export function FaqAccordion(props: { role: AccessRole; context?: 'all' | 'schedule' | 'dashboard' }) {
  const isAdmin = props.role === 'admin' || props.role === 'developer'
  const context = props.context ?? 'all'
  const sectionIcon = (id: string) => {
    if (id === 'daily-workflow') return CalendarDays
    if (id === 'beds-and-summary') return Building2
    if (id === 'step2-3') return LayoutList
    if (id === 'schedule-admin' || id === 'dashboard-admin') return Settings
    return LayoutList
  }

  return (
    <div className="space-y-4">
      {HELP_FAQ_SECTIONS.map((section) => {
        const sectionContext = section.context ?? 'all'
        if (context !== 'all' && sectionContext !== 'all' && sectionContext !== context) return null
        const visibleItems = section.items.filter((item) => item.audience !== 'admin' || isAdmin)
        if (visibleItems.length === 0) return null
        const Icon = sectionIcon(section.id)
        return (
          <section key={section.id} className="space-y-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/60">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </span>
              <span>{section.title}</span>
            </h3>
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <details key={item.id} className="rounded-md border border-border bg-card px-3 py-2 group">
                  <summary className="cursor-pointer list-none text-sm font-medium pr-6 relative">
                    {item.question}
                    <span className="absolute right-0 top-0 text-muted-foreground group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                    {item.answerKind === 'dashboard-sync-publish' ? (
                      <DashboardSyncPublishAnswer />
                    ) : item.answerKind === 'staff-card-color-guide' ? (
                      <StaffCardColorGuideAnswer />
                    ) : (
                      item.answer
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

