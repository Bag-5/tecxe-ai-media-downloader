import { mkdir, stat } from 'node:fs/promises'
import { readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { mediaRoot } from '@/lib/binaries'
import * as ytdlp from '@/lib/downloaders/yt-dlp'
import * as gallerydl from '@/lib/downloaders/gallery-dl'
import { normalizeMedia, buildFilename, sanitiseSegment } from '@/lib/ai/normalize'
import { updateJob, insertMedia } from '@/lib/store'
import type { JobStatus, MediaKind } from '@/lib/types'

/**
 * In-process job queue.
 *
 * Progress lives in memory and is flushed to Neon on a throttle, because a
 * download can emit progress lines several times per second and every one of
 * those would otherwise become a network round trip to the pooler.
 *
 * A local single-user app does not need durable queues: if the dev server
 * restarts, in-flight jobs are lost — which is acceptable and recoverable,
 * since the source URL is all that is required to re-run them.
 */

export interface LiveJob {
  id: string
  status: JobStatus
  url: string
  platform: string
  title: string | null
  kind: MediaKind
  progress: number
  error: string | null
  hint: string | null
  filepath: string | null
  /** Chrome must be closed while this is read; forwarded to the extractor. */
  useCookies: boolean
  /** Pre-computed output stem from the caller; overrides the derived one. */
  filename: string | null
  updatedAt: number
}

const live = new Map<string, LiveJob>()

/** Queue depth, so the UI can warn before piling on. */
const MAX_CONCURRENT = 2
let active = 0
const pending: string[] = []

const FLUSH_MS = 1500

export function getLive(id: string): LiveJob | undefined {
  return live.get(id)
}

export function listLive(): LiveJob[] {
  return [...live.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function queuePosition(id: string): number {
  const idx = pending.indexOf(id)
  return idx === -1 ? 0 : idx + 1
}

function set(id: string, patch: Partial<LiveJob>): void {
  const cur = live.get(id)
  if (!cur) return
  live.set(id, { ...cur, ...patch, updatedAt: Date.now() })
}

/** Throttles Neon writes: many progress updates collapse into one. */
function makeFlusher(id: string) {
  let lastWrite = 0
  // yt-dlp fetches video and audio as separate streams, so each restarts at 0%.
  // Clamping to the high-water mark keeps the bar from visibly rewinding when
  // the second stream begins.
  let high = 0
  return (pct: number) => {
    const rounded = Math.max(high, Math.round(pct))
    high = rounded
    set(id, { progress: rounded })
    const now = Date.now()
    if (now - lastWrite < FLUSH_MS) return
    lastWrite = now
    void updateJob(id, { progress: rounded }, { persistProgress: true }).catch(
      (e) => console.error('[jobs] progress write failed:', e.message)
    )
  }
}

export interface EnqueueInput {
  id: string
  url: string
  platform: string
  extractor: 'ytdlp' | 'gallerydl'
  title?: string | null
  kind?: MediaKind
  useCookies?: boolean
  /** AI already produced a filename; skips the normalize call. */
  filename?: string | null
}

export function enqueue(input: EnqueueInput): LiveJob {
  const job: LiveJob = {
    id: input.id,
    status: 'queued',
    url: input.url,
    platform: input.platform,
    title: input.title ?? null,
    kind: input.kind ?? 'unknown',
    progress: 0,
    error: null,
    hint: null,
    filepath: null,
    useCookies: input.useCookies ?? false,
    filename: input.filename ?? null,
    updatedAt: Date.now(),
  }
  live.set(job.id, job)
  pending.push(job.id)
  drain()
  return job
}

function drain(): void {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const id = pending.shift()!
    active++
    void run(id).finally(() => {
      active--
      drain()
    })
  }
}

async function run(id: string): Promise<void> {
  const job = live.get(id)
  if (!job) return

  const onProgress = makeFlusher(id)
  set(id, { status: 'running' })
  await updateJob(id, { status: 'running' }).catch(() => {})

  try {
    const meta = await resolveMetadata(job)
    // Prefer the AI-normalised title so files land on disk named the way the
    // library will record them; fall back to the pasted title, then to
    // yt-dlp's own template when neither exists.
    const normalised = meta?.cleanTitle ?? job.title ?? null
    const folder = sanitiseSegment(meta?.folder ?? job.platform) || job.platform
    // A caller-supplied filename (AI-produced during search) wins; otherwise
    // derive one, falling back to yt-dlp's own template when no title exists.
    const stem =
      job.filename ??
      (normalised
        ? buildFilename({ cleanTitle: normalised, artist: meta?.artist ?? null })
        : '%(title).180B')

    set(id, { title: normalised })
    await updateJob(id, { title: normalised }, { persistProgress: false }).catch(
      () => {}
    )

    let filepath: string | null = null

    if (job.platform === 'youtube' || job.platform === 'youtube_music') {
      await ytdlp.startDownload(job.url, {
        kind: job.kind === 'audio' ? 'audio' : 'video',
        filename: stem,
        folder,
        useCookies: job.useCookies,
        onProgress,
      })
      filepath = findNewest(join(mediaRoot(), folder))
    } else {
      filepath = await gallerydl.startDownload(job.url, {
        folder,
        useCookies: job.useCookies,
        onProgress,
      })
    }

    onProgress(100)
    set(id, { status: 'complete', progress: 100, filepath })
    await updateJob(id, {
      status: 'complete',
      progress: 100,
      filepath,
    })

    await recordLibraryItem(job, filepath, meta)
  } catch (e) {
    const err = e as Error & { hint?: string | null }
    const hint = (err.hint ?? null) as string | null
    const message = err.message || 'Download failed'

    set(id, { status: 'error', error: message, hint })
    await updateJob(id, { status: 'error', error: message })
    console.error(`[jobs] ${id} failed:`, message)
  }
}

async function resolveMetadata(job: LiveJob) {
  try {
    if (job.title) return null
    const probe =
      job.platform === 'youtube' || job.platform === 'youtube_music'
        ? await ytdlp.probe(job.url)
        : await gallerydl.probe(job.url)
    return await normalizeMedia(probe)
  } catch (e) {
    console.error('[jobs] metadata failed, using fallback:', (e as Error).message)
    return null
  }
}

async function recordLibraryItem(
  job: LiveJob,
  filepath: string | null,
  meta: Awaited<ReturnType<typeof normalizeMedia>> | null
): Promise<void> {
  if (!filepath) return
  try {
    const full = resolve(filepath)
    const stats = await stat(full)
    await insertMedia({
      title: meta?.cleanTitle ?? job.title ?? basename(full),
      artist: meta?.artist ?? null,
      platform: job.platform,
      url: job.url,
      kind: job.kind === 'unknown' ? (meta?.kind ?? 'unknown') : job.kind,
      duration: null,
      filepath: full,
      sizeBytes: stats.size,
      tags: meta?.tags ?? [],
      aiMetadata: meta,
    })
  } catch (e) {
    console.error('[jobs] library insert failed:', (e as Error).message)
  }
}

/** yt-dlp writes into the folder; find the most recent completed file. */
function findNewest(dir: string): string | null {
  try {
    const entries = readdirSync(dir)
    let newest: { path: string; mtime: number } | null = null
    for (const name of entries) {
      if (name.endsWith('.part') || name.endsWith('.ytdl')) continue
      const p = join(dir, name)
      try {
        const s = statSync(p)
        if (!s.isFile()) continue
        if (!newest || s.mtimeMs > newest.mtime) {
          newest = { path: p, mtime: s.mtimeMs }
        }
      } catch {
        continue
      }
    }
    return newest?.path ?? null
  } catch {
    return null
  }
}

export function cancelJob(id: string): boolean {
  const job = live.get(id)
  if (!job) return false
  if (job.status === 'complete' || job.status === 'error') return false

  const idx = pending.indexOf(id)
  if (idx !== -1) pending.splice(idx, 1)

  set(id, { status: 'cancelled' })
  void updateJob(id, { status: 'cancelled' }).catch(() => {})
  return true
}

/** Ensures the media root exists before the first download. */
export async function ensureMediaRoot(): Promise<void> {
  await mkdir(mediaRoot(), { recursive: true })
}