import { NextRequest, NextResponse } from 'next/server'
import { synthesizeIntent, applyExclusions } from '@/lib/ai/synthesize'
import { rankCandidates, applyRanking } from '@/lib/ai/rank'
import { searchVideos, QuotaExceededError, MissingApiKeyError } from '@/lib/youtube/search'
import { saveSearch, generateId } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Natural-language media search.
 *
 * Pipeline:
 *   1. gpt-oss-120b turns the request into YouTube query parameters
 *   2. search.list (1 quota unit, capped at 100/day)
 *   3. videos.list enrichment (1 unit)
 *   4. gpt-oss-120b ranks results against what the user actually asked for
 *   5. Persist so the search can be revisited
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const query = typeof body.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const intent = await synthesizeIntent(query)
    const searchQuery = applyExclusions(intent.literalQuery, intent.excludeTerms)

    const raw = await searchVideos(
      { ...intent, literalQuery: searchQuery },
      Math.min(50, Math.max(5, Number(body.limit) || 20))
    )

    const ranking = await rankCandidates(intent, query, raw)
    const candidates = applyRanking(raw, ranking)

    const id = generateId()
    await saveSearch(id, query, intent, candidates).catch((e) =>
      console.error('[search] persist failed:', e.message)
    )

    return NextResponse.json({
      id,
      query,
      intent,
      candidates,
      createdAt: Date.now(),
    })
  } catch (e) {
    if (e instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: e.message, quota: true },
        { status: 429 }
      )
    }
    if (e instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: e.message, needsApiKey: true },
        { status: 503 }
      )
    }
    const err = e as Error
    console.error('[search] failed:', err.message)
    return NextResponse.json(
      { error: err.message || 'Search failed' },
      { status: 500 }
    )
  }
}