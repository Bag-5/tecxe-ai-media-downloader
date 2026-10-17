import type { SVGProps } from 'react'

/**
 * Inline icon set.
 *
 * Deliberately dependency-free: this app runs locally and should never reach
 * out to an icon CDN. All icons share a 24px grid and 1.75 stroke so they sit
 * optically consistent next to 14–16px text.
 */

type P = SVGProps<SVGSVGElement>

function Base({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  )
}

export function IconSearch(p: P) {
  return (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Base>
  )
}

export function IconLink(p: P) {
  return (
    <Base {...p}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </Base>
  )
}

export function IconLibrary(p: P) {
  return (
    <Base {...p}>
      <path d="M4 5v14M8 5v14" />
      <rect x="12" y="5" width="8" height="14" rx="1.5" />
    </Base>
  )
}

export function IconSliders(p: P) {
  return (
    <Base {...p}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Base>
  )
}

export function IconDownload(p: P) {
  return (
    <Base {...p}>
      <path d="M12 3v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Base>
  )
}

export function IconMusic(p: P) {
  return (
    <Base {...p}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Base>
  )
}

export function IconVideo(p: P) {
  return (
    <Base {...p}>
      <rect x="2.5" y="5.5" width="14" height="13" rx="2" />
      <path d="m16.5 10.5 5-3v9l-5-3z" />
    </Base>
  )
}

export function IconImage(p: P) {
  return (
    <Base {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 18" />
    </Base>
  )
}

export function IconCheck(p: P) {
  return (
    <Base {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Base>
  )
}

export function IconAlert(p: P) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconClock(p: P) {
  return (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </Base>
  )
}

export function IconX(p: P) {
  return (
    <Base {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  )
}

export function IconExternal(p: P) {
  return (
    <Base {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10.5 13.5" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </Base>
  )
}

export function IconFolder(p: P) {
  return (
    <Base {...p}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z" />
    </Base>
  )
}

export function IconSparkle(p: P) {
  return (
    <Base {...p}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
      <path d="M18.5 3v3M20 4.5h-3" />
    </Base>
  )
}

export function IconChip(p: P) {
  return (
    <Base {...p}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M10 3v3.5M14 3v3.5M10 17.5V21M14 17.5V21M3 10h3.5M3 14h3.5M17.5 10H21M17.5 14H21" />
    </Base>
  )
}

export function IconCopy(p: P) {
  return (
    <Base {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V6a1.5 1.5 0 0 0-1.5-1.5h-8A1.5 1.5 0 0 0 4 6v8a1.5 1.5 0 0 0 1.5 1.5H6" />
    </Base>
  )
}