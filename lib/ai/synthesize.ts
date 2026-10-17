import { completeJson } from '@/lib/ai'
import type { SearchIntent } from '@/lib/types'

/**
 * Natural-language → YouTube search parameters.
 *
 * Runs on `strong` (120b): this is the one genuinely reasoning-heavy step in the
 * pipeline, where a better query materially changes result quality.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    literalQuery: { type: 'string' },
    duration: { type: 'string', enum: ['any', 'short', 'medium', 'long'] },
    order: {
      type: 'string',
      enum: ['relevance', 'viewCount', 'rating', 'date'],
    },
    excludeTerms: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    isMusic: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: ['literalQuery', 'duration', 'order', 'excludeTerms', 'isMusic', 'rationale'],
} as const

const SYSTEM = `You convert a user's natural-language media request into YouTube
search parameters.

literalQuery: the literal string to send to the YouTube search API. Keep it
concise — keywords, not sentences. Preserve the user's language. If they asked
for something specific (an artist, a track, a topic, a course), name it
directly. Do not invent content.

duration:
  any    — default
  short  — explicitly wants something brief (under ~4 min, "shorts", "clip")
  medium — ~4-20 min
  long   — wants a long-form or extended piece ("2 hours", "full album", "lofi mix")

order:
  relevance — default; best match first
  viewCount — wants the most popular ("popular", "best", "trending")
  rating    — wants highest rated ("top rated", "acclaimed")
  date      — wants newest ("new", "recent", "2026")

excludeTerms: short lowercase keywords to subtract from literalQuery (using
"-" prefix) when the user wants to avoid something, e.g. asked for instrumental
music → ["lyrics", "live"] only if clearly implied. Return [] when nothing
should be excluded.

isMusic: true when the request is for music or audio content.

rationale: one short sentence on why you chose these parameters.`

export async function synthesizeIntent(query: string): Promise<SearchIntent> {
  const { data } = await completeJson(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: query.trim() },
    ],
    SCHEMA as unknown as Record<string, unknown>,
    parseIntent,
    { tier: 'strong', temperature: 0.1, maxTokens: 3072 }
  )
  return data
}

function parseIntent(v: unknown): SearchIntent | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>

  const literalQuery = typeof o.literalQuery === 'string' ? o.literalQuery.trim() : ''
  if (!literalQuery) return null

  const durations = ['any', 'short', 'medium', 'long'] as const
  const orders = ['relevance', 'viewCount', 'rating', 'date'] as const

  return {
    literalQuery,
    duration: durations.includes(o.duration as SearchIntent['duration'])
      ? (o.duration as SearchIntent['duration'])
      : 'any',
    order: orders.includes(o.order as SearchIntent['order'])
      ? (o.order as SearchIntent['order'])
      : 'relevance',
    excludeTerms: Array.isArray(o.excludeTerms)
      ? o.excludeTerms
          .filter((t): t is string => typeof t === 'string')
          .map((t) => t.toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
    isMusic: o.isMusic === true,
    rationale:
      typeof o.rationale === 'string' ? o.rationale.trim() : 'No rationale given.',
  }
}

/** Applies excludeTerms as YouTube "-term" operators. */
export function applyExclusions(query: string, terms: string[]): string {
  if (terms.length === 0) return query
  const cleaned = terms.map((t) => t.replace(/[^a-z0-9]+/gi, '')).filter(Boolean)
  return [query, ...cleaned.map((t) => `-${t}`)].join(' ')
}