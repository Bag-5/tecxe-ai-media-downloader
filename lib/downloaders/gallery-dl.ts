import { execa } from 'execa'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveBinary, mediaRoot } from '@/lib/binaries'
import type { ExtractedMedia } from '@/lib/types'
import { DownloaderError } from './yt-dlp'

/**
 * gallery-dl wrapper — Instagram, Pinterest, Reddit, Facebook images.
 *
 * gallery-dl installs from Chocolatey as a PATH shim (upstream publishes no
 * release assets), so it is resolved from PATH rather than bin/.
 *
 * Instagram and Pinterest require browser cookies since 2023 even for public
 * profiles. Chrome must be fully closed while its cookie DB is read.
 */

export async function probe(
  url: string,
  opts: { useCookies?: boolean } = {}
): Promise<ExtractedMedia> {
  const bin = await resolveBinary('gallerydl')
  if (!bin) {
    throw new DownloaderError(
      'gallery-dl is not available',
      'Run: choco install gallery-dl'
    )
  }

  const args = [
    '--quiet',
    '--dump-json',
    ...(opts.useCookies ? ['--cookies-from-browser', 'chrome'] : []),
    url,
  ]

  let stdout: string
  try {
    const result = await execa(bin.command, args, {
      timeout: 90_000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
    stdout = result.stdout
  } catch (e) {
    const stderr = e instanceof Error ? (e as { stderr?: string }).stderr ?? '' : ''
    const msg = e instanceof Error ? e.message : 'unknown error'
    throw new DownloaderError(summarise(stderr) || msg, hintFor(stderr), stderr)
  }

  // gallery-dl emits one JSON document per media item.
  const records = parseLines(stdout)

  if (records.length === 0) {
    throw new DownloaderError(
      'No media found at that URL',
      'The post may be private, deleted, or require cookies.'
    )
  }

  const first = records[0]
  const title =
    pickString(first, 'title') ??
    pickString(first, 'description') ??
    'Untitled'

  return {
    id: pickString(first, 'category') ?? platformFromUrl(url),
    url,
    platform: platformFromUrl(url),
    title: truncate(title, 200),
    uploader: pickString(first, 'username') ?? pickString(first, 'author'),
    duration: typeof first.duration === 'number' ? first.duration : null,
    thumbnail: pickString(first, 'thumbnail'),
    isPlaylist: records.length > 1,
    entryCount: records.length,
    extractor: 'gallerydl',
    raw: first,
  }
}

export interface DownloadOptions {
  useCookies?: boolean
  filename?: string
  folder?: string
  onProgress?: (pct: number) => void
}

export async function startDownload(
  url: string,
  opts: DownloadOptions = {}
): Promise<string> {
  const bin = await resolveBinary('gallerydl')
  if (!bin) {
    throw new DownloaderError(
      'gallery-dl is not available',
      'Run: choco install gallery-dl'
    )
  }

  const dir = join(mediaRoot(), opts.folder ?? 'gallery')
  await mkdir(dir, { recursive: true })

  const base = opts.filename ?? '{category}/{title:.120}'
  const args = [
    '--quiet',
    '--no-input',
    '--download-archive',
    join(mediaRoot(), 'archive.txt'),
    ...(opts.useCookies ? ['--cookies-from-browser', 'chrome'] : []),
    '--directory',
    dir,
    '--filename',
    `${base}.%(ext)s`,
    url,
  ]

  let stdout = ''
  try {
    // execa(), not execaNode(): see the matching note in yt-dlp.ts. Output is
    // bounded by maxBuffer so it can never grow without limit.
    const result = await execa(bin.command, args, {
      cwd: mediaRoot(),
      windowsHide: true,
      timeout: 30 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      stripFinalNewline: true,
    })
    stdout = result.stdout
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? ''
    throw new DownloaderError(
      summarise(stderr) || 'gallery-dl failed',
      hintFor(stderr),
      stderr
    )
  }

  // gallery-dl reports paths on stdout; take the last non-empty line.
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim())
  opts.onProgress?.(100)
  return lines[lines.length - 1]?.trim() ?? ''
}

function parseLines(stdout: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try {
      out.push(JSON.parse(t))
    } catch {
      // Partial trailing line — ignore.
    }
  }
  return out
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  return typeof v === 'string' && v.trim() ? v : null
}

function platformFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    if (h.includes('instagram')) return 'instagram'
    if (h.includes('pinterest')) return 'pinterest'
    if (h.includes('reddit')) return 'reddit'
    if (h.includes('facebook') || h.includes('fb.')) return 'facebook'
    return h
  } catch {
    return 'unknown'
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s
}

function summarise(stderr: string): string {
  if (!stderr) return ''
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim())
  return line?.trim() ?? ''
}

function hintFor(stderr: string): string | null {
  const s = stderr.toLowerCase()
  if (s.includes('login') || s.includes('cookie')) {
    return 'Close Chrome fully, then retry — it locks its own cookie database.'
  }
  if (s.includes('private')) return 'This post is private or needs an account.'
  if (s.includes('not found') || s.includes('404')) return 'The post may be deleted.'
  return null
}
