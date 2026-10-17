/**
 * URL → platform routing.
 *
 * Determines which extractor handles a pasted link, and whether browser cookies
 * are required. Instagram and Pinterest have required login for nearly all
 * content since 2023, so they need --cookies-from-browser.
 */

export type Platform =
  | 'youtube'
  | 'youtube_music'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'pinterest'
  | 'reddit'
  | 'unknown'

export type Extractor = 'ytdlp' | 'gallerydl'

export interface PlatformInfo {
  platform: Platform
  extractor: Extractor
  /** Chrome must be fully closed while cookies are read. */
  requiresCookies: boolean
  label: string
}

interface Rule {
  test: RegExp
  info: Omit<PlatformInfo, 'extractor' | 'requiresCookies'>
  extractor: Extractor
  requiresCookies?: boolean
}

const RULES: Rule[] = [
  // YouTube Music must precede YouTube: the YouTube host pattern also matches
  // `music.youtube.com`, so `find()` would otherwise swallow it.
  {
    test: /(^|\.)music\.youtube\.com$/i,
    info: { platform: 'youtube_music', label: 'YouTube Music' },
    extractor: 'ytdlp',
  },
  {
    test: /(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/i,
    info: { platform: 'youtube', label: 'YouTube' },
    extractor: 'ytdlp',
  },
  {
    test: /(^|\.)instagram\.com$|(^|\.)instagr\.am$/i,
    info: { platform: 'instagram', label: 'Instagram' },
    extractor: 'gallerydl',
    requiresCookies: true,
  },
  {
    test: /(^|\.)tiktok\.com$|(^|\.)vt\.tiktok\.com$/i,
    info: { platform: 'tiktok', label: 'TikTok' },
    extractor: 'ytdlp',
  },
  {
    test: /(^|\.)facebook\.com$|(^|\.)fb\.watch$|(^|\.)fb\.com$/i,
    info: { platform: 'facebook', label: 'Facebook' },
    extractor: 'ytdlp',
  },
  {
    test: /(^|\.)pinterest\.[a-z.]+$/i,
    info: { platform: 'pinterest', label: 'Pinterest' },
    extractor: 'gallerydl',
    requiresCookies: true,
  },
  {
    test: /(^|\.)reddit\.com$|(^|\.)redd\.it$/i,
    info: { platform: 'reddit', label: 'Reddit' },
    extractor: 'gallerydl',
  },
]

export function detectPlatform(rawUrl: string): PlatformInfo | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const rule = RULES.find((r) => r.test.test(url.hostname))
  if (!rule) return null

  return {
    ...rule.info,
    extractor: rule.extractor,
    requiresCookies: rule.requiresCookies ?? false,
  }
}

export function isSupportedUrl(rawUrl: string): boolean {
  return detectPlatform(rawUrl) !== null
}

/** Platforms gallery-dl or yt-dlp cannot reach without authentication. */
export function cookieNotice(info: PlatformInfo): string | null {
  if (!info.requiresCookies) return null
  return `${info.label} requires browser cookies. Fully close Chrome before starting, then retry.`
}