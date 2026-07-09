import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PencilLine, ReceiptText, Upload, X } from 'lucide-react'
import { GoalForm } from '../goals/GoalForm'
import type { GoalFormState } from '../goals/goalFormModel'
import { documentImportAccept } from '../imports/documentImportConfig'

export type CreateProfileMode = 'manual' | 'documents'

export function CreateProfileDialog({
  mode,
  profileCount,
  name,
  description,
  includeStarterGoal,
  starterGoal,
  starterGoalError,
  asOfDate,
  isImporting,
  importQueue,
  onModeChange,
  onNameChange,
  onDescriptionChange,
  onIncludeStarterGoalChange,
  onStarterGoalChange,
  onClose,
  onSubmitManual,
  onFiles,
}: {
  mode: CreateProfileMode
  profileCount: number
  name: string
  description: string
  includeStarterGoal: boolean
  starterGoal: GoalFormState
  starterGoalError: string
  asOfDate: string
  isImporting: boolean
  importQueue: string[]
  onModeChange: (mode: CreateProfileMode) => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onIncludeStarterGoalChange: (value: boolean) => void
  onStarterGoalChange: (value: GoalFormState) => void
  onClose: () => void
  onSubmitManual: () => void
  onFiles: (files: File[]) => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const appShell = document.querySelector('main.app-shell')
    appShell?.setAttribute('inert', '')
    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      appShell?.removeAttribute('inert')
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  function selectedFiles(fileList: FileList | null) {
    return Array.from(fileList ?? [])
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="create-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-profile-title">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Nuevo perfil</p>
            <h2 id="create-profile-title">Crear perfil financiero</h2>
            <p>Elige si quieres iniciar manualmente o dejar que los documentos creen cuentas, movimientos y clasificacion.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Cerrar crear perfil" onClick={onClose} ref={closeButtonRef}>
            <X size={20} />
          </button>
        </header>

        <div className="creation-options" role="tablist" aria-label="Metodo de creacion">
          <button type="button" role="tab" id="manual-profile-tab" aria-selected={mode === 'manual'} aria-controls="profile-creation-panel" className={`creation-option ${mode === 'manual' ? 'active' : ''}`} onClick={() => onModeChange('manual')}>
            <PencilLine size={20} />
            <strong>Manual</strong>
            <span>Nombre, descripcion y captura desde cero.</span>
          </button>
          <button type="button" role="tab" id="documents-profile-tab" aria-selected={mode === 'documents'} aria-controls="profile-creation-panel" className={`creation-option ${mode === 'documents' ? 'active' : ''}`} onClick={() => onModeChange('documents')}>
            <ReceiptText size={20} />
            <strong>Con documentos</strong>
            <span>PDF, CSV, XML o imagen para poblar el perfil.</span>
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="dialog-body" role="tabpanel" id="profile-creation-panel" aria-labelledby="manual-profile-tab">
            <label>
              Nombre del perfil
              <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder={`Mi plan financiero ${profileCount + 1}`} />
            </label>
            <label>
              Descripcion
              <textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Ej. Perfil personal para capturar ingresos, tarjetas, metas y gastos reales."
              />
            </label>
            <p className="dialog-note">Puedes empezar por cuenta, movimiento o meta. Si agregas una meta inicial, abrire Planeacion.</p>
            <section className="starter-goal">
              <div className="starter-goal-header">
                <div>
                  <strong>Primera meta</strong>
                  <span>Opcional: crea una meta junto con el perfil y revisala en Planeacion.</span>
                </div>
                <button
                  type="button"
                  className={`mini-action ${includeStarterGoal ? 'active' : ''}`}
                  onClick={() => onIncludeStarterGoalChange(!includeStarterGoal)}
                >
                  {includeStarterGoal ? 'Quitar' : 'Agregar'}
                </button>
              </div>
              {includeStarterGoal && <GoalForm goal={starterGoal} error={starterGoalError} compact asOfDate={asOfDate} onChange={onStarterGoalChange} />}
            </section>
          </div>
        ) : (
          <div className="dialog-body" role="tabpanel" id="profile-creation-panel" aria-labelledby="documents-profile-tab">
            <label className="drop-zone compact">
              <Upload size={28} />
              <span>{isImporting ? 'Analizando documentos...' : 'Subir documentos y crear perfil'}</span>
              <small>Clasifico nomina, tarjetas, bancos, inversiones, facturas, tickets y recibos escaneados.</small>
              <input type="file" multiple accept={documentImportAccept} onChange={(event) => onFiles(selectedFiles(event.target.files))} />
            </label>
            {importQueue.length > 0 && (
              <div className="import-queue">
                {importQueue.map((fileName, index) => (
                  <span key={`${fileName}-${index}`}>{fileName}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="dialog-footer">
          <button type="button" className="ghost" onClick={onClose}>
            Cancelar
          </button>
          {mode === 'manual' && (
            <button type="button" className="ghost primary" onClick={onSubmitManual} disabled={!name.trim()}>
              {includeStarterGoal ? 'Crear y revisar meta' : 'Crear y capturar datos'}
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  )
}
