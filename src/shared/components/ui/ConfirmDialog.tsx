import React from 'react'
import { Button, Group, Modal, Stack, Text, ThemeIcon } from '@mantine/core'
import { ExclamationTriangleIcon } from '@/shared/icons/tabler'

interface ConfirmDialogProps {
  isOpen:       boolean
  onClose:      () => void
  onConfirm:    () => void
  title:        string
  message:      string
  confirmText?: string
  cancelText?:  string
  type?:        'warning' | 'danger' | 'info'
}

const typeConfig = {
  danger: {
    color: 'red',
  },
  info: {
    color: 'blue',
  },
  warning: {
    color: 'yellow',
  },
} as const

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText  = '取消',
  type        = 'warning',
}) => {
  const cfg = typeConfig[type]

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      centered
      closeOnClickOutside={false}
      title={
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size={44} radius="xl" color={cfg.color} variant="light">
            <ExclamationTriangleIcon width={24} height={24} />
          </ThemeIcon>
          <Text fw={600} c={`${cfg.color}.3`}>
            {title}
          </Text>
        </Group>
      }
    >
      <Stack gap="xl">
        <Text c="dimmed">{message}</Text>
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button color={cfg.color} onClick={handleConfirm}>
            {confirmText}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export default ConfirmDialog
