import { execa } from 'execa'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveBinary, resolveBinarySync, mediaRoot } from '@/lib/binaries'
import type { ExtractedMedia } from '@/lib/types'

/**
 * yt-dlp wrapper.
 *
 * The vendored Windows .exe is a PyInstaller bundle and cannot autodetect a JS
 * runtime, so `--js-runtimes node` is applied by resolveBinary(). This is
 * required for YouTube's EJS challenge solver.
 */

export class DownloaderError extends Error {
  constructor(
    message: string,
    readonly hint: string | null = null,
    readonly raw = ''
  ) {
    super(message)
    this.name = 'DownloaderError'
  }
}

/**
 * Hard ceiling on captured child output. yt-dlp is chatty, but a runaway buffer
 * previously exhausted the dev server's heap; failing loudly beats an OOM.
 */
const MAX_BUFFER = 64 * 1024 * 1024

/** Chrome holds a lock on its cookie DB; reading it fails while Chrome runs. */
function cookieArgs(enabled: boolean): string[] {
  return enabled ? ['--cookies-from-browser', 'chrome'] : []
}

export async function probe(
  url: string,
  opts: { useCookies?: boolean } = {}
): Promise<ExtractedMedia> {
  const bin = await resolveBinary('ytdlp')
  if (!bin) {
    throw new DownloaderError('yt-dlp is not available', 'Run: npm run setup')
  }

  const args = [
    ...bin.prefixArgs,
    '--dump-single-json',
    '--no-warnings',
    '--flat-playlist',
    '--no-playlist',
    '--socket-timeout',
    '20',
    ...cookieArgs(opts.useCookies ?? false),
    url,
  ]

  let result
  try {
    result = await execa(bin.command, args, {
      timeout: 90_000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (e) {
    const stderr = e instanceof Error ? (e as { stderr?: string }).stderr ?? '' : ''
    const msg = e instanceof Error ? e.message : 'unknown error'
    throw new DownloaderError(
      summarise(stderr) || msg,
      hintFor(stderr),
      stderr
    )
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new DownloaderError(
      'Could not parse yt-dlp JSON output',
      null,
      result.stdout.slice(0, 500)
    )
  }

  return {
    id: String(parsed.id ?? ''),
    url,
    platform: String(parsed.extractor_key ?? 'youtube'),
    title: String(parsed.title ?? 'Untitled'),
    uploader: parsed.uploader ? String(parsed.uploader) : null,
    duration: typeof parsed.duration === 'number' ? parsed.duration : null,
    thumbnail: parsed.thumbnail ? String(parsed.thumbnail) : null,
    isPlaylist: parsed._type === 'playlist',
    entryCount: Array.isArray(parsed.entries)
      ? parsed.entries.length
      : typeof parsed.entries === 'number'
        ? parsed.entries
        : null,
    extractor: 'ytdlp',
    raw: parsed,
  }
}

export interface DownloadOptions {
  useCookies?: boolean
  /** 'video' keeps the best muxed video+audio; 'audio' extracts MP3. */
  kind?: 'video' | 'audio'
  /** AI-normalised base filename, without extension. */
  filename?: string
  /** Subfolder under MEDIA_ROOT. */
  folder?: string
  onProgress?: (pct: number) => void
}

export async function startDownload(
  url: string,
  opts: DownloadOptions = {}
): Promise<void> {
  const bin = resolveBinarySync('ytdlp')
  if (!bin) {
    throw new DownloaderError('yt-dlp is not available', 'Run: npm run setup')
  }

  const kind = opts.kind ?? 'video'
  const dir = join(mediaRoot(), opts.folder ?? 'youtube')
  await mkdir(dir, { recursive: true })

  const stem = opts.filename ?? '%(title).180B'
  const outTpl = join(dir, `${stem}.%(ext)s`)

  const format =
    kind === 'audio'
      ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
      : // Capped at 1080p by default. An uncapped `bestvideo*` selection pulls
        // multi-gigabyte 4K AV1/VP9 streams that are slow to merge and absurd
        // to archive by default; the extra height is rarely worth the size.
        ['-f', 'bv*[height<=1080]+ba/b[height<=1080]', '--merge-output-format', 'mp4']

  const args = [
    ...bin.prefixArgs,
    '--newline',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout',
    '20',
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    // YouTube returns 403 when a client hammers the CDN. Backing off between
    // requests and retrying with linear sleep keeps the tool usable instead of
    // failing the moment a user queues a few downloads.
    '--retry-sleep',
    'linear=1::2',
    '--sleep-requests',
    '1',
    ...format,
    ...cookieArgs(opts.useCookies ?? false),
    '-o',
    outTpl,
    url,
  ]

  // execa() rather than execaNode(): execaNode's stdio handling makes yt-dlp's
  // JS challenge solver re-invoke node against its own .exe, which fails with a
  // DOS-mode SyntaxError. Buffering is bounded below instead of unbounded.
  const subprocess = execa(bin.command, args, {
    windowsHide: true,
    cwd: mediaRoot(),
    maxBuffer: MAX_BUFFER,
    stripFinalNewline: true,
  })

  if (opts.onProgress) {
    attachProgressParser(subprocess.stdout, opts.onProgress)
  }

  try {
    await subprocess
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? ''
    throw new DownloaderError(
      summarise(stderr) || 'yt-dlp failed',
      hintFor(stderr),
      stderr
    )
  }
}

/** yt-dlp emits "[download]  42.3% of ..." on stdout with --newline. */
function attachProgressParser(
  stream: NodeJS.ReadableStream | null,
  onProgress: (pct: number) => void
): void {
  const pct = /\[download\]\s+(\d+(?:\.\d+)?)%/
  let buffered = ''

  stream?.on('data', (chunk: Buffer | string) => {
    buffered += chunk.toString()
    // Guard against a pathological line with no newline terminator.
    if (buffered.length > 8192) buffered = buffered.slice(-1024)
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const m = pct.exec(line)
      if (m) onProgress(Math.min(100, Number(m[1])))
    }
  })
}

function summarise(stderr: string): string {
  if (!stderr) return ''
  const errorLine = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => /^ERROR:/i.test(l.trim()))
  return (errorLine ?? stderr.split(/\r?\n/).pop() ?? '').replace(/^ERROR:\s*/i, '').trim()
}

function hintFor(stderr: string): string | null {
  const s = stderr.toLowerCase()
  if (s.includes('403') || s.includes('forbidden')) {
    return 'YouTube is rate-limiting this IP after repeated downloads. Wait a few minutes, then retry.'
  }
  if (s.includes('could not find web archive')) {
    return 'This post may be private, deleted, or region-locked.'
  }
  if (s.includes('sign in to confirm') || s.includes('not a bot')) {
    return 'YouTube is rate-limiting this IP. Wait a few minutes and retry.'
  }
  if (s.includes('private video') || s.includes('this video is private')) {
    return 'This video is private.'
  }
  if (s.includes('age') && s.includes('restricted')) {
    return 'Age-restricted content needs --cookies-from-browser.'
  }
  if (s.includes('requested format is not available')) {
    return 'No matching format; try the other kind (video/audio).'
  }
  return null
}