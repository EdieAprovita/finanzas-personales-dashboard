# Finanzas personales dashboard

## Contexto

- React 19 + TypeScript + Vite; API local Node 26 con SQLite en `server/`.
- Frontend en `src/`; persistencia local en `data/`; scripts de validación en `scripts/`.
- Los datos financieros y las bases SQLite son locales y no deben enviarse a servicios externos.

## Terminado cuando

- `npm run build` y `npm run lint` pasan.
- Para cambios de lógica, `npm run test:unit` pasa; para cambios de flujo UI, ejecutar también `npm run test:e2e` si el entorno lo permite.
- Se revisa el diff y no se incluyen `data/`, `dist/`, informes ni artefactos generados.

## Límites

- Mantener la API local y el esquema de persistencia salvo que el cambio lo solicite explícitamente.
- Validar CSV/PDF y cualquier entrada externa antes de persistirla.
- No usar documentos financieros reales en Graphify, pruebas o servicios externos; utilizar datos sintéticos.
