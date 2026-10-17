import { neon } from '@neondatabase/serverless'
import type {
  AiMetadata,
  DownloadJob,
  JobStatus,
  MediaItem,
  MediaKind,
  SearchCandidate,
  SearchIntent,
} from './types'

/**
 * Neon persistence.
 *
 * Progress is deliberately NOT written on every tick — a download emitting
 * progress lines would otherwise hammer the pooler over the network. Callers
 * buffer progress in memory and persist only on state transitions
 * (queued → running → complete/error), via persistJob.
 */

const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  return neon(url)
}

export function generateId(): string {
  let id = ''
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function now(): number {
  return Date.now()
}

/* ------------------------------------------------------------------ jobs -- */

export interface CreateJobInput {
  id: string
  url: string
  platform: string | null
  title: string | null
  kind: MediaKind
}

export async function createJob(input: CreateJobInput): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO jobs (id, status, url, platform, title, kind, progress, created_at, updated_at)
    VALUES (${input.id}, 'queued', ${input.url}, ${input.platform}, ${input.title},
            ${input.kind}, 0, ${now()}, ${now()})
  `
}

/**
 * Writes a job state change. `persistProgress` is false for progress-only
 * updates that the caller is batching.
 */
export async function updateJob(
  id: string,
  patch: Partial<{
    status: JobStatus
    progress: number
    error: string | null
    filepath: string | null
    title: string | null
    metadata: AiMetadata | null
  }>,
  opts: { persistProgress?: boolean } = {}
): Promise<void> {
  const sql = getSql()
  const t = now()

  if (opts.persistProgress === false) {
    // Status transitions still matter even when progress is batched.
    await sql`
      UPDATE jobs SET
        status = COALESCE(${patch.status ?? null}, status),
        error = COALESCE(${patch.error ?? null}, error),
        filepath = COALESCE(${patch.filepath ?? null}, filepath),
        title = COALESCE(${patch.title ?? null}, title),
        metadata = COALESCE(${patch.metadata ?? null}::jsonb, metadata),
        updated_at = ${t}
      WHERE id = ${id}
    `
    return
  }

  await sql`
    UPDATE jobs SET
      status = COALESCE(${patch.status ?? null}, status),
      progress = COALESCE(${patch.progress ?? null}, progress),
      error = COALESCE(${patch.error ?? null}, error),
      filepath = COALESCE(${patch.filepath ?? null}, filepath),
      title = COALESCE(${patch.title ?? null}, title),
      metadata = COALESCE(${patch.metadata ?? null}::jsonb, metadata),
      updated_at = ${t}
    WHERE id = ${id}
  `
}

export async function getJob(id: string): Promise<DownloadJob | undefined> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM jobs WHERE id = ${id}`
  if (rows.length === 0) return undefined
  return mapJob(rows[0])
}

export async function listJobs(limit = 50): Promise<DownloadJob[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM jobs ORDER BY created_at DESC LIMIT ${limit}
  `
  return rows.map(mapJob)
}

function mapJob(r: Record<string, unknown>): DownloadJob {
  return {
    id: String(r.id),
    status: String(r.status) as JobStatus,
    url: String(r.url),
    platform: r.platform ? String(r.platform) : null,
    title: r.title ? String(r.title) : null,
    progress: Number(r.progress ?? 0),
    error: r.error ? String(r.error) : null,
    filepath: r.filepath ? String(r.filepath) : null,
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
  }
}

/* ----------------------------------------------------------- media items -- */

export interface InsertMediaInput {
  id?: string
  title: string
  artist: string | null
  platform: string
  url: string
  kind: MediaKind
  duration: number | null
  filepath: string
  sizeBytes: number | null
  tags: string[]
  aiMetadata: AiMetadata | null
}

export async function insertMedia(input: InsertMediaInput): Promise<string> {
  const sql = getSql()
  const id = input.id ?? generateId()
  await sql`
    INSERT INTO media_items
      (id, title, artist, platform, url, kind, duration, filepath, size_bytes, tags, ai_metadata, created_at)
    VALUES (
      ${id}, ${input.title}, ${input.artist}, ${input.platform}, ${input.url},
      ${input.kind}, ${input.duration}, ${input.filepath}, ${input.sizeBytes},
      ${input.tags}, ${input.aiMetadata ? JSON.stringify(input.aiMetadata) : null}::jsonb, ${now()}
    )
    ON CONFLICT (id) DO NOTHING
  `
  return id
}

export async function listMedia(opts: {
  platform?: string
  tag?: string
  limit?: number
} = {}): Promise<MediaItem[]> {
  const sql = getSql()
  const limit = opts.limit ?? 200

  const rows = opts.tag
    ? await sql`
        SELECT * FROM media_items
        WHERE ${opts.tag} = ANY(tags)
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : opts.platform
      ? await sql`
          SELECT * FROM media_items
          WHERE platform = ${opts.platform}
          ORDER BY created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM media_items
          ORDER BY created_at DESC LIMIT ${limit}
        `

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    artist: r.artist ? String(r.artist) : null,
    platform: String(r.platform),
    url: String(r.url),
    kind: String(r.kind) as MediaKind,
    duration: r.duration ? Number(r.duration) : null,
    filepath: String(r.filepath),
    sizeBytes: r.size_bytes ? Number(r.size_bytes) : null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    aiMetadata: (r.ai_metadata as AiMetadata | null) ?? null,
    createdAt: Number(r.created_at ?? 0),
  }))
}

/* --------------------------------------------------------------- search -- */

export async function saveSearch(
  id: string,
  query: string,
  intent: SearchIntent,
  candidates: SearchCandidate[]
): Promise<void> {
  const sql = getSql()

  await sql`
    INSERT INTO searches (id, query, intent, result_count, created_at)
    VALUES (${id}, ${query}, ${JSON.stringify(intent)}::jsonb, ${candidates.length}, ${now()})
  `

  if (candidates.length === 0) return

  // Bulk insert candidates in one round trip.
  const videoIds = candidates.map((c) => c.videoId)
  const titles = candidates.map((c) => c.title)
  const channels = candidates.map((c) => c.channel)
  const durations = candidates.map((c) => c.duration)
  const views = candidates.map((c) => c.viewCount)
  const urls = candidates.map((c) => c.url)
  const scores = candidates.map((c) => c.score)
  const reasons = candidates.map((c) => c.reason)
  const filenames = candidates.map((c) => c.suggestedFilename)
  const positions = candidates.map((_, i) => i)
  const ids = candidates.map(() => generateId())

  await sql`
    INSERT INTO candidates
      (id, search_id, video_id, title, channel, duration, view_count, url,
       score, reason, filename, position, created_at)
    SELECT * FROM UNNEST(
      ${ids}::text[], ${Array(candidates.length).fill(id)}::text[], ${videoIds}::text[],
      ${titles}::text[], ${channels}::text[], ${durations}::int[], ${views}::bigint[],
      ${urls}::text[], ${scores}::int[], ${reasons}::text[], ${filenames}::text[],
      ${positions}::int[], ${Array(candidates.length).fill(now())}::bigint[]
    )
  `
}

export async function listSearches(limit = 25) {
  const sql = getSql()
  return sql`
    SELECT id, query, result_count, created_at
    FROM searches ORDER BY created_at DESC LIMIT ${limit}
  `
}