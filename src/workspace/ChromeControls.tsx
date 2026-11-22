import { Languages, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Language, Translate } from '../locale'
import type { ThemePreference } from '../theme'

const themeOptions = [
  ['system', Monitor, 'System theme'],
  ['light', Sun, 'Light theme'],
  ['dark', Moon, 'Dark theme'],
] as const

export function ThemeSwitch({
  value,
  onChange,
  t,
}: {
  value: ThemePreference
  onChange: (value: ThemePreference) => void
  t: Translate
}) {
  return (
    <div className="segmented theme-switch" role="group" aria-label={t('Theme')}>
      {themeOptions.map(([option, Icon, label]) => (
        <Tooltip key={option}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t(label)}
                aria-pressed={value === option}
                onClick={() => onChange(option)}
              />
            }
          >
            <Icon />
          </TooltipTrigger>
          <TooltipContent side="bottom">{t(label)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export function LanguageSelect({
  value,
  onChange,
  t,
}: {
  value: Language
  onChange: (value: Language) => void
  t: Translate
}) {
  return (
    <Select
      items={{ en: 'English', es: 'Español' }}
      value={value}
      onValueChange={next => {
        if (next === 'en' || next === 'es') onChange(next)
      }}
    >
      <SelectTrigger className="locale-trigger" aria-label={t('Language')}>
        <Languages size={15} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en" lang="en">English</SelectItem>
        <SelectItem value="es" lang="es">Español</SelectItem>
      </SelectContent>
    </Select>
  )
}
