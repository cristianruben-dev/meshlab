import { useEffect } from 'react'
import { CircuitBoard, ExternalLink, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_NAME, APP_VERSION, AUTHOR_HANDLE, GITHUB_REPO_SLUG, GITHUB_REPO_URL, RELEASE_NOTES } from '../appMeta'
import type { Translate } from '../locale'

export type AboutModalProps = {
  open: boolean
  t: Translate
  onClose: () => void
  onStarClick?: () => void
}

export function AboutModal({ open, t, onClose, onStarClick }: AboutModalProps) {
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

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('About Meshlab')}
        className="modal-card about-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title-group">
            <span className="modal-icon"><CircuitBoard size={16} /></span>
            <div className="about-head-text">
              <div className="about-title-row">
                <h2>{APP_NAME}</h2>
                <span className="about-version-badge">v{APP_VERSION}</span>
              </div>
              <small>{t('DC CIRCUIT WORKBENCH')}</small>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t('Close dialog')} onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        <div className="modal-body about-modal-body">
          <p className="about-summary">
            {t('Browser-based DC/transient circuit simulator, 3D breadboard, and IEC 60062 resistor color code calculator. Runs client-side with local IndexedDB storage.')}
          </p>

          <div className="about-specs">
            <div className="about-spec-item">
              <span>{t('Solver')}</span>
              <strong>MNA · DC / RC</strong>
            </div>
            <div className="about-spec-item">
              <span>{t('Storage')}</span>
              <strong>IndexedDB</strong>
            </div>
            <div className="about-spec-item">
              <span>{t('Repository')}</span>
              <strong>{GITHUB_REPO_SLUG}</strong>
            </div>
          </div>

          <section className="about-releases" aria-label={t('Release notes')}>
            <h3 className="section-label">{t('Release notes')}</h3>
            {RELEASE_NOTES.map(release => (
              <div key={release.version} className="about-release-card">
                <div className="about-release-head">
                  <span className="about-version-badge">v{release.version}</span>
                  <span className="about-release-tag">{t(release.tag)}</span>
                </div>
                <ul className="about-release-list">
                  {release.items.map(item => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>

        <div className="modal-foot about-modal-foot">
          <span className="about-author">@{AUTHOR_HANDLE}</span>
          <div className="about-foot-actions">
            <a
              className="about-gh-link"
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onStarClick}
            >
              <Star size={13} aria-hidden="true" />
              <span>{t('Star on GitHub')}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('Close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
