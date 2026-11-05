import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Box, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { TrashIcon } from '@/shared/icons/tabler'

interface DeleteLoadingOverlayProps {
  isVisible: boolean
  projectName?: string | null
}

const DeleteLoadingOverlay: React.FC<DeleteLoadingOverlayProps> = ({ isVisible, projectName }) => {
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!isVisible) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isVisible])

  const overlay = (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(8px)',
            }}
          />

          <motion.div
            initial={shouldReduceMotion ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { scale: 0.9, opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 }}
            style={{
              position: 'relative',
              width: 'min(100% - 32px, 480px)',
            }}
          >
            <Paper p="xl" radius="xl" withBorder>
              <Stack gap="xl" align="center">
                <motion.div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    height: 112,
                    width: 112,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  animate={shouldReduceMotion ? undefined : { rotate: [0, 360] }}
                  transition={shouldReduceMotion ? undefined : { duration: 6, repeat: Infinity, ease: 'linear' }}
                >
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '999px',
                      border: '1px solid rgba(91, 148, 255, 0.22)',
                    }}
                    animate={shouldReduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.4, 1, 0.4] }}
                    transition={shouldReduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 12,
                      borderRadius: '999px',
                      border: '2px solid rgba(91, 148, 255, 0.35)',
                    }}
                    animate={shouldReduceMotion ? undefined : { rotate: [0, 360] }}
                    transition={shouldReduceMotion ? undefined : { duration: 4, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 24,
                      borderRadius: '999px',
                      border: '1px solid #6b9aff',
                    }}
                    animate={shouldReduceMotion ? undefined : { rotate: [360, 0] }}
                    transition={shouldReduceMotion ? undefined : { duration: 5, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      height: 64,
                      width: 64,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    animate={shouldReduceMotion ? undefined : { scale: [0.95, 1.05, 0.95] }}
                    transition={shouldReduceMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ThemeIcon size={64} radius="xl" variant="light" color="brand">
                      <TrashIcon width={32} height={32} />
                    </ThemeIcon>
                  </motion.div>
                </motion.div>

                <Stack gap={4} align="center">
                  <Text fw={700} size="lg">
                    正在删除项目
                  </Text>
                  {projectName ? <Text c="brand.4">{projectName}</Text> : null}
                  <Text c="dimmed" ta="center" size="sm">
                    需要同步清理相关文件，可能需要一点时间，请耐心等待。
                  </Text>
                </Stack>

                <Stack gap="xs" w="100%">
                  <Box
                    style={{
                      borderRadius: 999,
                      background: '#1b2a46',
                      height: 6,
                      overflow: 'hidden',
                    }}
                  >
              <motion.div
                    style={{
                      height: '100%',
                      width: '50%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #6b9aff 0%, #5b8dff 50%, #6b9aff 100%)',
                    }}
                    animate={shouldReduceMotion ? undefined : { x: ['-100%', '100%'] }}
                    transition={shouldReduceMotion ? undefined : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  </Box>
                  <Text c="dimmed" size="xs" ta="center">
                    系统正在安全删除媒体和脚本资源...
                  </Text>
                </Stack>
              </Stack>
            </Paper>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(overlay, document.body)
}

export default DeleteLoadingOverlay
