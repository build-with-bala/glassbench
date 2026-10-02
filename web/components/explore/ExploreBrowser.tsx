'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ItemSummary, Outcome, Split, SystemRef } from '../../lib/types'
import { OUTCOME_KEYS, OUTCOME_STYLE, SPLIT_KEYS, SPLIT_LABEL } from '../../lib/outcomes'
import { filterItems } from '../../lib/explore'
import { DEFAULT_EXPLORE_FILTERS, exploreQuery, parseExploreFilters, type ExploreFilters } from '../../lib/routes'
import { CopyButton } from '../ui/CopyButton'
import { Select } from '../ui/Select'
import { ItemRow, SystemOrder } from './ItemRow'
import { boardStore } from '../world/store'
import ui from '../platform/ui.module.css'
import css from './explore.module.css'

/** The interactive explorer: filter the items by split, by outcome (for one system or
 *  any), and by text. The filter state lives in the query string, so a view is a link. */
export function ExploreBrowser({ items, systems }: { items: ItemSummary[]; systems: SystemRef[] }) {
  const names = useMemo(() => systems.map((s) => s.system), [systems])
  const searchParams = useSearchParams()
  const urlQuery = searchParams.toString()
  const [filters, setFilters] = useState<ExploreFilters>(() => parseExploreFilters(searchParams, names))
  const [shareUrl, setShareUrl] = useState('')

  // URL → state: back/forward and links into /explore?… re-apply their filters.
  useEffect(() => {
    const fromUrl = parseExploreFilters(new URLSearchParams(urlQuery), names)
    setFilters((prev) => (exploreQuery(prev) === exploreQuery(fromUrl) ? prev : fromUrl))
  }, [urlQuery, names])

  // State → URL: keep the address bar shareable without adding history entries.
  useEffect(() => {
    const query = exploreQuery(filters)
    if (query !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${query}`)
    }
    setShareUrl(`${window.location.origin}${window.location.pathname}${query}`)
  }, [filters])

  const shown = useMemo(() => filterItems(items, filters), [items, filters])
  const isFiltered = exploreQuery(filters) !== ''
  const activeSystem = filters.system !== 'any' ? filters.system : undefined

  // The board mirrors the view: the chosen system's outcomes (plain glass when an
  // outcome is asked of "any system", since no single system's pattern applies) with
  // the listed items lit. Pointing at a row singles out its cell.
  useEffect(() => {
    boardStore.setBase({
      system: activeSystem ?? (filters.outcome !== 'all' ? null : undefined),
      highlight: isFiltered ? { items: shown.map((it) => it.id) } : null,
    })
  }, [shown, isFiltered, activeSystem, filters.outcome])
  useEffect(() => () => boardStore.resetBase(), [])
  const onRowActive = (id: string | null) => boardStore.setPreview(id ? { focus: id } : null)

  const searchId = useId()
  const splitId = useId()
  const outcomeId = useId()
  const systemId = useId()
  const set = (patch: Partial<ExploreFilters>) => setFilters((f) => ({ ...f, ...patch }))

  return (
    <div>
      <form className={ui.controls} role="search" aria-label="Filter items" onSubmit={(e) => e.preventDefault()}>
        <div className={`${ui.field} ${ui.fieldGrow}`}>
          <label className={ui.label} htmlFor={searchId}>
            Search id or query text
          </label>
          <input
            id={searchId}
            className={ui.input}
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. sneakers, postcards, gb-stale"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
        <div className={`${ui.field} ${ui.fieldSelect}`}>
          <span className={ui.label} id={splitId}>
            Split
          </span>
          <Select<Split | 'all'>
            labelledBy={splitId}
            value={filters.split}
            onChange={(split) => set({ split })}
            options={[
              { value: 'all', label: 'All splits' },
              ...SPLIT_KEYS.map((s) => ({ value: s, label: SPLIT_LABEL[s] })),
            ]}
          />
        </div>
        <div className={`${ui.field} ${ui.fieldSelect}`}>
          <span className={ui.label} id={outcomeId}>
            Outcome
          </span>
          <Select<Outcome | 'all'>
            labelledBy={outcomeId}
            value={filters.outcome}
            onChange={(outcome) => set({ outcome })}
            options={[
              { value: 'all', label: 'Any outcome' },
              ...OUTCOME_KEYS.map((o) => ({ value: o, label: OUTCOME_STYLE[o].label })),
            ]}
          />
        </div>
        <div className={`${ui.field} ${ui.fieldSelect}`}>
          <span className={ui.label} id={systemId}>
            For system
          </span>
          <Select
            labelledBy={systemId}
            value={filters.system}
            onChange={(system) => set({ system })}
            options={[
              { value: 'any', label: 'Any system' },
              ...systems.map((s) => ({
                value: s.system,
                label: s.system,
                hint: s.kind === 'reference' ? '(reference)' : undefined,
              })),
            ]}
          />
        </div>
      </form>

      <div className={css.toolbar}>
        <p className={ui.status} role="status" aria-live="polite">
          Showing {shown.length} of {items.length} items
          {filters.outcome !== 'all'
            ? ` — ${OUTCOME_STYLE[filters.outcome].label.toLowerCase()} for ${activeSystem ?? 'at least one system'}`
            : ''}
        </p>
        <div className={ui.buttonRow}>
          {isFiltered ? (
            <button type="button" className={ui.button} onClick={() => setFilters(DEFAULT_EXPLORE_FILTERS)}>
              Clear filters
            </button>
          ) : null}
          {shareUrl ? <CopyButton text={shareUrl} label="copy link to this view" /> : null}
        </div>
      </div>

      <div className={css.keyBlock} style={{ marginTop: '1rem' }}>
        <p className={`${ui.small} ${ui.muted}`} style={{ margin: 0 }}>
          Each row ends with one cell per system, in this order:
        </p>
        <SystemOrder systems={names} activeSystem={activeSystem} />
      </div>

      {shown.length === 0 ? (
        <div className={ui.empty}>
          <p>No items match these filters.</p>
          <button type="button" className={ui.button} onClick={() => setFilters(DEFAULT_EXPLORE_FILTERS)}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className={css.list} style={{ marginTop: '1rem' }}>
          {shown.map((item) => (
            <ItemRow key={item.id} item={item} systems={names} activeSystem={activeSystem} onActive={onRowActive} />
          ))}
        </ul>
      )}
    </div>
  )
}
