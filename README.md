# Finanzas OS

Aplicacion local para centralizar informacion financiera personal, calcular salud financiera, ingresar cuentas y movimientos, cargar recibos de nomina o estados de cuenta, y planear metas como viajes, inmuebles, autos, deuda y fondo de emergencia.

## Stack

- React 19 + TypeScript + Vite
- Node 26 `node:sqlite` + API local para persistencia en archivo SQLite
- Dexie + IndexedDB como fallback del navegador
- Recharts para visualizaciones
- PapaParse + Zod para CSVs de estados de cuenta
- PDF.js para lectura local de PDFs
- Lucide React para iconografia

## Comandos

```bash
npm install
npm run api
npm run dev:mobile
npm run build
npm run lint
```

Para usarla desde tu celular o desde otro navegador en la misma red, deja corriendo `npm run api` en una terminal y `npm run dev:mobile` en otra. Abre la URL LAN que imprime Vite, por ejemplo `http://192.168.x.x:5173/`. El navegador usa rutas `/api`; Vite las reenvia a la API local en tu computadora.

La API solo acepta origenes locales de desarrollo: `localhost`, `127.0.0.1` y las IPs LAN activas de esta Mac. Si cambias de red o cambia la IP de tu Mac, reinicia `npm run api` para que recalcule los origenes permitidos.

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
