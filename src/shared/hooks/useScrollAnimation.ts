/**
 * 滚动动画 Hook
 * 使用 Intersection Observer API 检测元素是否进入视口
 * 当元素进入视口时，触发动画
 */

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

/**
 * 使用 Framer Motion 的 useInView Hook 检测元素是否在视口中
 * @param options 配置选项
 * @returns ref 和 inView 状态
 */
export function useScrollAnimation(options?: {
  once?: boolean // 是否只触发一次
  amount?: 'some' | 'all' | number // 元素进入多少才触发
}) {
  const ref = useRef<HTMLElement>(null)
  const isInView = useInView(ref, {
    once: options?.once ?? true, // 默认只触发一次
    amount: options?.amount ?? 0.3, // 默认元素 30% 进入视口时触发
  })

  return { ref, isInView }
}

/**
 * 更高级的滚动动画 Hook
 * 提供更多控制选项和滚动进度信息
 */
export function useAdvancedScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting)

          // 计算滚动进度（0-1）
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect
            const windowHeight = window.innerHeight
            const elementTop = rect.top
            const progress = Math.min(
              Math.max((windowHeight - elementTop) / windowHeight, 0),
              1
            )
            setScrollProgress(progress)
          }
        })
      },
      {
        threshold: Array.from({ length: 100 }, (_, i) => i / 100), // 100 个阈值点
        rootMargin: '-10%',
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return { ref, isVisible, scrollProgress }
}

/**
 * 视差滚动 Hook
 * 返回元素的滚动位置，用于创建视差效果
 */
export function useParallax() {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return scrollY
}

/**
 * 检测滚动方向
 * @returns 'up' | 'down' | null
 */
export function useScrollDirection() {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (currentScrollY > lastScrollY) {
        setScrollDirection('down')
      } else if (currentScrollY < lastScrollY) {
        setScrollDirection('up')
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  return scrollDirection
}

/**
 * 检测是否滚动到页面顶部
 * @param threshold 距离顶部多少像素算作"顶部"（默认 50px）
 */
export function useIsScrolledToTop(threshold: number = 50) {
  const [isTop, setIsTop] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      setIsTop(window.scrollY < threshold)
    }

    // 初始检查
    handleScroll()

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [threshold])

  return isTop
}
