'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ResultCard, type Candidate } from '@/components/ResultCard'
import { JobList, useJobs } from '@/components/JobList'
import {
  IconAlert,
  IconLibrary,
  IconLink,
  IconSearch,
  IconSparkle,
} from '@/components/Icons'
import type { SearchIntent } from '@/lib/types'

type Mode = 'search' | 'paste'

const EXAMPLES = [
  'instrumental lo-fi to code to, about 2 hours',
  'live set recorded at Wembley, 1998',
  'short film about deep sea exploration',
]

const PLATFORMS = [
  'YouTube',
  'YouTube Music',
  'Instagram',
  'TikTok',
  'Facebook',
  'Pinterest',
  'Reddit',
]

export default function Home() {
  const { jobs, enqueue, cancel } = useJobs()

  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [useCookies, setUseCookies] = useState(false)

  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<{ msg: string; hint?: string | null } | null>(null)

  const [intent, setIntent] = useState<SearchIntent | null>(null)
  const [results, setResults] = useState<Candidate[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const switchMode = useCallback((m: Mode) => {
    setMode(m)
    setError(null)
    if (m === 'search') searchRef.current?.focus()
  }, [])

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError(null)
    setResults([])
    setIntent(null)

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError({ msg: data.error ?? 'Search failed', hint: data.hint })
        return
      }

      setIntent(data.intent)
      const found: Candidate[] = data.candidates ?? []
      setResults(found)
      if (found.length === 0) {
        setError({
          msg: 'No results matched that description.',
          hint: 'Try rephrasing, or add a YouTube Data API key on the Setup page to enable search.',
        })
      }
    } catch (err) {
      setError({ msg: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  async function runPaste(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Preview first so the user can confirm before a large download starts.
      const probe = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), useCookies }),
      })
      const data = await probe.json()

      if (!probe.ok) {
        setError({ msg: data.error ?? 'Extraction failed', hint: data.hint })
        return
      }

      await enqueue({
        url: url.trim(),
        title: data.media.title,
        kind: data.platform.platform === 'youtube_music' ? 'audio' : 'video',
        useCookies,
      })
      setUrl('')
    } catch (err) {
      setError({ msg: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  async function downloadCandidate(c: Candidate, kind: 'video' | 'audio') {
    setBusyId(c.videoId)
    setError(null)
    try {
      await enqueue({
        url: c.url,
        title: c.title,
        // The AI already settled on a filename during search; sending it as a
        // `title` would make the normaliser try to parse a filename as prose.
        filename: c.suggestedFilename || null,
        kind,
      })
    } catch (err) {
      setError({ msg: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
      {/* ---------------- Hero ---------------- */}
      <div className="mb-8 max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[0.6875rem] font-medium text-[var(--muted)]">
          <IconSparkle className="size-3.5" style={{ color: 'var(--accent)' }} />
          Describe what you want, or paste a link
        </span>
        <h1 className="display mt-4 text-[2rem] leading-[1.15] sm:text-[2.5rem]">
          Your media, found and filed
          <span className="block text-[var(--muted)]">in plain language.</span>
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-soft)]">
          TECXE turns a rough description into a real search, ranks the results
          against what you actually asked for, then names, tags and archives the
          file for you.
        </p>
      </div>

      {/* ---------------- Mode switch ---------------- */}
      <div
        role="tablist"
        aria-label="Download mode"
        className="mb-4 inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
      >
        {(
          [
            ['search', 'AI Search', IconSearch],
            ['paste', 'Paste Link', IconLink],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150',
              mode === value
                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--muted)] hover:text-[var(--text-soft)]',
            ].join(' ')}
          >
            <Icon
              className="size-4"
              style={mode === value ? { color: 'var(--accent)' } : undefined}
            />
            {label}
          </button>
        ))}
      </div>

      {/* ---------------- Input card ---------------- */}
      {mode === 'search' ? (
        <form onSubmit={runSearch} className="panel rise p-4 sm:p-5">
          <label htmlFor="q" className="eyebrow">
            What are you looking for?
          </label>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--faint)]" />
              <input
                id="q"
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. instrumental lo-fi to code to, around 2 hours"
                className="input pl-10"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn btn-primary sm:px-6"
            >
              {loading ? (
                <>
                  <span className="spin inline-block">◐</span> Thinking
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Example prompts — fastest path for a first-time user. */}
          {!query && !loading && (
            <div className="mt-4">
              <p className="text-[0.6875rem] font-medium text-[var(--faint)]">
                Try one of these
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setQuery(ex)
                      searchRef.current?.focus()
                    }}
                    className="tag hover:text-[var(--accent)]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Interpreted query — shows the AI actually understood the ask. */}
          {intent && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="eyebrow mr-1">Understood as</span>
                <span className="tag mono text-[var(--accent)]">
                  {intent.literalQuery}
                </span>
                {intent.duration !== 'any' && (
                  <span className="tag">{intent.duration}</span>
                )}
                {intent.order !== 'relevance' && (
                  <span className="tag">{intent.order}</span>
                )}
                {intent.isMusic && (
                  <span className="tag">music</span>
                )}
                {intent.excludeTerms.map((t) => (
                  <span key={t} className="tag">
                    −{t}
                  </span>
                ))}
              </div>
              {intent.rationale && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  {intent.rationale}
                </p>
              )}
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={runPaste} className="panel rise p-4 sm:p-5">
          <label htmlFor="u" className="eyebrow">
            Paste a link
          </label>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconLink className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--faint)]" />
              <input
                id="u"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="input mono pl-10 text-[0.8125rem]"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="btn btn-primary sm:px-6"
            >
              {loading ? 'Reading…' : 'Fetch'}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <span key={p} className="tag">
                {p}
              </span>
            ))}
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--muted)] transition-colors hover:border-[var(--border-strong)]">
            <input
              type="checkbox"
              checked={useCookies}
              onChange={(e) => setUseCookies(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-dim)]"
            />
            <span>
              <span className="font-medium text-[var(--text-soft)]">
                Use Chrome cookies
              </span>{' '}
              — required for Instagram and Pinterest. Close Chrome fully first;
              it locks its own cookie database.
            </span>
          </label>
        </form>
      )}

      {/* ---------------- Notice ---------------- */}
      {error && (
        <div
          role="alert"
          className="rise mt-4 flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--danger)_35%,var(--border))] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] p-3.5"
        >
          <IconAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
          <div className="min-w-0">
            <p className="text-sm text-[var(--danger)]">{error.msg}</p>
            {error.hint && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                {error.hint}
              </p>
            )}
          </div>
        </div>
      )}

      <JobList jobs={jobs} onCancel={cancel} />

      {/* ---------------- Results ---------------- */}
      {results.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="display text-base">
              {results.length} {results.length === 1 ? 'result' : 'results'}
            </h2>
            <Link
              href="/library"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
            >
              <IconLibrary className="size-3.5" />
              View library
            </Link>
          </div>

          <div className="space-y-2.5">
            {results.map((c, i) => (
              <div key={c.videoId} className="rise" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                <ResultCard
                  candidate={c}
                  onDownload={downloadCandidate}
                  busy={busyId === c.videoId}
                  isMusic={intent?.isMusic ?? false}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}