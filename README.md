# TECXE AI-Media Downloader

A local, single-user media downloader with an AI front-end. Paste a link and it
fetches and files the media; or describe what you want in plain English and let
it search, rank, and name the results.

Built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and Neon Postgres.
Media extraction is handled by **yt-dlp** and **gallery-dl**, with **ffmpeg** for
merging streams.

---

## What it does

**Two ways in.**

| Workflow | How | Needs |
|---|---|---|
| **Link paste** | Drop in any supported URL; it detects the platform, extracts metadata, and downloads. | Nothing extra |
| **AI search** | Describe what you want ("a 3-minute ambient loop for a title card"). It parses intent, queries YouTube, ranks candidates with an LLM, and normalises the filename. | `YOUTUBE_API_KEY` |

**Supported platforms**

YouTube · YouTube Music · Instagram · TikTok · Facebook · Pinterest · Reddit

**AI does three jobs**

1. **Intent parsing** — turns a sentence into a structured query (literal terms,
   duration band, ordering, exclusions, music flag).
2. **Ranking** — scores candidates 0–100 against that intent and explains each pick.
3. **Normalisation** — derives a clean title, artist, and folder so files land on
   disk as `Artist - Title.mp4` instead of a slugged URL fragment.

**Library** — every completed download is written to Neon with its normalised
title, platform, kind, size, file path, and AI tags. Filter the library by
platform or tag.

---

## Requirements

- **Node.js ≥ 22** — yt-dlp needs a modern JS runtime (EJS support). Check
  under `/settings`, which also verifies everything else.
- No global installs needed. `npm run setup` fetches the binaries into `bin/`.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in your values
npm run setup                  # downloads yt-dlp, gallery-dl, ffmpeg, ffprobe
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string for the library |
| `OPENROUTER_API_KEY` | Yes | Intent parsing, ranking, filename normalisation |
| `YOUTUBE_API_KEY` | For AI search | YouTube Data API v3. Without it, search is disabled but link-paste still works |
| `MEDIA_ROOT` | No | Where media lands. Defaults to `<repo>/Downloads` |
| `AI_PRIMARY_MODEL` | No | Defaults to `openai/gpt-oss-120b` |
| `AI_FALLBACK_MODEL` | No | Defaults to `openai/gpt-oss-20b` |

> `.env.local` is gitignored. Never commit it.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run setup` | Fetch binaries and verify the toolchain |
| `npm run setup:check` | Verify only, download nothing |
| `npm run update:binaries` | Force a re-download of every binary |

`/settings` renders the same health data in the browser, including per-binary
versions, which env vars are set, and the resolved media root.

---

## Notes and behaviour

**Quality is capped at 1080p by default.** The yt-dlp format selector is
`bv*[height<=1080]+ba/b[height<=1080]`. This is deliberate — a 4K download
produced a ~1.9 GB peak in the dev server's heap. Change it in
`lib/downloaders/yt-dlp.ts` if you want more.

**Instagram and Pinterest need browser cookies.** Both have required login for
nearly all content since 2023, so requests are made with
`--cookies-from-browser chrome`. Chrome must be **fully closed** while the
cookie database is read, or the extractor fails to acquire it.

**YouTube rate-limits aggressive testing.** Repeated downloads in a short window
will return `HTTP Error 403: Forbidden`. The app surfaces this as a hint and
backs off automatically; it clears after a cooldown.

**The queue is in-memory.** Two downloads run concurrently; the rest sit in a
pending queue and the UI shows their position. Progress is flushed to Neon on a
throttle rather than per progress line, since yt-dlp can emit several per second.
Restarting the dev server loses in-flight jobs — the source URL is all you need
to re-run them.

**Progress does not rewind.** yt-dlp fetches video and audio as separate streams,
so the second stream restarts at 0%. Progress is clamped to the high-water mark.

---

## Project layout

```
app/
  api/extract      resolve a URL to platform + metadata
  api/search       AI intent → YouTube query → ranked candidates
  api/download     enqueue, poll, cancel
  api/library      read the Neon-backed library
  api/health       toolchain and env status
  page.tsx         search + paste workflow
  library/         saved downloads
  settings/        toolchain diagnostics
components/        Icons, JobList, NavTabs, ResultCard
lib/
  platforms.ts     URL → platform routing
  jobs.ts          in-memory queue, progress, library insert
  downloaders/     yt-dlp + gallery-dl wrappers
  ai/              intent synthesis, ranking, normalisation
  youtube/         Data API search client
  store.ts         Neon persistence
db/schema.sql      tables and indexes
scripts/setup.mjs  binary fetcher / verifier
```

---

## Responsible use

This tool is intended for **your own content, public-domain material, and
licensed media you have the right to archive**. It does not and will not bypass
DRM, paywalls, or access controls. Respect the terms of service of the platforms
you pull from, and the rights of creators.

---

## License

MIT — see [LICENSE](LICENSE).