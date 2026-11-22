import { validateCircuit } from '../circuit/model'
import type { WorkspaceRepository } from './repository'
import type { Project } from './types'

export const LEGACY_CIRCUIT_KEY = 'meshlab:circuit:v1'
export const MIGRATION_DONE_KEY = 'meshlab:workspace:migrated:v1'

export async function migrateLegacyCircuit(
  repo: WorkspaceRepository,
  options?: { defaultName?: string; defaultDescription?: string },
): Promise<Project | null> {
  let alreadyMigrated = false
  try {
    alreadyMigrated = localStorage.getItem(MIGRATION_DONE_KEY) === '1'
  } catch {
    return null
  }
  if (alreadyMigrated) return null

  const existing = await repo.loadAll()
  if (existing.projects.length > 0) {
    try { localStorage.setItem(MIGRATION_DONE_KEY, '1') } catch { /* Storage is optional. */ }
    return null
  }

  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_CIRCUIT_KEY)
  } catch {
    return null
  }
  if (!raw) {
    try { localStorage.setItem(MIGRATION_DONE_KEY, '1') } catch { /* Storage is optional. */ }
    return null
  }

  try {
    const circuit = validateCircuit(JSON.parse(raw))
    const migrated = await repo.createProject({
      name: options?.defaultName ?? 'Recovered Circuit',
      description: options?.defaultDescription ?? 'Migrated from previous local autosave.',
      circuit,
      preferredView: 'schematic',
    })
    try { localStorage.setItem(MIGRATION_DONE_KEY, '1') } catch { /* Storage is optional. */ }
    return migrated
  } catch {
    try { localStorage.setItem(MIGRATION_DONE_KEY, '1') } catch { /* Storage is optional. */ }
    return null
  }
}
