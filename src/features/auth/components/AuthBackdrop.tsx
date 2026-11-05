import { Box } from '@mantine/core'

interface AuthBackdropProps {
  intensity?: 'soft' | 'strong'
}

export default function AuthBackdrop({ intensity = 'soft' }: AuthBackdropProps) {
  return (
    <>
      <Box
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'fixed',
          inset: 0,
          opacity: intensity === 'strong' ? 0.5 : 0.36,
          background:
            'radial-gradient(ellipse 46% 30% at 50% 12%, rgb(91 148 255 / 18%), transparent 70%), radial-gradient(circle at 50% 50%, transparent 0%, rgb(0 0 0 / 28%) 56%, rgb(0 0 0 / 68%) 100%)'
        }}
      />
      <Box
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'fixed',
          inset: 0,
          opacity: intensity === 'strong' ? 0.34 : 0.24,
          background:
            'linear-gradient(180deg, rgb(255 255 255 / 5%) 0%, transparent 22%, transparent 78%, rgb(255 255 255 / 3%) 100%)'
        }}
      />
      <Box
        aria-hidden="true"
        style={{
          pointerEvents: 'none',
          position: 'fixed',
          left: '50%',
          top: 0,
          width: 'min(56rem, 88vw)',
          height: '20rem',
          transform: 'translateX(-50%)',
          opacity: 0.28,
          background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 22%), transparent)',
          filter: 'blur(70px)'
        }}
      />
    </>
  )
}
