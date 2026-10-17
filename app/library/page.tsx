'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { MediaItem } from '@/lib/types'
import {
  IconExternal,
  IconFolder,
  IconImage,
  IconLibrary,
  IconMusic,
  IconSearch,
  IconVideo,
} from '@/components/Icons'

interface LibraryData {
  items: MediaItem[]
  tags: string[]
  stats: { total: number; platforms: Record<string, number> }
}

function fmtBytes(n: number | null): string {
  if (!n) return '—'
  const mb = n / 1024 / 1024
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

function fmtDuration(s: number | null): string {
  if (!s) return ''
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

const KIND_META: Record<string, { Icon: typeof IconVideo; tint: string }> = {
  video: { Icon: IconVideo, tint: 'var(--accent)' },
  audio: { Icon: IconMusic, tint: 'var(--info)' },
  image: { Icon: IconImage, tint: 'var(--warn)' },
}

/**
 * `created_at` arrives as an epoch timestamp. Values are written with
 * `Date.now()`, but rows created by raw SQL can be in seconds, so normalise
 * anything below the ~1973 millisecond threshold.
 */
function fmtDate(value: number | null): string {
  if (!value) return ''
  const ms = value > 1e11 ? value : value * 1000
  const d = new Date(ms)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
}

export default function LibraryPage() {
  const [data, setData] = useState<LibraryData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [platform, setPlatform] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (platform) params.set('platform', platform)
    if (tag) params.set('tag', tag)

    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/library?${params}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load library')
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [platform, tag])

  const filtered = Boolean(platform || tag)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-2xl">Library</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Everything you&rsquo;ve pulled down, with AI-normalised names and tags.
          </p>
        </div>
        {data && (
          <p className="mono text-xs text-[var(--faint)]">
            {data.stats.total} {data.stats.total === 1 ? 'item' : 'items'}
          </p>
        )}
      </header>

      {error && (
        <div className="panel mt-6 border-[color-mix(in_oklab,var(--danger)_40%,var(--border))] p-3.5">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}

      {/* Skeleton keeps layout from jumping during the first fetch. */}
      {loading && !data && (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[5.5rem]" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Platform facets */}
          <div className="mt-6 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setPlatform(null)}
              className={`tag ${!platform ? 'tag-active' : ''}`}
            >
              All ({data.stats.total})
            </button>
            {Object.entries(data.stats.platforms).map(([p, n]) => (
              <button
                key={p}
                onClick={() => setPlatform(platform === p ? null : p)}
                className={`tag ${platform === p ? 'tag-active' : ''}`}
              >
                {p} ({n})
              </button>
            ))}
          </div>

          {/* Tag facets */}
          {data.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.tags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTag(tag === t ? null : t)}
                  className={`tag ${tag === t ? 'tag-active' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          {data.items.length === 0 ? (
            <div className="panel mt-6 px-6 py-16 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--faint)]">
                {filtered ? (
                  <IconSearch className="size-5" />
                ) : (
                  <IconLibrary className="size-5" />
                )}
              </span>
              <p className="mt-4 text-sm font-medium">
                {filtered ? 'No items match these filters' : 'Your library is empty'}
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[var(--muted)]">
                {filtered
                  ? 'Clear a filter above to see the rest of your collection.'
                  : 'Search for something or paste a link, and finished downloads will be filed here automatically.'}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {filtered ? (
                  <button
                    onClick={() => {
                      setPlatform(null)
                      setTag(null)
                    }}
                    className="btn px-3.5 py-1.5 text-xs"
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link href="/" className="btn btn-primary px-3.5 py-1.5 text-xs">
                    <IconSearch className="size-3.5" />
                    Find something
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <ul className="panel mt-6 divide-y divide-[var(--border)] overflow-hidden">
              {data.items.map((item) => {
                const meta = KIND_META[item.kind] ?? {
                  Icon: IconVideo,
                  tint: 'var(--muted)',
                }
                const { Icon } = meta

                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3.5 p-4 transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span
                      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                      style={{
                        color: meta.tint,
                        background: `color-mix(in oklab, ${meta.tint} 12%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.tint} 26%, transparent)`,
                      }}
                    >
                      <Icon className="size-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.artist && (
                          <span className="text-[var(--muted)]">{item.artist} — </span>
                        )}
                        {item.title}
                      </p>

                      <p className="mono mt-1 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-[var(--muted)]">
                        <span>{item.platform}</span>
                        <span className="text-[var(--faint)]">·</span>
                        <span>{fmtBytes(item.sizeBytes)}</span>
                        {item.duration ? (
                          <>
                            <span className="text-[var(--faint)]">·</span>
                            <span>{fmtDuration(item.duration)}</span>
                          </>
                        ) : null}
                        {fmtDate(item.createdAt) ? (
                          <>
                            <span className="text-[var(--faint)]">·</span>
                            <span>{fmtDate(item.createdAt)}</span>
                          </>
                        ) : null}
                      </p>

                      <p className="mono mt-1 flex items-center gap-1.5 truncate text-[0.65rem] text-[var(--faint)]">
                        <IconFolder className="size-3 shrink-0" />
                        {item.filepath}
                      </p>

                      {item.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.map((t) => (
                            <button
                              key={t}
                              onClick={() => setTag(t)}
                              className={`tag ${tag === t ? 'tag-active' : ''}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost mt-0.5 shrink-0 px-2 py-1 text-[0.7rem]"
                      aria-label="Open source"
                    >
                      <IconExternal className="size-3.5" />
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}