/**
 * PreProductionPage — 前期沟通页面
 * Agent 在任务开始前与用户对话确认 4 项内容：
 * 1. 文案方向  2. 实现方式  3. 素材需求  4. 最终效果
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArtTitle, DecisionCard } from '@/components/ui'
import { RadialGlow } from '@/components/ui'
import { ParticleCanvas } from '@/components/ui'
import type { DecisionChoice } from '@/components/ui'
import {
  startPreProduction,
  confirmPreProductionStep,
  getPreProduction,
  type QuestionEvent,
  type PreProductionPlan,
} from '@/features/agent/agentService'
import { T } from '@/theme/tokens'

const STEP_LABELS: Record<string, string> = {
  script_direction: '文案方向',
  production_method: '实现方式',
  material_needs: '素材需求',
  final_expectation: '最终效果',
  complete: '完成',
}

const STEP_ORDER = ['script_direction', 'production_method', 'material_needs', 'final_expectation']

interface PreProductionPageProps {
  projectId: string
  userId: string
  initialTopic?: string
  onComplete?: (plan: PreProductionPlan) => void
}

export function PreProductionPage({
  projectId, userId, initialTopic = '', onComplete,
}: PreProductionPageProps) {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PreProductionPlan | null>(null)
  const [question, setQuestion] = useState<QuestionEvent | null>(null)
  const [topic, setTopic] = useState(initialTopic)
  const [loading, setLoading] = useState(false)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 若项目已有前期沟通方案，恢复状态
  useEffect(() => {
    if (!projectId) return
    getPreProduction(projectId)
      .then(({ plan: p, question: q }) => {
        if (p) { setPlan(p); setQuestion(q ?? null); setStarted(true) }
      })
      .catch(() => {})
  }, [projectId])

  async function handleStart() {
    if (!topic.trim()) { setError('请先描述你想要制作的视频主题'); return }
    setLoading(true); setError(null)
    try {
      const { plan: p, question: q } = await startPreProduction(projectId, userId, topic)
      setPlan(p); setQuestion(q ?? null); setStarted(true)
    } catch (e) {
      setError('启动前期沟通失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleChoice(choiceKey: string, customText?: string) {
    if (!plan) return
    setLoading(true); setError(null)
    try {
      const { plan: p, question: q, complete } = await confirmPreProductionStep(
        projectId, plan.currentStep, choiceKey, customText,
      )
      setPlan(p); setQuestion(q ?? null)
      if (complete) {
        onComplete?.(p)
        navigate(`/workspace/${projectId}`)
      }
    } catch (e) {
      setError('确认失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const currentStepIdx = plan ? STEP_ORDER.indexOf(plan.currentStep) : -1

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      padding: '40px 16px',
    }}>
      <RadialGlow />
      <ParticleCanvas particleCount={40} opacity={0.4} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 600 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <ArtTitle size="lg" gradient italic>
            制作前沟通
          </ArtTitle>
          <p style={{ color: T.muted, fontSize: 14, marginTop: 8 }}>
            Agent 将帮你确认 4 项内容，确认完成后自动开始制作
          </p>
        </div>

        {/* 步骤进度条 */}
        {started && plan && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
            {STEP_ORDER.map((step, i) => {
              const done = currentStepIdx > i || plan.status === 'confirmed'
              const current = currentStepIdx === i
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                    background: done ? T.accent : current ? T.accentBg : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${done || current ? T.accent : T.border}`,
                    color: done ? '#fff' : current ? T.accent : T.muted,
                    transition: 'all 200ms ease',
                    flexShrink: 0,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: current ? T.text : T.muted, whiteSpace: 'nowrap' }}>
                    {STEP_LABELS[step]}
                  </span>
                  {i < STEP_ORDER.length - 1 && (
                    <div style={{ width: 24, height: 1, background: done ? T.accent : T.border, flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 未开始：主题输入 */}
        {!started && (
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 24,
          }}>
            <div style={{ fontSize: 14, color: T.text, marginBottom: 12, fontWeight: 500 }}>
              你想制作什么视频？
            </div>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="描述你的视频主题，例如：讲解 React Hooks 的入门教程、介绍公司新产品的宣传视频…"
              style={{
                width: '100%', minHeight: 80,
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${T.border}`,
                borderRadius: 8, padding: '10px 12px',
                resize: 'vertical', color: T.text,
                fontSize: 14, lineHeight: 1.6,
                outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = T.accentBorder }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = T.border }}
            />
            {error && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</div>
            )}
            <button
              onClick={handleStart}
              disabled={loading}
              style={{
                marginTop: 14, width: '100%',
                padding: '10px 0',
                background: loading ? 'rgba(255,255,255,0.08)' : T.accent,
                border: 'none', borderRadius: 8,
                color: '#fff', fontSize: 14, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {loading ? '启动中…' : '开始制作规划 →'}
            </button>
          </div>
        )}

        {/* 已开始：确认卡片（加 key 确保步骤切换时组件重建，M-08 修复）*/}
        {started && question && (
          <DecisionCard
            key={question.questionId}
            title={question.title}
            subtitle={question.subtitle}
            body={question.body ? <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{question.body}</p> : undefined}
            choices={question.choices as DecisionChoice[]}
            allowCustom={question.allowCustom}
            customPlaceholder={question.customPlaceholder}
            onChoice={handleChoice}
            loading={loading}
          />
        )}

        {/* 完成状态 */}
        {started && plan?.status === 'confirmed' && (
          <div style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 12, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
              前期沟通完成！
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
              Agent 已生成制作草稿，正在跳转到工作台…
            </div>
          </div>
        )}

        {error && started && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 12, textAlign: 'center' }}>{error}</div>
        )}
      </div>
    </div>
  )
}
