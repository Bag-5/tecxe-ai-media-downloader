import { NextRequest, NextResponse } from 'next/server'
import { listMedia, listSearches } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get('platform') ?? undefined
  const tag = request.nextUrl.searchParams.get('tag') ?? undefined

  try {
    const items = await listMedia({ platform, tag })
    const searches = await listSearches().catch(() => [])

    const allTags = [...new Set(items.flatMap((i) => i.tags))].sort()

    return NextResponse.json({
      items,
      searches,
      tags: allTags,
      stats: {
        total: items.length,
        platforms: Object.fromEntries(
          items.reduce((acc, i) => acc.set(i.platform, (acc.get(i.platform) ?? 0) + 1), new Map<string, number>())
        ),
      },
    })
  } catch (e) {
    const err = e as Error
    return NextResponse.json(
      { error: err.message || 'Failed to load library' },
      { status: 500 }
    )
  }
}