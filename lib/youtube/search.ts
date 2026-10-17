import type { SearchCandidate, SearchIntent } from '@/lib/types'

/**
 * YouTube Data API v3 client.
 *
 * QUOTA NOTE — this is the binding constraint on search:
 *   search.list is capped at 100 calls/day per project (its own bucket),
 *   distinct from the 10,000 units/day shared across all other endpoints.
 *   videos.list costs 1 unit per 50 ids, so enrichment is effectively free.
 *
 * Handle every quota response as a distinct, user-visible condition rather
 * than a generic error.
 */

const BASE = 'https://www.googleapis.com/youtube/v3'

export class QuotaExceededError extends Error {
  constructor() {
    super('YouTube search quota exhausted (100 searches/day). Resets at midnight Pacific Time.')
    this.name = 'QuotaExceededError'
  }
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('YOUTUBE_API_KEY is not set. Add it to .env.local to enable search.')
    this.name = 'MissingApiKeyError'
  }
}

function key(): string {
  const k = process.env.YOUTUBE_API_KEY
  if (!k || !k.trim()) throw new MissingApiKeyError()
  return k.trim()
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/${path}`)
  url.searchParams.set('key', key())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 403 || res.status === 429) {
    const body = await res.text().catch(() => '')
    if (
      /quota|dailyLimitExceeded|rateLimitExceeded/i.test(body) ||
      res.status === 429
    ) {
      throw new QuotaExceededError()
    }
    throw new Error(`YouTube API returned ${res.status}: ${body.slice(0, 200)}`)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`YouTube API returned ${res.status}: ${body.slice(0, 300)}`)
  }

  return (await res.json()) as T
}

interface SearchResponse {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      title?: string
      description?: string
      channelTitle?: string
      publishedAt?: string
      thumbnails?: Record<string, { url?: string; width?: number }>
    }
  }>
  pageInfo?: { totalResults?: number }
}

/**
 * Costs 1 search.list call — the expensive step.
 * maxResults is capped at 50 by the API.
 */
export async function searchVideos(
  intent: SearchIntent,
  maxResults = 20
): Promise<SearchCandidate[]> {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q: intent.literalQuery,
    maxResults: String(Math.min(50, Math.max(1, maxResults))),
    order: intent.order,
    safeSearch: 'moderate',
  }
  if (intent.duration !== 'any') params.videoDuration = intent.duration

  const data = await get<SearchResponse>('search', params)
  const ids = (data.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((v): v is string => Boolean(v))

  if (ids.length === 0) return []
  return enrichCandidates(ids, data)
}

interface VideosResponse {
  items?: Array<{
    id?: string
    contentDetails?: { duration?: string }
    statistics?: { viewCount?: string }
  }>
}

/** Costs 1 unit per call, batches 50 ids. Adds duration + view counts. */
async function enrichCandidates(
  ids: string[],
  searchData: SearchResponse
): Promise<SearchCandidate[]> {
  let details = new Map<string, { duration: number | null; viewCount: number | null }>()

  try {
    const vid = await get<VideosResponse>('videos', {
      part: 'contentDetails,statistics',
      id: ids.join(','),
      maxResults: '50',
    })
    details = new Map(
      (vid.items ?? []).map((v) => [
        String(v.id),
        {
          duration: parseIsoDuration(v.contentDetails?.duration),
          viewCount: v.statistics?.viewCount
            ? Number(v.statistics.viewCount)
            : null,
        },
      ])
    )
  } catch (e) {
    // Enrichment is an enhancement; fall back to snippet-only results.
    console.error('[youtube] enrichment failed:', (e as Error).message)
  }

  return (searchData.items ?? [])
    .map((item): SearchCandidate | null => {
      const videoId = item.id?.videoId
      const snippet = item.snippet
      if (!videoId || !snippet) return null

      const d = details.get(videoId)
      return {
        videoId,
        title: decodeEntities(snippet.title ?? 'Untitled'),
        channel: decodeEntities(snippet.channelTitle ?? ''),
        description: snippet.description ?? '',
        thumbnail: pickThumbnail(snippet.thumbnails),
        duration: d?.duration ?? null,
        viewCount: d?.viewCount ?? null,
        publishedAt: snippet.publishedAt ?? null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        score: 0,
        reason: '',
        suggestedFilename: '',
      }
    })
    .filter((c): c is SearchCandidate => c !== null)
}

/** ISO 8601 duration (PT1H2M10S) → seconds. */
function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(iso)
  if (!m) return null
  const [, d, h, min, s] = m
  return (
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0)
  )
}

function pickThumbnail(
  thumbs: Record<string, { url?: string; width?: number }> | undefined
): string | null {
  if (!thumbs) return null
  return (
    thumbs.maxres?.url ??
    thumbs.standard?.url ??
    thumbs.high?.url ??
    thumbs.medium?.url ??
    thumbs.default?.url ??
    null
  )
}

/** YouTube escapes HTML entities in snippet titles. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}