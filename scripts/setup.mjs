#!/usr/bin/env node
/**
 * TECXE AI-Media Downloader — toolchain bootstrap.
 *
 * Fetches the standalone yt-dlp.exe and gallery-dl.exe Windows binaries into
 * bin/, then verifies every runtime dependency the app shells out to.
 *
 * These are official upstream builds. No Python runtime is required:
 * yt-dlp.exe is a PyInstaller bundle and gallery-dl.exe is a frozen script.
 *
 *   node scripts/setup.mjs            fetch anything missing
 *   node scripts/setup.mjs --force    re-download unconditionally
 *   node scripts/setup.mjs --check    verify only, download nothing
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'bin')

const args = new Set(process.argv.slice(2))
const FORCE = args.has('--force')
const CHECK_ONLY = args.has('--check')

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}
const log = (...m) => console.log(...m)
const ok = (m) => log(`${c.green}  ok${c.reset}  ${m}`)
const warn = (m) => log(`${c.yellow}warn${c.reset}  ${m}`)
const fail = (m) => log(`${c.red}fail${c.reset}  ${m}`)
const info = (m) => log(`${c.dim}      ${m}${c.reset}`)

function run(cmd, cmdArgs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, cmdArgs, { windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('error', () => resolve({ code: -1, out }))
    p.on('close', (code) => resolve({ code, out }))
  })
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

/**
 * yt-dlp publishes a signed standalone .exe on every release, so we vendor it
 * into bin/ for reproducibility.
 *
 * gallery-dl publishes NO release assets — its Windows build is produced by a
 * CI workflow and surfaced only through package managers. Chocolatey ships it
 * with a PATH shim, which is what we resolve against at runtime.
 */
async function fetchYtdlp() {
  mkdirSync(BIN, { recursive: true })
  const dest = join(BIN, 'yt-dlp.exe')
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

  if (existsSync(dest) && !FORCE) {
    ok('yt-dlp already present')
    return
  }
  if (existsSync(dest) && FORCE) {
    info(`--force: replacing ${dest}`)
    await rm(dest, { force: true })
  }
  try {
    log(`${c.cyan}fetch${c.reset}  yt-dlp`)
    info(url)
    await download(url, dest)
    ok(`yt-dlp downloaded (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`)
  } catch (err) {
    fail(`yt-dlp download failed — ${err.message}`)
    info(`Download manually to ${dest}`)
    process.exitCode = 1
  }
}

async function checkGdl() {
  const r = await run('gallery-dl', ['--version'])
  if (r.code === 0) {
    ok(`gallery-dl ${r.out.trim().split('\n')[0]} (from PATH)`)
    return
  }
  fail('gallery-dl not on PATH — install: choco install gallery-dl')
  info('Required for Instagram, Pinterest, Reddit and Facebook images.')
  process.exitCode = 1
}

async function verify() {
  log(`\n${c.bold}Runtime checks${c.reset}\n`)

  const nodeMajor = Number(process.versions.node.split('.')[0])
  nodeMajor >= 22
    ? ok(`Node ${process.versions.node}`)
    : fail(`Node ${process.versions.node} — yt-dlp needs >= 22 for its JS runtime`)

  const ff = await run('ffmpeg', ['-version'])
  ff.code === 0
    ? ok(`ffmpeg ${ff.out.split('\n')[0].split(' ')[2]}`)
    : fail('ffmpeg not on PATH — install: choco install ffmpeg')

  const fp = await run('ffprobe', ['-version'])
  fp.code === 0
    ? ok(`ffprobe ${fp.out.split('\n')[0].split(' ')[2]}`)
    : fail('ffprobe not on PATH — reinstall ffmpeg')

  const ytdlp = join(BIN, 'yt-dlp.exe')
  if (existsSync(ytdlp)) {
    const r = await run(ytdlp, ['--version'])
    r.code === 0
      ? ok(`yt-dlp ${r.out.trim().split('\n')[0]}`)
      : fail(`yt-dlp present but not runnable: ${r.out.slice(0, 200)}`)
  } else {
    fail('yt-dlp.exe missing from bin/')
  }

  const gdl = await run('gallery-dl', ['--version'])
  gdl.code === 0
    ? ok(`gallery-dl ${gdl.out.trim().split('\n')[0]} (from PATH)`)
    : fail('gallery-dl not on PATH — install: choco install gallery-dl')

  const envKeys = ['DATABASE_URL', 'OPENROUTER_API_KEY', 'YOUTUBE_API_KEY']
  const missing = envKeys.filter((k) => !process.env[k])
  if (missing.length === 0) ok('.env keys present')
  else warn(`missing env keys: ${missing.join(', ')}`)
  info('(read from .env.local by Next.js at runtime — fine if unset here)')
}

log(`${c.bold}TECXE AI-Media Downloader — setup${c.reset}`)

if (!CHECK_ONLY) {
  log(`\n${c.bold}Binaries${c.reset}\n`)
  await fetchYtdlp()
  await checkGdl()
}

await verify()

log('')
if (process.exitCode) {
  log(`${c.yellow}Setup incomplete — fix the failures above.${c.reset}\n`)
} else {
  log(`${c.green}Toolchain ready.${c.reset} Next: npm install && npm run dev\n`)
}
