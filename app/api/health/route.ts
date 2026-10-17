import { NextResponse } from 'next/server'
import {
  checkAllBinaries,
  nodeSupportsEjs,
  mediaRoot,
} from '@/lib/binaries'

export const dynamic = 'force-dynamic'

/**
 * Toolchain health. Surfaced in the UI so a missing binary or a missing env
 * key is diagnosed in one click instead of surfacing as an opaque download
 * failure ten minutes into a job.
 */
export async function GET() {
  const binaries = await checkAllBinaries()

  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
    YOUTUBE_API_KEY: Boolean(process.env.YOUTUBE_API_KEY),
  }

  const required = binaries.filter((b) => !b.available)
  const ready = required.length === 0 && env.DATABASE_URL && env.OPENROUTER_API_KEY

  return NextResponse.json({
    ready,
    binaries,
    env,
    node: {
      version: process.versions.node,
      ejsSupported: nodeSupportsEjs(),
    },
mediaRoot: mediaRoot(),
    notes: [
      !env.YOUTUBE_API_KEY
        ? 'Natural-language search is disabled until YOUTUBE_API_KEY is set. Link-paste still works.'
        : null,
      !env.DATABASE_URL ? 'Database not configured — downloads will not be recorded.' : null,
      !env.OPENROUTER_API_KEY ? 'AI features disabled — filenames will not be normalised.' : null,
    ].filter(Boolean),
  })
}