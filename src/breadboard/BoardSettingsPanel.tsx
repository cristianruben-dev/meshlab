import { useId } from 'react'
import { Switch } from '@/components/ui/switch'
import type { Translate } from '../locale'
import { boardShape, tiePoints } from './model'
import { boardSizes, type BoardSettings, type BoardSize } from './settings'
import './settings-panel.css'

const sizeNames: Record<BoardSize, string> = { mini: 'Mini', half: 'Half', full: 'Full' }

/** Board size and optional features; the workspace shell renders it inside a drawer. */
export function BoardSettingsPanel({ t, value, onChange }: { t: Translate; value: BoardSettings; onChange: (value: BoardSettings) => void }) {
  const id = useId()
  const hasRails = value.size !== 'mini'
  const canSplit = value.size === 'full' && value.rails
  const toggles = [
    { key: 'rails', label: 'Power rails', hint: hasRails ? 'Four rails along the long edges.' : 'A mini board has no power rails.', checked: hasRails && value.rails, disabled: !hasRails },
    { key: 'splitRails', label: 'Split power rails', hint: canSplit ? 'Separate the left and right halves of each rail.' : 'Only on a full board with power rails.', checked: canSplit && value.splitRails, disabled: !canSplit },
    { key: 'labels', label: 'Socket labels', hint: 'Row letters and column numbers.', checked: value.labels, disabled: false },
  ] as const

  return <div className="board-settings">
    <fieldset className="board-settings-sizes">
      <legend>{t('Board size')}</legend>
      <div>{boardSizes.map(size => <label key={size} className="board-settings-size">
        <input type="radio" name={`${id}-size`} value={size} checked={value.size === size} onChange={() => onChange({ ...value, size })} />
        <strong>{t(sizeNames[size])}</strong>
        <small><b>{tiePoints(boardShape({ ...value, size, rails: true }))}</b> {t('tie points')}</small>
      </label>)}</div>
    </fieldset>
    {toggles.map(toggle => <div key={toggle.key} className="board-settings-toggle" data-disabled={toggle.disabled || undefined}>
      <div>
        <span id={`${id}-${toggle.key}`}>{t(toggle.label)}</span>
        <small id={`${id}-${toggle.key}-hint`}>{t(toggle.hint)}</small>
      </div>
      <Switch aria-labelledby={`${id}-${toggle.key}`} aria-describedby={`${id}-${toggle.key}-hint`} checked={toggle.checked} disabled={toggle.disabled}
        onCheckedChange={checked => onChange({ ...value, [toggle.key]: checked })} />
    </div>)}
  </div>
}
