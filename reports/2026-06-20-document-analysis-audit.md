# Auditoria de analisis documental financiero

Fecha: 2026-06-20
Estado: implementado y validado con benchmark sintetico y E2E mobile/desktop
Alcance: PDF, XML/CFDI, CSV, tickets/recibos, documentos escaneados e imagenes para la app Finanzas OS.

## Resumen ejecutivo

La app ya tiene un flujo documental funcional para una demo profesional con datos sinteticos:

- CSV: funciona bien para movimientos tabulares simples con `papaparse`.
- XML/CFDI: soporta nomina y factura con `fast-xml-parser`, validacion XML y extraccion por atributos/namespaces.
- PDF digital: usa `pdfjs-dist`; si no hay texto extraible, prueba OCR local en las primeras paginas.
- Tickets, recibos e imagenes: acepta PNG, JPG y WEBP, ejecuta OCR local con `tesseract.js`, extrae comercio, fecha, IVA, total y muestra confianza/warnings.
- Fechas: se valida calendario real; fechas imposibles como `2026-99-99` o `31/02/2026` no crean movimientos.
- XML no verificable: XML con nodos parecidos a CFDI pero sin namespace/version SAT queda en revision y no se aplica automaticamente.
- Fallos por archivo: errores de OCR/parsing quedan contenidos como documento rechazado sin abortar todo el lote.

La mejor opcion para esta app sigue siendo una arquitectura por capas, no una sola libreria para todos los documentos:

1. Mantener pipeline ligero en browser para CSV, XML y PDF digital.
2. Usar `fast-xml-parser` para CFDI.
3. Usar OCR local con `tesseract.js` para recibos/imagenes como baseline.
4. Evaluar Docling como sidecar local opcional para PDFs escaneados, tablas, layout complejo y formatos futuros.

## Estado actual del codigo

### Formatos soportados

- PDF, CSV, XML e imagenes entran por `importFinancialFile` en `src/lib/importers.ts`.
- La UI acepta `.pdf,.csv,.xml,.png,.jpg,.jpeg,.webp` y sus MIME types principales.
- `ImportedDocument.fileType` permite `pdf | csv | xml | image`.
- `DocumentKind` usa `purchase_receipt` para tickets/recibos detectados por OCR.

### PDF

Implementacion actual:

- `pdfjs-dist` lee hasta 4 paginas.
- Extrae texto plano con `page.getTextContent()`.
- Si el PDF no tiene texto extraible, renderiza paginas iniciales a canvas y ejecuta OCR local.
- Clasifica por palabras clave.
- Crea o actualiza una cuenta detectada.
- Siempre deja el PDF en `needs_review`.

Limitaciones:

- No reconstruye tablas.
- No usa coordenadas de texto para detectar columnas.
- No extrae movimientos de estados de cuenta PDF.
- El OCR de PDF escaneado cubre un baseline local, pero sigue requiriendo revision humana.

### CSV

Implementacion actual:

- `papaparse` parsea con headers normalizados.
- Reconoce columnas comunes: fecha, importe/monto/cargo/abono, descripcion/comercio.
- Crea transacciones y deduplica por fingerprint.
- Omite filas con fechas no parseables y registra warnings en vez de usar la fecha actual en silencio.
- Valida que la fecha exista en calendario real antes de construir movimientos.

Limitaciones:

- Si no reconoce el tipo, tiende a tratar CSV como tarjeta de credito.
- Importes usan `number` y regex simple; falta decimal exacto para dinero.

### XML/CFDI

Implementacion actual:

- Usa `fast-xml-parser` con `XMLValidator`.
- Soporta CFDI de nomina y CFDI factura.
- Extrae percepciones, deducciones, otros pagos, total, emisor/receptor, UUID y conceptos.
- Conserva atributos y remueve prefijos de namespace para hacer el parser portable entre browser y Node.
- Requiere señales CFDI/SAT (`sat.gob.mx/cfd`, namespace `cfdi` y version 3.3/4.0) para marcar documentos como procesados.
- Requiere namespace de nomina SAT para aplicar ingresos de nomina automaticamente.

Limitaciones:

- Falta schema interno por tipo de CFDI para normalizar campos y warnings.
- Falta cubrir mas variantes SAT reales con fixtures anonimizados.

### Tickets, recibos y escaneados

Estado actual:

- La app acepta PNG, JPG, JPEG y WEBP.
- `tesseract.js` corre bajo demanda en el navegador.
- Extrae comercio probable, fecha, IVA y total.
- Solo propone transaccion si hay total, fecha y confianza suficiente.
- La UI muestra confianza, campos extraidos y warnings sin persistir el archivo crudo.

Limitaciones:

- No hay preprocesamiento de imagen: rotacion, contraste, binarizacion, crop.
- No hay extraccion de items linea por linea.
- OCR con recibos reales de baja calidad puede requerir revision manual.

## Benchmark sintetico

Comando:

```bash
npm run benchmark:documents
```

Politica de datos: fixtures sinteticos generados en `/tmp`; no se usaron documentos financieros reales.

Resultado observado:

| Caso | Libreria/herramienta | Resultado | Tiempo |
| --- | --- | --- | ---: |
| CSV movimientos | `papaparse` | 3 filas, 0 errores, total detectado | 0.8 ms |
| CFDI nomina XML | `fast-xml-parser` | XML valido, nomina y deducciones detectadas | 1.7 ms |
| PDF digital | `pdfjs-dist` | saldo y movimiento detectados en texto extraible | 38.3 ms |
| Recibo escaneado PNG | `tesseract.js` | confianza 91%, comercio y total detectados | 188.9 ms |
| Recibo escaneado PNG | Tesseract CLI 5.5.2 | comercio y total detectados | 81.7 ms |

Conclusion del benchmark:

- `papaparse` sigue siendo correcto para CSV.
- `fast-xml-parser` es mejor base que `DOMParser` para CFDI porque valida y produce objetos JS con atributos/namespaces de forma portable.
- `pdfjs-dist` es suficiente para texto de PDF digital, pero no resuelve layout/tablas.
- `tesseract.js` es viable como baseline local dentro de la app; Tesseract CLI queda como baseline local de comparacion para benchmarks.
- Para recibos reales con sombras, rotacion y baja calidad se necesitara preprocesamiento y revision manual.

## Librerias open source evaluadas

| Necesidad | Recomendacion | Por que encaja | Riesgo |
| --- | --- | --- | --- |
| CSV | `papaparse` | Ya esta integrado, rapido, browser-friendly | Validar dialectos y fechas por banco |
| XML/CFDI | `fast-xml-parser` | MIT, ESM/browser/Node, valida XML y conserva atributos | Hay que mapear namespaces SAT con cuidado |
| PDF digital | `pdfjs-dist` | Ya integrado, Apache 2.0, corre en browser | No entiende tablas ni escaneos |
| OCR local simple | `tesseract.js` o Tesseract CLI | Open source, local/offline, baseline suficiente para recibos claros | Peso de modelos, calidad variable, requiere preprocesamiento |
| Preprocesamiento imagen | OpenCV.js | Rotacion, threshold, crop, blur/glare checks | Bundle grande; mejor cargar bajo demanda |
| PDF/layout avanzado | Docling | MIT, local, soporta PDF, imagenes, tablas, OCR, layout, JSON/Markdown | Python sidecar; modelos pesados; revisar licencias de modelos |
| Extraccion PDF a Markdown/JSON | Marker | Alta capacidad en documentos complejos | GPL/model license limita uso comercial amplio |
| ETL documental general | Unstructured | Muy completo para pipelines de documentos | Mas pesado; Docker/servicio externo complica privacidad |
| Dinero exacto | `decimal.js-light` | Evita errores de `number` en centavos | Migracion gradual de calculos |
| Validacion interna | `zod` | Ya instalado; ideal para schemas por tipo documental | Requiere definir contratos por parser |

## Decision recomendada

### Camino corto aplicado para demo profesional

1. `papaparse` se mantiene para CSV.
2. XML/CFDI ya usa `fast-xml-parser`.
3. `fileType: 'image'` ya existe y la UI acepta `.png,.jpg,.jpeg,.webp`.
4. OCR bajo demanda con `tesseract.js` ya funciona para imagenes y PDFs sin texto.
5. La UI ya muestra:
   - confianza,
   - campos extraidos,
   - warnings,
   - estado `needs_review` cuando la informacion no debe aplicarse automaticamente.

### Revision multiagente aplicada

Hallazgos corregidos despues de la revision:

- Fechas invalidas ya no pasan por regex solamente; ahora se valida calendario real.
- XML bien formado pero no verificable como CFDI/SAT ya no se marca como procesado ni crea movimientos.
- Fallos de OCR/parsing por archivo ya no abortan el lote completo; se crea un documento rechazado con warning.
- Las confirmaciones destructivas se limpian al salir de la vista de perfiles.

Cobertura agregada:

- E2E mobile y desktop para CSV/XML/imagen con OCR.
- E2E mobile y desktop para CSV con fecha imposible y XML no-SAT en revision.

### Camino robusto para datos reales

1. Crear un `DocumentAnalysisService` local con contratos por formato:
   - `detectFileKind`
   - `extractRawText`
   - `classifyDocument`
   - `extractFinancialFacts`
   - `proposeTransactions`
   - `needsReview`
2. Mover parsers a modulos separados:
   - `csvImporter`
   - `cfdiImporter`
   - `pdfTextImporter`
   - `receiptOcrImporter`
3. Agregar un sidecar local opcional para Docling:
   - solo para PDF escaneado, tablas complejas e imagenes,
   - nunca subir documentos reales a servicios externos por default.
4. Guardar documentos derivados con retencion y redaccion:
   - no guardar archivo crudo por default,
   - truncar OCR completo si no es necesario,
   - cifrar SQLite o cifrar `data_json` antes de persistir.

## Riesgos de privacidad

Datos derivados sensibles ya persistidos:

- nombres de empleador/emisor/receptor,
- UUID de CFDI,
- ultimos digitos de cuenta,
- conceptos de factura,
- comercios,
- saldos,
- movimientos.

Controles faltantes:

- cifrado local de SQLite/IndexedDB,
- autenticacion local para abrir la app,
- redaccion de logs/errores,
- politica de retencion de OCR completo,
- warning fuerte cuando se usa `dev:mobile` en red local.

## Backlog recomendado

### P0 - Contratos y seguridad minima

- Parcialmente cubierto: metadata de documento incluye `ocrConfidence`, `extractedFields`, `textPreview` y `warnings`.
- Cubierto: no aplicar movimientos de OCR/PDF automaticamente si falta fecha, total o confianza suficiente.
- Cubierto: mostrar campos extraidos y warnings en UI.
- Cubierto: evitar fallback silencioso de fecha a hoy; usar warning y `needs_review`.
- Pendiente: formalizar contratos `AnalyzedDocument`, `ExtractedField`, `ProposedTransaction` y `DocumentWarning`.

### P1 - Mejoras de parsers actuales

- Cubierto: migrar CFDI XML a `fast-xml-parser`.
- Agregar `decimal.js-light` para dinero.
- Separar parsers por formato y cubrirlos con unit tests.
- Mejorar clasificacion CSV para banco vs tarjeta.

### P2 - OCR local

- Cubierto: aceptar imagenes en importacion.
- Cubierto: integrar `tesseract.js` bajo demanda.
- Agregar preprocesamiento simple: escala de grises, threshold, rotacion.
- Parcialmente cubierto: extraer campos de recibo comercio, fecha, total e IVA.
- Pendiente: extraer lineas/items.

### P3 - Sidecar documental avanzado

- Probar Docling con PDFs escaneados y estados de cuenta con tablas.
- Definir si corre como comando local, proceso Python o microservicio localhost.
- Mantenerlo opcional para no aumentar el peso inicial de la app.

## Fuentes consultadas

- Docling GitHub: https://github.com/docling-project/docling
- Docling technical report: https://arxiv.org/abs/2408.09869
- Unstructured GitHub: https://github.com/Unstructured-IO/unstructured
- Marker GitHub: https://github.com/datalab-to/marker
- Tesseract.js GitHub: https://github.com/naptha/tesseract.js
- fast-xml-parser GitHub: https://github.com/NaturalIntelligence/fast-xml-parser
- PapaParse GitHub: https://github.com/mholt/PapaParse
- Mozilla PDF.js GitHub: https://github.com/mozilla/pdf.js
