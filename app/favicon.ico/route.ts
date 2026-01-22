export function GET() {
  // Serve an SVG favicon at /favicon.ico to avoid 404 noise in dev.
  // (We intentionally keep this as text to avoid committing binary .ico files.)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="0" y="0" width="64" height="64" rx="12" fill="#111827"/>
  <text x="32" y="38" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-size="20" font-weight="700" fill="#ffffff">RBIP</text>
</svg>`

  return new Response(svg, {
    headers: {
      // SVG is broadly accepted as a favicon; this avoids needing a binary .ico file.
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

