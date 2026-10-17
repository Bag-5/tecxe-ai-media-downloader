'use client'

import { useEffect, useState } from 'react'
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconDownload,
  IconFolder,
  IconX,
} from './Icons'

export interface LiveJob {
  id: string
  status: string
  url: string
  platform: string
  title: string | null
  progress: number
  error: string | null
  hint: string | null
  filepath: string | null
  position: number
}

/**
 * Polls active jobs.
 *
 * Mirrors the scanv pattern: poll a cheap in-memory status endpoint rather than
 * holding a stream open, so a page refresh never orphans a running download.
 */
export function useJobs() {
  const [jobs, setJobs] = useState<LiveJob[]>([])
  const [loading, setLoading] = useState(true)

  const active = jobs.filter(
    (j) => j.status === 'queued' || j.status === 'running'
  )
  const needsPolling = active.length > 0

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/download', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          const live: LiveJob[] = Array.isArray(data.live) ? data.live : []
          setJobs(live)
        }
      } catch {
        // Dev server restarting — retry on next tick.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!needsPolling) return
    const id = setInterval(() => {
      void (async () => {
        try {
          const res = await fetch('/api/download', { cache: 'no-store' })
          if (res.ok) setJobs((await res.json()).live ?? [])
        } catch {
          /* keep last known state */
        }
      })()
    }, 1000)
    return () => clearInterval(id)
  }, [needsPolling])

  const enqueue = async (payload: {
    url: string
    kind?: string
    title?: string | null
    filename?: string | null
    useCookies?: boolean
  }) => {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to start download')
    return data as { id: string; platform: string }
  }

  const cancel = async (id: string) => {
    await fetch(`/api/download?id=${id}`, { method: 'DELETE' })
  }

  return { jobs, active, loading, enqueue, cancel }
}

export function JobList({
  jobs,
  onCancel,
}: {
  jobs: LiveJob[]
  onCancel: (id: string) => void
}) {
  if (jobs.length === 0) return null

  const visible = jobs.slice(0, 8)
  const running = jobs.filter((j) => j.status === 'running').length
  const queued = jobs.filter((j) => j.status === 'queued').length
  const done = jobs.filter((j) => j.status === 'complete').length
  const failed = jobs.filter((j) => j.status === 'error').length

  return (
    <section className="panel rise mt-6 overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h2 className="display flex items-center gap-2 text-sm">
          <IconDownload className="size-4 text-[var(--accent)]" />
          Downloads
        </h2>
        <span className="mono text-[0.7rem] text-[var(--muted)]">
          {running > 0 && <span className="text-[var(--accent)]">{running} running</span>}
          {running > 0 && (queued > 0 || done > 0 || failed > 0) && ' · '}
          {queued > 0 && `${queued} queued`}
          {queued > 0 && (done > 0 || failed > 0) && ' · '}
          {done > 0 && <span className="text-[var(--ok)]">{done} done</span>}
          {done > 0 && failed > 0 && ' · '}
          {failed > 0 && <span className="text-[var(--danger)]">{failed} failed</span>}
        </span>
      </header>

      <ul className="divide-y divide-[var(--border)]">
        {visible.map((job) => (
          <li key={job.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {job.title ?? job.url}
                </p>
                <p className="mono mt-0.5 truncate text-[0.7rem] text-[var(--faint)]">
                  {job.platform} · {job.id.slice(0, 8)}
                </p>
              </div>
              <StatusPill status={job.status} />
            </div>

            {(job.status === 'running' || job.status === 'queued') && (
              <>
                <div className="progress mt-2.5">
                  {job.status === 'queued' ? (
                    <div className="progress-fill-indeterminate h-full w-full" />
                  ) : (
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.max(2, job.progress)}%` }}
                    />
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="mono text-[0.7rem] text-[var(--muted)]">
                    {job.status === 'queued'
                      ? job.position
                        ? `queued · position ${job.position}`
                        : 'queued'
                      : `${job.progress}%`}
                  </span>
                  <button
                    onClick={() => onCancel(job.id)}
                    className="btn btn-ghost px-2 py-0.5 text-[0.7rem] hover:!text-[var(--danger)]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {job.status === 'error' && (
              <div className="mt-2 flex gap-2 rounded-lg border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)] p-2.5">
                <IconAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
                <div className="min-w-0">
                  <p className="text-xs text-[var(--danger)]">{job.error}</p>
                  {job.hint && (
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-soft)]">
                      {job.hint}
                    </p>
                  )}
                </div>
              </div>
            )}

            {job.status === 'complete' && job.filepath && (
              <p className="mono mt-1.5 flex items-center gap-1.5 truncate text-[0.7rem] text-[var(--ok)]">
                <IconFolder className="size-3 shrink-0" />
                {job.filepath}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

const STATUS_STYLES: Record<
  string,
  { label: string; color: string; Icon: typeof IconClock }
> = {
  queued: { label: 'Queued', color: 'var(--muted)', Icon: IconClock },
  running: { label: 'Downloading', color: 'var(--accent)', Icon: IconDownload },
  complete: { label: 'Done', color: 'var(--ok)', Icon: IconCheck },
  error: { label: 'Failed', color: 'var(--danger)', Icon: IconAlert },
  cancelled: { label: 'Cancelled', color: 'var(--muted)', Icon: IconX },
}

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? {
    label: status,
    color: 'var(--muted)',
    Icon: IconClock,
  }
  const { Icon } = s

  return (
    <span
      className="mono inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
      style={{
        color: s.color,
        background: `color-mix(in oklab, ${s.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${s.color} 34%, transparent)`,
      }}
    >
      <Icon className="size-3" />
      {s.label}
    </span>
  )
}