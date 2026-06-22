import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const runtimePython =
  process.env.CODEX_BUNDLED_PYTHON ??
  process.env.PYTHON ??
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')

export function generateSyntheticDocumentFixtures() {
  const dir = mkdtempSync(join(tmpdir(), 'finanzas-doc-fixtures-'))
  const csvPath = join(dir, 'account-activity-amex-demo.csv')
  const bankCsvPath = join(dir, 'estado-cuenta-bancario-demo.csv')
  const nuSavingsCsvPath = join(dir, 'cuenta-nu-cajitas-demo.csv')
  const gbmOperationsCsvPath = join(dir, 'operaciones-gbm-demo.csv')
  const aforeSubaccountsCsvPath = join(dir, 'subcuentas-afore-demo.csv')
  const xmlPath = join(dir, 'cfdi-nomina-demo.xml')
  const pdfPath = join(dir, 'estado-cuenta-tarjeta-demo.pdf')
  const nuSavingsPdfPath = join(dir, 'estado-cuenta-nu-cajitas-demo.pdf')
  const gbmInvestmentPdfPath = join(dir, 'estado-cuenta-gbm-smart-cash-demo.pdf')
  const cetesInvestmentPdfPath = join(dir, 'estado-cuenta-cetesdirecto-demo.pdf')
  const pprRetirementPdfPath = join(dir, 'estado-cuenta-ppr-demo.pdf')
  const aforeRetirementPdfPath = join(dir, 'estado-cuenta-afore-demo.pdf')
  const receiptPath = join(dir, 'recibo-demo.png')

  writeFileSync(
    csvPath,
    [
      'Fecha,Fecha de Compra,Descripción,Titular de la Tarjeta,Cuenta,Importe,Monto en moneda extranjera,Tipo de Cambio,Información Adicional,Aparece en su Estado de Cuenta como,Dirección,Población/Provincia,Código postal,País,Referencia',
      '13 Jun 2026,12 Jun 2026,SUPERMERCADO DEMO,PERSONA DEMO,****1001,1250.50,,,,SUPERMERCADO DEMO,,,,MX,REF-DEMO-001',
      '15 Jun 2026,15 Jun 2026,PAGO RECIBIDO,PERSONA DEMO,****1001,-3200.00,,,,PAGO RECIBIDO,,,,MX,REF-DEMO-002',
      '18 Jun 2026,17 Jun 2026,COMPRA INTERNACIONAL DEMO,PERSONA DEMO,****1001,99.99,5.25 USD,19.05,,COMERCIO EXTRANJERO DEMO,,,,US,REF-DEMO-003',
    ].join('\n'),
  )

  writeFileSync(
    bankCsvPath,
    [
      'Fecha,Descripción,Tipo,Monto,Saldo',
      '01/06/2026,NOMINA EMPRESA DEMO,Depósito,45000.00,45000.00',
      '03/06/2026,RETIRO CAJERO NOMINA DEMO,Retiro,1250.50,43749.50',
      '05/06/2026,PAGO TARJETA DEMO,Retiro,3200.00,40549.50',
      '06/06/2026,SPEI ENTRE CUENTAS DEMO,Retiro,5000.00,35549.50',
      '07/06/2026,TRANSFERENCIA CUENTA PROPIA DEMO,Ingreso,700.00,36249.50',
    ].join('\n'),
  )

  writeFileSync(
    gbmOperationsCsvPath,
    [
      'Fecha Operacion,Fecha Liquidacion,Operacion,Ticker,Tipo Instrumento,Mercado,Titulos,Precio,Importe,Comision,ISR,Moneda',
      '2026-06-04,2026-06-06,Compra,CETES 28D,CETES,MX,15000,9.95,149250.00,45.00,0.00,MXN',
      '2026-06-11,2026-06-13,Venta,GBMTRAC ETF,ETF,MX,25,72.40,1810.00,18.00,5.00,MXN',
      '2026-06-20,2026-06-20,Dividendo,FIBRA DEMO,FIBRA,MX,0,0.00,350.00,0.00,35.00,MXN',
    ].join('\n'),
  )

  writeFileSync(
    nuSavingsCsvPath,
    [
      'Fecha,Concepto,Deposito,Retiro,Saldo,Producto,GAT Nominal,GAT Real,Vigencia,Proteccion UDIs',
      '2026-06-01,SALDO INICIAL CAJITA TURBO,0.00,0.00,80000.00,Cajita Turbo,13.88%,9.77%,2026-07-08,25000',
      '2026-06-05,RENDIMIENTO CAJITA TURBO,845.30,0.00,80845.30,Cajita Turbo,13.88%,9.77%,2026-07-08,25000',
      '2026-06-10,RETIRO CAJITA A CUENTA PROPIA,0.00,6000.00,74845.30,Cajita Turbo,13.88%,9.77%,2026-07-08,25000',
    ].join('\n'),
  )

  writeFileSync(
    aforeSubaccountsCsvPath,
    [
      'Subcuenta,Saldo,Aportaciones,Retiros,Rendimiento,SIEFORE,Semanas cotizadas,Producto retiro',
      'Retiro Cesantia y Vejez RCV,430000.00,18500.00,0.00,5100.00,SIEFORE Basica 85-89,820,AFORE',
      'Ahorro voluntario,35000.00,35000.00,4000.00,1200.00,SIEFORE Basica 85-89,820,AFORE',
      'Vivienda INFONAVIT,55000.00,12000.00,0.00,0.00,SIEFORE Basica 85-89,820,AFORE',
    ].join('\n'),
  )

  writeFileSync(
    xmlPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:nomina12="http://www.sat.gob.mx/nomina12" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-06-15" Total="42000.00" SubTotal="48200.00">
  <cfdi:Emisor Nombre="EMPRESA DEMO SA DE CV" Rfc="AAA010101AAA" />
  <cfdi:Receptor Nombre="PERSONA DEMO" Rfc="XAXX010101000" />
  <cfdi:Complemento>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="2026-06-15" FechaInicialPago="2026-06-01" FechaFinalPago="2026-06-15" NumDiasPagados="15.000" TotalPercepciones="48000.00" TotalDeducciones="6200.00" TotalOtrosPagos="200.00">
      <nomina12:Emisor RegistroPatronal="Y1234567890" />
      <nomina12:Receptor Curp="XAXX010101HDFXXX00" NumSeguridadSocial="12345678901" NumEmpleado="EMP-12345" TipoContrato="01" TipoJornada="01" TipoRegimen="02" RiesgoPuesto="2" PeriodicidadPago="04" Banco="012" CuentaBancaria="123456789012345678" SalarioBaseCotApor="1600.00" SalarioDiarioIntegrado="1700.00" ClaveEntFed="CMX" />
      <nomina12:Percepciones TotalSueldos="48000.00" TotalGravado="48000.00" TotalExento="0.00"><nomina12:Percepcion TipoPercepcion="001" Clave="P001" Concepto="Sueldo" ImporteGravado="48000.00" ImporteExento="0.00" /></nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="200.00" TotalImpuestosRetenidos="6000.00">
        <nomina12:Deduccion TipoDeduccion="002" Clave="D001" Concepto="ISR" Importe="6000.00" />
        <nomina12:Deduccion TipoDeduccion="001" Clave="D002" Concepto="IMSS" Importe="200.00" />
      </nomina12:Deducciones>
      <nomina12:OtrosPagos><nomina12:OtroPago TipoOtroPago="002" Clave="OP001" Concepto="Subsidio empleo" Importe="200.00"><nomina12:SubsidioAlEmpleo SubsidioCausado="200.00" /></nomina12:OtroPago></nomina12:OtrosPagos>
    </nomina12:Nomina>
    <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555" />
  </cfdi:Complemento>
</cfdi:Comprobante>`,
  )

  const py = spawnSync(
    runtimePython,
    [
      '-c',
      `
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont, ImageFilter
pdf_path = r'''${pdfPath}'''
nu_pdf_path = r'''${nuSavingsPdfPath}'''
gbm_pdf_path = r'''${gbmInvestmentPdfPath}'''
cetes_pdf_path = r'''${cetesInvestmentPdfPath}'''
ppr_pdf_path = r'''${pprRetirementPdfPath}'''
afore_pdf_path = r'''${aforeRetirementPdfPath}'''
png_path = r'''${receiptPath}'''
c = canvas.Canvas(pdf_path, pagesize=(612, 792))
c.setFont("Helvetica", 14)
c.drawString(72, 720, "Estado de cuenta universal de tarjeta de credito demo")
c.drawString(72, 690, "Saldo final: $36,549.50")
c.drawString(72, 660, "Fecha de corte: 15 de junio de 2026")
c.drawString(72, 630, "Fecha limite de pago: 05 de julio de 2026")
c.drawString(72, 600, "Pago minimo: $1,250.00")
c.drawString(72, 570, "Pago para no generar intereses: $5,100.00")
c.drawString(72, 540, "Saldo actual: $5,100.00")
c.drawString(72, 510, "Limite de credito: $120,000.00")
c.drawString(72, 480, "Credito disponible: $114,900.00")
c.drawString(72, 450, "Saldo anterior: $7,000.00")
c.drawString(72, 420, "Total de cargos: $1,250.50")
c.drawString(72, 390, "Cargos diferidos: $0.00")
c.drawString(72, 360, "Total de pagos: $3,350.00")
c.drawString(72, 330, "Intereses: $100.00")
c.drawString(72, 300, "Comisiones: $50.00")
c.drawString(72, 270, "IVA: $49.50")
c.drawString(72, 240, "CAT 148.1%")
c.drawString(72, 215, "Escenarios de pago")
c.drawString(72, 195, "ESCENARIO: Pago minimo | pago: $1250.00 | meses: 8 | intereses: $950.00 | total: $6050.00")
c.drawString(72, 175, "ESCENARIO: Pago minimo x2 | pago: $2500.00 | meses: 3 | intereses: $280.00 | total: $5380.00")
c.drawString(72, 155, "ESCENARIO: Pago minimo x5 | pago: $6250.00 | meses: 1 | intereses: $0.00 | total: $5100.00")
c.setFont("Helvetica", 8)
c.drawString(72, 135, "Fecha Concepto Cargo Pago Credito")
c.drawString(72, 115, "2026-06-03 SUPERMERCADO DEMO 1250.50 0.00 0.00")
c.drawString(72, 95, "2026-06-05 PAGO RECIBIDO 0.00 3200.00 0.00")
c.drawString(72, 75, "2026-06-08 BONIFICACION DEMO 0.00 0.00 150.00")
for page in range(2, 5):
    c.showPage()
    c.setFont("Helvetica", 10)
    c.drawString(72, 720, f"Pagina {page} con avisos sinteticos de tarjeta")
c.showPage()
c.setFont("Helvetica", 8)
c.drawString(72, 720, "Fecha Concepto Cargo Pago Credito")
c.drawString(72, 700, "2026-06-10 FARMACIA DEMO 0.00 0.00 75.00")
c.drawString(72, 670, "Fecha Concepto Importe Saldo")
c.drawString(72, 650, "2026-06-11 RESTAURANTE DEMO 400.00 7400.00")
c.drawString(72, 630, "2026-06-12 PAGO APP DEMO 1000.00 6400.00")
c.drawString(72, 610, "2026-06-13 BONIFICACION COMERCIO DEMO 50.00 6350.00")
c.save()
nu = canvas.Canvas(nu_pdf_path, pagesize=(612, 792))
nu.setFont("Helvetica", 14)
nu.drawString(72, 720, "Estado de cuenta nomina Cuenta Nu y Cajitas demo")
nu.drawString(72, 690, "Nu Mexico Financiera S.A. de C.V., SFP")
nu.drawString(72, 660, "Periodo: 01 de junio de 2026 al 30 de junio de 2026")
nu.drawString(72, 630, "Cuenta terminacion: 7788")
nu.drawString(72, 600, "Saldo inicial: $80,000.00")
nu.drawString(72, 570, "Depositos: $25,000.00")
nu.drawString(72, 540, "Retiros: $10,000.00")
nu.drawString(72, 510, "Saldo final: $95,000.00")
nu.drawString(72, 480, "Cajita Turbo")
nu.drawString(72, 450, "Tasa de Rendimiento Anual Fija: 13.00%")
nu.drawString(72, 420, "GAT Nominal: 13.88%")
nu.drawString(72, 390, "GAT Real: 9.77%")
nu.drawString(72, 360, "Valores calculados el 7 de mayo de 2026")
nu.drawString(72, 335, "Vigencia al 8 de julio de 2026")
nu.drawString(72, 310, "Rendimiento del periodo: $845.30")
nu.drawString(72, 285, "Ahorro Congelado: 28 dias")
nu.drawString(72, 260, "Monto minimo de ahorro: $50.00")
nu.drawString(72, 240, "Fondo de Proteccion hasta por 25,000 UDIs")
nu.drawString(72, 225, "Limite de depositos mensuales 30,000 UDIs")
nu.setFont("Helvetica", 7)
nu.drawString(72, 210, "SPEI Clave de rastreo DEMO123456 Referencia 7654321")
nu.drawString(72, 197, "Institucion emisora del pago BANCO DEMO Institucion receptora del pago NU MEXICO")
nu.drawString(72, 184, "Cuenta Beneficiaria 012345678901234567 Monto del pago $4000.00")
nu.setFont("Helvetica", 8)
nu.drawString(72, 170, "MOVIMIENTO: 2026-06-03 | descripcion: NOMINA DEMO | deposito: $25000.00 | retiro: $0.00 | saldo: $105000.00")
nu.drawString(72, 150, "MOVIMIENTO: 2026-06-07 | descripcion: RETIRO CAJITA | deposito: $0.00 | retiro: $6000.00 | saldo: $99000.00")
nu.drawString(72, 130, "MOVIMIENTO: 2026-06-12 | descripcion: SPEI A CUENTA PROPIA | deposito: $0.00 | retiro: $4000.00 | saldo: $95000.00")
nu.drawString(72, 110, "Fecha Concepto Deposito Retiro Saldo")
nu.drawString(72, 90, "2026-06-20 INTERES CAJITA 845.30 0.00 95845.30")
nu.drawString(72, 70, "21/06/2026 RETIRO ATM 0.00 845.30 95000.00 Saldo final")
nu.showPage()
nu.setFont("Helvetica", 14)
nu.drawString(72, 720, "Movimientos compactos con importe y saldo")
nu.setFont("Helvetica", 8)
nu.drawString(72, 690, "Fecha Concepto Importe Saldo")
nu.drawString(72, 670, "2026-06-22 NOMINA COMPACTA DEMO 12000.00 92000.00")
nu.drawString(72, 650, "2026-06-23 PAGO TARJETA COMPACTA DEMO 3000.00 89000.00")
nu.drawString(72, 630, "2026-06-24 RETIRO ATM COMPACTO 1000.00 88000.00")
nu.save()
gbm = canvas.Canvas(gbm_pdf_path, pagesize=(612, 792))
gbm.setFont("Helvetica", 14)
gbm.drawString(72, 720, "Estado de cuenta GBM Smart Cash y Trading demo")
gbm.drawString(72, 690, "Periodo: 01 de junio de 2026 al 30 de junio de 2026")
gbm.drawString(72, 660, "Smart Cash Pesos")
gbm.drawString(72, 630, "Saldo disponible: $180,000.00")
gbm.drawString(72, 600, "Valor del portafolio: $245,500.00")
gbm.drawString(72, 570, "Disponible para comprar: $25,000.00")
gbm.drawString(72, 540, "Rendimiento del periodo: $1,250.75")
gbm.drawString(72, 510, "Rendimiento diario: $82.50")
gbm.drawString(72, 480, "Tasa anual: 9.25%")
gbm.drawString(72, 450, "Moneda MXN")
gbm.drawString(72, 420, "Liquidez 24 horas")
gbm.drawString(72, 390, "Liquidacion a 48 horas")
gbm.drawString(72, 360, "Trading MX acciones ETF fondos FIBRAS reporto")
gbm.drawString(72, 330, "Aportaciones: $20,000.00")
gbm.drawString(72, 300, "Retiros: $5,000.00")
gbm.drawString(72, 270, "Comisiones: $120.00")
gbm.drawString(72, 240, "ISR retenido: $80.00")
gbm.drawString(72, 210, "Ganancia no realizada: $4,500.00")
gbm.save()
cetes = canvas.Canvas(cetes_pdf_path, pagesize=(612, 792))
cetes.setFont("Helvetica", 14)
cetes.drawString(72, 720, "Estado de cuenta Cetesdirecto demo")
cetes.drawString(72, 690, "Periodo: 01 de junio de 2026 al 30 de junio de 2026")
cetes.drawString(72, 660, "Valores gubernamentales CETES BONDDIA UDIBONO")
cetes.drawString(72, 630, "Valor del portafolio: $150,000.00")
cetes.drawString(72, 600, "Instrumento: CETES")
cetes.drawString(72, 570, "Titulos: 15000")
cetes.drawString(72, 540, "Fecha de compra: 06 de junio de 2026")
cetes.drawString(72, 510, "Fecha de vencimiento: 04 de julio de 2026")
cetes.drawString(72, 480, "Plazo: 28 dias")
cetes.drawString(72, 450, "Valor nominal: $10.00")
cetes.drawString(72, 420, "Valor de mercado: $149,250.00")
cetes.drawString(72, 390, "Valor al vencimiento: $150,000.00")
cetes.drawString(72, 360, "Tasa anual: 10.25%")
cetes.drawString(72, 330, "Rendimiento del periodo: $750.00")
cetes.drawString(72, 300, "ISR retenido: $45.00")
cetes.drawString(72, 270, "Disponible para retirar: $25,000.00")
cetes.drawString(72, 240, "BONDDIA liquidez diaria")
cetes.drawString(72, 210, "ENERFIN liquidacion a 48 horas riesgo alto")
cetes.setFont("Helvetica", 9)
cetes.drawString(72, 180, "POSICION: CETES 28D | tipo: CETES | titulos: 15000 | precio: $9.95 | valor: $149250.00 | ganancia: $750.00")
cetes.drawString(72, 150, "POSICION: BONDDIA | tipo: BONDDIA | titulos: 2500 | precio: $10.00 | valor: $25000.00 | ganancia: $125.00")
cetes.save()
ppr = canvas.Canvas(ppr_pdf_path, pagesize=(612, 792))
ppr.setFont("Helvetica", 14)
ppr.drawString(72, 720, "Estado de cuenta Plan Personal para el Retiro PPR demo")
ppr.drawString(72, 690, "Periodo: 01 de junio de 2026 al 30 de junio de 2026")
ppr.drawString(72, 660, "Plan Personal para el Retiro")
ppr.drawString(72, 630, "Saldo de retiro: $310,000.00")
ppr.drawString(72, 600, "Valor del portafolio: $310,000.00")
ppr.drawString(72, 570, "Aportacion mensual: $8,000.00")
ppr.drawString(72, 540, "Aportaciones: $24,000.00")
ppr.drawString(72, 510, "Aportacion deducible: $24,000.00")
ppr.drawString(72, 480, "Aportaciones no deducibles: $2,000.00")
ppr.drawString(72, 450, "Rendimiento del periodo: $2,450.00")
ppr.drawString(72, 420, "ISR retenido: $120.00")
ppr.drawString(72, 390, "Fecha objetivo de retiro: 01 de junio de 2046")
ppr.drawString(72, 360, "Restriccion de retiro anticipado y liquidez de largo plazo")
ppr.drawString(72, 330, "Fondos acciones ETF reporto")
ppr.setFont("Helvetica", 9)
ppr.drawString(72, 300, "POSICION: Fondo Retiro Balanceado | tipo: FONDO | cantidad: 1200 | precio: $120.00 | valor: $144000.00 | ganancia: $12000.00")
ppr.drawString(72, 270, "POSICION: ETF Retiro MX | tipo: ETF | cantidad: 300 | precio: $553.33 | valor: $166000.00 | ganancia: $8450.00")
ppr.save()
afore = canvas.Canvas(afore_pdf_path, pagesize=(612, 792))
afore.setFont("Helvetica", 14)
afore.drawString(72, 720, "Estado de cuenta AFORE demo")
afore.drawString(72, 690, "CONSAR Cuenta Individual AFORE")
afore.drawString(72, 660, "Periodo: 01 de junio de 2026 al 30 de junio de 2026")
afore.drawString(72, 630, "AFORE Futuro Demo")
afore.drawString(72, 600, "SIEFORE Basica 85-89")
afore.drawString(72, 570, "Saldo total AFORE: $520,000.00")
afore.drawString(72, 540, "Saldo para el retiro: $520,000.00")
afore.drawString(72, 510, "Subcuenta Retiro, Cesantia y Vejez RCV")
afore.drawString(72, 480, "Ahorro voluntario: $35,000.00")
afore.drawString(72, 450, "Aportaciones obligatorias: $18,500.00")
afore.drawString(72, 420, "Aportaciones patronales: $12,000.00")
afore.drawString(72, 390, "Aportaciones gobierno: $1,200.00")
afore.drawString(72, 360, "Retiro de ahorro voluntario: $4,000.00")
afore.drawString(72, 330, "Rendimiento del periodo: $6,300.00")
afore.drawString(72, 300, "Indicador de rendimiento neto: 6.8%")
afore.drawString(72, 270, "Semanas cotizadas: 820")
afore.drawString(72, 240, "NSS: 12345678901")
afore.drawString(72, 210, "CURP XAXX010101HDFXXX00")
afore.drawString(72, 180, "Liquidez de largo plazo")
afore.setFont("Helvetica", 9)
afore.drawString(72, 150, "SUBCUENTA: RCV | saldo: $430000.00 | aportaciones: $18500.00 | retiros: $0.00 | rendimiento: $5100.00")
afore.drawString(72, 120, "SUBCUENTA: Ahorro voluntario | saldo: $35000.00 | aportaciones: $35000.00 | retiros: $4000.00 | rendimiento: $1200.00")
afore.save()
img = Image.new("RGB", (760, 420), "white")
draw = ImageDraw.Draw(img)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 36)
small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 30)
draw.text((48, 40), "TIENDA DEMO", font=font, fill="black")
draw.text((48, 105), "FECHA 2026-06-08", font=small, fill="black")
draw.text((48, 165), "SUPERMERCADO 1250.50", font=small, fill="black")
draw.text((48, 225), "IVA 172.48", font=small, fill="black")
draw.text((48, 285), "TOTAL $1250.50", font=font, fill="black")
img = img.filter(ImageFilter.GaussianBlur(0.35))
img.save(png_path)
`,
    ],
    { encoding: 'utf8' },
  )
  if (py.status !== 0) throw new Error(`No se pudieron generar fixtures sinteticos: ${py.stderr}`)

  return {
    dir,
    csvPath,
    bankCsvPath,
    nuSavingsCsvPath,
    gbmOperationsCsvPath,
    aforeSubaccountsCsvPath,
    xmlPath,
    pdfPath,
    nuSavingsPdfPath,
    gbmInvestmentPdfPath,
    cetesInvestmentPdfPath,
    pprRetirementPdfPath,
    aforeRetirementPdfPath,
    receiptPath,
  }
}
