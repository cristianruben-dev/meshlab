// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import { DISMISS_COOLDOWN_MS, dismissStarNudge, evaluateStarNudge, markGitHubStarred } from './githubStarNudge'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('githubStarNudge', () => {
  it('shows intermittently across sessions (visits 1, 4, 7) and stays stable within a session', () => {
    const t0 = 1_700_000_000_000

    // Visit 1: shows, and repeated checks in the same session keep returning true
    expect(evaluateStarNudge(t0)).toBe(true)
    expect(evaluateStarNudge(t0)).toBe(true)

    // Visit 2 & 3: hidden
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + 1000)).toBe(false)
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + 2000)).toBe(false)

    // Visit 4: reappears
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + 3000)).toBe(true)
  })

  it('respects the 7-day cooldown after dismissal', () => {
    const t0 = 1_700_000_000_000
    expect(evaluateStarNudge(t0)).toBe(true)

    dismissStarNudge(t0)
    expect(evaluateStarNudge(t0 + 1000)).toBe(false)

    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + DISMISS_COOLDOWN_MS - 1000)).toBe(false)

    // After cooldown expires, counting resumes on subsequent visits
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + DISMISS_COOLDOWN_MS + 1000)).toBe(false) // visit 2
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + DISMISS_COOLDOWN_MS + 2000)).toBe(false) // visit 3
    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + DISMISS_COOLDOWN_MS + 3000)).toBe(true) // visit 4
  })

  it('never shows again once the user opens GitHub to star', () => {
    const t0 = 1_700_000_000_000
    expect(evaluateStarNudge(t0)).toBe(true)
    markGitHubStarred()

    sessionStorage.clear()
    expect(evaluateStarNudge(t0 + DISMISS_COOLDOWN_MS * 10)).toBe(false)
  })
})
