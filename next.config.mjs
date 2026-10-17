import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This machine has a stray package-lock.json in the home directory, which
  // makes Next.js infer the wrong workspace root. Pinning it here keeps
  // process.cwd() — and therefore bin/ and Downloads/ resolution — correct.
  turbopack: {
    root: __dirname,
  },
  // yt-dlp and gallery-dl are spawned as child processes and never bundled.
  // Excluding Downloads/ also keeps the file watcher from thrashing as media
  // is written.
  outputFileTracingExcludes: {
    '*': ['./bin/**', './Downloads/**'],
  },
  serverExternalPackages: ['execa'],
}

export default nextConfig