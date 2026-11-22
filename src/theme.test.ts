// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readThemePreference, resolveTheme, themeKey } from './theme'

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('theme preference', () => {
  it('defaults to the system preference when nothing valid is saved', () => {
    expect(readThemePreference()).toBe('system')
    localStorage.setItem(themeKey, 'sepia')
    expect(readThemePreference()).toBe('system')
    localStorage.setItem(themeKey, 'light')
    expect(readThemePreference()).toBe('light')
  })

  it('resolves system to the operating system scheme and keeps explicit choices', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark')
    expect(resolveTheme('system', 'light')).toBe('light')
    expect(resolveTheme('light', 'dark')).toBe('light')
    expect(resolveTheme('dark', 'light')).toBe('dark')
  })

  it('reads the system scheme from matchMedia', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark'), addEventListener() {}, removeEventListener() {} }))
    expect(resolveTheme('system')).toBe('dark')
  })

  it('applies the dark class and color scheme to the document', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
