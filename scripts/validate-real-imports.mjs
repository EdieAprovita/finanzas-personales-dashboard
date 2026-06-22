import { inspectDocumentDirectory } from './lib/document-inspection.mjs'

const sourceDir = process.env.FINANZAS_IMPORT_FIXTURES
const allowRealDocs = process.env.FINANZAS_ALLOW_REAL_IMPORTS === '1' || process.argv.includes('--allow-real-docs')

if (!sourceDir || !allowRealDocs) {
  throw new Error(
    [
      'Validacion real bloqueada por seguridad.',
      'Usa npm run test:imports para fixtures sinteticos.',
      'Para una auditoria local real, ejecuta FINANZAS_IMPORT_FIXTURES=/ruta/a/fixtures FINANZAS_ALLOW_REAL_IMPORTS=1 npm run test:imports:real.',
      'La salida real solo debe contener conteos agregados, no filas, OCR crudo, rutas de documentos ni datos personales.',
    ].join('\n'),
  )
}

const result = {
  sourceDir: '[redacted-real-fixture-directory]',
  fixturePolicy: 'real local documents; explicit opt-in; aggregate output only',
  ...(await inspectDocumentDirectory(sourceDir, { includeImages: false })),
}

console.log(JSON.stringify(result, null, 2))
