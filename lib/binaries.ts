import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execa } from 'execa'

/**
 * Resolution and health checks for the external binaries this app drives.
 *
 * yt-dlp.exe is vendored into bin/ by scripts/setup.mjs so runs are reproducible.
 * gallery-dl.exe ships no release assets upstream — it comes from Chocolatey
 * (which places a shim on PATH) and is therefore resolved from PATH only.
 *
 * ffmpeg/ffprobe come from PATH (choco install ffmpeg).
 */

const IS_WINDOWS = process.platform === 'win32'
const BIN_DIR = join(process.cwd(), 'bin')

const ytdlpPath = join(BIN_DIR, IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp')

export type BinaryName = 'ytdlp' | 'gallerydl' | 'ffmpeg' | 'ffprobe'

export interface BinaryStatus {
  name: string
  command: string
  available: boolean
  version: string | null
  source: 'vendored' | 'path' | null
  hint: string | null
}

export function mediaRoot(): string {
  return process.env.MEDIA_ROOT || join(process.cwd(), 'Downloads')
}

async function probe(
  command: string,
  args: string[]
): Promise<{ ok: boolean; version: string | null; err: string | null }> {
  try {
    const { stdout } = await execa(command, args, { timeout: 15_000 })
    return { ok: true, version: stdout.split('\n')[0]?.trim() || null, err: null }
  } catch (e) {
    return {
      ok: false,
      version: null,
      err: e instanceof Error ? e.message.slice(0, 200) : 'unknown error',
    }
  }
}

/**
 * Resolve the actual executable + args prefix for a tool.
 * Returns null when the binary is unavailable, so callers can fail clearly
 * rather than surfacing an opaque ENOENT.
 */
export async function resolveBinary(
  name: BinaryName
): Promise<{ command: string; prefixArgs: string[] } | null> {
  if (name === 'ytdlp') {
    if (existsSync(ytdlpPath)) {
      // yt-dlp.exe is a PyInstaller bundle; its JS runtime must be declared
      // explicitly on Windows, since the exe cannot autodetect Node there.
      return {
        command: ytdlpPath,
        prefixArgs: IS_WINDOWS ? ['--js-runtimes', 'node'] : [],
      }
    }
    return null
  }

  if (name === 'gallerydl') return { command: 'gallery-dl', prefixArgs: [] }
  if (name === 'ffmpeg') return { command: 'ffmpeg', prefixArgs: [] }
  if (name === 'ffprobe') return { command: 'ffprobe', prefixArgs: [] }
  return null
}

/**
 * Synchronous variant for paths that must resolve before a process is spawned
 * (e.g. building an execa call synchronously). Returns null when unavailable.
 */
export function resolveBinarySync(
  name: BinaryName
): { command: string; prefixArgs: string[] } | null {
  if (name === 'ytdlp') {
    if (!existsSync(ytdlpPath)) return null
    return {
      command: ytdlpPath,
      prefixArgs: IS_WINDOWS ? ['--js-runtimes', 'node'] : [],
    }
  }
  const cmd =
    name === 'gallerydl'
      ? 'gallery-dl'
      : name === 'ffmpeg'
        ? 'ffmpeg'
        : name === 'ffprobe'
          ? 'ffprobe'
          : null
  return cmd ? { command: cmd, prefixArgs: [] } : null
}

export async function checkAllBinaries(): Promise<BinaryStatus[]> {
  const checks: Array<{
    name: string
    command: string
    args: string[]
    source: 'vendored' | 'path'
    hint: string | null
  }> = []

  const ytdlpVendored = existsSync(ytdlpPath)
  checks.push({
    name: 'yt-dlp',
    command: ytdlpPath,
    args: ['--version'],
    source: 'vendored',
    hint: ytdlpVendored
      ? null
      : 'Run: npm run setup',
  })

  checks.push({
    name: 'gallery-dl',
    command: 'gallery-dl',
    args: ['--version'],
    source: 'path',
    hint: 'Run: choco install gallery-dl',
  })

  checks.push({
    name: 'ffmpeg',
    command: 'ffmpeg',
    args: ['-version'],
    source: 'path',
    hint: 'Run: choco install ffmpeg',
  })

  checks.push({
    name: 'ffprobe',
    command: 'ffprobe',
    args: ['-version'],
    source: 'path',
    hint: 'Run: choco install ffmpeg',
  })

  const results = await Promise.all(
    checks.map(async (c) => {
      const r = await probe(c.command, c.args)
      return {
        name: c.name,
        command: c.command,
        available: r.ok,
        version: r.version,
        source: r.ok ? c.source : null,
        hint: r.ok ? null : c.hint,
      } satisfies BinaryStatus
    })
  )

  return results
}

/** Node must satisfy yt-dlp's EJS challenge solver requirement. */
export function nodeSupportsEjs(): boolean {
  return Number(process.versions.node.split('.')[0]) >= 22
}