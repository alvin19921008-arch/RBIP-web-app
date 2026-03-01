import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getRequesterContext } from '@/app/api/accounts/_utils'

// POST /api/feedback/screenshot — upload screenshot blob, return URL
export async function POST(request: NextRequest) {
  try {
    const { requesterId } = await getRequesterContext()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const filename = `feedback/${requesterId}/${Date.now()}.png`
    const blob = await put(filename, file, {
      access: 'public',
      contentType: 'image/png',
    })

    return NextResponse.json({ url: blob.url }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/feedback/screenshot]', error)
    return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 })
  }
}
