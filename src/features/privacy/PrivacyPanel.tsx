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
          <p>Datos guardados en SQLite local con fallback IndexedDB. La API escucha en esta computadora y Vite la expone como ruta local de desarrollo.</p>
        </article>
        <article>
          <Trash2 size={22} />
          <h3>Minimizacion</h3>
          <p>El importador conserva movimientos y metadata; no guarda PDF/CSV crudo por defecto.</p>
        </article>
        <article>
          <AlertTriangle size={22} />
          <h3>Siguiente nivel</h3>
          <p>Para uso continuo conviene activar cifrado fuerte, backups cifrados, threat model y conectores bancarios formales.</p>
        </article>
      </div>
    </section>
  )
}
