# Deploy (Vercel + Supabase)

## Required environment variables

For **Vercel** (and local `.env.local`), the app needs at least:

| Variable | Description |
|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL (e.g. `https://<project_ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (publishable) key for client-side auth and API |

If these are missing in Vercel, the build may succeed but the app can fail at runtime when calling Supabase.

## Setting env vars on Vercel

1. Vercel dashboard → your project → **Settings** → **Environment Variables**.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for **Production** (and Preview if you use it).
3. Redeploy after saving.

## Getting Supabase URL and anon key

- In Supabase dashboard: **Project Settings** → **API** → Project URL and anon public key.
- Or use Supabase MCP (if enabled): `get_project_url` and `get_publishable_keys` with your project id.

## Optional

- `SUPABASE_SERVICE_ROLE_KEY`: only needed for server-side admin (e.g. some API routes or scripts). Do not expose in client.
- Help media and other optional vars: see `lib/help/helpMedia.ts` and scripts that use `process.env.*`.
