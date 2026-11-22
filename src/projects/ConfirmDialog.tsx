import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Translate } from '../locale'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  t: Translate
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive = true,
  t,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="modal-card modal-card-sm"
        onClick={event => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-title-group">
            <span className={destructive ? 'modal-icon modal-icon-danger' : 'modal-icon'} aria-hidden="true">
              <AlertTriangle size={16} />
            </span>
            <h2 id="confirm-dialog-title">{title}</h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t('Close dialog')} onClick={onCancel}>
            <X />
          </Button>
        </header>
        <div className="modal-body">
          <p id="confirm-dialog-desc" className="confirm-desc">{description}</p>
        </div>
        <footer className="modal-foot">
          <Button variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>{confirmLabel}</Button>
        </footer>
      </div>
    </div>
  )
}
