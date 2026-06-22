# Auditoria UX - Flujo de perfiles

Fecha: 2026-06-20
Estado: revisado y corregido

## Contexto

El flujo anterior permitia crear perfiles, navegar entre ellos e importar documentos, pero el comportamiento se sentia confuso en mobile porque `Crear perfil vacio` creaba datos inmediatamente sin abrir una pantalla de decision. El usuario quedaba en la misma vista de perfiles y podia interpretar que el boton no habia hecho nada.

## Evidencia visual

- Antes: captura local no versionada.
- Antes de la correccion, despues de crear vacio: captura local no versionada.
- Modal nuevo perfil: captura local no versionada.
- Modal con documentos: captura local no versionada.
- Manual creado y enviado a Captura: captura local no versionada.
- Perfil importado desde documentos: captura local no versionada.
- Perfil vacio sin metricas rotas: captura local no versionada.

## Hallazgos

1. Crear perfil vacio era tecnicamente funcional, pero parecia un no-op.
   - Causa: creaba `Mi plan financiero` directamente, con 0 cuentas, 0 movimientos y 0 documentos.
   - Impacto: perfiles duplicados se veian iguales y no habia siguiente paso claro.

2. Los perfiles vacios podian producir KPIs invalidos.
   - Causa: calculos de margen, ahorro y deuda dividian entre ingreso 0.
   - Impacto: riesgo de mostrar `NaN` o estados rojos sin contexto.

3. El dashboard de perfiles ocupaba demasiado espacio en tabs operativas.
   - Causa: siempre se renderizaba el bloque completo de perfiles antes de Captura/Documentos.
   - Impacto: al crear manualmente, la pestaña Captura quedaba activa pero el formulario no era visible arriba.

4. La clasificacion documental era insuficiente.
   - CSV se trataba como tarjeta de credito por default.
   - PDF de inversiones podia quedar como estado bancario.
   - XML no nomina quedaba como `unknown` aunque fuera factura CFDI.

## Cambios aplicados

1. Nuevo modal de creacion de perfil.
   - Ruta Manual: pide nombre/descripcion, crea el perfil y abre Captura.
   - Ruta Con documentos: sube PDF/CSV/XML y crea un perfil poblado por importacion.

2. Navegacion menos confusa.
   - El dashboard completo de perfiles aparece solo en Estado actual.
   - En Captura/Documentos se muestra una barra compacta del perfil activo.
   - Las tarjetas ya no se reordenan cada vez que se selecciona un perfil.

3. Perfil vacio con estado explicito.
   - Badges `Activo`, `Vacio`, `Sin datos`, `Importado`, `por revisar`.
   - Dashboard vacio con acciones de siguiente paso.
   - Calculos financieros usan divisiones seguras.

4. Clasificacion documental ampliada.
   - Nuevos tipos: factura CFDI y ticket/recibo.
   - Metadata: confianza, razones de clasificacion, campos extraidos y transacciones fuente.
   - PDF sin movimientos queda en revision, no como listo silenciosamente.
   - Perfiles creados desde documentos ahora toman nombre/descripcion a partir de los tipos detectados.

## Happy paths validados

1. Crear perfil manual.
   - Accion: `Nuevo perfil` -> `Manual` -> `Crear y capturar datos`.
   - Resultado: se creo `Mi plan financiero 11` y la app abrio Captura con el formulario visible.

2. Crear perfil desde documentos.
   - Accion: `Nuevo perfil` -> `Con documentos` -> subir CSV, XML nomina y PDF.
   - Resultado: se creo `Perfil importado 12`.
   - Conteos SQLite: 3 cuentas, 32 movimientos, 3 documentos.
   - Clasificacion SQLite: `bank_statement`, `payroll_cfdi`, `credit_card_statement`.

3. Navegar de perfil importado a perfil vacio.
   - Resultado: se mostro el perfil vacio con estado `Sin datos` y sin metricas invalidas.

## Validaciones

- `npm run lint`: pasa.
- `npm run build`: pasa.
- `npm run test:imports`: pasa con 54 archivos reales, 629 filas CSV, 28 XML nomina, 12 PDFs legibles.

## Riesgos pendientes

- La base SQLite guarda JSON completo sin cifrado. Para datos reales continuos conviene agregar cifrado, auth local y backups cifrados.
- El importador PDF sigue siendo conservador: detecta cuenta/saldo y clasifica, pero no extrae movimientos de PDFs con layouts complejos.
- `dev:mobile` expone la app a la red local; debe usarse solo en red confiable.
