# Auditoría del merge y estado actual

Fecha: 2026-07-09
Repositorio: `EdieAprovita/finanzas-personales-dashboard`
Merge auditado: PR #1, `bd584ae` (`Implement Finance OS trust foundation`)
Alcance: arquitectura, API, importación documental, confiabilidad analítica, UX desktop/mobile, accesibilidad, rendimiento y pruebas.

## Veredicto ejecutivo

La aplicación está funcional y el merge es una mejora real: valida perfiles al guardar, elimina el fallback silencioso a IndexedDB, añade migración SQLite, clasificación documental, calidad de extracción, deduplicación y una cobertura E2E amplia.

No encontré un P0 de disponibilidad. Sí hay varios P1 que impiden tratar el dashboard como fuente confiable para decisiones de ingresos, deuda, patrimonio o inversiones:

1. Quedaron cuatro hilos de revisión de Copilot sin resolver en PR #1.
2. El flujo LAN documentado no funciona por defecto desde una IP de red local.
3. El dashboard muestra `0%` de uso de tarjeta y `576.4 meses` de runway con evidencia documental incompleta; deberían ser estados no calculables o de baja confianza.
4. Hay rutas de importación que pueden mezclar moneda, clasificar un CSV genérico como tarjeta, omitir inversiones del patrimonio o duplicar pasivos de tarjeta.
5. El periodo seleccionado no gobierna todos los KPIs.
6. El flujo mobile es funcional, pero captura y documentos concentran demasiada información y la navegación fija puede ocultar contenido.

## Evidencia y validación

### Estado del merge

- `main`, `origin/main` y `bd584ae` están alineados.
- El merge modificó 30 archivos: `+1568/-523` líneas.
- El árbol de trabajo quedó limpio después de instalar dependencias desde el lockfile.
- La revisión de GitHub cubrió 29 de 30 archivos y dejó 4 hilos sin resolver.

### Pruebas ejecutadas

| Validación | Resultado |
|---|---|
| `npm run lint` | Pasa |
| `npm run test:unit` | 1 archivo, 5 pruebas pasan |
| `npm run build` | Pasa TypeScript y Vite |
| `npm run test:imports` | Pasa con 13 fixtures sintéticos |
| `npm run test:knowledge` | Pasa, 61 entradas y 33 fuentes |
| `npm run test:e2e` | 35 pasan, 1 omitida, en mobile y desktop |
| Consola browser | Sin errores ni warnings |
| `git diff --check` | Pasa |

Los fixtures de importación reportaron correctamente depósitos, retiros, inversiones, ahorro, retiro, CFDI, PDF e imagen. Los warnings repetidos de PDF.js sobre `standardFontDataUrl` no rompen la prueba, pero deben corregirse para evitar degradación silenciosa en fuentes PDF.

### Snapshot agregado observado

El perfil local auditado contiene 54 documentos, 656 movimientos y 12 documentos en revisión. La evidencia agregada muestra 26 estados de tarjeta con cobertura cercana al 20% y 28 CFDI de nómina con cobertura declarada del 100%. Esta cifra mide extracción/campos detectados, no exactitud contra una verdad terreno ni conciliación completa.

## Hallazgos críticos y altos

### P1. Hilos de revisión de PR todavía abiertos

Los cuatro hilos pendientes son correctos y deben resolverse antes de ampliar la confianza del merge:

- `server/index.mjs`: `GET /api/profiles` hace `JSON.parse`, migra, pero no valida cada perfil leído contra `financialProfileSchema`. Un JSON válido pero semánticamente inválido puede llegar al frontend.
- `server/index.mjs`: cualquier `ZodError` se convierte en `Perfil invalido`, incluso en `/api/knowledge/explain`; el cliente recibe un diagnóstico incorrecto.
- `src/features/capture/Capture.tsx`: eliminar una cuenta de deuda no bloquea transacciones existentes con `debtId`, dejando referencias huérfanas.
- `src/features/capture/Capture.tsx`: `isEssential` se calcula con la categoría previa, aunque un pago de deuda termina con categoría `Pago de deuda`.

Referencias: [server/index.mjs](../server/index.mjs#L70-L76), [server/index.mjs](../server/index.mjs#L246-L259), [Capture.tsx](../src/features/capture/Capture.tsx#L133-L164), [Capture.tsx](../src/features/capture/Capture.tsx#L213-L220).

### P1. El modo LAN no está alineado con el flujo mobile documentado

La API sólo permite `localhost`, `127.0.0.1` y `::1` por defecto. `npm run api` tampoco activa `FINANZAS_LAN_MODE=1`; por eso abrir Vite desde `http://192.168.x.x:5173` puede mostrar la app, pero las llamadas a SQLite responden 403. En LAN mode las IP permitidas aún requieren configuración manual.

Esto debe resolverse con un flujo explícito: comando LAN documentado, lista de orígenes configurada automáticamente de forma segura o, preferiblemente, un código de emparejamiento local. CORS por sí solo no es autenticación.

Referencia: [server/index.mjs](../server/index.mjs#L7-L45), [package.json](../package.json).

### P1. KPIs con apariencia de certeza aunque faltan datos

En la captura browser del dashboard real se observó:

- Score `84/100` con 13 documentos por conciliar.
- Uso de tarjeta `0%` aunque los estados de tarjeta tienen cobertura insuficiente.
- Runway `576.4 meses`, un valor que debería marcarse como atípico o no significativo.

El problema no es sólo visual. El producto mezcla salud financiera, calidad documental y disponibilidad de campos dentro de una misma lectura. Recomendación:

- Separar `Salud financiera`, `Calidad de datos` y `Preparación para decisión`.
- Representar `unknown`, `insufficient_data` y `not_meaningful`; no convertir falta de límite de crédito en 0%.
- Bloquear o degradar uso de tarjeta, runway, deuda y patrimonio cuando faltan campos críticos o conciliación.
- Mostrar denominador, periodo, moneda, cobertura monetaria confiable y fecha de actualización junto a cada KPI.

Referencia: [Dashboard.tsx](../src/features/dashboard/Dashboard.tsx), [finance.ts](../src/domain/finance.ts#L123-L149), [documentQuality.ts](../src/features/imports/documentQuality.ts#L350-L365).

### P1. El selector de periodo no controla todos los cálculos

Flujo y categorías usan el periodo seleccionado, pero ingreso base, liquidez, deuda, patrimonio y gastos esenciales toman valores actuales del perfil o `asOfDate`. Seleccionar un mes histórico puede producir un dashboard parcialmente histórico con score y runway actuales.

Hay que definir una única semántica: cada métrica debe aceptar `period` y `asOfDate`, o la UI debe dejar claro qué es histórico y qué es estado actual. Añadir pruebas cambiando entre dos periodos y comparando score, runway, deuda, patrimonio y capacidad de ahorro.

Referencia: [finance.ts](../src/domain/finance.ts#L105-L149).

### P1. Clasificación de movimientos y moneda todavía puede producir conclusiones incorrectas

Los riesgos encontrados en importadores son concretos:

- Un CSV genérico sin señales puede caer en `credit_card_statement`; montos positivos pueden terminar como cargos negativos.
- Cuentas importadas desde PDF/CSV se inicializan en MXN y no existe tipo de cambio por transacción. Un documento USD puede contaminar métricas MXN.
- Operaciones de inversión se guardan como evidencia, pero no siempre actualizan saldo o patrimonio.
- Los estados de tarjeta pueden crear una deuda separada de la cuenta si no se enlazan; el snapshot del importador puede restar ambos pasivos.
- La conciliación bancaria infiere saldo inicial desde la primera fila; un CSV ordenado de más reciente a más antiguo puede producir un resultado falso.
- La deduplicación de nómina usa fecha, importe y ventana de tres días; puede colisionar entre dos empleadores o cuentas.
- El PDF se limita a las primeras ocho páginas y OCR usa sólo `eng`; documentos largos o español pueden perder campos.

Referencias: [importers.ts](../src/lib/importers.ts#L2016-L2050), [importers.ts](../src/lib/importers.ts#L2078-L2085), [importers.ts](../src/lib/importers.ts#L2468-L2534), [importers.ts](../src/lib/importers.ts#L2623-L2690), [importers.ts](../src/lib/importers.ts#L1575-L1623), [importers.ts](../src/lib/importers.ts#L1386-L1410).

### P1. Calidad de extracción no equivale a confiabilidad analítica

La confianza actual se deriva de señales heurísticas y en nómina puede fijarse en `0.95` por estructura CFDI. Eso no prueba UUID/estatus, consistencia de percepciones menos deducciones, neto, periodo, cuenta receptora ni conciliación bancaria. Además, el promedio de confianza excluye valores cero, por lo que documentos rechazados pueden no penalizar el agregado.

Separar al menos estas dimensiones:

- cobertura de campos;
- confianza de clasificación;
- confianza de extracción por campo;
- consistencia interna del documento;
- conciliación contra cuenta/estado;
- deduplicación;
- preparación para impactar KPIs.

Reportar precisión, recall y F1 por clase y tipo documental; error de conciliación; tasa de filas omitidas; monedas y fechas no parseadas; falsos positivos/negativos de deduplicación; calibración de confianza y tasa de abstención.

### P1. Reanálisis de documentos antiguos no puede mejorar extracción

El sistema no conserva el archivo crudo. La acción `Reanalizar documentos guardados` sólo reevalúa metadata ya persistida; no puede recuperar texto ni campos ausentes. La UI debe llamarla `Recalcular calidad de metadata` o mostrar una cola de reimportación con la razón exacta y un CTA para volver a subir el archivo.

La política de privacidad es razonable para un prototipo local, pero debe explicar qué metadata sí queda persistida: nombre de archivo, preview OCR, conceptos sanitizados y sufijos de identificadores.

## Hallazgos de arquitectura y mantenibilidad

### P2. `App.tsx` ya no está descontrolado, pero sigue siendo un orquestador de alto acoplamiento

Tiene 493 líneas y concentra carga de perfiles, selección, persistencia, importación, borrado, reanálisis, navegación y creación. No es una urgencia, pero cada cambio transversal aumenta el riesgo.

Separación recomendada, sin reescritura:

- `useFinanceBootstrap`: health, perfiles, perfil activo y periodo.
- `useProfileActions`: crear, guardar, borrar uno y borrar todos.
- `useDocumentImport`: cola, progreso, importación, reanálisis y revisión.
- `useProfileNavigation`: tabs, dashboard por perfil y selección.
- Dejar `App.tsx` como composición de hooks y vistas.

Referencia: [App.tsx](../src/App.tsx#L24-L75), [App.tsx](../src/App.tsx#L247-L393).

### P2. Persistencia con último guardado gana

No hay versión de perfil, `updatedAt` de cliente validado, ETag ni control optimista. Si desktop y celular escriben el mismo perfil, el último `PUT` puede borrar cambios del otro contexto. Añadir `revision` monotónica y responder 409 ante conflicto; el cliente debe ofrecer recargar o comparar.

### P2. Corrupción de una fila puede impedir arrancar la API

`backupAndMigrateLegacyProfiles()` y `rowToProfile()` usan `JSON.parse` sin recuperación. Una fila corrupta puede detener startup o `GET /api/profiles`. La migración debe mover filas inválidas a cuarentena, registrar un error de auditoría sin PII y permitir arrancar con los perfiles válidos.

Referencias: [db.mjs](../server/db.mjs#L68-L96), [db.mjs](../server/db.mjs#L158-L160).

### P2. Rendimiento y bundle

El build pasa, pero genera aproximadamente:

- `index` JS: 720 KB minificado;
- `importers` JS: 598 KB minificado;
- worker PDF: 2.19 MB.

Acciones: cargar por ruta `Imports`, usar workers separados para PDF/OCR, evitar que Recharts y procesamiento documental entren en el primer dashboard, y medir Web Vitals/LCP en 390 y 1280 px.

## UX, responsive y accesibilidad

### P1. Captura demasiado larga en mobile

Cuenta, movimiento, meta y registros recientes conviven en una pantalla de más de 3,000 px. Dividir por tareas: `Cuenta`, `Movimiento`, `Meta`, con una acción primaria visible y un resumen posterior.

### P1. Dashboard vacío con demasiadas decisiones

El empty state combina onboarding, preparación, rutas, cuatro métricas y preview. Reducirlo a una CTA primaria, dos alternativas y un checklist de tres pasos. El preview debe ser colapsable.

### P1. Foco y errores accesibles

Hay `outline: none` en inputs y no existe una regla global `:focus-visible` para todos los controles. Los errores de captura no usan `aria-live`, `aria-invalid` ni `aria-describedby`. Los gráficos necesitan una alternativa en tabla o resumen textual.

W3C recomienda foco visible y que el foco no quede oculto por contenido creado por la aplicación en WCAG 2.2: [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible), [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### P2. Navegación fija mobile

El nav inferior funciona, pero debe usar `env(safe-area-inset-bottom)` y reservar espacio dinámico. En la captura de viewport el nav queda sobre el contenido visible. Renombrar `Mov.` a `Capturar` y revisar si `Más` oculta rutas importantes.

Referencias: [AppShell.tsx](../src/features/shell/AppShell.tsx#L234-L259), [App.css](../src/App.css#L8-L20).

### P2. Ledger y perfiles

El ledger usa `ellipsis` y `nowrap`, ocultando conceptos largos. Permitir wrap o una fila expandible. En perfiles se repiten acciones globales y acciones por tarjeta; conservar una acción primaria y mover eliminar a un menú secundario.

## Recomendaciones open source

1. **PDF.js**: mantenerlo para PDF text-native y renderizar sólo páginas necesarias; separar worker y configurar fuentes para eliminar warnings. La API oficial expone la capa de display para leer/renderizar PDFs: [PDF.js Getting Started](https://mozilla.github.io/pdf.js/getting_started/index.html).
2. **Tesseract.js**: mantenerlo como fallback local para imágenes, pero usar `spa` o `spa+eng`, reusar workers por lote y persistir sólo métricas agregadas. La documentación soporta múltiples idiomas, workers, `recognize` y terminación explícita: [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md). Tesseract.js no procesa PDF directamente; requiere PDF.js/render a imagen o una librería especializada: [scope y FAQ](https://github.com/naptha/tesseract.js#project-scope).
3. **DuckDB-Wasm**: evaluarlo como capa analítica opcional para consultas por periodo, conciliación, cohortes y exportaciones locales, sin reemplazar SQLite como almacenamiento transaccional. Corre en navegador/WebAssembly y ofrece SQL, pero tiene límites de memoria y por defecto un solo hilo: [DuckDB-Wasm](https://duckdb.org/docs/stable/clients/wasm/overview), [Query](https://duckdb.org/docs/current/clients/wasm/query).
4. **Accesibilidad**: añadir `axe-core` sólo en tests, no al bundle productivo, y validar foco visible, foco no obstruido, navegación de teclado, nombres accesibles y tablas alternativas.

## Roadmap recomendado

### Sprint 1: confianza y corrección

- Resolver los cuatro hilos de PR.
- Validar perfiles al leer y poner filas corruptas en cuarentena.
- Corregir error de Zod por endpoint.
- Bloquear eliminación de deudas con transacciones referenciadas.
- Corregir `isEssential` con categoría final.
- Añadir estados `unknown/not_meaningful` para tarjeta, runway y score.
- Activar y probar flujo LAN con emparejamiento local.

### Sprint 2: importación y analítica

- Modelo de moneda por cuenta y movimiento con FX explícito o exclusión visible.
- Enlace obligatorio cuenta-deuda y prueba contra doble pasivo.
- Ledger de ingestión inmutable con `sourceFingerprint`, fila de origen y clave idempotente.
- Conciliación ordenada por fecha y saldo, con razón de abstención.
- Validación CFDI interna antes de aplicar nómina.
- Inversiones como posiciones/saldos, no sólo operaciones.
- Métricas de cobertura monetaria y calibración de confianza.

### Sprint 3: experiencia y rendimiento

- Captura por tareas en mobile.
- Empty state reducido.
- Foco global, errores asociados y tabla accesible para gráficos.
- `safe-area-inset-bottom`, ledger expandible y pruebas en 390/768/1024/1280 px.
- Code splitting de importadores, PDF.js, OCR y charts.
- E2E de periodos, moneda, corrupción, deuda, LAN, teclado y calidad documental.

## Criterio de salida sugerido

No presentar “salud financiera” como confiable hasta que cada KPI indique periodo, moneda, cobertura y estado de conciliación; el sistema pueda abstenerse ante datos insuficientes; los importadores sean idempotentes; y exista una prueba automatizada para cada clase de movimiento: ingreso de nómina, retiro de nómina, gasto, transferencia, inversión, venta, rendimiento y pago de deuda.

