'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  /** Set only in `useEffect` so we never call `createBrowserClient` during SSR/prerender (build fails if env is missing, e.g. Vercel without Supabase vars). */
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    try {
      setSupabase(createClientComponentClient())
    } catch (e) {
      console.error(e)
      setError('Authentication is not configured (missing Supabase URL or key).')
    }
  }, [])

  // Check if already logged in
  useEffect(() => {
    if (!mounted || !supabase) return
    const checkSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          router.push('/schedule')
        }
      } catch (err) {
        console.error('Session check error:', err)
      }
    }
    void checkSession()
  }, [router, supabase, mounted])

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    
    if (!identifier || !password) {
      setError('Please enter your email/username and password')
      return
    }

    if (!supabase) {
      setError('Authentication is not ready. Check Supabase environment variables.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const ident = identifier.trim()
      let emailToUse = ident

      if (!ident.includes('@')) {
        const res = await fetch('/api/auth/resolve-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: ident }),
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error || 'Invalid credentials')
        }
        emailToUse = String(json?.email || '')
        if (!emailToUse) throw new Error('Invalid credentials')
      }

      const result = await supabase.auth.signInWithPassword({
        email: emailToUse.trim(),
        password: password,
      })

      if (result.error) {
        setError(result.error.message)
        setLoading(false)
        return
      }

      if (result.data?.user) {
        // Wait for session to be set in cookies
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Verify authenticated user is available
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          window.location.href = '/schedule'
        } else {
          setError('Login successful but session not set. Please try again.')
          setLoading(false)
        }
      } else {
        setError('Login failed: No user data returned')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Login exception:', err)
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }


  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium mb-1">
                Email or username
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md"
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 pr-10 border rounded-md"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || !supabase}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
            {process.env.NODE_ENV !== 'production' ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = '/api/dev/auto-login'
                }}
              >
                Auto-login (localhost)
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
