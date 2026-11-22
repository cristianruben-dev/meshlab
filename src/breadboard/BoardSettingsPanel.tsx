// Contract stub: the breadboard unit replaces the body; the workspace shell renders it inside a drawer.
import type { Translate } from '../locale'
import type { BoardSettings } from './settings'

export function BoardSettingsPanel({ t, value, onChange }: { t: Translate; value: BoardSettings; onChange: (value: BoardSettings) => void }) {
  void onChange
  return <div className="board-settings">{t('Breadboard')}: {value.size}</div>
}
