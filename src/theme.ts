import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const themeKey = 'meshlab:theme'
const query = '(prefers-color-scheme: dark)'
const chrome: Record<Theme, string> = { light: '#f5f7fa', dark: '#0a0f17' }

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(themeKey)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch { return 'system' }
}

export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia(query).matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference, system: Theme = systemTheme()): Theme {
  return preference === 'system' ? system : preference
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome[theme])
}

/** Persists an explicit choice; "system" removes it so the OS preference applies again. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference)
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme = resolveTheme(preference, system)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia(query)
    const change = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener?.('change', change)
    return () => media.removeEventListener?.('change', change)
  }, [])
  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    try {
      if (preference === 'system') localStorage.removeItem(themeKey)
      else localStorage.setItem(themeKey, preference)
    } catch { /* Storage is optional. */ }
  }, [preference])
  return { preference, setPreference, theme }
}
