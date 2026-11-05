import React from 'react'
import { Box, Paper } from '@mantine/core'
import { motion } from 'framer-motion'

interface StageCardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'highlighted' | 'success' | 'processing' | 'error'
  withGlow?: boolean
  hover?: boolean
}

const variantStyles = {
  default: {
    background: 'linear-gradient(135deg, #111827 0%, #0b1220 100%)',
    borderColor: '#1b2a46',
    glow: 'none',
  },
  highlighted: {
    background: 'rgba(15, 15, 15, 0.94)',
    borderColor: 'var(--app-border)',
    glow: '0 18px 40px rgba(27, 42, 70, 0.2)',
  },
  success: {
    background: 'rgba(26, 26, 26, 0.98)',
    borderColor: 'rgba(91, 148, 255, 0.3)',
    glow: 'none',
  },
  processing: {
    background: 'linear-gradient(135deg, #181a26 0%, #111318 100%)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    glow: '0 18px 40px rgba(59, 130, 246, 0.1)',
  },
  error: {
    background: 'linear-gradient(135deg, #2a1818 0%, #181111 100%)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    glow: '0 18px 40px rgba(239, 68, 68, 0.1)',
  },
} as const

export const StageCard: React.FC<StageCardProps> = ({
  children,
  className = '',
  variant = 'default',
  withGlow = false,
  hover = true,
}) => {
  const currentVariant = variantStyles[variant]

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5 }}
      whileHover={hover ? { scale: 1.02 } : undefined}
    >
      <Paper
        className={className}
        p="xl"
        radius="xl"
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${currentVariant.borderColor}`,
          backdropFilter: 'blur(12px)',
          background: currentVariant.background,
          boxShadow: withGlow ? currentVariant.glow : undefined,
          cursor: hover ? 'pointer' : undefined,
          transition: 'box-shadow 200ms ease',
        }}
      >
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.5,
            pointerEvents: 'none',
            background:
              'linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(255, 255, 255, 0) 100%)',
          }}
        />

        <Box style={{ position: 'relative' }}>
          {children}
        </Box>
      </Paper>
    </motion.div>
  )
}
