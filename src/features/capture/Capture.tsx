import { useState } from 'react'
import { CircleDollarSign, Landmark, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { mxn } from '../../domain/finance'
import type { Account, AccountType, FinancialProfile, Goal, Transaction } from '../../domain/types'
import { GoalForm } from '../goals/GoalForm'
import {
  defaultGoalForm,
  goalFormEstimate,
  goalFormToGoal,
  validateGoalForm,
  type GoalFormState,
} from '../goals/goalFormModel'

type AccountForm = {
  name: string
  type: AccountType
  balance: string
  creditLimit: string
  minimumPayment: string
  dueDate: string
}

const emptyAccountForm = (asOfDate: string): AccountForm => ({
  name: '',
  type: 'checking',
  balance: '',
  creditLimit: '',
  minimumPayment: '',
  dueDate: asOfDate,
})

function isDebtAccount(type: AccountType): boolean {
  return type === 'credit_card' || type === 'loan'
}

function reverseManualTransaction(profile: FinancialProfile, transaction: Transaction): FinancialProfile {
  const paidDebt = transaction.type === 'debt_payment' ? profile.debts.find((debt) => debt.id === transaction.debtId) : undefined
  const accounts = profile.accounts.map((row) => {
    if (row.id === transaction.accountId) return { ...row, balance: row.balance - transaction.amount }
    if (paidDebt?.accountId === row.id) return { ...row, balance: row.balance - Math.abs(transaction.amount) }
    return row
  })
  const debts = profile.debts.map((debt) => {
    if (transaction.type === 'debt_payment' && debt.id === transaction.debtId) {
      return { ...debt, balance: debt.balance + Math.abs(transaction.amount) }
    }
    if (transaction.type === 'expense' && debt.accountId === transaction.accountId) {
      return { ...debt, balance: Math.max(0, debt.balance - Math.abs(transaction.amount)) }
    }
    return debt
  })
  return { ...profile, accounts, debts, transactions: profile.transactions.filter((row) => row.id !== transaction.id) }
}

export function Capture({ profile, asOfDate, onChange }: { profile: FinancialProfile; asOfDate: string; onChange: (profile: FinancialProfile) => void }) {
  const [account, setAccount] = useState<AccountForm>(() => emptyAccountForm(asOfDate))
  const [editingAccountId, setEditingAccountId] = useState('')
  const [transaction, setTransaction] = useState({
    date: asOfDate,
    amount: '',
    merchant: '',
    category: 'Supermercado',
    accountId: profile.accounts.find((row) => !isDebtAccount(row.type))?.id ?? '',
    debtId: profile.debts[0]?.id ?? '',
    type: 'expense' as Transaction['type'],
  })
  const [editingTransactionId, setEditingTransactionId] = useState('')
  const [goal, setGoal] = useState<GoalFormState>(() => defaultGoalForm(profile.goals.length ? 'savings' : 'emergency', asOfDate))
  const [editingGoalId, setEditingGoalId] = useState('')
  const [goalError, setGoalError] = useState('')
  const [message, setMessage] = useState('')

  const paymentAccounts = profile.accounts.filter((row) => !isDebtAccount(row.type))

  function resetAccountForm(): void {
    setAccount(emptyAccountForm(asOfDate))
    setEditingAccountId('')
  }

  function addAccount(): void {
    const balance = Number(account.balance)
    const creditLimit = account.creditLimit ? Number(account.creditLimit) : undefined
    const minimumPayment = account.minimumPayment ? Number(account.minimumPayment) : 0
    if (!account.name.trim() || !Number.isFinite(balance) || balance < 0 || (creditLimit !== undefined && (!Number.isFinite(creditLimit) || creditLimit < 0))) {
      setMessage('Revisa nombre, saldo y limite antes de guardar la cuenta.')
      return
    }
    if (isDebtAccount(account.type) && (!Number.isFinite(minimumPayment) || minimumPayment < 0 || !account.dueDate)) {
      setMessage('Captura el pago minimo y la fecha limite de la deuda.')
      return
    }
    const accountId = editingAccountId || `account-${Date.now()}`
    const nextAccount: Account = {
      id: accountId,
      name: account.name.trim(),
      type: account.type,
      balance: isDebtAccount(account.type) ? -balance : balance,
      currency: 'MXN',
      creditLimit,
    }
    const accounts = editingAccountId
      ? profile.accounts.map((row) => (row.id === editingAccountId ? nextAccount : row))
      : [nextAccount, ...profile.accounts]
    const debts = isDebtAccount(account.type)
      ? [
          ...profile.debts.filter((debt) => debt.accountId !== accountId),
          {
            id: `debt-${accountId}`,
            accountId,
            name: nextAccount.name,
            balance,
            apr: 0,
            minimumPayment,
            creditLimit,
            currency: 'MXN' as const,
            dueDate: account.dueDate,
          },
        ]
      : profile.debts.filter((debt) => debt.accountId !== accountId)
    onChange({ ...profile, accounts, debts })
    setMessage(editingAccountId ? 'Cuenta actualizada.' : 'Cuenta agregada.')
    resetAccountForm()
  }

  function addTransaction(): void {
    const amount = Math.abs(Number(transaction.amount))
    const sourceAccount = profile.accounts.find((row) => row.id === transaction.accountId)
    const debt = profile.debts.find((row) => row.id === transaction.debtId)
    if (!sourceAccount || !transaction.merchant.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Selecciona una cuenta y captura monto y concepto validos.')
      return
    }
    if (transaction.type === 'debt_payment' && (!debt || isDebtAccount(sourceAccount.type))) {
      setMessage('El pago de deuda requiere una cuenta de origen y una deuda destino.')
      return
    }
    const previousTransaction = profile.transactions.find((row) => row.id === editingTransactionId)
    const baseProfile = previousTransaction?.isManual ? reverseManualTransaction(profile, previousTransaction) : profile
    const signedAmount = transaction.type === 'income' ? amount : -amount
    const nextTransaction: Transaction = {
      id: editingTransactionId || `tx-${Date.now()}`,
      date: transaction.date,
      amount: signedAmount,
      merchant: transaction.merchant.trim(),
      category: transaction.type === 'debt_payment' ? 'Pago de deuda' : transaction.category.trim() || 'Sin categoria',
      accountId: sourceAccount.id,
      debtId: transaction.type === 'debt_payment' ? debt?.id : undefined,
      type: transaction.type,
      isManual: true,
      isEssential: ['Vivienda', 'Supermercado', 'Transporte', 'Salud'].includes(transaction.category),
    }
    const accounts = baseProfile.accounts.map((row) => {
      if (row.id === sourceAccount.id) return { ...row, balance: row.balance + signedAmount }
      if (nextTransaction.type === 'debt_payment' && row.id === debt?.accountId) return { ...row, balance: row.balance + amount }
      return row
    })
    const debts = baseProfile.debts.map((row) => {
      if (nextTransaction.type === 'debt_payment' && row.id === debt?.id) return { ...row, balance: Math.max(0, row.balance - amount) }
      if (nextTransaction.type === 'expense' && row.accountId === sourceAccount.id && isDebtAccount(sourceAccount.type)) {
        return { ...row, balance: row.balance + amount }
      }
      return row
    })
    onChange({ ...baseProfile, accounts, debts, transactions: [nextTransaction, ...baseProfile.transactions] })
    setMessage(editingTransactionId ? 'Movimiento actualizado.' : 'Movimiento guardado.')
    setEditingTransactionId('')
    setTransaction({ date: asOfDate, amount: '', merchant: '', category: 'Supermercado', accountId: paymentAccounts[0]?.id ?? '', debtId: profile.debts[0]?.id ?? '', type: 'expense' })
  }

  function saveGoal(): void {
    const validationError = validateGoalForm(goal, asOfDate)
    if (validationError) {
      setGoalError(validationError)
      return
    }
    const nextGoal = goalFormToGoal(goal, new Date().toISOString())
    const savedGoal: Goal = editingGoalId ? { ...nextGoal, id: editingGoalId } : nextGoal
    const goals = editingGoalId ? profile.goals.map((row) => (row.id === editingGoalId ? savedGoal : row)) : [savedGoal, ...profile.goals]
    onChange({ ...profile, goals })
    const estimate = goalFormEstimate(goal, asOfDate)
    setMessage(estimate ? `${savedGoal.name} requiere aproximadamente ${mxn(estimate.requiredMonthly)} al mes.` : `${savedGoal.name} guardada.`)
    setGoal(defaultGoalForm('savings', asOfDate))
    setEditingGoalId('')
    setGoalError('')
  }

  function editTransaction(row: Transaction): void {
    if (!row.isManual) return
    setEditingTransactionId(row.id)
    setTransaction({ date: row.date, amount: String(Math.abs(row.amount)), merchant: row.merchant, category: row.category, accountId: row.accountId, debtId: row.debtId ?? '', type: row.type })
    setMessage('Editando movimiento manual.')
  }

  function removeTransaction(row: Transaction): void {
    if (!row.isManual) return
    onChange(reverseManualTransaction(profile, row))
    setMessage('Movimiento manual eliminado.')
  }

  function editAccount(row: Account): void {
    const debt = profile.debts.find((candidate) => candidate.accountId === row.id)
    setEditingAccountId(row.id)
    setAccount({
      name: row.name,
      type: row.type,
      balance: String(Math.abs(row.balance)),
      creditLimit: row.creditLimit ? String(row.creditLimit) : '',
      minimumPayment: debt?.minimumPayment ? String(debt.minimumPayment) : '',
      dueDate: debt?.dueDate ?? asOfDate,
    })
  }

  function removeAccount(row: Account): void {
    if (profile.transactions.some((transactionRow) => transactionRow.accountId === row.id)) {
      setMessage('No puedes eliminar una cuenta con movimientos. Elimina o corrige sus movimientos primero.')
      return
    }
    onChange({ ...profile, accounts: profile.accounts.filter((candidate) => candidate.id !== row.id), debts: profile.debts.filter((debt) => debt.accountId !== row.id) })
    setMessage('Cuenta eliminada.')
  }

  function editGoal(row: Goal): void {
    setEditingGoalId(row.id)
    setGoal({
      name: row.name,
      type: row.type,
      targetAmount: String(row.targetAmount),
      currentSaved: String(row.currentSaved),
      targetDate: row.targetDate,
      plannedMonthlyContribution: String(row.plannedMonthlyContribution),
      priority: row.priority ?? 'medium',
      targetCoverageMonths: row.targetCoverageMonths ? String(row.targetCoverageMonths) : '',
    })
  }

  return (
    <div className="capture-grid">
      <section className="panel capture-card">
        <div className="panel-heading">
          <div>
            <h2>{editingAccountId ? 'Editar cuenta o deuda' : 'Agregar cuenta o deuda'}</h2>
            <p>Para tarjeta o crédito registra el saldo adeudado como número positivo.</p>
          </div>
          <Landmark size={22} />
        </div>
        <div className="form-grid">
          <label>Nombre<input value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} placeholder="Cuenta nómina" /></label>
          <label>Tipo<select value={account.type} onChange={(event) => setAccount({ ...account, type: event.target.value as AccountType })}><option value="checking">Cuenta corriente</option><option value="savings">Ahorro</option><option value="investment">Inversión</option><option value="retirement">Retiro</option><option value="credit_card">Tarjeta de crédito</option><option value="loan">Crédito</option><option value="property">Inmueble</option><option value="vehicle">Vehículo</option></select></label>
          <label>{isDebtAccount(account.type) ? 'Saldo adeudado' : 'Saldo actual'}<input inputMode="decimal" value={account.balance} onChange={(event) => setAccount({ ...account, balance: event.target.value })} placeholder="25000" /></label>
          <label>Límite de crédito<input inputMode="decimal" value={account.creditLimit} onChange={(event) => setAccount({ ...account, creditLimit: event.target.value })} placeholder="Opcional" /></label>
          {isDebtAccount(account.type) && <label>Pago mínimo<input inputMode="decimal" value={account.minimumPayment} onChange={(event) => setAccount({ ...account, minimumPayment: event.target.value })} placeholder="1500" /></label>}
          {isDebtAccount(account.type) && <label>Fecha límite<input type="date" value={account.dueDate} onChange={(event) => setAccount({ ...account, dueDate: event.target.value })} /></label>}
        </div>
        <button type="button" className="action-button" onClick={addAccount}><Plus size={18} /> {editingAccountId ? 'Guardar cuenta' : 'Agregar cuenta'}</button>
        {editingAccountId && <button type="button" className="ghost" onClick={resetAccountForm}>Cancelar edición</button>}
      </section>

      <section className="panel capture-card">
        <div className="panel-heading">
          <div><h2>{editingTransactionId ? 'Editar movimiento' : 'Registrar movimiento'}</h2><p>Los pagos reducen efectivo y deuda; las compras con tarjeta aumentan la deuda.</p></div>
          <CircleDollarSign size={22} />
        </div>
        <div className="form-grid">
          <label>Fecha<input type="date" value={transaction.date} onChange={(event) => setTransaction({ ...transaction, date: event.target.value })} /></label>
          <label>Tipo<select value={transaction.type} onChange={(event) => setTransaction({ ...transaction, type: event.target.value as Transaction['type'], accountId: event.target.value === 'debt_payment' ? paymentAccounts[0]?.id ?? '' : transaction.accountId })}><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="debt_payment">Pago de deuda</option></select></label>
          <label>Cuenta {transaction.type === 'debt_payment' ? 'de origen' : ''}<select value={transaction.accountId} onChange={(event) => setTransaction({ ...transaction, accountId: event.target.value })}><option value="">Selecciona cuenta</option>{(transaction.type === 'debt_payment' ? paymentAccounts : profile.accounts).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {transaction.type === 'debt_payment' && <label>Deuda destino<select value={transaction.debtId} onChange={(event) => setTransaction({ ...transaction, debtId: event.target.value })}><option value="">Selecciona deuda</option>{profile.debts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
          <label>Monto<input inputMode="decimal" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} placeholder="1200" /></label>
          <label>Comercio / origen<input value={transaction.merchant} onChange={(event) => setTransaction({ ...transaction, merchant: event.target.value })} placeholder="Supermercado, nómina..." /></label>
          <label>Categoría<input value={transaction.category} disabled={transaction.type === 'debt_payment'} onChange={(event) => setTransaction({ ...transaction, category: event.target.value })} placeholder="Supermercado" /></label>
        </div>
        <button type="button" className="action-button" onClick={addTransaction} disabled={transaction.type === 'debt_payment' ? !paymentAccounts.length || !profile.debts.length : !profile.accounts.length}><Plus size={18} /> {editingTransactionId ? 'Guardar movimiento' : 'Guardar movimiento'}</button>
      </section>

      <section className="panel capture-card wide goal-capture-card">
        <div className="panel-heading"><div><h2>{editingGoalId ? 'Editar meta' : 'Crear meta'}</h2><p>Define una prioridad de ahorro, viaje, compra, inmueble, auto, emergencia o deuda.</p></div><Target size={22} /></div>
        <GoalForm goal={goal} error={goalError} asOfDate={asOfDate} onChange={(next) => { setGoal(next); setGoalError('') }} />
        <button type="button" className="action-button" onClick={saveGoal}><Plus size={18} /> {editingGoalId ? 'Guardar meta' : 'Guardar meta'}</button>
      </section>

      <section className="panel wide recent-ledger">
        <div className="panel-heading"><div><h2>Datos recientes</h2><p>Edita o elimina los registros manuales antes de confiar en el dashboard.</p></div></div>
        {message && <p className="profile-message">{message}</p>}
        <div className="recent-ledger-grid">
          <article><h3>Cuentas</h3>{profile.accounts.map((row) => <div key={row.id}><span>{row.name} · {mxn(row.balance)}</span><button type="button" onClick={() => editAccount(row)} aria-label={`Editar ${row.name}`}><Pencil size={15} /></button><button type="button" onClick={() => removeAccount(row)} aria-label={`Eliminar ${row.name}`}><Trash2 size={15} /></button></div>)}</article>
          <article><h3>Movimientos manuales</h3>{profile.transactions.filter((row) => row.isManual).slice(0, 8).map((row) => <div key={row.id}><span>{row.date} · {row.merchant} · {mxn(row.amount)}</span><button type="button" onClick={() => editTransaction(row)} aria-label={`Editar ${row.merchant}`}><Pencil size={15} /></button><button type="button" onClick={() => removeTransaction(row)} aria-label={`Eliminar ${row.merchant}`}><Trash2 size={15} /></button></div>)}</article>
          <article><h3>Metas</h3>{profile.goals.map((row) => <div key={row.id}><span>{row.name} · {mxn(row.targetAmount)}</span><button type="button" onClick={() => editGoal(row)} aria-label={`Editar ${row.name}`}><Pencil size={15} /></button><button type="button" onClick={() => onChange({ ...profile, goals: profile.goals.filter((goalRow) => goalRow.id !== row.id) })} aria-label={`Eliminar ${row.name}`}><Trash2 size={15} /></button></div>)}</article>
        </div>
      </section>
    </div>
  )
}
