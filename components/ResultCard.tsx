import Image from 'next/image'
import {
  IconDownload,
  IconExternal,
  IconMusic,
  IconVideo,
} from './Icons'

export interface Candidate {
  videoId: string
  title: string
  channel: string
  description: string
  thumbnail: string | null
  duration: number | null
  viewCount: number | null
  publishedAt: string | null
  url: string
  score: number
  reason: string
  suggestedFilename: string
}

/** Score → colour ramp. Strong matches read green, weak ones recede. */
function scoreStyle(score: number): { color: string; label: string } {
  if (score >= 75) return { color: 'var(--ok)', label: 'Strong match' }
  if (score >= 45) return { color: 'var(--warn)', label: 'Possible match' }
  return { color: 'var(--faint)', label: 'Weak match' }
}

function fmtDuration(s: number | null): string {
  if (!s) return '--:--'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function fmtViews(n: number | null): string {
  if (n === null) return 'views unknown'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B views`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K views`
  return `${n} views`
}

export function ResultCard({
  candidate,
  onDownload,
  busy,
  isMusic,
}: {
  candidate: Candidate
  onDownload: (c: Candidate, kind: 'video' | 'audio') => void
  busy: boolean
  isMusic: boolean
}) {
  const score = scoreStyle(candidate.score)
  const KindIcon = isMusic ? IconMusic : IconVideo

  return (
    <article className="panel panel-hover overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Thumbnail */}
        <a
          href={candidate.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative aspect-video w-full shrink-0 overflow-hidden bg-[var(--surface-2)] sm:aspect-auto sm:w-52"
        >
          {candidate.thumbnail ? (
            <Image
              src={candidate.thumbnail}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 208px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              unoptimized
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-[0.7rem] text-[var(--faint)]">
              No preview
            </span>
          )}

          <span className="mono absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[0.65rem] text-white backdrop-blur-sm">
            {fmtDuration(candidate.duration)}
          </span>

          {/* Score — legible over any thumbnail thanks to the scrim. */}
          <span
            title={`${candidate.score} / 100 — ${score.label}`}
            className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[0.65rem] font-semibold backdrop-blur-sm"
            style={{ color: score.color }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: score.color }}
            />
            {candidate.score}
          </span>
        </a>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <a
              href={candidate.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 text-sm font-semibold leading-snug transition-colors hover:text-[var(--accent)]"
            >
              <span className="line-clamp-2">{candidate.title}</span>
            </a>
          </div>

          <p className="mt-1 truncate text-xs text-[var(--muted)]">
            {candidate.channel} · {fmtViews(candidate.viewCount)}
          </p>

          {candidate.reason && (
            <p className="mt-2 line-clamp-2 border-l-2 border-[var(--border-strong)] pl-2.5 text-xs leading-relaxed text-[var(--text-soft)]">
              {candidate.reason}
            </p>
          )}

          {candidate.suggestedFilename && (
            <p className="mono mt-2 truncate text-[0.7rem] text-[var(--accent-dim)]">
              {candidate.suggestedFilename}
            </p>
          )}

          {/* Actions pinned to the bottom so cards align in a list. */}
          <div className="mt-auto flex items-center gap-2 pt-3.5">
            <button
              onClick={() => onDownload(candidate, isMusic ? 'audio' : 'video')}
              disabled={busy}
              className="btn btn-primary px-3.5 py-1.5 text-xs"
            >
              {busy ? (
                <>
                  <span className="spin inline-block">◐</span> Starting
                </>
              ) : (
                <>
                  <KindIcon className="size-3.5" />
                  {isMusic ? 'Audio' : 'Video'}
                </>
              )}
            </button>

            <a
              href={candidate.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              aria-label="Open source on YouTube"
            >
              <IconExternal className="size-3.5" />
              <span className="hidden sm:inline">Source</span>
            </a>

            <span className="mono ml-auto hidden text-[0.65rem] text-[var(--faint)] sm:inline">
              <IconDownload className="mr-1 inline size-3" />
              {candidate.publishedAt?.slice(0, 10) ?? 'date unknown'}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}