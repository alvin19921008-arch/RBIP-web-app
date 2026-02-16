import { DebugPageClient } from './DebugPageClient'

// Prevent static prerender so Supabase client is never created at build time
// (env vars may be missing on Vercel build).
export const dynamic = 'force-dynamic'

export default function DebugPage() {
  return <DebugPageClient />
}
