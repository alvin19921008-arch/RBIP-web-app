'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function DebugPageClient() {
  const isDev = process.env.NODE_ENV !== 'production'
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClientComponentClient(), [])

  const checkSession = useCallback(async () => {
    setLoading(true)
    try {
      console.log('Calling getSession...')
      const sessionResult = await supabase.auth.getSession()
      console.log('Session result:', sessionResult)
      const { data: { session }, error: sessionError } = sessionResult

      console.log('Calling getUser...')
      const userResult = await supabase.auth.getUser()
      console.log('User result:', userResult)
      const { data: { user }, error: userError } = userResult

      setSession(session)
      setUser(user)

      if (sessionError) {
        console.error('Session Error:', sessionError)
      }
      if (userError) {
        console.error('User Error:', userError)
      }
    } catch (err: any) {
      console.error('Error in checkSession:', err)
      console.error('Error message:', err?.message)
      console.error('Error stack:', err?.stack)
    } finally {
      console.log('Setting loading to false')
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    console.log('Debug page mounted, checking session...')
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Supabase key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    void checkSession()
  }, [checkSession])

  if (!isDev) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Not Found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Debug: Auth Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <>
              <div>
                <h3 className="font-semibold mb-2">Session:</h3>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                  {session ? JSON.stringify(session, null, 2) : 'No session'}
                </pre>
              </div>
              <div>
                <h3 className="font-semibold mb-2">User:</h3>
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                  {user ? JSON.stringify(user, null, 2) : 'No user'}
                </pre>
              </div>
              <button
                onClick={checkSession}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
              >
                Refresh
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
