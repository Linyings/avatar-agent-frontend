import { Container, Stack } from '@mantine/core'
import type { ContainerProps, ElementProps, MantineSpacing } from '@mantine/core'
import type { ReactNode } from 'react'

interface AppPageShellProps extends Omit<ContainerProps, 'children'>, ElementProps<'div'> {
  children: ReactNode
  gap?: MantineSpacing
  padded?: boolean
}

const pageShellMaxWidth = {
  xs: 540,
  sm: 720,
  md: 960,
  lg: 1180,
  xl: 1540,
} as const

function resolveMaxWidth(size: ContainerProps['size']) {
  if (typeof size === 'string' && size in pageShellMaxWidth) {
    return pageShellMaxWidth[size as keyof typeof pageShellMaxWidth]
  }

  return size
}

export default function AppPageShell({
  children,
  className,
  gap = 'xl',
  padded = true,
  size = 'xl',
  px,
  py,
  style,
  ...props
}: AppPageShellProps) {
  return (
    <Container
      fluid
      maw={resolveMaxWidth(size)}
      ml={0}
      mr="auto"
      px={px ?? { base: 18, md: 42, xl: 56 }}
      py={py ?? (padded ? { base: 'xl', md: '2rem' } : 0)}
      className={['app-page-shell', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        ...style,
      }}
      {...props}
    >
      <Stack gap={gap}>
        {children}
      </Stack>
    </Container>
  )
}
