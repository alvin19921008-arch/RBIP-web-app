'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { FeedbackForm } from '@/components/feedback/FeedbackForm'
import { useNavigationLoading } from '@/components/ui/navigation-loading'
import { useRouter } from 'next/navigation'
import { useAccessControl } from '@/lib/access/useAccessControl'
import { MessageSquarePlus } from 'lucide-react'
import { motion } from 'framer-motion'

export default function FeedbackPage() {
  const [userName, setUserName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('user')
  const [submitted, setSubmitted] = useState(false)
  const [ticketNumber, setTicketNumber] = useState<number | null>(null)
  const supabase = createClientComponentClient()
  const navLoading = useNavigationLoading()
  const router = useRouter()
  const access = useAccessControl()

  // Developer is redirected to /feedback/review
  useEffect(() => {
    if (access.role === 'developer') {
      navLoading.start('/feedback/review')
      router.replace('/feedback/review')
    }
  }, [access.role, router, navLoading])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id
      if (!userId) return
      supabase
        .from('user_profiles')
        .select('username, role')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          const p = profile as { username?: string; role?: string } | null
          setUserName(p?.username ?? null)
          setUserRole(p?.role ?? 'user')
        })
    })
  }, [supabase])

  const handleSubmitSuccess = (ticket: number) => {
    setTicketNumber(ticket)
    setSubmitted(true)
  }

  return (
    <div className="mx-auto w-full px-8 py-6 max-w-2xl">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-6 flex items-center gap-3"
      >
        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <MessageSquarePlus className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Feedback & Issues</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Report a bug, suggest a feature, or +1 an existing issue.
          </p>
        </div>
      </motion.div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.25 }}
      >
        {submitted && ticketNumber ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
              <MessageSquarePlus className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold">Report submitted — thank you!</p>
            <p className="text-xs text-muted-foreground">
              Ticket <span className="font-mono text-foreground">#{ticketNumber.toString().padStart(3, '0')}</span>
            </p>
            <button
              className="mt-2 text-xs text-sky-600 hover:text-sky-700 transition-colors"
              onClick={() => {
                setSubmitted(false)
                setTicketNumber(null)
              }}
            >
              Submit another report
            </button>
          </div>
        ) : (
          <FeedbackForm
            userRole={userRole}
            userName={userName}
            onSubmitSuccess={handleSubmitSuccess}
          />
        )}
      </motion.div>
    </div>
  )
}
