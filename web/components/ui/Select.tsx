'use client'

import { useEffect, useId, useRef, useState } from 'react'
import css from './select.module.css'

export interface SelectOption<V extends string> {
  value: V
  label: string
  /** Secondary text shown after the label (a rank, a count). */
  hint?: string
}

/** A select-only combobox (WAI-ARIA APG pattern) in the site's glass: a button that
 *  shows the current choice and a listbox that opens under it.
 *
 *  Keyboard: Enter / Space / ArrowDown / ArrowUp open it; arrows, Home and End move;
 *  Enter, Space or Tab choose; Escape closes; typing jumps to the option that starts
 *  with what you typed (open or closed, like a native select). The trigger takes its
 *  name from `labelledBy`, so `getByLabel` and screen readers find it by its label. */
export function Select<V extends string>({
  value,
  options,
  onChange,
  labelledBy,
  className = '',
}: {
  value: V
  options: ReadonlyArray<SelectOption<V>>
  onChange: (value: V) => void
  /** id of the element that labels this control */
  labelledBy: string
  className?: string
}) {
  const uid = useId()
  const listId = `${uid}-list`
  const triggerId = `${uid}-trigger`
  const optionId = (i: number) => `${uid}-opt-${i}`
  const [open, setOpen] = useState(false)
  const selected = Math.max(0, options.findIndex((o) => o.value === value))
  const [active, setActive] = useState(selected)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })

  const openList = (at = selected) => {
    setActive(at)
    setOpen(true)
  }
  const choose = (i: number) => {
    const o = options[i]
    if (o && o.value !== value) onChange(o.value)
    setOpen(false)
  }

  // close on an outside press
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  // keep the active option in view
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const typeahead = (key: string): number => {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 700 ? key : t.text + key
    t.at = now
    const needle = t.text.toLowerCase()
    const from = open ? active : selected
    // a repeated single letter cycles through the options that start with it
    const start = needle.length === 1 ? from + 1 : from
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length
      if (options[i].label.toLowerCase().startsWith(needle)) return i
    }
    return -1
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) openList()
        else setActive((a) => Math.min(last, a + 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        if (!open) openList()
        else setActive((a) => Math.max(0, a - 1))
        return
      case 'Home':
        if (open) {
          e.preventDefault()
          setActive(0)
        }
        return
      case 'End':
        if (open) {
          e.preventDefault()
          setActive(last)
        }
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) choose(active)
        else openList()
        return
      case 'Tab':
        if (open) choose(active)
        return
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
        return
      default:
        if (e.key.length === 1) {
          const i = typeahead(e.key)
          if (i >= 0) {
            if (open) setActive(i)
            else choose(i)
          }
        }
    }
  }

  const current = options[selected]

  return (
    <div ref={rootRef} className={`${css.root} ${className}`} data-open={open}>
      <button
        id={triggerId}
        type="button"
        role="combobox"
        className={css.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={open ? optionId(active) : undefined}
        data-value={value}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={css.value}>
          {current?.label}
          {current?.hint ? <span className={css.hint}> {current.hint}</span> : null}
        </span>
        <span className={css.chevron} aria-hidden="true" />
      </button>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        // named after its trigger, so the field's label points at one control only
        aria-labelledby={triggerId}
        className={css.list}
        hidden={!open}
        data-lenis-prevent
        // keep focus on the trigger while the pointer works the list
        onPointerDown={(e) => e.preventDefault()}
      >
        {options.map((o, i) => (
          <li
            key={o.value}
            id={optionId(i)}
            role="option"
            aria-selected={i === selected}
            data-index={i}
            data-active={i === active}
            className={css.option}
            onPointerEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span className={css.check} aria-hidden="true">
              {i === selected ? '✓' : ''}
            </span>
            <span className={css.optionLabel}>
              {o.label}
              {o.hint ? <span className={css.hint}> {o.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
