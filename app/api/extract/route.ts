import { NextRequest, NextResponse } from 'next/server'
import { detectPlatform, cookieNotice } from '@/lib/platforms'
import * as ytdlp from '@/lib/downloaders/yt-dlp'
import * as gallerydl from '@/lib/downloaders/gallery-dl'

export const dynamic = 'force-dynamic'

/**
 * URL → metadata preview.
 *
 * Runs the platform extractor in probe mode so the user sees title, uploader
 * and item count before committing to a download.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url = typeof body.url === 'string' ? body.url.trim() : ''
    const useCookies = body.useCookies === true

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const platform = detectPlatform(url)
    if (!platform) {
      return NextResponse.json(
        {
          error:
            'Unsupported link. Supported: YouTube, Instagram, TikTok, Facebook, Pinterest, Reddit.',
        },
        { status: 400 }
      )
    }

    const probe =
      platform.extractor === 'ytdlp'
        ? await ytdlp.probe(url, { useCookies })
        : await gallerydl.probe(url, { useCookies })

    return NextResponse.json({
      media: { ...probe, raw: undefined },
      platform,
      notice: cookieNotice(platform),
    })
  } catch (e) {
    const err = e as Error & { hint?: string | null }
    return NextResponse.json(
      {
        error: err.message || 'Extraction failed',
        hint: err.hint ?? null,
      },
      { status: 422 }
    )
  }
}