import { Group } from '@mantine/core'
import BrandLogo from './BrandLogo'
import BrandWordmark from './BrandWordmark'

interface BrandLockupProps {
  markSize?: number
  size?: number
  tone?: 'adaptive' | 'light' | 'dark'
}

export default function BrandLockup({ markSize = 36, size = 24, tone = 'adaptive' }: BrandLockupProps) {
  return (
    <Group gap={10} wrap="nowrap">
      <BrandLogo size={markSize} />
      <BrandWordmark size={size} tone={tone} />
    </Group>
  )
}
