import { NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/api-keys'
import { handleMediaUpload } from '@/lib/media-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireApiKey(request, 'IMAGE_UPLOAD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
  const response = await handleMediaUpload(request, {
    userId: auth.apiKey!.createdById!, apiKeyId: auth.apiKey!.id,
    imagesOnly: true, defaultPrivate: true,
  })
  for (const [key, value] of Object.entries(auth.headers)) {
    if (!response.headers.has(key)) response.headers.set(key, String(value))
  }
  return response
}
