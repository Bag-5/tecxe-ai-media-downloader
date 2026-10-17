import { NextRequest, NextResponse } from 'next/server'
import { detectPlatform } from '@/lib/platforms'
import { enqueue, getLive, listLive, cancelJob, queuePosition, ensureMediaRoot } from '@/lib/jobs'
import { createJob, generateId, getJob, listJobs } from '@/lib/store'
import type { MediaKind } from '@/lib/types'

export const dynamic = 'force-dynamic'

const VALID_KINDS: MediaKind[] = ['video', 'audio', 'image', 'unknown']

/**
 * Download queue.
 *
 * GET ?id=  → live status from memory (fast path for progress polling)
 * GET       → recent jobs from Neon
 * POST      → enqueue
 * DELETE    → cancel
 *
 * Live progress is served from memory; Neon is only consulted for jobs that
 * predate the current server process.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (id) {
    const live = getLive(id)
    if (live) {
      return NextResponse.json({ ...live, position: queuePosition(id) })
    }
    const stored = await getJob(id).catch(() => undefined)
    if (!stored) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json({ ...stored, position: 0 })
  }

  const jobs = await listJobs().catch(() => [])
  return NextResponse.json({ jobs, live: listLive() })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url = typeof body.url === 'string' ? body.url.trim() : ''

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const platform = detectPlatform(url)
    if (!platform) {
      return NextResponse.json(
        { error: 'Unsupported link for this platform.' },
        { status: 400 }
      )
    }

    const rawKind = String(body.kind ?? 'unknown')
    const kind: MediaKind = VALID_KINDS.includes(rawKind as MediaKind)
      ? (rawKind as MediaKind)
      : 'unknown'

    await ensureMediaRoot()

    const id = generateId()

    // Persist first so a crash between enqueue and completion still leaves a
    // trace of the intent.
    await createJob({
      id,
      url,
      platform: platform.platform,
      title: typeof body.title === 'string' ? body.title : null,
      kind,
    }).catch((e) => {
      // A DB failure must not block the download itself.
      console.error('[download] job persist failed:', e.message)
    })

    enqueue({
      id,
      url,
      platform: platform.platform,
      extractor: platform.extractor,
      title: typeof body.title === 'string' ? body.title : null,
      kind,
      useCookies: body.useCookies === true,
      filename: typeof body.filename === 'string' ? body.filename : null,
    })

    return NextResponse.json({ id, platform: platform.platform }, { status: 202 })
  } catch (e) {
    const err = e as Error
    return NextResponse.json(
      { error: err.message || 'Failed to enqueue' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }
  const cancelled = cancelJob(id)
  return NextResponse.json({ cancelled })
}