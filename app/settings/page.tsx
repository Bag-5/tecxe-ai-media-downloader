'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  IconAlert,
  IconCheck,
  IconChip,
  IconFolder,
  IconX,
} from '@/components/Icons'

interface Health {
  ready: boolean
  binaries: Array<{
    name: string
    available: boolean
    version: string | null
    source: string | null
    hint: string | null
  }>
  env: Record<string, boolean>
  node: { version: string; ejsSupported: boolean }
  mediaRoot: string
  notes: string[]
}

export default function SettingsPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const check = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const json = await res.json()
      setHealth(json)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled) {
          setHealth(json)
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
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-2xl">Setup</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Toolchain and configuration status for this machine.
          </p>
        </div>
        <button
          onClick={() => void check()}
          disabled={loading}
          className="btn px-3 py-1.5 text-xs"
        >
          {loading ? (
            <>
              <span className="spin inline-block">◐</span> Checking
            </>
          ) : (
            'Re-check'
          )}
        </button>
      </header>

      {error && (
        <div className="panel mt-6 border-[color-mix(in_oklab,var(--danger)_40%,var(--border))] p-3.5">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </div>
      )}

      {loading && !health && (
        <div className="mt-6 space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-40" />
          <div className="skeleton h-24" />
        </div>
      )}

      {health && (
        <div className="mt-6 space-y-3">
          {/* Overall verdict */}
          <div
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{
              borderColor: health.ready
                ? 'color-mix(in oklab, var(--ok) 32%, var(--border))'
                : 'color-mix(in oklab, var(--warn) 32%, var(--border))',
              background: `color-mix(in oklab, ${
                health.ready ? 'var(--ok)' : 'var(--warn)'
              } 6%, transparent)`,
            }}
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg"
              style={{
                color: health.ready ? 'var(--ok)' : 'var(--warn)',
                background: `color-mix(in oklab, ${
                  health.ready ? 'var(--ok)' : 'var(--warn)'
                } 14%, transparent)`,
              }}
            >
              {health.ready ? <IconCheck className="size-4.5" /> : <IconAlert className="size-4.5" />}
            </span>
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: health.ready ? 'var(--ok)' : 'var(--warn)' }}
              >
                {health.ready ? 'All core dependencies present' : 'Some dependencies are missing'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {health.ready
                  ? 'Search, download and archival are all operational.'
                  : 'Link extraction will fail until these are resolved.'}
              </p>
            </div>
          </div>

          {/* Binaries */}
          <Section title="Binaries" Icon={IconChip}>
            <ul className="divide-y divide-[var(--border)]">
              {health.binaries.map((b) => (
                <li key={b.name} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md"
                    style={{
                      color: b.available ? 'var(--ok)' : 'var(--danger)',
                      background: `color-mix(in oklab, ${
                        b.available ? 'var(--ok)' : 'var(--danger)'
                      } 13%, transparent)`,
                    }}
                  >
                    {b.available ? (
                      <IconCheck className="size-3" strokeWidth={2.5} />
                    ) : (
                      <IconX className="size-3" strokeWidth={2.5} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    {b.version && (
                      <p className="mono truncate text-[0.7rem] text-[var(--muted)]">
                        {b.version}
                      </p>
                    )}
                    {!b.available && b.hint && (
                      <p className="mono mt-1 text-[0.7rem] leading-relaxed text-[var(--warn)]">
                        {b.hint}
                      </p>
                    )}
                  </div>

                  {b.source && <span className="tag shrink-0">{b.source}</span>}
                </li>
              ))}
            </ul>
          </Section>

          {/* Environment */}
          <Section title="Environment">
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(health.env).map(([k, v]) => (
                <li
                  key={k}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: v ? 'var(--ok)' : 'var(--warn)' }}
                  />
                  <span className="mono min-w-0 flex-1 truncate text-[0.7rem]">{k}</span>
                  <span
                    className="mono text-[0.65rem] font-medium"
                    style={{ color: v ? 'var(--ok)' : 'var(--faint)' }}
                  >
                    {v ? 'set' : 'unset'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Set these in <span className="mono">.env.local</span> — see{' '}
              <span className="mono">.env.example</span>. Restart the dev server
              after editing.
            </p>
          </Section>

          {/* Runtime */}
          <Section title="Runtime" Icon={IconChip}>
            <dl className="space-y-2 text-sm">
              <Row label="Node">
                <span className="mono text-xs">{health.node.version}</span>
                <span
                  className="ml-2 text-[0.7rem]"
                  style={{ color: health.node.ejsSupported ? 'var(--ok)' : 'var(--danger)' }}
                >
                  yt-dlp JS runtime {health.node.ejsSupported ? 'satisfied' : 'needs ≥22'}
                </span>
              </Row>
              <Row label="Media root" Icon={IconFolder}>
                <span className="mono text-[0.7rem] break-all">{health.mediaRoot}</span>
              </Row>
            </dl>
          </Section>

          {health.notes.length > 0 && (
            <Section title="Notes" tone="var(--warn)">
              <ul className="space-y-1.5">
                {health.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-[var(--text-soft)]">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--warn)]" />
                    {n}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Commands */}
          <Section title="Useful commands">
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              {[
                ['npm run setup', 'fetch yt-dlp and verify the toolchain'],
                ['npm run update:binaries', 'force re-download of bundled binaries'],
                ['npm run dev', 'start the app on http://localhost:3000'],
              ].map(([cmd, desc], i) => (
                <div
                  key={cmd}
                  className={[
                    'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2',
                    i > 0 ? 'border-t border-[var(--border)]' : '',
                  ].join(' ')}
                >
                  <code className="mono text-[0.7rem] text-[var(--accent)]">{cmd}</code>
                  <span className="text-[0.7rem] text-[var(--faint)]">{desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
  Icon,
  tone,
}: {
  title: string
  children: React.ReactNode
  Icon?: typeof IconChip
  tone?: string
}) {
  return (
    <section
      className="panel p-4 sm:p-5"
      style={tone ? { borderColor: `color-mix(in oklab, ${tone} 30%, var(--border))` } : undefined}
    >
      <h2
        className="eyebrow mb-3 flex items-center gap-1.5"
        style={tone ? { color: tone } : undefined}
      >
        {Icon && <Icon className="size-3.5" />}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
  Icon,
}: {
  label: string
  children: React.ReactNode
  Icon?: typeof IconFolder
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="flex shrink-0 items-center gap-1.5 text-[var(--muted)]">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}