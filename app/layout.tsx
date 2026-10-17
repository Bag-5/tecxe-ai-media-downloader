import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'
import { IconLibrary, IconLink, IconSearch, IconSliders, IconSparkle } from '@/components/Icons'
import { NavTabs } from '@/components/NavTabs'

export const metadata: Metadata = {
  title: 'TECXE — AI Media Downloader',
  description:
    'Local, AI-assisted media downloader and library. Search in plain language or paste a link; files are named, tagged and archived automatically.',
  applicationName: 'TECXE',
}

export const viewport: Viewport = {
  themeColor: '#07080c',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
              <Link
                href="/"
                className="group flex min-w-0 items-center gap-2.5"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[#04211d] shadow-[0_6px_18px_-8px_var(--accent-glow)] transition-transform duration-200 group-hover:scale-105"
                  style={{
                    background:
                      'linear-gradient(140deg, var(--accent), var(--accent-dim))',
                  }}
                >
                  <IconSparkle className="size-4.5" strokeWidth={2.1} />
                </span>
                <span className="flex min-w-0 flex-col leading-none">
                  <span className="display truncate text-[0.95rem]">
                    TECXE
                  </span>
                  <span className="mt-0.5 truncate text-[0.68rem] text-[var(--faint)]">
                    AI Media Downloader
                  </span>
                </span>
              </Link>

              <nav className="ml-auto flex items-center gap-0.5">
                <NavTabs />
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-16 border-t border-[var(--border)]">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="max-w-xl text-xs leading-relaxed text-[var(--faint)]">
                Runs entirely on your machine. Intended for your own media and
                personal, licensed or public-domain archival.
              </p>
              <p className="flex items-center gap-3 text-xs text-[var(--faint)]">
                <span className="inline-flex items-center gap-1.5">
                  <IconLink className="size-3.5" />
                  Local only
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconLibrary className="size-3.5" />
                  Neon library
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconSearch className="size-3.5" />
                  OpenRouter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <IconSliders className="size-3.5" />
                  yt-dlp
                </span>
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}