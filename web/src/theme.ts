import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'theme'
const THEME_COLOR: Record<Theme, string> = { light: '#c8442f', dark: '#221912' }
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref = readPref()

const resolve = (p: ThemePref): Theme =>
  p === 'system' ? (systemDark.matches ? 'dark' : 'light') : p

/** Same logic as the inline script in index.html, which runs before first paint. */
function apply() {
  const theme = resolve(pref)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  for (const l of listeners) l()
}

systemDark.addEventListener('change', () => {
  if (pref === 'system') apply()
})
apply()

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    // Private mode etc.: the choice just won't survive a reload.
  }
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The stored preference and what it resolves to right now. */
export function useTheme(): { pref: ThemePref; theme: Theme } {
  const p = useSyncExternalStore(subscribe, () => pref)
  const theme = useSyncExternalStore(subscribe, () => resolve(pref))
  return { pref: p, theme }
}
