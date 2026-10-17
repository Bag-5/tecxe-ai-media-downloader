import { completeJson } from '@/lib/ai'
import type { SearchCandidate, SearchIntent } from '@/lib/types'

/**
 * Ranks YouTube results against the user's stated intent.
 *
 * Runs on `strong` (120b). This is where the model earns its cost: raw search
 * results are ranked by text similarity, whereas the user described a
 * *need* ("something instrumental to code to for two hours").
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ranked: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          videoId: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
          suggestedFilename: { type: 'string' },
        },
        required: ['videoId', 'score', 'reason', 'suggestedFilename'],
      },
    },
  },
  required: ['ranked'],
} as const

interface CandidateInput {
  videoId: string
  title: string
  channel: string
  description: string
  duration: number | null
  viewCount: number | null
}

const SYSTEM = `You rank YouTube search results against what the user actually asked for.

Score from 0 to 100 where 100 is a near-perfect match and 0 is irrelevant.

Apply these penalties:
- Disregard Shorts (vertical, under ~60s) when the user wanted long-form or music.
- Disregard sponsored, promotional and "shorts compilation" uploads.
- Disregard cover/stem/lyric videos when the user wants the original.
- Heavily penalise uploads that ignore the stated duration constraint.
- Penalise reaction/commentary videos when the user wants the content itself.
- Honour excludeTerms as hard exclusions — do not rank any result matching them.

reason: one short sentence on why this result does or does not fit the request.

suggestedFilename: a clean, filesystem-safe filename WITHOUT extension.
Use "Artist - Title" when identifiable, else just the title. Strip
[Official], (Lyrics), 4K/HD markers, emoji and channel suffixes.`

export async function rankCandidates(
  intent: SearchIntent,
  originalQuery: string,
  candidates: CandidateInput[]
): Promise<
  Map<string, { score: number; reason: string; suggestedFilename: string }>
> {
  if (candidates.length === 0) return new Map()

  const listing = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.videoId} | ${formatDuration(c.duration)} | ${fmtViews(c.viewCount)} views\n   ${c.title}\n   by ${c.channel}`
    )
    .join('\n')

  const { data } = await completeJson(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          `User request: ${originalQuery}`,
          `Interpreted as: query="${intent.literalQuery}", duration=${intent.duration}, order=${intent.order}, music=${intent.isMusic}`,
          intent.excludeTerms.length
            ? `Exclude: ${intent.excludeTerms.join(', ')}`
            : 'Exclude: nothing',
          '',
          'Candidates:',
          listing,
        ].join('\n'),
      },
    ],
    SCHEMA as unknown as Record<string, unknown>,
    parseRanking,
    { tier: 'strong', temperature: 0.1, maxTokens: 8192 }
  )

  const out = new Map<
    string,
    { score: number; reason: string; suggestedFilename: string }
  >()
  for (const r of data.ranked) {
    out.set(r.videoId, {
      score: r.score,
      reason: r.reason,
      suggestedFilename: r.suggestedFilename,
    })
  }
  return out
}

function parseRanking(
  v: unknown
): { ranked: Array<{ videoId: string; score: number; reason: string; suggestedFilename: string }> } | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as { ranked?: unknown }
  if (!Array.isArray(o.ranked)) return null

  const ranked: Array<{
    videoId: string
    score: number
    reason: string
    suggestedFilename: string
  }> = []

  for (const item of o.ranked) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const videoId = typeof r.videoId === 'string' ? r.videoId.trim() : ''
    if (!videoId) continue
    const raw = typeof r.score === 'number' ? r.score : Number(r.score)
    ranked.push({
      videoId,
      score: Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0,
      reason: typeof r.reason === 'string' ? r.reason : '',
      suggestedFilename:
        typeof r.suggestedFilename === 'string' ? r.suggestedFilename : '',
    })
  }

  return ranked.length > 0 ? { ranked } : null
}

/** Merges ranking onto raw search results and sorts descending by score. */
export function applyRanking(
  base: SearchCandidate[],
  ranking: Map<
    string,
    { score: number; reason: string; suggestedFilename: string }
  >
): SearchCandidate[] {
  return base
    .map((c) => {
      const r = ranking.get(c.videoId)
      return {
        ...c,
        score: r?.score ?? 0,
        reason: r?.reason ?? 'Not scored.',
        suggestedFilename: r?.suggestedFilename || sanitiseTitle(c.title),
      }
    })
    .sort((a, b) => b.score - a.score)
}

function sanitiseTitle(t: string): string {
  return t
    .replace(/[\[\(][^\]\)]*[\]\)]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function formatDuration(s: number | null): string {
  if (!s) return 'unknown length'
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

function fmtViews(n: number | null): string {
  if (n === null) return 'unknown'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}