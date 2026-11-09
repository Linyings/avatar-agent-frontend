/**
 * DecisionCard — Agent 确认卡片组件
 * 用于 Agent 提案确认、审核确认、前期沟通选项选择
 * 直接对标 NarratoAI-PC MovieDecisionCard
 * M-14 修复：添加 10 秒超时保护，防止用户长时间等待无响应
 */
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { T as tokens } from '@/theme/tokens'

export interface DecisionChoice {
  key: string
  label: string
  description?: string
  recommended?: boolean
  danger?: boolean
}

interface DecisionCardProps {
  title: string
  subtitle?: string
  body?: ReactNode
  choices: DecisionChoice[]
  allowCustom?: boolean
  customPlaceholder?: string
  onChoice: (key: string, customText?: string) => void
  loading?: boolean
  style?: React.CSSProperties
}

const T = tokens

export function DecisionCard({
  title, subtitle, body, choices, allowCustom, customPlaceholder,
  onChoice, loading, style,
}: DecisionCardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [timedOut, setTimedOut] = useState(false)

  // M-14：10 秒超时保护
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setTimedOut(true)
      }, 10000)
      return () => clearTimeout(timer)
    }
  }, [loading])

  function handleConfirm() {
    if (!selected) return
    onChoice(selected, selected === '__custom__' ? customText : undefined)
  }

  function handleRetry() {
    setTimedOut(false)
    // 重新触发一次确认，让外部重试
    if (selected) {
      onChoice(selected, selected === '__custom__' ? customText : undefined)
    }
  }

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      ...style,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{subtitle}</div>
        )}
      </div>

      {/* Body content */}
      {body && (
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
          {body}
        </div>
      )}

      {/* Choices */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {choices.map(c => {
          const isSelected = selected === c.key
          const isRecommended = c.recommended
          const isDanger = c.danger
          return (
            <button
              key={c.key}
              onClick={() => setSelected(c.key)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                border: isSelected
                  ? `1px solid ${isDanger ? T.danger : T.accentBorder}`
                  : `1px solid ${T.border}`,
                background: isSelected
                  ? (isDanger ? T.dangerBg : T.accentBg)
                  : T.surface,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = T.surfaceHover
              }}
              onMouseLeave={e => {
                if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = T.surface
              }}
            >
              {/* Radio dot */}
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                border: `2px solid ${isSelected ? (isDanger ? T.danger : T.accent) : 'rgba(255,255,255,0.2)'}`,
                background: isSelected ? (isDanger ? T.danger : T.accent) : 'transparent',
                boxShadow: isSelected ? `0 0 0 3px ${isDanger ? 'rgba(239,68,68,0.15)' : T.accentBg}` : 'none',
                transition: 'all 150ms ease',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: isDanger ? T.danger : T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.label}
                  {isRecommended && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: T.accentBg, color: T.accent, border: `1px solid ${T.accentBorder}`, fontWeight: 500 }}>
                      推荐
                    </span>
                  )}
                </div>
                {c.description && (
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>{c.description}</div>
                )}
              </div>
            </button>
          )
        })}

        {/* Custom input */}
        {allowCustom && (
          <button
            onClick={() => setSelected('__custom__')}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              border: selected === '__custom__' ? `1px solid ${T.accentBorder}` : `1px solid ${T.border}`,
              background: selected === '__custom__' ? T.accentBg : T.surface,
              cursor: 'pointer', textAlign: 'left', transition: 'all 150ms ease',
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
              border: `2px solid ${selected === '__custom__' ? T.accent : 'rgba(255,255,255,0.2)'}`,
              background: selected === '__custom__' ? T.accent : 'transparent',
              transition: 'all 150ms ease',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>自己描述</div>
              {selected === '__custom__' && (
                <textarea
                  autoFocus
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  placeholder={customPlaceholder ?? '请输入你的具体要求…'}
                  onClick={e => e.stopPropagation()}
                  style={{
                    marginTop: 8, width: '100%', minHeight: 72,
                    background: 'rgba(0,0,0,0.3)', border: `1px solid ${T.accentBorder}`,
                    borderRadius: 6, padding: '8px 10px', resize: 'vertical',
                    color: T.text, fontSize: 12, lineHeight: 1.6, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 14px 14px',
        borderTop: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'flex-end', gap: 8,
      }}>
        {timedOut && (
          <button
            onClick={handleRetry}
            style={{
              padding: '8px 18px', borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.text,
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            重试
          </button>
        )}
        <button
          disabled={!selected || loading}
          onClick={handleConfirm}
          style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: selected ? T.accent : 'rgba(255,255,255,0.08)',
            color: selected ? '#fff' : T.muted,
            fontSize: 13, fontWeight: 500,
            cursor: selected && !loading ? 'pointer' : 'not-allowed',
            transition: 'all 150ms ease',
          }}
        >
          {timedOut ? '提案生成超时，请重试' : (loading ? '执行中…' : '确认')}
        </button>
      </div>
    </div>
  )
}
