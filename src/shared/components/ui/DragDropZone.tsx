import React, { useState, useRef } from 'react'
import { Box, Stack, Text, Title } from '@mantine/core'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CloudArrowUpIcon,
  VideoCameraIcon,
  PhotoIcon
} from '@/shared/icons/tabler'

interface DragDropZoneProps {
  onFileSelect: (files: FileList) => void
  accept?: string
  multiple?: boolean
  maxSize?: number // MB
  disabled?: boolean
  children?: React.ReactNode
  height?: string | number
  title?: string
  subtitle?: string
}

export const DragDropZone: React.FC<DragDropZoneProps> = ({
  onFileSelect,
  accept = '*',
  multiple = false,
  maxSize = 100,
  disabled = false,
  children,
  height = 256,
  title = '拖拽文件到此处',
  subtitle = '或点击选择文件'
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragOver(false)
    }
  }

  const validateFiles = (files: FileList): boolean => {
    setIsError(false)
    setErrorMessage('')

    for (const file of Array.from(files)) {
      if (file.size > maxSize * 1024 * 1024) {
        setIsError(true)
        setErrorMessage(`文件 "${file.name}" 超过最大限制 ${maxSize}MB`)
        return false
      }
    }
    return true
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0 && validateFiles(files)) {
      onFileSelect(files)
    }
  }

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && validateFiles(files)) {
      onFileSelect(files)
    }
  }

  const getIconComponent = () => {
    if (accept.includes('video')) return VideoCameraIcon
    if (accept.includes('image')) return PhotoIcon
    return CloudArrowUpIcon
  }

  const IconComponent = getIconComponent()
  const resolvedHeight = typeof height === 'number' ? height : undefined
  const zoneBackground = isDragOver
    ? 'rgba(15, 15, 15, 0.22)'
    : isError
      ? 'rgba(239, 68, 68, 0.06)'
      : 'rgba(17, 24, 39, 0.5)'
  const zoneBorderColor = isDragOver
    ? '#6b9aff'
    : isError
      ? 'rgba(239, 68, 68, 0.5)'
      : '#1b2a46'

  return (
    <motion.div
      style={{
        position: 'relative',
        minHeight: resolvedHeight,
        height: resolvedHeight,
        borderRadius: 24,
        border: `2px dashed ${zoneBorderColor}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 300ms ease',
        background: zoneBackground,
        opacity: disabled ? 0.5 : 1,
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          background: 'linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.02) 50%, transparent 100%)',
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInputChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />

      <Box
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <AnimatePresence mode="wait">
          {children ? (
            <motion.div
              key="custom-content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%' }}
            >
              {children}
            </motion.div>
          ) : (
            <motion.div
              key="default-content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%' }}
            >
              <Stack align="center" gap="lg">
                <motion.div
                  animate={isDragOver ? { scale: 1.2, rotate: 5 } : { scale: 1, rotate: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    marginInline: 'auto',
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDragOver ? 'rgba(15, 15, 15, 0.2)' : 'rgba(27, 42, 70, 0.5)',
                    color: isDragOver ? '#6b9aff' : '#9ca3af',
                  }}
                >
                  <IconComponent style={{ width: 32, height: 32 }} />
                </motion.div>

                <Stack align="center" gap={4}>
                  <Title order={3} c={isDragOver ? 'brand.4' : 'white'}>{isDragOver ? '释放文件' : title}</Title>
                  <Text c="dimmed" size="sm">{subtitle}</Text>
                  {maxSize ? <Text c="gray.5" size="xs">最大文件大小: {maxSize}MB</Text> : null}
                </Stack>

                <AnimatePresence>
                  {isError ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      style={{
                        width: '100%',
                        maxWidth: 420,
                        padding: 12,
                        borderRadius: 12,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                      }}
                    >
                      <Text c="red.4" size="sm">{errorMessage}</Text>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 24,
              background: 'linear-gradient(90deg, rgba(91, 148, 255, 0.2) 0%, transparent 50%, rgba(91, 148, 255, 0.2) 100%)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
