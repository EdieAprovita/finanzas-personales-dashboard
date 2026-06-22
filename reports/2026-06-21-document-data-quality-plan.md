# Document Data Quality Plan - Finanzas OS

Date: 2026-06-21
Scope: local SQLite profile data and document import pipeline. No raw financial files, full account numbers, OCR text dumps, or personal identifiers were copied into this report.

## Dataset And Grain

Current local SQLite aggregate:

- Profiles: 1
- Documents: 61
- Accounts: 9
- Transactions: 656
- Extracted rows/concepts: 843
- Average document confidence: 0.849
- Documents by type: 19 PDF, 28 XML, 14 CSV
- Documents by status: 42 processed, 19 needs_review
- Documents by kind: 28 payroll_cfdi, 16 credit_card_statement, 12 bank_statement, 5 invoice_cfdi

Grain assumptions:

- `ImportedDocument` is one uploaded financial file.
- `Transaction` is one normalized financial movement.
- XML CFDI can produce one income/expense movement plus detail concepts.
- PDF statements remain review-first until table layout parsing is reliable.

## Checks Performed

- Schema/path review of `src/lib/importers.ts`, `server/knowledge-seed.mjs`, `server/index.mjs`, and `src/features/imports/Imports.tsx`.
- Local aggregate profile over SQLite data without printing raw filenames or extracted text.
- Synthetic benchmark for CSV, XML, digital PDF, Tesseract.js OCR, and local Tesseract CLI.
- Browser e2e import flow with synthetic CSV, XML, and receipt image.
- Official/confiable source review for Mexico financial document semantics:
  - SAT CFDI nomina: https://www.sat.gob.mx/consultas/97722/comprobante-de-nomina
  - CONDUSEF estado universal TDC: https://nuevoestadodecuentadetdc.condusef.gob.mx/
  - Banxico CEP/SPEI: https://www.banxico.org.mx/cep/
  - Nu Mexico products/transparency: https://nu.com.mx/
  - GBM products: https://gbm.com/
  - Cetesdirecto products: https://www.cetesdirecto.com/sites/portal/productos.cetesdirecto
  - CONSAR cuenta individual/Afore: https://www.consar.gob.mx/gobmx/aplicativo/catsar/Principal/TramiteExt.aspx?idTramite=4&PAG_ACTUAL=/gobmx/aplicativo/catsar/Principal/InicioExt.aspx
  - CFPB credit-card key terms: https://www.consumerfinance.gov/consumer-tools/credit-cards/answers/key-terms/

## Findings

### 1. PDFs are the main quality risk

Evidence: 19 of 61 documents are PDFs and all imported PDFs are review-first. Before this change, existing PDFs had no `qualityScore`; new imports now record `qualityScore`, `textLength`, `detectedFields`, `expectedFields`, and `missingFields`.

Risk: dashboard balances, credit-card liabilities, and investment values can be under-modeled if PDF statements only create shell accounts.

Fix implemented: PDF imports now extract structured fields for card, bank, and investment statements and score coverage without applying movements automatically.

Next automated check: require PDF synthetic fixtures to detect at least one balance/date/payment field per kind.

### 2. OCR coverage was too narrow for real statements

Evidence: previous scanned PDF OCR processed at most 2 pages. Real card and bank statements often put payment dates, summary, and transaction tables on separate pages.

Risk: missing key fields even when OCR technically runs.

Fix implemented: PDF OCR now covers the computed page limit, and image OCR uses local preprocessing before Tesseract.js.

Next improvement: add per-page density checks so mixed PDFs OCR only pages with low embedded text.

### 3. Classification lacked Nu, GBM, Cetesdirecto, savings, and retirement signals

Evidence: prior institution inference covered major banks and AMEX, but not Nu, GBM, Cetesdirecto, Hey Banco, HSBC, etc.

Risk: savings and investment statements become generic bank statements, losing correct account type and field expectations.

Fix implemented: classification/institution signals now include Nu Mexico, GBM, Smart Cash, Cetesdirecto, Cajitas, SOFIPO/GAT, PPR, ETFs, funds, and government securities.

### 4. Knowledge matrix did not search patterns/fields

Evidence: API matching used title, summary, and aliases only.

Risk: official-source patterns and expected fields existed but did not help explain pasted text or search matrix entries.

Fix implemented: search/explain now also use `patterns`, `fields`, and source ids. UI now shows fields and sources.

### 5. Real-document validation needs a synthetic-safe default

Evidence: `scripts/validate-real-imports.mjs` defaults to a personal financial folder. It prints only aggregate counts, but it still reads sensitive local files.

Risk: accidental PII exposure if future edits print raw filenames/text.

Recommended next fix: add `scripts/validate-synthetic-document-imports.mjs` with golden fixtures and make `test:imports` point to synthetic fixtures unless `FINANZAS_IMPORT_FIXTURES` is explicitly set for a local real-doc audit.

## Open-Source Libraries In Use

| Library | Role | Current Fit | Risk |
|---|---|---|---|
| `pdfjs-dist` | Digital PDF text extraction and page rendering | Good browser fit | Table structure is still weak |
| `tesseract.js` | Local browser OCR | Works offline/local after worker assets load | Needs preprocessing and page-level confidence |
| `fast-xml-parser` | CFDI XML parsing | Good for SAT XML structure | CFDI status still needs external SAT validation |
| `papaparse` | CSV statements | Good for CSV headers | Needs institution-specific cargo/abono schemas |

Local benchmark baseline also detected Tesseract CLI when installed. For heavier future local processing, evaluate Docling as a local sidecar for tables and multi-format document understanding, but do not upload real files to external processors.

## Current Validation Evidence

- `npm run lint`: passed
- `npm run build`: passed
- `npm run benchmark:documents`: passed on synthetic fixtures; CSV, XML, PDF, Tesseract.js, and Tesseract CLI detected expected demo fields.
- `npm run test:imports`: passed on 10 synthetic fixtures with 1 payroll deposit, 1 transfer-in, 3 bank withdrawals, Nu/GBM/Cetes/PPR/AFORE PDF signals, position/subaccount signals and net cash flow validation.
- `npm run analyze:documents`: passed against local SQLite and emits aggregate-only JSON. The report was saved to `reports/latest-document-quality-diagnostic.json` without filenames, raw OCR text, merchants, account identifiers or per-document paths.
- `npm run test:e2e -- --project=desktop-chrome --grep "imports synthetic CSV"`: passed in browser on desktop Chrome.
- Knowledge-source integrity check: 52 entries, 32 sources, 0 missing source ids.

Latest local aggregate profile, computed without printing filenames, raw OCR text, merchants or identifiers:

- Profiles: 1
- Documents: 61
- Documents by kind: 28 payroll CFDI, 16 credit-card statements, 12 bank statements, 5 invoice CFDI
- Documents by file type: 19 PDF, 28 XML, 14 CSV
- Documents by status: 42 processed, 19 needs_review
- Average stored quality/confidence: 0.849
- Important gap: older imported documents often have no `expectedFields`/`missingFields`, so stored coverage alone can overstate quality. Direct field-presence checks found 0/16 credit-card statements with key card fields such as cutoff/due dates, payments, charges and reconciliation; 0/12 bank statements with period/balance/deposit/withdrawal fields; and 28 payroll CFDI with net income but missing period/version/concept arrays because they were imported before the richer payroll parser.

Latest extension:

- Synthetic fixture set now includes 10 files: AMEX-like card CSV, payroll bank CSV, payroll XML, receipt image, credit-card PDF, Nu/Cajitas PDF, GBM Smart Cash/Trading PDF, Cetesdirecto PDF, PPR PDF and AFORE PDF.
- `npm run test:imports`: validates Nu/Cajitas/GAT, GBM/Smart Cash/Trading, Cetesdirecto/vencimiento, AFORE/PPR retirement signals and basic position/subaccount text signals.
- Desktop E2E validates Nu PDF as review-first `bank_statement`/savings, GBM/Cetes PDFs as review-first `investment_statement`, PPR/AFORE PDFs as retirement-backed investment statements, position/subaccount counts and no automatic movements from PDFs.

## Added Goal Inputs

The attached credit-card matrix architecture note is now treated as product guidance for the parser. The app should not blindly add PDF/card movements to the dashboard unless it can reconcile the statement math:

- Previous balance + new charges + deferred amortization + interest/IVA/fees - payments should match the current card balance or payment amount within tolerance.
- Universal card statements need separate fields for period, cutoff date, due date, minimum payment, minimum payment including deferred purchases, payment to avoid interest, CAT/rate, credit limit, available credit, and total debt balance.
- Deferred purchases need first-class fields: original amount, pending balance, installment number/total, required installment, rate, interest, IVA, and monthly commitment.
- Payment aggregators such as MercadoPago, Clip, Netpay, Zettle, Sr Pago, Toka, and Compropago must be modeled as processor plus probable real merchant, not as final category by default.
- Fees, annuality, late-payment charges, cash advances, replacement fees, interest, and IVA should be tagged as financial cost, not ordinary consumption.
- Disputed or unrecognized charges should be isolated with operation date, report date, folio/status, amount, linked transaction, and final resolution before affecting spend analytics.
- SAT CFDI product/service and unit codes can enrich tax/category hints, but ambiguous or business-deductible classifications remain review-first.

A real AMEX Mexico Account Activity CSV was inspected only for safe structure. No rows, merchants, account identifiers, addresses, or raw values were copied. The supported shape includes `Fecha`, `Fecha de Compra`, `Descripción`, `Titular de la Tarjeta`, `Cuenta`, `Importe`, `Monto en moneda extranjera`, `Tipo de Cambio`, `Información Adicional`, `Aparece en su Estado de Cuenta como`, location fields, country, and `Referencia`. Automated tests use a synthetic AMEX-like fixture instead of the real file.

## Implementation Update - Document Quality And Movement Intent

Added a document-quality layer in the app:

- `Documentos` now shows coverage score, processed/review/rejected counts, confidence, top remediation actions, and a breakdown by document type.
- `Dashboard` now shows a compact `Pulso documental` so the user can see whether insights are backed by processed documents or pending review.
- Recent-document fields are prioritized by type instead of blindly showing the first extracted keys.
- Field display now formats MXN amounts and percentages, making `qualityScore`, `CAT`, balances and OCR confidence readable.

Improved text-detection and safety:

- PDFs that are payroll/invoice/receipt-like are no longer forced into `bank_statement`.
- PDF balances are now marked as `balancePendingReview`; they are not applied automatically to account balances while the document remains review-first.
- OCR previews are redacted for sensitive identifiers such as fiscal IDs, CURP-like values, NSS, CLABE and long card/account numbers.
- Credit-card PDFs now extract additional fields: `minimumPaymentWithDeferred`, `availableCredit`, `totalDebtBalance`, `previousBalance`, `newCharges`, `paymentsAmount`, `interestAmount`, `feesAmount`, `vatAmount`, deferred flags and dispute flags.
- Investment/Nu/GBM/Cetes/PPR/AFORE extraction now captures currency, liquidity, settlement window, retirement account type, AFORE signals and instruments including BONDDIA, ENERFIN and SIEFORE.

Improved movement classification:

- Added a financial-intent classifier so movements are not classified only by sign.
- Payroll deposits become `income` with category `Nomina`.
- Credit-card payments become `debt_payment`.
- GBM/Cetes/Smart Cash/Cajita/PPR/AFORE/investment contributions are treated as `transfer`/patrimonial movements, not ordinary expenses.
- Investment yields, dividends, coupons, interest and GAT-like text become income categories for returns.
- Payroll account statements with `Depósito`/`Retiro`/`Saldo` or `Tipo` + `Monto` are treated as bank statements with deposits and withdrawals, not as payroll CFDI, even when the filename is payroll/nomina-oriented.
- Bank-statement CSV imports persist `bankMovementRows`, `depositsTotal`, `withdrawalsTotal` and `closingBalance` so the UI can reconcile cash movement from statement-level totals.
- Bank-statement CSV imports now also persist `depositRows`, `withdrawalRows`, `incomeRows`, `expenseRows`, `transferRows`, `debtPaymentRows`, `payrollDepositRows`, totals by movement type, `netCashFlow`, `openingBalance`, `expectedClosingBalance`, `bankBalanceDifference` and `bankReconciliationStatus`.
- CSV bank schema detection now accepts `Cargo`, `Cargos`, `Abono`, `Abonos`, `Credit`, `Debit`, `Tipo`, `Naturaleza`, `Monto` and `Saldo` variants, and ambiguous rows with both deposit and withdrawal are skipped with an explicit warning.
- CSV bank/payroll rows with positive `Monto/Amount` but no `Tipo/Naturaleza` can now be recovered when the previous and current `Saldo` prove the direction within a tight tolerance. Balance-inferred deposits default to `transfer` unless the concept clearly indicates payroll/yield, so the app captures the cash-flow direction without inflating income KPIs.
- Payroll account statements are modeled as account movement evidence: deposits can be payroll income, withdrawals can be expenses/transfers/debt payments, and the payroll CFDI remains deduped against the matching bank deposit. A `RETIRO CAJERO NOMINA` style row is no longer treated as payroll income just because the concept contains "nomina".
- Bank-statement PDFs can now persist visible movement rows as `statementMovementRows` with date, concept, deposit, withdrawal, balance, movement type and category. These rows do not create transactions or alter dashboard cash flow until the user approves them from Documentos.
- PDF movement extraction now covers both labeled rows (`MOVIMIENTO: ... | descripcion ...`) and header-gated table rows (`Fecha Concepto Deposito Retiro Saldo`). The tabular parser normalizes `yyyy-mm-dd` and `dd/mm/yyyy`, supports comma-decimal money strings, skips ambiguous rows with both deposit and withdrawal, and requires a movement-table header to reduce false positives from prose.
- Users can now explicitly approve visible bank-statement PDF rows from Documentos. The approval path applies those rows through the same transaction dedupe logic as CSV/XML, updates the account balance from the reviewed statement balance, marks the document with `reviewedMovementRowsApproval = manual_user_action`, and preserves that approval metadata if the same PDF is reimported.
- Bank-statement and savings PDFs now capture CEP/SPEI metadata aligned with Banxico fields: `speiTraceKey`, `speiReferenceNumber`, `speiIssuerInstitution`, `speiReceiverInstitution`, `speiBeneficiaryAccountLast4` and `speiPaymentAmount`. Full beneficiary accounts are reduced to last four digits.
- Credit-card PDF reconciliation now separates `deferredAmortization`, `financialCostsTotal`, `cardReconciliationStatus` and `cardReconciliationSeverity`; the interest regex excludes "pago para no generar intereses" so payment amounts are not misread as interest charges.
- Credit-card PDFs now capture visible card movement rows as review-first evidence in `cardMovementRows`, with separate charge, payment and credit columns plus row counts/totals. Balanced card statements can now be manually approved from Documentos, turning charges into expenses, payments into `debt_payment`, credits into transfers, and updating card account/debt fields without automatic application.
- Payroll-account statements can contain both deposits and withdrawals. The current rule is: `payroll_cfdi` represents the payroll receipt, while account statements named "nomina" remain `bank_statement` cash-flow evidence when they include deposits/retiros/saldo. Deposit rows can become income only when direction is clear; withdrawal rows such as `RETIRO CAJERO NOMINA`, card payments and transfers remain expense/debt-payment/transfer.
- Goal requirement locked: payroll bank/account statements are mixed-flow sources. The app must preserve deposits and withdrawals as separate facts, must not infer salary income from the word "nomina" on a withdrawal, and must keep ambiguous positive amounts in review instead of inflating income KPIs.
- Ambiguous bank/payroll CSV rows with positive `Monto/Amount` but no clear direction and no provable balance delta are still omitted with `ambiguousDirectionRows` and the document is marked `needs_review`, so unclear payroll-account withdrawals cannot inflate income KPIs.
- Nu/Cajitas PDF extraction now captures `savingsProduct`, `annualYieldPercent`, `nominalGatPercent`, `realGatPercent`, `yieldCalculationDate`, `yieldValidUntil`, `periodYield`, `frozenTermDays`, `minimumAmount`, `protectionLimitUdis` and `monthlyDepositLimitUdis`, using official Nu Cuenta/GAT concepts.
- GBM/Smart Cash/Trading PDF extraction now captures `investmentProduct`, `portfolioValue`, `cashBalance`, `availableToInvest`, `periodReturn`, `dailyReturn`, `annualYieldPercent`, `currency`, `market`, `liquidity`, `settlementWindow`, `contributionsTotal`, `investmentWithdrawalsTotal`, `commissionsAmount`, `taxWithheld`, `unrealizedGain` and detected instruments.
- Cetesdirecto PDF extraction now captures `instrumentType`, `titleCount`, `purchaseDate`, `maturityDate`, `termDays`, `nominalValue`, `marketValue`, `maturityValue`, `availableToWithdraw`, `dailyLiquidity`, `riskLevel`, `settlementWindow`, tax withheld and detected instruments.
- PPR/AFORE PDF extraction now captures `retirementProduct`, `retirementBalance`, `monthlyContribution`, `taxDeductibleAmount`, `voluntaryContributions`, `mandatoryContributions`, `employerContributions`, `governmentContributions`, `retirementWithdrawals`, `subaccounts`, `siefore`, `netReturnIndicator`, `weeksContributed` and long-term liquidity/restriction flags.
- PPR/AFORE statement accounts now use `AccountType = retirement`, while Cetes/GBM remain `investment`.
- Basic position parsing now captures `positions`, `positionRows`, `positionsMarketValue`, and per-position `name`, `instrumentType`, `quantity`, `price`, `marketValue`, and optional `unrealizedGain` for Cetes/PPR-style investment rows.
- AFORE subaccount parsing now captures `subaccountPositions`, `subaccountRows`, `subaccountBalanceTotal`, and per-subaccount `name`, `balance`, `contributions`, `withdrawals`, and `periodReturn`.
- The compact document preview shows counts/totals for positions and subaccounts, and Documentos now renders expandable review tables for position/subaccount rows instead of hiding full arrays in API metadata.
- Monthly snapshot generation now excludes `transfer` movements from income/expense, so aportaciones/retiros between bank, Smart Cash, Trading, Cajitas or investment accounts do not inflate operating income or spending.
- Knowledge matrix was extended and aligned with camelCase extractor fields for Nu GAT, GBM cash/liquidity, Cetesdirecto, PPR and AFORE.
- Synthetic E2E now imports both an AMEX-like credit-card CSV and a payroll bank statement CSV with deposits/retiros, and asserts the payroll bank statement renders as `bank_statement` with 1 income, 1 expense, 1 debt payment and 3 transfers, including a transfer to GBM and a positive `Tipo=Ingreso` transfer-in that must not inflate operating income.
- Payroll-account statement imports now persist `payrollAccountDepositRows`, `payrollAccountWithdrawalRows` and `payrollAccountMixedFlow`. This makes the UI explicit when an account named or used for nomina contains both deposits and withdrawals; only clear payroll deposits count as `income`, while withdrawals and transfers are classified by concept/direction.
- PDF imports now reconstruct text by visual lines from `pdfjs-dist` item coordinates before falling back to OCR, read up to 8 pages, and expose `pdfTextMode`, `pdfTextPagesRead`, `pagesWithLayoutText` and `pagesWithOcrText`. Bank-statement PDFs with nomina context now expose the same mixed-flow fields as CSV: `payrollAccountDepositRows`, `payrollAccountWithdrawalRows`, `payrollAccountMixedFlow`, `payrollDepositRows`, `payrollDepositTotal`, movement-type counts and bank reconciliation fields.
- Documentos now includes a `Brechas de captura` panel that derives current expected fields by document type, independent of legacy `missingFields`. It flags how many already-imported documents need reimport or expanded extraction and lists aggregate missing fields without exposing filenames or raw document text.
- Documentos now includes an `Estado de captura` card and a per-document quality chip (`Completo`, `Incompleto`, `Legado`) computed from persisted metadata. This makes the current real-data limitation explicit: raw files are not stored, so older documents can be audited from metadata but must be uploaded again to recapture text with the latest extractor.
- Current local SQLite aggregate, without filenames or raw text: 1 profile, 61 documents, 19 PDFs, 28 XMLs, 14 CSVs, 42 processed, 19 `needs_review`, and 0 documents with the new stored `expectedFields` quality schema before reimport.
- Added `npm run analyze:documents`, a read-only SQLite diagnostic for current imported profile data. It reports only aggregate counts by kind/status/file type, legacy/current quality-schema coverage, review risk, field coverage by document kind, top missing fields and sanitized recommended actions. It opens SQLite directly in read-only mode and does not import `server/db.mjs`, so it does not seed or mutate the database while auditing.
- New imports now persist a secondary local content fingerprint on processed PDF, CSV, XML and image documents. The fingerprint is used only to detect reimports with a different filename; `document.id` remains stable and previous manual approval metadata is preserved, so profile document lists and dropdowns do not grow duplicate cards for the same statement.
- `npm run analyze:documents` now reports aggregate-only fingerprint coverage and duplicate-fingerprint group counts without printing hashes, filenames or document contents.
- CSV imports now recognize investment-operation layouts with `fecha_operacion`, `fecha_liquidacion`, `ticker`/`emisora`, `titulos`, `precio`, `importe`, `comision`, `ISR` and `moneda`. These files are captured as `investment_statement` with `investmentOperationRows`, tickers, trade totals, commissions, tax withheld and cash-flow estimate, but remain `needs_review` and do not create transactions or alter dashboard income/expense automatically.
- Documentos now renders an `Operaciones de inversion para revisar` table for those CSV rows, keeping brokerage operations visible without treating purchases, sales, dividends or commissions as operating spend/income until there is a dedicated review flow.
- Synthetic PDF coverage now includes visible Nu/Cajitas bank movement rows in labeled and tabular formats and asserts the browser renders the review table while keeping `appliedRows = 0` and `sourceTransactionIds = []`.
- Synthetic PDF coverage now includes a credit-card movement table on page 5 to verify the import no longer stops at the first 4 pages. The desktop browser test asserts that the later-page row is visible in the review table.
- Desktop E2E now clicks PDF approval actions for both bank/savings statements and balanced card statements, validating `sourceTransactionIds`, `appliedRows`, manual approval metadata, account balance update, card debt, credit limit, payment minimum, due date and one applied transaction per approved PDF row.
- Credit-card PDF extraction now captures CONDUSEF-style payment scenarios as `cardPaymentScenarios`, with scenario name, monthly payment, months to payoff, estimated interest and estimated total cost. The document preview renders a dedicated `Escenarios de pago de tarjeta` table and persists `cardLowestInterestScenario`, `cardLowestEstimatedInterest` and `cardMaxInterestSavings` for debt-planning analysis.
- Payroll semantic dedupe now prevents bank-statement payroll deposits and matching CFDI payroll XML from inflating dashboard income when they share the same date and net amount, when the bank date is within 3 days and rounded within 1 peso, or when 2-4 partial bank deposits sum to the CFDI net amount. The protection works whether the CSV or XML is imported first.
- Bank/payroll CSV imports now treat generic positive deposits as `Nomina` when the file or account has payroll context and the concept is not already a transfer, investment, yield, refund or adjustment. This helps reconcile real bank rows where the concept only names the employer and does not include the word nomina.
- Imported documents persist `appliedRows`, `skippedDuplicateRows`, `skippedSemanticDuplicates`, `matchedTransactionIds` and `dedupeReason` so users can see when a document is evidence only and did not create a second movement.
- The import summary now separates extracted rows/concepts from applied movements and omitted duplicates.
- Documentos and Dashboard now show a "Riesgo de conteo y conciliacion" signal with applied documents, pending reconciliation and duplicate rows omitted.
- Payroll CFDI XML extraction now captures period start/end, payroll complement version, payroll type, periodicity, paid days, masked suffixes for fiscal/labor identifiers, UUID suffix, SBC/SDI, ISR/IMSS/INFONAVIT, parent totals for taxable/exempt salary and withheld taxes, employment subsidy, labor codes and line-level perception/deduction/other-payment details.
- Documentos now renders visible payroll CFDI detail tables for perceptions, deductions and other payments using only safe concept/type/key/amount columns, keeping RFC/CURP/NSS/account/UUID values masked or out of the table.
- Payroll XML documents now persist `detectedFields`, `expectedFields` and `missingFields`, so the document quality layer can measure payroll completeness instead of relying only on generic confidence.
- Synthetic payroll XML fixtures and desktop E2E now validate detailed payroll extraction, including complement version 1.2, period, ISR/IMSS, UUID suffix, visible concept tables and semantic dedupe against a matching bank-statement payroll deposit.
- Desktop E2E validates that an account statement with nomina context can contain deposits and withdrawals at the same time: the payroll deposit is income, a cash withdrawal with `NOMINA` in the concept remains expense, card payment remains debt payment, SPEI/investment movements remain transfers, and a positive transfer-in marked `Ingreso` remains transfer rather than salary income.
- Knowledge matrix was expanded from 52 to 60 entries while keeping source integrity checks active. New contract-style entries cover payroll bank statements, real credit-card layouts, Nu/SOFIPO statements, GBM trades/taxes, BMV/Indeval market infrastructure, Cetesdirecto ladders, official AFORE statements and PPR tax treatment, using camelCase extractor field names. The credit-card payment-scenarios entry now maps to the app's actual camelCase scenario fields.

## Next Priorities

1. Add institution-specific CSV schemas for Nu, Cetesdirecto and AFORE with `cargo`, `abono`, `deposito`, `retiro`, `saldo`, subaccount and retirement-specific fields. GBM/Cetes-style operation CSV now has a review-first baseline.
2. Expand position and bank-movement extraction beyond synthetic row labels to real table layouts from GBM/AFORE/Cetesdirecto/Nu/bank PDFs, including multi-line holdings, multi-page tables and account movement tables.
3. Expand approval controls beyond whole-row approval: field-level confidence, row exclusion, edited amounts/categories, and clear before/after reconciliation before applying extracted PDF rows.
4. Add a regression case for non-balanced card PDF statements proving the approval button stays hidden and the import remains review-only.
5. Normalize remaining knowledge-matrix fields to the app's camelCase extraction contract, especially payroll CFDI, bank/SPEI, invoice CFDI and investment subtypes.
6. Keep all real-document audits aggregate-only by default and never print raw OCR text or document paths in CI-style output.

## Official Source Notes

- Banco de Mexico CEP/SPEI: CEP lookup requires fields such as payment date, trace key or reference number, issuing institution, receiving institution, beneficiary account and payment amount. This supports preserving SPEI trace/payment concepts as reviewable movement evidence rather than dropping them during OCR/PDF extraction.
- CONDUSEF Estado de Cuenta Universal: the card statement guide exists to make credit-card statements uniform, easier to understand and comparable across issuers. That supports extracting payment scenarios and estimated interest as first-class planning fields instead of leaving them hidden in PDF text.
- Cetesdirecto official product descriptions distinguish CETES, BONOS, BONDES, UDIBONOS, BONDDIA and ENERFIN by term, coupon/rendimiento behavior, liquidity and risk. This supports keeping instrument/product fields separate from operating cash flow.
- GBM Smart Cash official material emphasizes MXN/USD, daily growth and liquidity/access timing. This supports `currency`, `liquidity`, `settlementWindow`, `dailyReturn` and `availableToInvest` fields.
- CONSAR account-individual guidance confirms AFORE registration/account context and account-related documents; the app should keep AFORE subaccounts, retirement balance, weeks and beneficiary/identity fields privacy-safe and separate from normal investments.
- Nu Mexico GAT/Cuenta: the official Nu GAT page distinguishes GAT Nominal before taxes and GAT Real after estimated inflation, and publishes calculation/validity dates plus protection and minimum amount notes. This supports storing `yieldCalculationDate` and `yieldValidUntil` with Nu/Cajitas rates instead of treating current GAT values as timeless.
- Cetesdirecto products: the official product page describes CETES as instruments acquired below nominal value with $10 nominal value at maturity and terms such as 28, 91, 182, 364 and 728 days. It also distinguishes BONDDIA daily liquidity and ENERFIN daily operation with 48-hour settlement and higher market risk, supporting separate liquidity/risk fields for investment statements.
