'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconLibrary, IconSearch, IconSliders } from './Icons'

const TABS = [
  { href: '/', label: 'Search', Icon: IconSearch },
  { href: '/library', label: 'Library', Icon: IconLibrary },
  { href: '/settings', label: 'Setup', Icon: IconSliders },
] as const

/**
 * Route-aware nav. `usePathname` is required here, so this lives in its own
 * client component rather than forcing the whole layout to be one.
 */
export function NavTabs() {
  const pathname = usePathname()

  return (
    <>
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-all duration-150',
              active
                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-soft)]',
            ].join(' ')}
          >
            <Icon
              className="size-4"
              style={active ? { color: 'var(--accent)' } : undefined}
            />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        )
      })}
    </>
  )
}