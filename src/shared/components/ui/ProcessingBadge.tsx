import React from 'react'
import { Badge } from '@mantine/core'
import { motion } from 'framer-motion'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@/shared/icons/tabler'

interface ProcessingBadgeProps {
  status: 'completed' | 'processing' | 'warning' | 'error' | 'pending'
  text?: string
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  pulse?: boolean
}

const statusConfig = {
  completed: {
    color: 'green',
    label: '已完成',
    icon: CheckCircleIcon,
  },
  processing: {
    color: 'blue',
    label: '处理中',
    icon: ArrowPathIcon,
  },
  warning: {
    color: 'yellow',
    label: '警告',
    icon: ExclamationTriangleIcon,
  },
  error: {
    color: 'red',
    label: '错误',
    icon: XCircleIcon,
  },
  pending: {
    color: 'gray',
    label: '待处理',
    icon: ClockIcon,
  },
} as const

const sizeConfig = {
  sm: {
    badge: 'xs',
    icon: 12,
  },
  md: {
    badge: 'sm',
    icon: 14,
  },
  lg: {
    badge: 'md',
    icon: 16,
  },
} as const

export const ProcessingBadge: React.FC<ProcessingBadgeProps> = ({
  status,
  text,
  size = 'md',
  showIcon = true,
  pulse = false,
}) => {
  const config = statusConfig[status]
  const currentSize = sizeConfig[size]
  const IconComponent = config.icon

  const badgeContent = (
    <Badge
      color={config.color}
      leftSection={
        showIcon ? (
          <motion.span
            animate={status === 'processing' ? { rotate: 360 } : undefined}
            transition={
              status === 'processing'
                ? {
                    duration: 1.2,
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  }
                : undefined
            }
            style={{ display: 'inline-flex', alignItems: 'center' }}
          >
            <IconComponent height={currentSize.icon} width={currentSize.icon} />
          </motion.span>
        ) : undefined
      }
      radius="xl"
      size={currentSize.badge}
      variant="light"
    >
      {text ?? config.label}
    </Badge>
  )

  return (
    <motion.div
      animate={
        pulse
          ? {
              opacity: [1, 0.82, 1],
              scale: [1, 1.03, 1],
            }
          : {
              opacity: 1,
              scale: 1,
            }
      }
      initial={{ opacity: 0, scale: 0.8 }}
      transition={
        pulse
          ? {
              duration: 1.4,
              ease: 'easeInOut',
              repeat: Number.POSITIVE_INFINITY,
            }
          : {
              duration: 0.3,
            }
      }
      style={{ display: 'inline-flex' }}
    >
      {badgeContent}
    </motion.div>
  )
}
