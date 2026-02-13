'use client'

import { HelpCenterContent } from '@/components/help/HelpCenterContent'

export default function HelpPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] w-full px-8 py-6 bg-background">
      <div className="max-w-5xl mx-auto space-y-2">
        <h1 className="text-2xl font-bold">Help Center</h1>
        <p className="text-sm text-muted-foreground">
          Start guided onboarding tours and browse frequently asked questions.
        </p>
      </div>
      <div className="max-w-5xl mx-auto mt-5">
        <HelpCenterContent />
      </div>
    </div>
  )
}

