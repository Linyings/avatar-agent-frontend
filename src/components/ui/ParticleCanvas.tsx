/**
 * ParticleCanvas — 浮动粒子动效（55 粒子，随机运动 + 呼吸透明度）
 * 用于主页 Hero 区背景
 */
import { useEffect, useRef } from 'react'

interface ParticleCanvasProps {
  width?: number | string
  height?: number | string
  particleCount?: number
  opacity?: number
  style?: React.CSSProperties
}

export function ParticleCanvas({
  width = '100%', height = '100%',
  particleCount = 55, opacity = 0.6,
  style,
}: ParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0, h = 0
    const dpr = window.devicePixelRatio || 1

    interface P { x: number; y: number; vx: number; vy: number; r: number; op: number; dOp: number }
    let particles: P[] = []

    function resize() {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    function init() {
      particles = Array.from({ length: particleCount }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.8 + 0.4,
        op: Math.random() * 0.8 + 0.05,
        dOp: (Math.random() - 0.5) * 0.004,
      }))
    }

    function tick() {
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        p.op += p.dOp
        if (p.op < 0.05 || p.op > 0.85) p.dOp *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.op * opacity})`
        ctx.fill()
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    init()
    tick()
    // 用具名函数引用，确保 removeEventListener 能正确移除（M-11 修复）
    const onResize = () => { resize(); init() }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [particleCount, opacity])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width, height,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        ...style,
      }}
    />
  )
}
