import { useState } from 'react'
import { CircleDollarSign, Landmark, Plus, Target } from 'lucide-react'
import { mxn } from '../../domain/finance'
import type { Account, AccountType, FinancialProfile, Transaction } from '../../domain/types'
import { GoalForm } from '../goals/GoalForm'
import {
  defaultGoalForm,
  goalFormEstimate,
  goalFormToGoal,
  validateGoalForm,
  type GoalFormState,
} from '../goals/goalFormModel'

export function Capture({ profile, onChange }: { profile: FinancialProfile; onChange: (profile: FinancialProfile) => void }) {
  const [account, setAccount] = useState({
    name: '',
    type: 'checking' as AccountType,
    balance: '',
    creditLimit: '',
  })
  const [transaction, setTransaction] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    merchant: '',
    category: 'Supermercado',
    accountId: profile.accounts[0]?.id ?? '',
    type: 'expense' as Transaction['type'],
  })
  const [goal, setGoal] = useState<GoalFormState>(() => defaultGoalForm(profile.goals.length ? 'savings' : 'emergency'))
  const [goalError, setGoalError] = useState('')
  const [goalMessage, setGoalMessage] = useState('')

  function addAccount() {
    if (!account.name || !account.balance) return
    const nextAccount: Account = {
      id: `account-${Date.now()}`,
      name: account.name,
      type: account.type,
      balance: Number(account.balance),
      currency: 'MXN',
      creditLimit: account.creditLimit ? Number(account.creditLimit) : undefined,
    }
    onChange({ ...profile, accounts: [nextAccount, ...profile.accounts] })
    setAccount({ name: '', type: 'checking', balance: '', creditLimit: '' })
  }

  function addTransaction() {
    const selectedAccountId = transaction.accountId || profile.accounts[0]?.id || ''
    if (!transaction.amount || !transaction.merchant || !selectedAccountId) return
    const signedAmount = Math.abs(Number(transaction.amount)) * (transaction.type === 'income' ? 1 : -1)
    const nextTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      date: transaction.date,
      amount: signedAmount,
      merchant: transaction.merchant,
      category: transaction.category,
      accountId: selectedAccountId,
      type: transaction.type,
      isEssential: ['Vivienda', 'Supermercado', 'Transporte', 'Salud'].includes(transaction.category),
    }
    const accounts = profile.accounts.map((row) =>
      row.id === selectedAccountId ? { ...row, balance: row.balance + signedAmount } : row,
    )
    onChange({ ...profile, accounts, transactions: [nextTransaction, ...profile.transactions] })
    setTransaction({
      date: new Date().toISOString().slice(0, 10),
      amount: '',
      merchant: '',
      category: 'Supermercado',
      accountId: selectedAccountId,
      type: 'expense',
    })
  }

  function addGoal() {
    const validationError = validateGoalForm(goal)
    if (validationError) {
      setGoalError(validationError)
      setGoalMessage('')
      return
    }
    const nextGoal = goalFormToGoal(goal)
    onChange({ ...profile, goals: [nextGoal, ...profile.goals] })
    const estimate = goalFormEstimate(goal)
    setGoal(defaultGoalForm('savings'))
    setGoalError('')
    setGoalMessage(
      estimate
        ? `${nextGoal.name} guardada. Requiere aproximadamente ${mxn(estimate.requiredMonthly)} al mes.`
        : `${nextGoal.name} guardada.`,
    )
  }

  return (
    <div className="capture-grid">
      <section className="panel capture-card wide goal-capture-card">
        <div className="panel-heading">
          <div>
            <h2>Crear meta</h2>
            <p>Define una prioridad de ahorro, viaje, compra, inmueble, auto, emergencia o deuda.</p>
          </div>
          <Target size={22} />
        </div>
        <GoalForm
          goal={goal}
          error={goalError}
          onChange={(next) => {
            setGoal(next)
            setGoalError('')
            setGoalMessage('')
          }}
        />
        <button type="button" className="action-button" onClick={addGoal}>
          <Plus size={18} /> Guardar meta
        </button>
        {goalMessage && <p className="profile-message">{goalMessage}</p>}
      </section>

      <section className="panel capture-card">
        <div className="panel-heading">
          <div>
            <h2>Agregar cuenta</h2>
            <p>Registra efectivo, ahorro, inversion o tarjeta para calcular patrimonio.</p>
          </div>
          <Landmark size={22} />
        </div>
        <div className="form-grid">
          <label>
            Nombre
            <input value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} placeholder="Cuenta nomina" />
          </label>
          <label>
            Tipo
            <select value={account.type} onChange={(event) => setAccount({ ...account, type: event.target.value as AccountType })}>
              <option value="checking">Cuenta corriente</option>
              <option value="savings">Ahorro</option>
              <option value="investment">Inversion</option>
              <option value="retirement">Retiro</option>
              <option value="credit_card">Tarjeta de credito</option>
              <option value="loan">Credito</option>
              <option value="property">Inmueble</option>
              <option value="vehicle">Vehiculo</option>
            </select>
          </label>
          <label>
            Saldo actual
            <input inputMode="decimal" value={account.balance} onChange={(event) => setAccount({ ...account, balance: event.target.value })} placeholder="25000" />
          </label>
          <label>
            Limite de credito
            <input inputMode="decimal" value={account.creditLimit} onChange={(event) => setAccount({ ...account, creditLimit: event.target.value })} placeholder="Opcional" />
          </label>
        </div>
        <button type="button" className="action-button" onClick={addAccount}>
          <Plus size={18} /> Guardar cuenta
        </button>
      </section>

      <section className="panel capture-card">
        <div className="panel-heading">
          <div>
            <h2>Agregar movimiento</h2>
            <p>Un ingreso o gasto actualiza el mes, categorias y score.</p>
          </div>
          <CircleDollarSign size={22} />
        </div>
        <div className="form-grid">
          <label>
            Fecha
            <input type="date" value={transaction.date} onChange={(event) => setTransaction({ ...transaction, date: event.target.value })} />
          </label>
          <label>
            Cuenta
            <select value={transaction.accountId || profile.accounts[0]?.id || ''} onChange={(event) => setTransaction({ ...transaction, accountId: event.target.value })}>
              <option value="">Selecciona cuenta</option>
              {profile.accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select value={transaction.type} onChange={(event) => setTransaction({ ...transaction, type: event.target.value as Transaction['type'] })}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="debt_payment">Pago deuda</option>
            </select>
          </label>
          <label>
            Monto
            <input inputMode="decimal" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} placeholder="1200" />
          </label>
          <label>
            Comercio / origen
            <input value={transaction.merchant} onChange={(event) => setTransaction({ ...transaction, merchant: event.target.value })} placeholder="Supermercado, nomina..." />
          </label>
          <label>
            Categoria
            <input value={transaction.category} onChange={(event) => setTransaction({ ...transaction, category: event.target.value })} placeholder="Supermercado" />
          </label>
        </div>
        <button type="button" className="action-button" onClick={addTransaction} disabled={!profile.accounts.length}>
          <Plus size={18} /> Guardar movimiento
        </button>
      </section>
    </div>
  )
}
