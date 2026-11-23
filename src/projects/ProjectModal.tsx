import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CircuitBoard, Folder as FolderIcon, Sparkles, Waypoints, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { autoPlaceCircuit } from '../breadboard/compiler'
import { boardShape, tiePoints } from '../breadboard/model'
import { boardSizes, defaultBoardSettings, type BoardSettings, type BoardSize } from '../breadboard/settings'
import { examples } from '../circuit/examples'
import type { Circuit } from '../circuit/model'
import type { Translate } from '../locale'
import type { Palette } from '../palette'
import {
  blankCircuit,
  boardSettingsForSize,
  type Folder,
  type PreferredView,
  type Project,
} from '../storage/types'
import { CircuitPreview } from './CircuitPreview'
import { BlankStartArt, BoardSizeArt, BreadboardTypeArt, SchematicTypeArt, TemplateStartArt } from './WizardArt'

const templateNames = Object.keys(examples)
const sizeNames: Record<BoardSize, string> = { mini: 'Mini', half: 'Half', full: 'Full' }
const sizeHints: Record<BoardSize, string> = {
  mini: '17 columns · no power rails',
  half: '30 columns · 4 power rails',
  full: '63 columns · 4 power rails',
}

export type StartingPoint = 'blank-schematic' | 'blank-board' | 'template'
type WizardStep = 'type' | 'size' | 'start' | 'details'

export type ProjectModalSubmit = {
  name: string
  description: string
  folderId: string | null
  preferredView: PreferredView
  boardSettings?: BoardSettings
  circuit?: Circuit
}

type ProjectModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialProject?: Project
  defaultFolderId?: string | null
  defaultStartingPoint?: StartingPoint
  defaultTemplate?: string
  folders: Folder[]
  palette: Palette
  t: Translate
  onSubmit: (data: ProjectModalSubmit) => void | Promise<void>
  onClose: () => void
}

export function ProjectModal({
  open,
  mode,
  initialProject,
  defaultFolderId = null,
  defaultStartingPoint = 'blank-schematic',
  defaultTemplate = templateNames[0],
  folders,
  palette,
  t,
  onSubmit,
  onClose,
}: ProjectModalProps) {
  const [step, setStep] = useState<WizardStep>('type')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [projectType, setProjectType] = useState<PreferredView>('schematic')
  const [boardSize, setBoardSize] = useState<BoardSize>('half')
  const [splitRails, setSplitRails] = useState(false)
  const [startFromTemplate, setStartFromTemplate] = useState(false)
  const [templateName, setTemplateName] = useState<string>(templateNames[0])
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const steps: WizardStep[] = useMemo(
    () => projectType === 'board' ? ['type', 'size', 'start', 'details'] : ['type', 'start', 'details'],
    [projectType],
  )
  const stepIndex = Math.max(0, steps.indexOf(step))
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1

  const previewBoardSettings = useMemo(
    () => projectType === 'board' ? boardSettingsForSize(boardSize, boardSize === 'full' && splitRails) : undefined,
    [boardSize, projectType, splitRails],
  )

  const previewCircuit = useMemo<Circuit>(() => {
    if (!startFromTemplate) {
      return projectType === 'board'
        ? { ...blankCircuit(), breadboard: { placements: [], jumpers: [] } }
        : blankCircuit()
    }
    const base = structuredClone(examples[templateName] ?? blankCircuit())
    if (projectType === 'board' && previewBoardSettings) {
      return {
        ...base,
        wires: [],
        junctions: [],
        breadboard: autoPlaceCircuit(base, boardShape(previewBoardSettings)),
      }
    }
    return base
  }, [previewBoardSettings, projectType, startFromTemplate, templateName])

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialProject) {
      setName(initialProject.name)
      setDescription(initialProject.description)
      setFolderId(initialProject.folderId)
      setProjectType(initialProject.preferredView)
      const currentSettings = initialProject.boardSettings ?? defaultBoardSettings
      setBoardSize(currentSettings.size)
      setSplitRails(currentSettings.splitRails)
      setStartFromTemplate(false)
      setStep('details')
    } else {
      setName('')
      setDescription('')
      setFolderId(defaultFolderId)
      setProjectType(defaultStartingPoint === 'blank-board' ? 'board' : 'schematic')
      setBoardSize('half')
      setSplitRails(false)
      setStartFromTemplate(defaultStartingPoint === 'template')
      setTemplateName(defaultTemplate && examples[defaultTemplate] ? defaultTemplate : templateNames[0])
      setStep('type')
    }
    setSubmitting(false)
  }, [open, mode, initialProject, defaultFolderId, defaultStartingPoint, defaultTemplate])

  useEffect(() => {
    if (open && (mode === 'edit' || step === 'details')) {
      setTimeout(() => nameRef.current?.focus(), 0)
    }
  }, [open, mode, step])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const stepLabels: Record<WizardStep, string> = {
    type: t('Type'),
    size: t('Size'),
    start: t('Start'),
    details: t('Details'),
  }

  function goNext() {
    if (stepIndex < steps.length - 1) setStep(steps[stepIndex + 1])
  }

  function goBack() {
    if (stepIndex > 0) setStep(steps[stepIndex - 1])
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (mode === 'create' && !isLastStep) {
      goNext()
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      const resolvedName = name.trim() || (
        mode === 'create' && startFromTemplate
          ? t(templateName)
          : t('Untitled Project')
      )
      if (mode === 'edit') {
        await onSubmit({
          name: resolvedName,
          description,
          folderId,
          preferredView: initialProject?.preferredView ?? projectType,
          ...(initialProject?.boardSettings ? { boardSettings: initialProject.boardSettings } : {}),
        })
      } else {
        await onSubmit({
          name: resolvedName,
          description,
          folderId,
          preferredView: projectType,
          ...(previewBoardSettings ? { boardSettings: previewBoardSettings } : {}),
          circuit: structuredClone(previewCircuit),
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        className={mode === 'create' ? 'modal-card wizard-modal' : 'modal-card'}
        onClick={event => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="modal-head">
          <div className="modal-title-group">
            <span className="modal-icon" aria-hidden="true">
              {projectType === 'board' ? <CircuitBoard size={16} /> : <Waypoints size={16} />}
            </span>
            <div>
              <h2 id="project-modal-title">{t(mode === 'create' ? 'New project' : 'Edit project')}</h2>
              {mode === 'create' && (
                <p className="wizard-subtitle">
                  {step === 'type'
                    ? t('Choose what you want to build')
                    : step === 'size'
                      ? t('Choose the physical size of your breadboard')
                      : step === 'start'
                        ? t('Start from scratch or use a template')
                        : t('Name and organize your project')}
                </p>
              )}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Close dialog')} onClick={onClose}>
            <X />
          </Button>
        </header>

        {mode === 'create' && (
          <nav className="wizard-stepper" aria-label={t('Project setup steps')}>
            {steps.map((id, index) => {
              const current = index === stepIndex
              const completed = index < stepIndex
              return (
                <button
                  key={id}
                  type="button"
                  className={
                    current
                      ? 'wizard-step wizard-step-active'
                      : completed
                        ? 'wizard-step wizard-step-done'
                        : 'wizard-step'
                  }
                  aria-current={current ? 'step' : undefined}
                  disabled={index > stepIndex}
                  onClick={() => { if (index < stepIndex) setStep(id) }}
                >
                  <span className="wizard-step-num" aria-hidden="true">
                    {completed ? <Check size={12} /> : index + 1}
                  </span>
                  <span>{stepLabels[id]}</span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="modal-body">
          {mode === 'create' && step === 'type' && (
            <div className="wizard-choice-grid wizard-choice-grid-2" role="radiogroup" aria-label={t('Project type')}>
              <button
                type="button"
                role="radio"
                aria-checked={projectType === 'schematic'}
                className={projectType === 'schematic' ? 'wizard-choice-card wizard-choice-card-active' : 'wizard-choice-card'}
                onClick={() => setProjectType('schematic')}
                onDoubleClick={() => { setProjectType('schematic'); setStep('start') }}
              >
                <div className="wizard-choice-art">
                  <SchematicTypeArt />
                  {projectType === 'schematic' && <span className="wizard-check-badge" aria-hidden="true"><Check size={13} /></span>}
                </div>
                <div className="wizard-choice-copy">
                  <strong><Waypoints size={15} /> {t('Circuit')}</strong>
                  <small>{t('Design and simulate 2D electrical schematics.')}</small>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={projectType === 'board'}
                className={projectType === 'board' ? 'wizard-choice-card wizard-choice-card-active' : 'wizard-choice-card'}
                onClick={() => setProjectType('board')}
                onDoubleClick={() => { setProjectType('board'); setStep('size') }}
              >
                <div className="wizard-choice-art">
                  <BreadboardTypeArt />
                  {projectType === 'board' && <span className="wizard-check-badge" aria-hidden="true"><Check size={13} /></span>}
                </div>
                <div className="wizard-choice-copy">
                  <strong><CircuitBoard size={15} /> {t('Breadboard')}</strong>
                  <small>{t('Build and test circuits on a 3D breadboard.')}</small>
                </div>
              </button>
            </div>
          )}

          {mode === 'create' && step === 'size' && (
            <div className="wizard-step-panel">
              <div className="wizard-choice-grid wizard-choice-grid-3" role="radiogroup" aria-label={t('Breadboard size')}>
                {boardSizes.map(size => {
                  const active = boardSize === size
                  const pts = tiePoints(boardShape(boardSettingsForSize(size)))
                  return (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={active ? 'wizard-choice-card wizard-choice-card-active' : 'wizard-choice-card'}
                      onClick={() => {
                        setBoardSize(size)
                        if (size !== 'full') setSplitRails(false)
                      }}
                    >
                      <div className="wizard-choice-art wizard-choice-art-size">
                        <BoardSizeArt size={size} splitRails={size === 'full' && splitRails} />
                        {active && <span className="wizard-check-badge" aria-hidden="true"><Check size={13} /></span>}
                      </div>
                      <div className="wizard-choice-copy">
                        <div className="board-size-title">
                          <strong>{t(sizeNames[size])}</strong>
                          <span className="board-size-pts">{pts} {t('tie points')}</span>
                        </div>
                        <small>{t(sizeHints[size])}</small>
                      </div>
                    </button>
                  )
                })}
              </div>

              {boardSize === 'full' && (
                <label className="modal-toggle-row">
                  <span>
                    <strong>{t('Split power rails')}</strong>
                    <small>{t('Separate the left and right halves of each rail.')}</small>
                  </span>
                  <Switch size="sm" checked={splitRails} onCheckedChange={setSplitRails} />
                </label>
              )}
            </div>
          )}

          {mode === 'create' && step === 'start' && (
            <div className="wizard-step-panel">
              <div className="wizard-choice-grid wizard-choice-grid-2" role="radiogroup" aria-label={t('Starting point')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!startFromTemplate}
                  className={!startFromTemplate ? 'wizard-choice-card wizard-choice-card-active' : 'wizard-choice-card'}
                  onClick={() => setStartFromTemplate(false)}
                >
                  <div className="wizard-choice-art wizard-choice-art-sm">
                    <BlankStartArt type={projectType} boardSize={boardSize} />
                    {!startFromTemplate && <span className="wizard-check-badge" aria-hidden="true"><Check size={13} /></span>}
                  </div>
                  <div className="wizard-choice-copy">
                    <strong>{t(projectType === 'board' ? 'Blank breadboard' : 'Blank schematic')}</strong>
                    <small>{t(projectType === 'board' ? 'Start with a clean empty breadboard.' : 'Start with an empty schematic canvas.')}</small>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={startFromTemplate}
                  className={startFromTemplate ? 'wizard-choice-card wizard-choice-card-active' : 'wizard-choice-card'}
                  onClick={() => setStartFromTemplate(true)}
                >
                  <div className="wizard-choice-art wizard-choice-art-sm">
                    <TemplateStartArt />
                    {startFromTemplate && <span className="wizard-check-badge" aria-hidden="true"><Check size={13} /></span>}
                  </div>
                  <div className="wizard-choice-copy">
                    <strong><Sparkles size={14} /> {t('From template')}</strong>
                    <small>{t('Start from a ready-to-edit example circuit.')}</small>
                  </div>
                </button>
              </div>

              {startFromTemplate && (
                <div className="template-picker">
                  <span className="section-label">{t('Choose template')}</span>
                  <div className="template-picker-grid">
                    {templateNames.map(key => {
                      const active = templateName === key
                      const tplCircuit = projectType === 'board' && previewBoardSettings
                        ? {
                            ...examples[key],
                            wires: [],
                            junctions: [],
                            breadboard: autoPlaceCircuit(examples[key], boardShape(previewBoardSettings)),
                          }
                        : examples[key]
                      return (
                        <button
                          key={key}
                          type="button"
                          className={active ? 'template-option template-option-active' : 'template-option'}
                          aria-pressed={active}
                          onClick={() => setTemplateName(key)}
                        >
                          <CircuitPreview
                            circuit={tplCircuit}
                            preferredView={projectType}
                            boardSettings={previewBoardSettings}
                            palette={palette}
                            t={t}
                            compact
                          />
                          <span>{t(key)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(mode === 'edit' || step === 'details') && (
            <div className="wizard-step-panel">
              {mode === 'create' ? (
                <div className="wizard-summary-card">
                  <div className="wizard-summary-thumb">
                    <CircuitPreview
                      circuit={previewCircuit}
                      preferredView={projectType}
                      boardSettings={previewBoardSettings}
                      palette={palette}
                      t={t}
                      compact
                    />
                  </div>
                  <div className="wizard-summary-info">
                    <span className="view-chip">
                      {projectType === 'board' ? <CircuitBoard size={12} /> : <Waypoints size={12} />}
                      {projectType === 'board'
                        ? `${t('Breadboard')} · ${t(sizeNames[boardSize])}`
                        : t('Circuit')}
                    </span>
                    <small>
                      {startFromTemplate
                        ? `${t('From template')}: ${t(templateName)}`
                        : t(projectType === 'board' ? 'Blank breadboard' : 'Blank schematic')}
                    </small>
                  </div>
                </div>
              ) : (
                <div className="modal-readonly-meta">
                  <span className="view-chip">
                    {projectType === 'board' ? <CircuitBoard size={12} /> : <Waypoints size={12} />}
                    {projectType === 'board'
                      ? `${t('Breadboard')} · ${t(sizeNames[boardSize])}`
                      : t('Circuit')}
                  </span>
                </div>
              )}

              <div className="modal-grid-2">
                <label className="modal-field">
                  <span>{t('Project name')}</span>
                  <Input
                    ref={nameRef}
                    value={name}
                    maxLength={120}
                    placeholder={mode === 'create' && startFromTemplate ? t(templateName) : t('Untitled Project')}
                    onChange={event => setName(event.target.value)}
                  />
                </label>

                <label className="modal-field">
                  <span><FolderIcon size={12} className="inline-icon" /> {t('Folder')}</span>
                  <select
                    aria-label={t('Folder')}
                    className="modal-select"
                    value={folderId ?? ''}
                    onChange={event => setFolderId(event.target.value || null)}
                  >
                    <option value="">{t('Unfiled')}</option>
                    {folders.map(folder => (
                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="modal-field">
                <span>{t('Description')}</span>
                <textarea
                  className="modal-textarea"
                  rows={2}
                  maxLength={500}
                  placeholder={t('Optional notes about this circuit…')}
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <footer className="modal-foot wizard-foot">
          {mode === 'create' ? (
            <>
              <Button type="button" variant="ghost" onClick={isFirstStep ? onClose : goBack}>
                {isFirstStep ? t('Cancel') : <><ArrowLeft size={14} /> {t('Back')}</>}
              </Button>
              {isLastStep ? (
                <Button key="wizard-submit" type="submit" disabled={submitting}>
                  {t('Create project')}
                </Button>
              ) : (
                <Button key="wizard-next" type="button" onClick={goNext}>
                  {t('Next')} <ArrowRight size={14} />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
              <Button type="submit" disabled={submitting}>{t('Save changes')}</Button>
            </>
          )}
        </footer>
      </form>
    </div>
  )
}
