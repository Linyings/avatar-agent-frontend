/**
 * 统一的动效配置工具
 * 基于 Framer Motion，提供预设的动画效果
 * 参考 lovart.ai 的优雅动效设计
 */

import type { Variants } from 'framer-motion'

// ==================== 基础动画配置 ====================

/**
 * 淡入 + 上移动画
 * 适用于：标题、段落、卡片等元素进入时
 */
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1], // cubic-bezier 缓动
    },
  },
}

/**
 * 淡入 + 下移动画
 * 适用于：从上方进入的元素
 */
export const fadeInDown: Variants = {
  hidden: {
    opacity: 0,
    y: -30,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

/**
 * 淡入 + 左滑入
 * 适用于：从左侧进入的元素
 */
export const fadeInLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -50,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

/**
 * 淡入 + 右滑入
 * 适用于：从右侧进入的元素
 */
export const fadeInRight: Variants = {
  hidden: {
    opacity: 0,
    x: 50,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

/**
 * 纯淡入动画
 * 适用于：简单的淡入效果
 */
export const fadeIn: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
}

/**
 * 缩放淡入动画
 * 适用于：图标、小型元素
 */
export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  },
}

// ==================== 容器动画配置 ====================

/**
 * 交错动画容器
 * 让子元素依次出现，产生流畅的连续效果
 * @param staggerDelay 每个子元素之间的延迟时间（秒）
 */
export const staggerContainer = (staggerDelay: number = 0.1): Variants => ({
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.1,
    },
  },
})

/**
 * 交错子元素动画（配合 staggerContainer 使用）
 */
export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
}

// ==================== 悬停动效配置 ====================

/**
 * 卡片悬停效果
 * 轻微上浮 + 阴影增强
 */
export const cardHover = {
  rest: {
    y: 0,
    scale: 1,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  hover: {
    y: -8,
    scale: 1.02,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
}

/**
 * 按钮悬停效果
 * 缩放 + 阴影变化
 */
export const buttonHover = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.2,
      ease: 'easeInOut',
    },
  },
  tap: {
    scale: 0.95,
  },
}

/**
 * 主要 CTA 按钮的脉冲效果
 */
export const pulseAnimation = {
  scale: [1, 1.05, 1],
  transition: {
    duration: 2,
    repeat: Infinity,
    repeatType: 'loop' as const,
    ease: 'easeInOut',
  },
}

// ==================== 特殊动效配置 ====================

/**
 * 页面切换过渡动画
 */
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: 'easeIn',
    },
  },
}

/**
 * 滚动指示器动画（向下箭头）
 */
export const scrollIndicator = {
  animate: {
    y: [0, 10, 0],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      repeatType: 'loop' as const,
      ease: 'easeInOut',
    },
  },
}

/**
 * 视差效果配置
 * @param speed 滚动速度倍数（默认 0.5 = 一半速度）
 */
export const parallaxConfig = (speed: number = 0.5) => ({
  initial: { y: 0 },
  animate: (scrollY: number) => ({
    y: scrollY * speed,
  }),
})

// ==================== 导出便捷函数 ====================

/**
 * 创建延迟动画
 * @param delay 延迟时间（秒）
 */
export const withDelay = (variants: Variants, delay: number): Variants => {
  return {
    ...variants,
    visible: {
      ...variants.visible,
      transition: {
        ...(typeof variants.visible === 'object' && 'transition' in variants.visible
          ? variants.visible.transition
          : {}),
        delay,
      },
    },
  }
}

/**
 * 创建自定义持续时间的动画
 * @param variants 原始动画变体
 * @param duration 持续时间（秒）
 */
export const withDuration = (variants: Variants, duration: number): Variants => {
  return {
    ...variants,
    visible: {
      ...variants.visible,
      transition: {
        ...(typeof variants.visible === 'object' && 'transition' in variants.visible
          ? variants.visible.transition
          : {}),
        duration,
      },
    },
  }
}
