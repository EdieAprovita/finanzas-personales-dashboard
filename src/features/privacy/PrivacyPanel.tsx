import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react'

export function PrivacyPanel() {
  return (
    <section className="panel wide">
      <div className="panel-heading">
        <div>
          <h2>Privacidad operativa</h2>
          <p>Controles visibles para trabajar con informacion financiera personal en entorno local.</p>
        </div>
        <ShieldCheck size={28} />
      </div>

      <div className="privacy-grid">
        <article>
          <ShieldCheck size={22} />
          <h3>Datos locales</h3>
          <p>Tu información se guarda localmente en este dispositivo. Los documentos se procesan aquí y no se suben por defecto; la base aún no tiene cifrado propio.</p>
        </article>
        <article>
          <Trash2 size={22} />
          <h3>Minimizacion</h3>
          <p>El importador conserva movimientos y metadata; no guarda PDF/CSV crudo por defecto.</p>
        </article>
        <article>
          <AlertTriangle size={22} />
          <h3>Backups cifrados</h3>
          <p>La herramienta local crea y valida copias cifradas. Conserva la clave y una copia en ubicaciones separadas.</p>
        </article>
        <article>
          <AlertTriangle size={22} />
          <h3>Cifrado pendiente</h3>
          <p>La base activa todavía no tiene cifrado propio; protege también el disco y la cuenta del sistema.</p>
        </article>
      </div>
    </section>
  )
}
