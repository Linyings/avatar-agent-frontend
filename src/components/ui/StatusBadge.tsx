/**
 * StatusBadge — 任务/节点状态标签
 * running: 橙色脉冲  done: 绿色  stopped: 灰色  failed: 红色  pending: 暗灰
 */
import type { CSSProperties } from 'react'

export type StatusType = 'running' | 'done' | 'stopped' | 'failed' | 'pending' | 'reviewing' | 'skipped'

interface StatusBadgeProps {
  status: StatusType
  label?: string
  size?: 'sm' | 'md'
  style?: CSSProperties
}

const STATUS_CONFIG: Record<StatusType, { color: string; bg: string; label: string; pulse: boolean }> = {
  running:   { color: '#e8820a', bg: 'rgba(232,130,10,0.14)', label: '制作中',  pulse: true  },
  done:      { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',  label: '已完成',  pulse: false },
  stopped:   { color: 'rgba(255,255,255,0.42)', bg: 'rgba(255,255,255,0.07)', label: '已停止', pulse: false },
  failed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.14)',  label: '失败',    pulse: false },
  pending:   { color: 'rgba(255,255,255,0.28)', bg: 'rgba(255,255,255,0.05)', label: '待开始', pulse: false },
  reviewing: { color: '#f59e0b', bg: 'rgba(245,158,11,0.14)', label: '审核中',  pulse: true  },
  skipped:   { color: 'rgba(255,255,255,0.22)', bg: 'rgba(255,255,255,0.04)', label: '已跳过', pulse: false },
}

export function StatusBadge({ status, label, size = 'md', style }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  const fontSize = size === 'sm' ? '11px' : '12px'
  const dotSize  = size === 'sm' ? 6 : 7

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '2px 7px' : '3px 9px',
      borderRadius: 999,
      background: cfg.bg,
      border: `1px solid ${cfg.color}44`,
      fontSize, fontWeight: 500,
      color: cfg.color,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      <span style={{
        width: dotSize, height: dotSize,
        borderRadius: '50%',
        background: cfg.color,
        flexShrink: 0,
        animation: cfg.pulse ? 'statusPulse 1.6s ease-in-out infinite' : 'none',
      }} />
      {label ?? cfg.label}
    </span>
  )
}

// 注入全局关键帧（只注入一次）
if (typeof document !== 'undefined' && !document.getElementById('status-pulse-style')) {
  const s = document.createElement('style')
  s.id = 'status-pulse-style'
  s.textContent = `
    @keyframes statusPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.75); }
    }
  `
  document.head.appendChild(s)
}
