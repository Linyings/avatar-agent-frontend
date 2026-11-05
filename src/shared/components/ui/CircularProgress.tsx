import React from 'react'
import { motion } from 'framer-motion'

interface CircularProgressProps {
  progress: number // 0-100
  size?: number
  strokeWidth?: number
  variant?: 'default' | 'success' | 'processing' | 'error'
  showPercentage?: boolean
  children?: React.ReactNode
}

const colorVariants = {
  default: {
    track: '#1b2a46',
    progress: '#3f7cff',
    text: '#3f7cff'
  },
  success: {
    track: '#223454',
    progress: '#3f7cff',
    text: '#3f7cff'
  },
  processing: {
    track: '#1e3a8a',
    progress: '#3b82f6',
    text: '#3b82f6'
  },
  error: {
    track: '#7f1d1d',
    progress: '#ef4444',
    text: '#ef4444'
  }
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 120,
  strokeWidth = 8,
  variant = 'default',
  showPercentage = true,
  children
}) => {
  const colors = colorVariants[variant]
  const normalizedRadius = (size - strokeWidth) / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        height={size}
        width={size}
        className="transform -rotate-90"
      >
        {/* 背景圆环 */}
        <circle
          stroke={colors.track}
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />

        {/* 进度圆环 */}
        <motion.circle
          stroke={colors.progress}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          style={{
            filter: `drop-shadow(0 0 6px ${colors.progress}40)`
          }}
        />
      </svg>

      {/* 中心内容 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children || (
          showPercentage && (
            <motion.div
              className="text-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <div className={`text-2xl font-bold`} style={{ color: colors.text }}>
                {Math.round(progress)}%
              </div>
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}