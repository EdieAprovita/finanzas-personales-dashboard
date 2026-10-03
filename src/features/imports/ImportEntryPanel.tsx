import { ArrowDownToLine, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FinancialProfile } from '../../domain/types'
import { profileDisplayName } from '../profiles/profileSummary'
import { documentImportAccept } from './documentImportConfig'

interface ImportEntryPanelProps {
  profile: FinancialProfile
  importMessage: string
  importQueue: string[]
  isImporting: boolean
  onFiles: (files: File[], mode: 'current' | 'new') => void
}

export function ImportEntryPanel({
  profile,
  importMessage,
  importQueue,
  isImporting,
  onFiles,
}: ImportEntryPanelProps): ReactNode {
  function selectedFiles(fileList: FileList | null): File[] {
    return Array.from(fileList ?? [])
  }

  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <h2>Ingreso de documentos</h2>
          <p>
            Sube CSV, PDF, XML o imágenes al perfil activo. Crea otro perfil desde
            “Nuevo” si necesitas separar escenarios.
          </p>
        </div>
        <ArrowDownToLine size={24} />
      </div>
      <label className="drop-zone">
        <Upload size={28} />
        <span>
          {isImporting
            ? 'Procesando localmente...'
            : `Agregar documentos ${profileDisplayName(profile, [profile])}`}
        </span>
        <input
          className="file-input"
          type="file"
          multiple
          accept={documentImportAccept}
          onChange={(event) => onFiles(selectedFiles(event.target.files), 'current')}
        />
      </label>
      {importQueue.length > 0 && (
        <div className="import-queue">
          {importQueue.map((fileName, index) => (
            <span key={`${fileName}-${index}`}>{fileName}</span>
          ))}
        </div>
      )}
      {importMessage && (
        <p className="import-message" role="status" aria-live="polite">
          {importMessage}
        </p>
      )}
    </section>
  )
}
