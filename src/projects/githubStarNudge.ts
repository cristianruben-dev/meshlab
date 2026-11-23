const STORAGE_KEY = 'meshlab:github-star-nudge'
const SESSION_KEY = 'meshlab:github-star-session'

/** Cooldown duration after dismissing the GitHub star prompt (7 days). */
export const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

type StarNudgeState = {
  visits: number
  starred?: boolean
  dismissedUntil?: number
}

function readState(): StarNudgeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { visits: 0 }
    const parsed = JSON.parse(raw) as Partial<StarNudgeState>
    return {
      visits: typeof parsed.visits === 'number' && Number.isFinite(parsed.visits) && parsed.visits >= 0 ? parsed.visits : 0,
      ...(parsed.starred ? { starred: true } : {}),
      ...(typeof parsed.dismissedUntil === 'number' && Number.isFinite(parsed.dismissedUntil)
        ? { dismissedUntil: parsed.dismissedUntil }
        : {}),
    }
  } catch {
    return { visits: 0 }
  }
}

function writeState(state: StarNudgeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* Storage is optional. */ }
}

function readSessionDecision(): boolean | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
    return null
  } catch {
    return null
  }
}

function writeSessionDecision(show: boolean) {
  try {
    sessionStorage.setItem(SESSION_KEY, show ? '1' : '0')
  } catch { /* Session storage is optional. */ }
}

/**
 * Decide whether to show the occasional GitHub star pill on the Home screen.
 * - Never shows after the user clicks the star link (`starred: true`).
 * - Respects a 7-day cooldown after dismissal.
 * - Counts once per browser tab session and appears intermittently (visits 1, 4, 7, …).
 */
export function evaluateStarNudge(now = Date.now()): boolean {
  const state = readState()
  if (state.starred) {
    writeSessionDecision(false)
    return false
  }
  if (state.dismissedUntil && now < state.dismissedUntil) {
    writeSessionDecision(false)
    return false
  }

  const cached = readSessionDecision()
  if (cached !== null) return cached

  const visits = state.visits + 1
  writeState({ ...state, visits })
  const show = visits === 1 || visits % 3 === 1
  writeSessionDecision(show)
  return show
}

export function dismissStarNudge(now = Date.now()) {
  const state = readState()
  writeState({ ...state, dismissedUntil: now + DISMISS_COOLDOWN_MS })
  writeSessionDecision(false)
}

export function markGitHubStarred() {
  const state = readState()
  writeState({ ...state, starred: true })
  writeSessionDecision(false)
}
