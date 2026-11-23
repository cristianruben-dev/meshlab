import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, Palette, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Language, Translate } from '../locale'
import {
  bandCodeToColors,
  COLOR_BY_ID,
  COMMON_RESISTOR_VALUES,
  convertBandCount,
  decodeResistorBands,
  DIGIT_COLORS,
  encodeResistance,
  findNearestStandard,
  FIRST_DIGIT_COLORS,
  formatOhms,
  MULTIPLIER_COLORS,
  parseResistanceInput,
  RESISTOR_COLORS,
  resistorHexBands,
  TOLERANCE_COLORS,
  type BandCount,
  type ColorId,
  type DigitColorId,
  type ResistorBandCode,
  type ResistorColorSpec,
  type ToleranceColorId,
} from './resistorColor'

type ToolMode = 'colors' | 'value'

type BandDescriptor = {
  index: number
  kind: 'first-digit' | 'digit' | 'multiplier' | 'tolerance'
  label: string
  shortLabel: string
  colorId: ColorId
  options: readonly ResistorColorSpec[]
  callout: string
}

function getBandDescriptors(code: ResistorBandCode, t: Translate): BandDescriptor[] {
  const digitLabels = code.bandCount === 4
    ? [t('1st digit'), t('2nd digit')]
    : [t('1st digit'), t('2nd digit'), t('3rd digit')]

  const bands: BandDescriptor[] = code.digits.map((colorId, idx) => {
    const spec = COLOR_BY_ID[colorId]
    return {
      index: idx,
      kind: idx === 0 ? 'first-digit' : 'digit',
      label: digitLabels[idx],
      shortLabel: `B${idx + 1}`,
      colorId,
      options: idx === 0 ? FIRST_DIGIT_COLORS : DIGIT_COLORS,
      callout: code.bandCount === 5 ? `B${idx + 1}:${spec.digit}` : `B${idx + 1} · ${spec.digit}`,
    }
  })

  const multSpec = COLOR_BY_ID[code.multiplier]
  const multExp = multSpec.exponent
  const multCallout = multExp === -2 ? '×10⁻²' : multExp === -1 ? '×10⁻¹' : `×10${toSuperscript(multExp)}`
  bands.push({
    index: code.digits.length,
    kind: 'multiplier',
    label: t('Multiplier'),
    shortLabel: t('Mult'),
    colorId: code.multiplier,
    options: MULTIPLIER_COLORS,
    callout: multCallout,
  })

  const tolSpec = COLOR_BY_ID[code.tolerance]
  bands.push({
    index: code.digits.length + 1,
    kind: 'tolerance',
    label: t('Tolerance'),
    shortLabel: t('Tol'),
    colorId: code.tolerance,
    options: TOLERANCE_COLORS,
    callout: tolSpec.toleranceLabel ?? '±5%',
  })

  return bands
}

function toSuperscript(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(n).split('').map(ch => map[ch] ?? ch).join('')
}

function updateBandColor(code: ResistorBandCode, bandIndex: number, colorId: ColorId): ResistorBandCode {
  if (bandIndex < code.digits.length) {
    const nextDigits = [...code.digits]
    nextDigits[bandIndex] = colorId as DigitColorId
    if (code.bandCount === 4) {
      return { ...code, digits: nextDigits as [DigitColorId, DigitColorId] }
    }
    return { ...code, digits: nextDigits as [DigitColorId, DigitColorId, DigitColorId] }
  }
  if (bandIndex === code.digits.length) {
    return { ...code, multiplier: colorId }
  }
  return { ...code, tolerance: colorId as ToleranceColorId }
}

function initialCodeForOhms(ohms?: number): ResistorBandCode {
  if (ohms !== undefined && ohms > 0 && Number.isFinite(ohms)) {
    const four = encodeResistance(ohms, 4, 'gold')
    if (four.isExact) return four.code
    const five = encodeResistance(ohms, 5, 'brown')
    if (five.isExact) return five.code
    return four.code
  }
  return {
    bandCount: 4,
    digits: ['yellow', 'violet'],
    multiplier: 'red',
    tolerance: 'gold',
  }
}

export function ResistorSvg({
  code,
  activeBand,
  onSelectBand,
  t,
}: {
  code: ResistorBandCode
  activeBand: number
  onSelectBand: (index: number) => void
  t: Translate
}) {
  const uid = useId().replace(/:/g, '')
  const bands = useMemo(() => getBandDescriptors(code, t), [code, t])
  const isFive = code.bandCount === 5
  // Band horizontal positions & heights follow the axial ceramic dogbone contour
  const geometry = isFive
    ? [
        { x: 136, y: 15, w: 16, h: 68 },
        { x: 178, y: 20, w: 16, h: 58 },
        { x: 220, y: 20, w: 16, h: 58 },
        { x: 262, y: 20, w: 16, h: 58 },
        { x: 326, y: 15, w: 16, h: 68 },
      ]
    : [
        { x: 148, y: 15, w: 18, h: 68 },
        { x: 196, y: 20, w: 18, h: 58 },
        { x: 244, y: 20, w: 18, h: 58 },
        { x: 320, y: 15, w: 18, h: 68 },
      ]

  const decoded = decodeResistorBands(code)
  const ariaLabel = `${t('Resistor')}: ${formatOhms(decoded.ohms)} ±${decoded.tolerancePercent}% (${code.bandCount} ${t('bands')})`

  return (
    <svg
      className="resistor-svg"
      viewBox="0 0 480 116"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={`${uid}-lead`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e9ef" />
          <stop offset="48%" stopColor="#9aa3ad" />
          <stop offset="100%" stopColor="#64707d" />
        </linearGradient>
        <linearGradient id={`${uid}-body4`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d9ae" />
          <stop offset="28%" stopColor="#e3c28c" />
          <stop offset="76%" stopColor="#c9a369" />
          <stop offset="100%" stopColor="#9f7d4c" />
        </linearGradient>
        <linearGradient id={`${uid}-body5`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#89c5eb" />
          <stop offset="30%" stopColor="#5aa3d6" />
          <stop offset="76%" stopColor="#3c7fb3" />
          <stop offset="100%" stopColor="#285b86" />
        </linearGradient>
        <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {/* Metallic axial leads */}
      <rect x="14" y="45" width="98" height="8" rx="4" fill={`url(#${uid}-lead)`} />
      <rect x="368" y="45" width="98" height="8" rx="4" fill={`url(#${uid}-lead)`} />

      {/* Ceramic body */}
      <path
        d="M112 22 C112 16 122 14 134 14 L158 14 C170 14 176 20 186 20 L294 20 C304 20 310 14 322 14 L346 14 C358 14 368 16 368 22 L368 76 C368 82 358 84 346 84 L322 84 C310 84 304 78 294 78 L186 78 C176 78 170 84 158 84 L134 84 C122 84 112 82 112 76 Z"
        fill={`url(#${uid}-${isFive ? 'body5' : 'body4'})`}
        stroke="rgba(0,0,0,0.24)"
        strokeWidth="1"
      />

      {/* Interactive color bands */}
      {bands.map((band, i) => {
        const g = geometry[i]
        const spec = COLOR_BY_ID[band.colorId]
        const isActive = activeBand === i
        const needsBorder = band.colorId === 'white' || band.colorId === 'black'
        return (
          <g
            key={`${code.bandCount}-${i}`}
            className={isActive ? 'resistor-band-hit resistor-band-active' : 'resistor-band-hit'}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            aria-label={`${band.label}: ${t(spec.name)}`}
            onClick={() => onSelectBand(i)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectBand(i)
              }
            }}
          >
            {/* Generous transparent click target */}
            <rect x={g.x - 6} y={10} width={g.w + 12} height={80} fill="transparent" />
            <rect
              x={g.x}
              y={g.y}
              width={g.w}
              height={g.h}
              rx={g.h > 60 ? 2 : 1}
              fill={spec.hex}
              stroke={needsBorder ? 'rgba(128,128,128,0.45)' : 'rgba(0,0,0,0.14)'}
              strokeWidth="0.75"
            />
            {isActive && (
              <rect
                x={g.x - 3}
                y={g.y - 3}
                width={g.w + 6}
                height={g.h + 6}
                rx="4"
                fill="none"
                stroke="var(--brand)"
                strokeWidth="2.2"
                strokeDasharray="4 2"
              />
            )}
            <text
              x={g.x + g.w / 2}
              y={104}
              textAnchor="middle"
              className={isActive ? 'resistor-callout resistor-callout-active' : 'resistor-callout'}
            >
              {band.callout}
            </text>
          </g>
        )
      })}

      {/* Specular gloss highlight (non-interactive) */}
      <path
        d="M120 22 C130 18 152 18 172 22 L308 22 C328 18 350 18 360 22 L360 32 L120 32 Z"
        fill={`url(#${uid}-gloss)`}
        pointerEvents="none"
      />
    </svg>
  )
}

/** Compact inline preview used inside the Workbench Inspector when a resistor is selected. */
export function ResistorMiniPreview({
  ohms,
  t,
  onClick,
}: {
  ohms: number
  t: Translate
  onClick: () => void
}) {
  const encoded = useMemo(() => encodeResistance(ohms, 4, 'gold'), [ohms])
  const hexes = useMemo(() => resistorHexBands(ohms, 4, 'gold'), [ohms])
  const names = useMemo(
    () => bandCodeToColors(encoded.code).map(id => t(COLOR_BY_ID[id].name)).join(' · '),
    [encoded.code, t],
  )

  return (
    <button
      type="button"
      className="resistor-mini-card"
      onClick={onClick}
      aria-label={`${t('Color code')}: ${names}`}
    >
      <div className="resistor-mini-top">
        <span className="resistor-mini-label">
          <Palette size={12} aria-hidden="true" />
          {t('Color code')}
        </span>
        <ChevronRight size={13} className="resistor-mini-chevron" aria-hidden="true" />
      </div>
      <svg className="resistor-mini-svg" viewBox="0 0 180 34" aria-hidden="true">
        <rect x="4" y="15" width="34" height="4" rx="2" fill="#9aa3ad" />
        <rect x="142" y="15" width="34" height="4" rx="2" fill="#9aa3ad" />
        <rect x="36" y="6" width="108" height="22" rx="7" fill="#dfc08b" stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
        <rect x="52" y="6.5" width="9" height="21" fill={hexes[0]} />
        <rect x="72" y="6.5" width="9" height="21" fill={hexes[1]} />
        <rect x="92" y="6.5" width="9" height="21" fill={hexes[2]} />
        <rect x="122" y="6.5" width="9" height="21" fill={hexes[3]} />
        <rect x="40" y="9" width="100" height="4" rx="2" fill="rgba(255,255,255,0.28)" />
      </svg>
      <span className="resistor-mini-names">{names}</span>
    </button>
  )
}

export type ResistorColorModalProps = {
  open: boolean
  initialOhms?: number
  targetResistorLabel?: string
  language: Language
  t: Translate
  onClose: () => void
  onApplyToResistor?: (ohms: number) => void
  onAddResistor?: (ohms: number) => void
}

export function ResistorColorModal({
  open,
  initialOhms,
  targetResistorLabel,
  language,
  t,
  onClose,
  onApplyToResistor,
  onAddResistor,
}: ResistorColorModalProps) {
  const [mode, setMode] = useState<ToolMode>('colors')
  const [code, setCode] = useState<ResistorBandCode>(() => initialCodeForOhms(initialOhms))
  const [activeBand, setActiveBand] = useState(0)
  const [valueDraft, setValueDraft] = useState(() => formatOhms(decodeResistorBands(initialCodeForOhms(initialOhms)).ohms))
  const [inputInvalid, setInputInvalid] = useState(false)
  const [requestedOhms, setRequestedOhms] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const valueInputRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const nextCode = initialCodeForOhms(initialOhms)
    const nextDecoded = decodeResistorBands(nextCode)
    setCode(nextCode)
    setActiveBand(0)
    setValueDraft(formatOhms(initialOhms !== undefined && initialOhms > 0 ? initialOhms : nextDecoded.ohms))
    setInputInvalid(false)
    setRequestedOhms(initialOhms !== undefined && initialOhms > 0 && Math.abs(nextDecoded.ohms - initialOhms) / initialOhms > 1e-4 ? initialOhms : null)
    setCopied(false)
    setMode('colors')
  }, [open, initialOhms])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  useEffect(() => {
    if (open && mode === 'value') {
      valueInputRef.current?.focus()
      valueInputRef.current?.select()
    }
  }, [open, mode])

  const bands = useMemo(() => getBandDescriptors(code, t), [code, t])
  const safeActiveBand = Math.min(activeBand, bands.length - 1)
  const currentBand = bands[safeActiveBand]
  const decoded = useMemo(() => decodeResistorBands(code), [code])
  const standardLookup = useMemo(() => findNearestStandard(requestedOhms ?? decoded.ohms), [requestedOhms, decoded.ohms])

  if (!open) return null

  const formattedNominal = formatOhms(decoded.ohms)
  const formattedExactOhms = `${decoded.ohms.toLocaleString(language, { maximumFractionDigits: 4 })} Ω`
  const formattedRange = `${formatOhms(decoded.minOhms)} – ${formatOhms(decoded.maxOhms)}`

  function handleBandCountChange(nextCount: BandCount) {
    if (nextCount === code.bandCount) return
    const targetOhms = requestedOhms ?? decoded.ohms
    const converted = requestedOhms
      ? encodeResistance(
          targetOhms,
          nextCount,
          nextCount === 5 && code.tolerance === 'gold'
            ? 'brown'
            : nextCount === 4 && code.tolerance === 'brown'
              ? 'gold'
              : code.tolerance,
        ).code
      : convertBandCount(code, nextCount)
    const nextDecoded = decodeResistorBands(converted)
    setCode(converted)
    setActiveBand(prev => Math.min(prev, nextCount - 1))
    setValueDraft(formatOhms(nextDecoded.ohms))
    setInputInvalid(false)
    setRequestedOhms(
      requestedOhms !== null && Math.abs(nextDecoded.ohms - requestedOhms) / requestedOhms > 1e-4
        ? requestedOhms
        : null,
    )
  }

  function handleColorPick(colorId: ColorId) {
    const next = updateBandColor(code, safeActiveBand, colorId)
    const nextDecoded = decodeResistorBands(next)
    setCode(next)
    setValueDraft(formatOhms(nextDecoded.ohms))
    setInputInvalid(false)
    setRequestedOhms(null)
  }

  function handleValueInputChange(raw: string) {
    setValueDraft(raw)
    if (!raw.trim()) {
      setInputInvalid(false)
      setRequestedOhms(null)
      return
    }
    const parsed = parseResistanceInput(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setInputInvalid(true)
      return
    }
    setInputInvalid(false)
    const encoded = encodeResistance(parsed, code.bandCount, code.tolerance)
    setCode(encoded.code)
    setRequestedOhms(encoded.isExact ? null : parsed)
  }

  function applyStandardValue(ohms: number) {
    const encoded = encodeResistance(ohms, code.bandCount, code.tolerance)
    setCode(encoded.code)
    setValueDraft(formatOhms(ohms))
    setInputInvalid(false)
    setRequestedOhms(encoded.isExact ? null : ohms)
  }

  function handleTolerancePick(tolerance: ToleranceColorId) {
    setCode(prev => ({ ...prev, tolerance }))
  }

  async function handleCopy() {
    const text = formattedNominal
    try {
      await navigator.clipboard?.writeText(text)
    } catch { /* Clipboard may be unavailable in restricted contexts. */ }
    setCopied(true)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
  }

  const formatDiff = (diff: number) => {
    const rounded = Number(diff.toFixed(1))
    return `${rounded > 0 ? '+' : ''}${rounded}%`
  }

  const canUpgradeToFiveBands =
    code.bandCount === 4 &&
    requestedOhms !== null &&
    encodeResistance(requestedOhms, 5, 'brown').isExact

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Resistor color code')}
        className="modal-card resistor-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title-group">
            <span className="modal-icon"><Palette size={16} /></span>
            <div className="resistor-head-text">
              <h2>{t('Resistor color code')}</h2>
              <small>{t('IEC 60062 · 4 & 5 bands')}</small>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t('Close dialog')} onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        <div className="modal-body resistor-modal-body">
          {/* Top segmented controls: Mode & Band Count */}
          <div className="resistor-controls-row">
            <div className="resistor-segmented" role="group" aria-label={t('Calculator mode')}>
              <button
                type="button"
                className={mode === 'colors' ? 'resistor-seg-btn resistor-seg-active' : 'resistor-seg-btn'}
                aria-pressed={mode === 'colors'}
                onClick={() => setMode('colors')}
              >
                {t('Colors → Value')}
              </button>
              <button
                type="button"
                className={mode === 'value' ? 'resistor-seg-btn resistor-seg-active' : 'resistor-seg-btn'}
                aria-pressed={mode === 'value'}
                onClick={() => setMode('value')}
              >
                {t('Value → Colors')}
              </button>
            </div>

            <div className="resistor-segmented" role="group" aria-label={t('Number of bands')}>
              <button
                type="button"
                className={code.bandCount === 4 ? 'resistor-seg-btn resistor-seg-active' : 'resistor-seg-btn'}
                aria-pressed={code.bandCount === 4}
                onClick={() => handleBandCountChange(4)}
              >
                {t('4 bands')}
              </button>
              <button
                type="button"
                className={code.bandCount === 5 ? 'resistor-seg-btn resistor-seg-active' : 'resistor-seg-btn'}
                aria-pressed={code.bandCount === 5}
                onClick={() => handleBandCountChange(5)}
              >
                {t('5 bands')}
              </button>
            </div>
          </div>

          {/* Value -> Colors dedicated input section when in value mode */}
          {mode === 'value' && (
            <section className="resistor-value-box" aria-label={t('Value → Colors')}>
              <div className="resistor-value-row">
                <label className="resistor-value-field">
                  <span>{t('Resistance value')}</span>
                  <Input
                    ref={valueInputRef}
                    value={valueDraft}
                    aria-label={t('Resistance value')}
                    aria-invalid={inputInvalid}
                    placeholder={t('e.g. 4.7 kΩ, 4k7, 330 Ω')}
                    onChange={event => handleValueInputChange(event.target.value)}
                  />
                </label>

                <div className="resistor-tol-quick" role="group" aria-label={t('Tolerance')}>
                  <span className="resistor-mini-field-label">{t('Tolerance')}</span>
                  <div className="resistor-tol-pills">
                    {(['gold', 'brown', 'red', 'green', 'silver'] as ToleranceColorId[]).map(tolId => {
                      const spec = COLOR_BY_ID[tolId]
                      const active = code.tolerance === tolId
                      return (
                        <button
                          key={tolId}
                          type="button"
                          className={active ? 'resistor-swatch-btn resistor-swatch-active' : 'resistor-swatch-btn'}
                          aria-pressed={active}
                          onClick={() => handleTolerancePick(tolId)}
                        >
                          <span className="resistor-dot" style={{ background: spec.hex }} />
                          <span>{spec.toleranceLabel}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {inputInvalid && (
                <p className="form-error">{t('Enter a positive resistance like 330, 4.7 kΩ, or 4k7.')}</p>
              )}

              {requestedOhms !== null && !inputInvalid && (
                <div className="resistor-round-note" role="status">
                  <span>
                    {t('Closest band code')}: <strong>{formattedNominal}</strong>
                    {' '}({t('requested')} {formatOhms(requestedOhms)})
                  </span>
                  {canUpgradeToFiveBands && (
                    <Button variant="outline" size="xs" onClick={() => handleBandCountChange(5)}>
                      {t('Use 5 bands for exact match')}
                    </Button>
                  )}
                </div>
              )}

              <div className="resistor-presets" role="group" aria-label={t('Presets')}>
                <span className="resistor-presets-label">{t('Presets')}:</span>
                {COMMON_RESISTOR_VALUES.map(val => {
                  const active = Math.abs(decoded.ohms - val) / val < 1e-6 && requestedOhms === null
                  return (
                    <button
                      key={val}
                      type="button"
                      className={active ? 'resistor-preset-chip resistor-preset-active' : 'resistor-preset-chip'}
                      onClick={() => applyStandardValue(val)}
                    >
                      {formatOhms(val)}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Interactive SVG Resistor Stage */}
          <div className="resistor-stage">
            <ResistorSvg
              code={code}
              activeBand={safeActiveBand}
              onSelectBand={index => {
                setActiveBand(index)
                if (mode === 'value') setMode('colors')
              }}
              t={t}
            />
          </div>

          {/* Readout Metrics */}
          <div className="resistor-readout-grid">
            <div className="resistor-metric">
              <span className="resistor-metric-label">{t('Nominal')}</span>
              <strong className="resistor-metric-value resistor-metric-primary">
                {formattedNominal} <span className="resistor-metric-tol">±{decoded.tolerancePercent}%</span>
              </strong>
              <span className="resistor-metric-sub">{formattedExactOhms}</span>
            </div>

            <div className="resistor-metric">
              <span className="resistor-metric-label">{t('Range')}</span>
              <strong className="resistor-metric-value resistor-metric-range">{formattedRange}</strong>
              <span className="resistor-metric-sub">±{formatOhms(decoded.deltaOhms)}</span>
            </div>

            <div className="resistor-metric">
              <span className="resistor-metric-label">{t('Series E12 / E24')}</span>
              {standardLookup ? (
                standardLookup.exactSeries ? (
                  <>
                    <strong className="resistor-metric-value resistor-metric-range">
                      {formatOhms(standardLookup.e24.value)}
                    </strong>
                    <span className="resistor-std-badge">
                      <Check size={11} aria-hidden="true" />
                      {standardLookup.exactSeries === 'E12' ? 'E12 / E24' : 'E24'}
                    </span>
                  </>
                ) : (
                  <div className="resistor-std-suggestions">
                    <button
                      type="button"
                      className="resistor-std-chip"
                      onClick={() => applyStandardValue(standardLookup.e24.value)}
                      title={t('Use nearest standard value')}
                    >
                      <span>E24: <strong>{formatOhms(standardLookup.e24.value)}</strong></span>
                      <small>{formatDiff(standardLookup.e24.diffPercent)}</small>
                    </button>
                    {standardLookup.e12.value !== standardLookup.e24.value && (
                      <button
                        type="button"
                        className="resistor-std-chip"
                        onClick={() => applyStandardValue(standardLookup.e12.value)}
                        title={t('Use nearest standard value')}
                      >
                        <span>E12: <strong>{formatOhms(standardLookup.e12.value)}</strong></span>
                        <small>{formatDiff(standardLookup.e12.diffPercent)}</small>
                      </button>
                    )}
                  </div>
                )
              ) : (
                <span className="resistor-metric-sub">—</span>
              )}
            </div>
          </div>

          {/* Band Cards + Swatch Palette */}
          {mode === 'colors' && (
            <>
              <div
                className={code.bandCount === 5 ? 'resistor-bands-grid resistor-bands-grid-5' : 'resistor-bands-grid'}
                role="tablist"
                aria-label={t('Resistor bands')}
              >
                {bands.map((band, idx) => {
                  const spec = COLOR_BY_ID[band.colorId]
                  const selected = safeActiveBand === idx
                  const codeText =
                    band.kind === 'multiplier'
                      ? spec.multiplierLabel
                      : band.kind === 'tolerance'
                        ? (spec.toleranceLabel ?? '')
                        : String(spec.digit)
                  return (
                    <button
                      key={`${code.bandCount}-${idx}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={selected ? 'resistor-band-card resistor-band-card-active' : 'resistor-band-card'}
                      onClick={() => setActiveBand(idx)}
                    >
                      <span className="resistor-band-card-head">
                        <span>{band.label}</span>
                        <span className="resistor-band-code">{codeText}</span>
                      </span>
                      <span className="resistor-band-card-color">
                        <span className="resistor-dot" style={{ background: spec.hex }} />
                        <span>{t(spec.name)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="resistor-swatches-panel" role="group" aria-label={`${t('Select color')}: ${currentBand.label}`}>
                <div className="resistor-swatches-head">
                  <span>{currentBand.label}</span>
                </div>
                <div className="resistor-swatches-grid">
                  {currentBand.options.map(spec => {
                    const active = currentBand.colorId === spec.id
                    const valueTag =
                      currentBand.kind === 'multiplier'
                        ? spec.multiplierLabel
                        : currentBand.kind === 'tolerance'
                          ? (spec.toleranceLabel ?? '')
                          : String(spec.digit)
                    return (
                      <button
                        key={spec.id}
                        type="button"
                        className={active ? 'resistor-swatch-btn resistor-swatch-active' : 'resistor-swatch-btn'}
                        aria-pressed={active}
                        onClick={() => handleColorPick(spec.id)}
                      >
                        <span className="resistor-dot" style={{ background: spec.hex }} />
                        <span className="resistor-swatch-name">{t(spec.name)}</span>
                        <span className="resistor-swatch-val">{valueTag}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Collapsible IEC 60062 Color Reference Table */}
          <details className="resistor-ref-details">
            <summary>{t('IEC 60062 reference')}</summary>
            <div className="resistor-ref-table-wrap">
              <table className="resistor-ref-table">
                <thead>
                  <tr>
                    <th>{t('Color')}</th>
                    <th>{t('Digit')}</th>
                    <th>{t('Multiplier')}</th>
                    <th>{t('Tolerance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {RESISTOR_COLORS.map(spec => (
                    <tr key={spec.id}>
                      <td>
                        <span className="resistor-ref-color">
                          <span className="resistor-dot" style={{ background: spec.hex }} />
                          {t(spec.name)}
                        </span>
                      </td>
                      <td>{spec.digit !== null ? spec.digit : '—'}</td>
                      <td>{spec.multiplierLabel}</td>
                      <td>{spec.toleranceLabel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="modal-foot resistor-modal-foot">
          <div className="resistor-foot-left">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('Copied') : t('Copy value')}
            </Button>
          </div>
          <div className="resistor-foot-right">
            {onAddResistor && (
              <Button
                type="button"
                variant={onApplyToResistor && targetResistorLabel ? 'outline' : 'default'}
                size="sm"
                onClick={() => {
                  onAddResistor(decoded.ohms)
                  onClose()
                }}
              >
                <Plus size={14} />
                {t('Add to circuit')}
              </Button>
            )}
            {onApplyToResistor && targetResistorLabel && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onApplyToResistor(decoded.ohms)
                  onClose()
                }}
              >
                <Check size={14} />
                {t('Apply to')} {targetResistorLabel}
              </Button>
            )}
            {!onAddResistor && !onApplyToResistor && (
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {t('Close')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
