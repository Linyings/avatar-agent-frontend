import { Box } from '@mantine/core'
import { motion, useReducedMotion } from 'framer-motion'

export default function GlowSpheres() {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) {
    return null
  }

  return (
    <Box
      aria-hidden="true"
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          width: 600,
          height: 600,
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(43,216,98,0.22) 0%, rgba(43,216,98,0.05) 40%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          top: '30%',
          left: '10%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(43,216,98,0.14) 0%, transparent 60%)',
          filter: 'blur(50px)',
        }}
        animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          top: '40%',
          right: '15%',
          width: 250,
          height: 250,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(43,216,98,0.12) 0%, transparent 60%)',
          filter: 'blur(50px)',
        }}
        animate={{ x: [0, -50, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '50%',
          width: 800,
          height: 400,
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(43,216,98,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
    </Box>
  )
}
