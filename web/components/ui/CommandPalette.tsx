'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { compareHref, itemHref, systemHref } from '../../lib/routes'
import { SPLIT_LABEL } from '../../lib/outcomes'
import { useBoardData } from '../world/BoardDataProvider'
import css from './palette.module.css'

/* The command palette: one keystroke to any page, system or item.

     Cmd/Ctrl+K or /   open            ↑ ↓   move      Enter   go      Esc   close
     g then h l s e c d u a   go to a page without opening it
     t                         switch theme

   Shortcuts never fire while you are typing in a field. The palette is a modal dialog
   with a combobox + listbox inside; focus is trapped on the input and returned to
   where it was when the palette closes. */

/* ---- open state, shared with the nav's button ---- */
let isOpen = false
const listeners = new Set<() => void>()
const setOpen = (v: boolean) => {
  if (v === isOpen) return
  isOpen = v
  listeners.forEach((l) => l())
}
export const openCommandPalette = () => setOpen(true)
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

interface Entry {
  id: string
  group: 'Pages' | 'Systems' | 'Items' | 'Actions'
  label: string
  detail?: string
  mono?: boolean
  hay: string
  href?: string
  run?: () => void
  key?: string
}

const PAGES: Array<{ href: string; label: string; detail: string; key: string }> = [
  { href: '/', label: 'Overview', detail: 'the story and the live board', key: 'h' },
  { href: '/leaderboard', label: 'Leaderboard', detail: 'ranked by Glass Score', key: 'l' },
  { href: '/systems', label: 'Systems', detail: 'a page per system', key: 's' },
  { href: '/explore', label: 'Explore items', detail: 'filter by split, outcome, system', key: 'e' },
  { href: '/compare', label: 'Compare', detail: 'two systems, item by item', key: 'c' },
  { href: '/datasheet', label: 'Datasheet', detail: 'the dataset card', key: 'd' },
  { href: '/submit', label: 'Submit', detail: 'five steps and the predictions checker', key: 'u' },
  { href: '/data', label: 'Data & API', detail: 'static JSON endpoints', key: 'a' },
]

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.getAttribute('role') === 'combobox'
}

export function CommandPalette() {
  const open = useSyncExternalStore(subscribe, () => isOpen, () => false)
  const data = useBoardData()
  const router = useRouter()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const chord = useRef(0)

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')

  /* ---- everything you can jump to ---- */
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = PAGES.map((p) => ({
      id: `page:${p.href}`,
      group: 'Pages',
      label: p.label,
      detail: p.detail,
      hay: `${p.label} ${p.detail} ${p.href}`.toLowerCase(),
      href: p.href,
      key: p.key,
    }))
    const leader = data.systems[0]?.name
    for (const s of data.systems) {
      out.push({
        id: `system:${s.name}`,
        group: 'Systems',
        label: s.name,
        detail: s.kind === 'ranked' ? `rank ${s.rank}` : 'reference · not ranked',
        mono: true,
        hay: `${s.name} system ${s.kind}`.toLowerCase(),
        href: systemHref(s.name),
      })
    }
    for (const s of data.systems) {
      if (!leader || s.name === leader) continue
      out.push({
        id: `compare:${s.name}`,
        group: 'Systems',
        label: `${leader} vs ${s.name}`,
        detail: 'compare',
        mono: true,
        hay: `compare ${leader} vs ${s.name}`.toLowerCase(),
        href: compareHref(leader, s.name),
      })
    }
    data.items.forEach((it) => {
      out.push({
        id: `item:${it.id}`,
        group: 'Items',
        label: it.id,
        detail: `${SPLIT_LABEL[it.split]} · ${it.query}`,
        mono: true,
        hay: `${it.id} ${it.query} ${SPLIT_LABEL[it.split]}`.toLowerCase(),
        href: itemHref(it.id),
      })
    })
    out.push({
      id: 'action:theme',
      group: 'Actions',
      label: 'Switch theme',
      detail: 'light / dark',
      hay: 'switch theme light dark appearance',
      key: 't',
    })
    return out
  }, [data])

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) {
      // nothing typed: pages, systems and actions — the items appear as you type
      return entries.filter((e) => e.group !== 'Items' && !e.id.startsWith('compare:'))
    }
    const hits = entries.filter((e) => terms.every((t) => e.hay.includes(t)))
    // names that start with what was typed come first; items are capped so the list stays short
    const rank = (e: Entry) => (e.label.toLowerCase().startsWith(terms[0]) ? 0 : 1)
    const groups: Entry['group'][] = ['Pages', 'Systems', 'Items', 'Actions']
    return groups.flatMap((g) =>
      hits
        .filter((e) => e.group === g)
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, g === 'Items' ? 8 : 12),
    )
  }, [entries, query])

  const itemHits = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return 0
    return entries.filter((e) => e.group === 'Items' && terms.every((t) => e.hay.includes(t))).length
  }, [entries, query])

  const go = (e: Entry | undefined) => {
    if (!e) return
    setOpen(false)
    if (e.href) router.push(e.href)
    else if (e.id === 'action:theme') toggleTheme()
  }

  /* ---- global shortcuts ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!isOpen)
        return
      }
      if (isOpen || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (e.key === '/') {
        e.preventDefault()
        setOpen(true)
        return
      }
      const now = Date.now()
      if (now - chord.current < 900) {
        chord.current = 0
        const page = PAGES.find((p) => p.key === e.key.toLowerCase())
        if (page) {
          e.preventDefault()
          router.push(page.href)
        }
        return
      }
      if (e.key === 'g') chord.current = now
      else if (e.key === 't') toggleTheme()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleTheme reads the live theme
  }, [router, resolvedTheme])

  /* ---- open / close housekeeping ---- */
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null
      setQuery('')
      setActive(0)
      // after the dialog has painted
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (returnTo.current) {
      returnTo.current.focus?.()
      returnTo.current = null
    }
  }, [open])

  // a navigation closes it
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(results.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(results.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      // the input is the only tab stop: keep focus in the dialog
      e.preventDefault()
    }
  }

  let lastGroup = ''
  return (
    <div className={css.backdrop} onPointerDown={() => setOpen(false)} data-lenis-prevent>
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a page, a system or an item"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={css.inputRow}>
          <span className={css.prompt} aria-hidden="true">
            ›
          </span>
          <input
            ref={inputRef}
            className={css.input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
            aria-label="Search pages, systems and items"
            placeholder={`Jump to a page, a system, or one of ${data.items.length} items…`}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className={css.kbd}>esc</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" aria-label="Results" className={css.list}>
          {results.length === 0 ? (
            <p className={css.empty}>Nothing matches “{query}”.</p>
          ) : (
            results.map((e, i) => {
              const head = e.group !== lastGroup ? e.group : null
              lastGroup = e.group
              return (
                <div key={e.id} role="presentation">
                  {head ? (
                    <div className={css.group} role="presentation">
                      {head}
                      {head === 'Items' && itemHits > 8 ? <span> · 8 of {itemHits}</span> : null}
                    </div>
                  ) : null}
                  <div
                    id={`palette-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    data-entry={e.id}
                    className={css.option}
                    onPointerMove={() => setActive(i)}
                    onClick={() => go(e)}
                  >
                    <span className={`${css.optionLabel} ${e.mono ? css.mono : ''}`}>{e.label}</span>
                    {e.detail ? <span className={css.optionDetail}>{e.detail}</span> : null}
                    {e.key ? (
                      <kbd className={css.kbd} aria-hidden="true">
                        {e.group === 'Pages' ? `g ${e.key}` : e.key}
                      </kbd>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <p className={css.foot} aria-hidden="true">
          <span>
            <kbd className={css.kbd}>↑</kbd> <kbd className={css.kbd}>↓</kbd> move
          </span>
          <span>
            <kbd className={css.kbd}>↵</kbd> open
          </span>
          <span>
            <kbd className={css.kbd}>/</kbd> or <kbd className={css.kbd}>⌘K</kbd> anywhere
          </span>
          <span>
            <kbd className={css.kbd}>g</kbd> then a letter goes straight to a page
          </span>
        </p>
      </div>
    </div>
  )
}
