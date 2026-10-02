# Finanzas OS

Aplicacion local para centralizar informacion financiera personal, calcular salud financiera, ingresar cuentas y movimientos, cargar recibos de nomina o estados de cuenta, y planear metas como viajes, inmuebles, autos, deuda y fondo de emergencia.

## Stack

- React 19 + TypeScript + Vite
- Node 26 `node:sqlite` + API local para persistencia en archivo SQLite
- SQLite local como unica fuente de persistencia; no se usa IndexedDB como fallback
- Recharts para visualizaciones
- PapaParse + Zod para CSVs de estados de cuenta
- PDF.js para lectura local de PDFs
- Lucide React para iconografia

## Comandos

```bash
npm install
npm run api
npm run dev
npm run dev:mobile
npm run build
npm run lint
```

### Backup cifrado y restauración

La herramienta local crea snapshots SQLite consistentes, los cifra con AES-256-GCM y conserva los siete más recientes. La clave se lee desde un archivo privado fuera del repositorio; no se acepta por argumento ni se guarda en la base.

```bash
umask 077
openssl rand -hex 32 > "$HOME/.finanzas-os-backup-key"
npm run backup:db -- --key-file "$HOME/.finanzas-os-backup-key"
```

La restauración siempre escribe una base nueva y valida autenticación, checksum, integridad SQLite, llaves foráneas y esquema antes de terminar:

```bash
npm run restore:db -- --input data/backups/finanzas-os-AAAA.backup.json --key-file "$HOME/.finanzas-os-backup-key"
FINANZAS_DB_PATH=data/finanzas-os-restored.sqlite npm run api
```

Guarda otra copia del backup y de la clave en ubicaciones separadas. Perder la clave hace imposible recuperar la copia cifrada. La base activa continúa sin cifrado propio.

`npm run dev` inicia Vite y la API local en paralelo. Vite queda disponible en
`http://localhost:5173/` y la API en `http://127.0.0.1:4147/`; al detener el
comando se detienen ambos procesos.

## Grafo Local Del Proyecto

Graphify se ejecuta en un entorno Python aislado del proyecto; no requiere una
instalación global ni usa los documentos financieros cargados por la app. La
primera vez instala la herramienta local:

```bash
npm run graphify:setup
npm run graphify:check
npm run graphify:code
```

`graphify:code` indexa únicamente código con extracción local y genera
`graphify-out/`. Para otros comandos de Graphify se reenvían los argumentos:

```bash
npm run graphify -- query "¿Qué módulos persisten perfiles?"
npm run graphify -- diagnose multigraph --graph graphify-out/graph.json
```

El entorno `.graphify-venv/` y los artefactos `graphify-out/` son locales y no
se versionan. No ejecutes una extracción semántica sobre documentos reales sin
revisar primero el proveedor de IA y la política de datos.

## CI/CD

- **CI** corre en cada rama, pull request y ejecución manual: formato Git, lint, pruebas unitarias, matriz de conocimiento, corpus documental sintético, build y E2E aislado en Chromium para móvil y escritorio.
- **Delivery candidate** corre en `main` y publica un artefacto inmutable con `dist`, `server`, `public`, manifiestos npm y checksum SHA-256. Es el paquete validado para un entorno de despliegue.
- Un tag `v*` crea una GitHub Release con el mismo paquete y checksum. Los documentos reales, `test:imports:real`, la base SQLite local y benchmarks no se ejecutan en GitHub Actions.

La app no puede desplegarse como sitio estático: el frontend necesita la API Node y una SQLite persistente. Antes de desplegar un artefacto, configura un destino con volumen persistente para `data/`, proceso Node 26 para la API, un servidor estático/reverse proxy para `dist` y una política de cifrado, backups y autenticación. No se deben exponer datos financieros ni secretos en PRs.

Para usarla desde tu celular o desde otro navegador en la misma red, deja corriendo `npm run api:lan` en una terminal y `npm run dev:mobile` en otra. Abre la URL LAN que imprime Vite, por ejemplo `http://192.168.x.x:5173/`. El navegador usa rutas `/api`; Vite las reenvia a la API local en tu computadora.

En modo LAN la API escucha en todas las interfaces y acepta orígenes IPv4 privados (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`). Para un hostname o puerto adicional puedes configurar `FINANZAS_ALLOWED_ORIGINS=http://mi-host:5173 npm run api:lan`. Todas las rutas de datos requieren una clave de acceso, incluso en modo local y a traves de Vite o preview. Al arrancar, la API genera una clave y la muestra en su terminal; introducela en la app una vez por pestaña. Reiniciar la API cambia la clave. Para fijarla, configura FINANZAS_API_TOKEN con al menos 32 bytes desde tu entorno privado; no uses variables VITE_*, URLs ni archivos versionados. HTTP no cifra datos ni credenciales: limita LAN a una red privada confiable y usa HTTPS si necesitas cifrado en transporte. Deten el modo LAN al terminar.

## Funcionalidad Implementada

- Experiencia mobile-first con navegacion inferior para celular y sidebar en escritorio.
- Dashboard con score de salud financiera, flujo mensual, runway liquido, uso de tarjeta, gasto por categoria y patrimonio.
- Captura manual de cuentas, movimientos e ingresos para empezar a trabajar con datos propios.
- Planeacion de metas con aportacion mensual requerida y lectura de viabilidad.
- Importador local de CSV y PDF:
  - CSV agrega movimientos validados al perfil activo.
  - PDF lee numero de paginas y texto inicial si existe.
- Persistencia principal en `data/finanzas-os.sqlite`.
- Matriz de conocimiento Mexico para explicar conceptos de tarjeta de credito, SPEI, CFDI de nomina, ISR, IMSS, INFONAVIT, RFC, CURP, NSS, SBC, SDI y subsidio para el empleo.
- Perfiles de ejemplo para validar el flujo sin cargar informacion personal.

## Formato CSV

El importador acepta encabezados:

```csv
date,amount,merchant,category,accountId
2026-06-12,-820,Supermercado,Vivienda,personal-checking
2026-06-15,12000,Nomina,Ingreso,personal-checking
```

`accountId` es opcional. Montos positivos se tratan como ingreso; negativos como gasto.

## Modelo De KPIs

- `financialHealthScore`: score compuesto 0-100 con flujo, runway, deuda, ahorro, tendencia patrimonial, metas y disciplina presupuestal.
- `monthlyCashFlowMargin`: flujo mensual / ingreso neto.
- `runwayMonths`: efectivo liquido / gastos esenciales.
- `savingsRate`: ahorro / ingreso neto.
- `debtToIncome`: pagos minimos de deuda / ingreso bruto.
- `creditUtilization`: balance de tarjetas / limite de credito.
- `goalOnTrackRatio`: avance proyectado de metas contra objetivo.

## Seguridad Y Datos Reales

La aplicacion guarda datos en una base SQLite local dentro del proyecto y no envia informacion a servicios externos. La API escucha en `127.0.0.1`; para celular se accede por el proxy de Vite. Para uso continuo con datos financieros personales conviene agregar cifrado local fuerte, exportaciones cifradas, backups controlados y conectores bancarios formales con OAuth.

## Base De Datos Local

La base recomendada para este tipo de informacion es SQLite porque permite:

- Archivo local portable y respaldable.
- Consultas relacionales para cuentas, movimientos, documentos, metas y matriz de conocimiento.
- Transacciones y WAL para reducir riesgo de corrupcion.
- API local simple sin depender de cloud.

Ruta por defecto:

```text
data/finanzas-os.sqlite
```

La primera ejecucion de `npm run api` crea la base, activa WAL y siembra la matriz de conocimiento interna.

## Trazabilidad documental

Además del perfil compatible en `profiles.data_json`, las migraciones SQLite crean proyecciones normalizadas:

- `documents`, `document_fields` y `document_rows` conservan fuente, periodo, moneda, confianza y estado de revisión.
- `reconciliation_matches` registra la relación entre filas documentales y movimientos del perfil.
- `transaction_amounts` conserva importes en unidades menores (`amount_minor`) para evitar errores de punto flotante.

Las migraciones son incrementales y se registran en `schema_migrations`. Los endpoints locales `GET /api/profiles/:id/documents`, `GET /api/profiles/:id/reconciliation` y `GET /api/profiles/:id/transaction-amounts` exponen estas proyecciones para auditoría. La copia del archivo original solo se marca como disponible cuando la ruta existe y apunta a un archivo; el importador actual todavía no copia automáticamente archivos crudos.

Los perfiles existentes generan estas proyecciones al volver a guardarse; sus datos originales permanecen en `profiles.data_json`. La conciliación solo marca una coincidencia cuando la moneda también coincide.

Para validar la persistencia local, ejecuta `npm run test:db`.
