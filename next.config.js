const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Nested git worktrees (e.g. .worktrees/<branch>/) sit under another copy of the
  // repo; without this, Turbopack picks the parent package-lock.json as root.
  turbopack: {
    root: __dirname,
  },
}

module.exports = withBundleAnalyzer(nextConfig)

