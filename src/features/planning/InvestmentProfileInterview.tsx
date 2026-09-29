import { ChevronLeft, ChevronRight, CircleAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  assessInvestorEducation,
  type DrawdownResponse,
  type IncomeStability,
  type InvestmentExperience,
  type InvestmentObjective,
  type InvestorProfileAnswers,
  type LiquidityNeed,
} from '../../domain/investorProfile'

type DraftAnswers = Partial<InvestorProfileAnswers>

interface InterviewQuestion {
  title: string
  prompt: string
  isComplete: (answers: DraftAnswers) => boolean
  content: (answers: DraftAnswers, update: (patch: DraftAnswers) => void) => ReactNode
}

function numberValue(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function radioGroup<T extends string>(
  name: string,
  value: T | undefined,
  options: readonly { value: T; label: string }[],
  onChange: (value: T) => void,
): ReactNode {
  return (
    <div className="goal-type-grid" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label className="goal-type-option" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  )
}

const questions: InterviewQuestion[] = [
  {
    title: 'Edad y horizonte',
    prompt: '¿Qué edad tienes y en cuántos años crees que necesitarás este dinero?',
    isComplete: (answers) => answers.ageYears !== undefined && answers.ageYears >= 0 && answers.horizonYears !== undefined && answers.horizonYears >= 0,
    content: (answers, update) => (
      <div className="form-grid">
        <label>Edad
          <input inputMode="numeric" min="0" max="120" type="number" value={answers.ageYears ?? ''} onChange={(event) => update({ ageYears: numberValue(event.target.value) })} />
        </label>
        <label>Horizonte en años
          <input inputMode="numeric" min="0" max="100" type="number" value={answers.horizonYears ?? ''} onChange={(event) => update({ horizonYears: numberValue(event.target.value) })} />
        </label>
      </div>
    ),
  },
  {
    title: 'Objetivo dominante',
    prompt: '¿Qué buscas principalmente con este dinero?',
    isComplete: (answers) => Boolean(answers.objective),
    content: (answers, update) => radioGroup<InvestmentObjective>('objetivo dominante', answers.objective, [
      { value: 'preserve_capital', label: 'Preservar capital' },
      { value: 'grow_wealth', label: 'Crecer patrimonio' },
      { value: 'passive_income', label: 'Generar ingreso pasivo' },
    ], (objective) => update({ objective })),
  },
  {
    title: 'Reserva y deuda',
    prompt: '¿Tienes un fondo de emergencia y deudas de alto interés?',
    isComplete: (answers) => answers.emergencyFundMonths !== undefined && answers.emergencyFundMonths >= 0 && answers.hasHighInterestDebt !== undefined,
    content: (answers, update) => (
      <div className="form-grid">
        <label>Meses de gastos cubiertos por tu fondo de emergencia
          <input inputMode="decimal" min="0" max="120" type="number" value={answers.emergencyFundMonths ?? ''} onChange={(event) => update({ emergencyFundMonths: numberValue(event.target.value) })} />
        </label>
        <label>¿Tienes deuda de alto interés?
          <select value={answers.hasHighInterestDebt === undefined ? '' : answers.hasHighInterestDebt ? 'yes' : 'no'} onChange={(event) => update({ hasHighInterestDebt: event.target.value === 'yes' ? true : event.target.value === 'no' ? false : undefined })}>
            <option value="">Selecciona una opción</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
    ),
  },
  {
    title: 'Ingresos',
    prompt: '¿Qué tan estables y diversificados son tus ingresos?',
    isComplete: (answers) => Boolean(answers.incomeStability),
    content: (answers, update) => radioGroup<IncomeStability>('estabilidad de ingresos', answers.incomeStability, [
      { value: 'stable_diversified', label: 'Estables y diversificados' },
      { value: 'stable', label: 'Estables, una fuente principal' },
      { value: 'variable', label: 'Variables o concentrados' },
    ], (incomeStability) => update({ incomeStability })),
  },
  {
    title: 'Tamaño de la decisión',
    prompt: '¿Qué porcentaje de tu patrimonio total representa el monto que planeas invertir?',
    isComplete: (answers) => answers.investmentShareOfNetWorth !== undefined && answers.investmentShareOfNetWorth >= 0 && answers.investmentShareOfNetWorth <= 100,
    content: (answers, update) => (
      <label>Porcentaje de tu patrimonio
        <input inputMode="decimal" min="0" max="100" type="number" value={answers.investmentShareOfNetWorth ?? ''} onChange={(event) => update({ investmentShareOfNetWorth: numberValue(event.target.value) })} />
      </label>
    ),
  },
  {
    title: 'Caídas y tolerancia',
    prompt: 'Si tu portafolio cayera 25% en seis meses, ¿qué harías y qué pérdida anual tolerarías?',
    isComplete: (answers) => Boolean(answers.drawdownResponse) && answers.maxAnnualLossPercent !== undefined && answers.maxAnnualLossPercent >= 0 && answers.maxAnnualLossPercent <= 100,
    content: (answers, update) => (
      <div className="form-grid">
        <label>Ante una caída de 25%
          <select value={answers.drawdownResponse ?? ''} onChange={(event) => update({ drawdownResponse: event.target.value as DrawdownResponse || undefined })}>
            <option value="">Selecciona una opción</option>
            <option value="sell">Vendería</option>
            <option value="wait">Esperaría</option>
            <option value="buy_more">Compraría más</option>
          </select>
        </label>
        <label>Pérdida anual máxima tolerable (%)
          <input inputMode="decimal" min="0" max="100" type="number" value={answers.maxAnnualLossPercent ?? ''} onChange={(event) => update({ maxAnnualLossPercent: numberValue(event.target.value) })} />
        </label>
      </div>
    ),
  },
  {
    title: 'Experiencia previa',
    prompt: '¿Qué experiencia tienes invirtiendo?',
    isComplete: (answers) => Boolean(answers.experience),
    content: (answers, update) => radioGroup<InvestmentExperience>('experiencia invirtiendo', answers.experience, [
      { value: 'none', label: 'Aún no invierto' },
      { value: 'basic', label: 'Experiencia básica' },
      { value: 'experienced', label: 'Experiencia frecuente' },
    ], (experience) => update({ experience })),
  },
  {
    title: 'Necesidad de liquidez',
    prompt: '¿Necesitas disponer de una parte de este dinero durante el camino?',
    isComplete: (answers) => Boolean(answers.liquidityNeed),
    content: (answers, update) => radioGroup<LiquidityNeed>('necesidad de liquidez', answers.liquidityNeed, [
      { value: 'none', label: 'No, puedo mantenerlo invertido' },
      { value: 'partial', label: 'Sí, una parte' },
      { value: 'substantial', label: 'Sí, una parte importante' },
    ], (liquidityNeed) => update({ liquidityNeed })),
  },
]

export function InvestmentProfileInterview(): ReactNode {
  const [started, setStarted] = useState(false)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<DraftAnswers>({})
  const [showResult, setShowResult] = useState(false)
  const question = questions[step]

  if (!question) return null

  function updateAnswers(patch: DraftAnswers): void {
    setAnswers((current) => ({ ...current, ...patch }))
  }

  function restart(): void {
    setAnswers({})
    setStep(0)
    setShowResult(false)
    setStarted(false)
  }

  if (!started) {
    return (
      <section className="panel wide" aria-labelledby="investment-profile-title">
        <div className="panel-heading">
          <div>
            <h2 id="investment-profile-title">Autodiagnóstico de perfil inversor</h2>
            <p>Ocho preguntas, una por vez, para entender capacidad y tolerancia al riesgo.</p>
          </div>
          <ShieldCheck size={24} />
        </div>
        <p className="debt-simulator-note"><CircleAlert size={16} /> Educación financiera; no es asesoría personalizada, regulada ni una recomendación de inversión.</p>
        <p className="period-note">Las respuestas se conservan sólo durante esta sesión y aún no se guardan en tu perfil.</p>
        <button type="button" className="action-button" onClick={() => setStarted(true)}>Iniciar entrevista <ChevronRight size={18} /></button>
      </section>
    )
  }

  if (showResult) {
    const assessment = assessInvestorEducation(answers as InvestorProfileAnswers)
    return (
      <section className="panel wide" aria-labelledby="investment-profile-result-title">
        <div className="panel-heading">
          <div>
            <h2 id="investment-profile-result-title">Resultado educativo</h2>
            <p>Es una lectura de tus respuestas, no una instrucción para comprar, vender o asignar productos.</p>
          </div>
          <ShieldCheck size={24} />
        </div>
        <div className="goal-summary-grid" aria-label="Lectura de riesgo educativa">
          <article><span>Capacidad de asumir riesgo</span><strong>{assessment.capacity}</strong></article>
          <article><span>Tolerancia emocional</span><strong>{assessment.tolerance}</strong></article>
          <article><span>Perfil educativo prudente</span><strong>{assessment.educationalProfile}</strong></article>
        </div>
        <p>{assessment.explanation}</p>
        <section className="investment-allocation-reference" aria-label="Referencia educativa de distribución">
          <h3>Referencia educativa de distribución</h3>
          <p>Es una guía general entre clases de activos; valida los vehículos, costos, impuestos y regulación de tu país antes de invertir.</p>
          <div className="goal-summary-grid">
            <article><span>Renta fija</span><strong>{assessment.allocationReference.fixedIncome}%</strong><small>Busca estabilidad y potencial ingreso.</small></article>
            <article><span>Renta variable</span><strong>{assessment.allocationReference.equities}%</strong><small>Busca valorización con mayor volatilidad.</small></article>
            <article><span>Finca raíz</span><strong>{assessment.allocationReference.realEstate}%</strong><small>Diversificación e ingreso potencial; puede ser menos líquida.</small></article>
          </div>
          <p><strong>Riesgos a vigilar:</strong> volatilidad de mercado, inflación/tasas y falta de liquidez o concentración. Revisa una vez al año, si tu objetivo cambia o si una clase se desvía más de 5 puntos porcentuales de esta referencia.</p>
          <p><strong>Primer paso:</strong> {assessment.firstStep}</p>
        </section>
        {assessment.readinessNotes.length > 0 && <div className="form-error" role="status">{assessment.readinessNotes.map((note) => <p key={note}>{note}</p>)}</div>}
        <p className="debt-simulator-note"><CircleAlert size={16} /> Educación financiera; antes de tomar decisiones, contrasta tus datos, costos, impuestos y condiciones con una persona profesional autorizada cuando aplique.</p>
        <button type="button" className="ghost" onClick={restart}><RotateCcw size={17} /> Reiniciar entrevista</button>
      </section>
    )
  }

  const canContinue = question.isComplete(answers)
  return (
    <section className="panel wide" aria-labelledby="investment-profile-question-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Pregunta {step + 1} de {questions.length}</p>
          <h2 id="investment-profile-question-title">{question.title}</h2>
          <p>{question.prompt}</p>
        </div>
        <ShieldCheck size={24} />
      </div>
      <progress value={step + 1} max={questions.length} aria-label={`Progreso: pregunta ${step + 1} de ${questions.length}`} />
      <div className="goal-form compact">{question.content(answers, updateAnswers)}</div>
      <p className="period-note">Educación financiera; no se ofrecen productos ni instrucciones de inversión.</p>
      <div className="empty-actions">
        <button type="button" className="ghost" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ChevronLeft size={18} /> Anterior</button>
        <button type="button" className="action-button" disabled={!canContinue} onClick={() => step === questions.length - 1 ? setShowResult(true) : setStep((current) => current + 1)}>
          {step === questions.length - 1 ? 'Ver lectura educativa' : 'Siguiente'} <ChevronRight size={18} />
        </button>
      </div>
    </section>
  )
}
