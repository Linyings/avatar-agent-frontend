import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Center,
  Container,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import type { BoxProps, ElementProps, PaperProps } from '@mantine/core'
import type { ReactNode } from 'react'
import { ArrowLeftIcon } from '@/shared/icons/tabler'

type WorkflowTone = 'default' | 'subtle' | 'highlight' | 'danger' | 'success'
export type WorkflowStageId = string
export type WorkflowRailItemStatus = 'completed' | 'current' | 'upcoming' | 'disabled'

export interface WorkflowRailItem {
  id: WorkflowStageId
  label: ReactNode
  status: WorkflowRailItemStatus
  description?: ReactNode
  disabled?: boolean
  onSelect?: () => void
}

const railStatusStyles: Record<WorkflowRailItemStatus, {
  iconColor: string
  iconVariant: 'filled' | 'light'
  iconTextColor?: string
  labelColor: string
  descriptionColor: string
  connectorColor: string
  itemBackground: string
  itemBorderColor: string
}> = {
  current: {
    iconColor: 'brand',
    iconVariant: 'filled',
    iconTextColor: 'var(--app-brand-contrast-text)',
    labelColor: 'var(--app-text)',
    descriptionColor: 'var(--app-muted)',
    connectorColor: 'var(--app-brand-soft-border-strong)',
    itemBackground: 'rgba(59, 130, 246, 0.10)',
    itemBorderColor: 'rgba(59, 130, 246, 0.34)',
  },
  completed: {
    iconColor: 'green',
    iconVariant: 'filled',
    iconTextColor: 'white',
    labelColor: 'var(--app-text)',
    descriptionColor: 'rgba(187, 247, 208, 0.78)',
    connectorColor: 'rgba(34, 197, 94, 0.46)',
    itemBackground: 'rgba(34, 197, 94, 0.08)',
    itemBorderColor: 'rgba(34, 197, 94, 0.24)',
  },
  upcoming: {
    iconColor: 'yellow',
    iconVariant: 'light',
    labelColor: 'var(--app-text)',
    descriptionColor: 'var(--app-muted)',
    connectorColor: 'rgba(234, 179, 8, 0.34)',
    itemBackground: 'rgba(234, 179, 8, 0.07)',
    itemBorderColor: 'rgba(234, 179, 8, 0.20)',
  },
  disabled: {
    iconColor: 'gray',
    iconVariant: 'light',
    labelColor: 'rgba(148, 163, 184, 0.48)',
    descriptionColor: 'rgba(148, 163, 184, 0.40)',
    connectorColor: 'rgba(148, 163, 184, 0.18)',
    itemBackground: 'transparent',
    itemBorderColor: 'transparent',
  },
}

const panelToneStyles: Record<WorkflowTone, React.CSSProperties> = {
  default: {
    background: 'var(--app-surface)',
    borderColor: 'var(--app-border)',
  },
  subtle: {
    background: 'var(--app-surface-alt)',
    borderColor: 'var(--app-border-subtle)',
  },
  highlight: {
    background: 'var(--app-brand-soft-bg)',
    borderColor: 'var(--app-brand-soft-border)',
  },
  danger: {
    background: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.22)',
  },
}

interface WorkflowPageShellProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: 'narrow' | 'default' | 'wide' | 'fluid'
  center?: boolean
}

const widthMap = {
  narrow: 960,
  default: 1280,
  wide: 1560,
  fluid: '100%',
} as const

export function WorkflowPageShell({
  title,
  description,
  actions,
  children,
  width = 'default',
  center = false,
}: WorkflowPageShellProps) {
  return (
    <Box
      component="section"
      py={{ base: 'lg', md: 'xl' }}
      px={{ base: 'md', md: 'xl' }}
      style={{ minHeight: '100%', color: 'var(--app-text)' }}
    >
      <Container size={widthMap[width]} px={0} fluid={width === 'fluid'}>
        <Stack gap="xl" align={center ? 'center' : 'stretch'}>
          {(title || description || actions) && (
            <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap">
              <Stack gap={6} maw={760}>
                {title && (
                  <Title order={1} size="h2" lh={1.15}>
                    {title}
                  </Title>
                )}
                {description && (
                  <Text c="var(--app-muted)" size="sm" lh={1.65}>
                    {description}
                  </Text>
                )}
              </Stack>
              {actions && <ActionToolbar>{actions}</ActionToolbar>}
            </Group>
          )}
          {children}
        </Stack>
      </Container>
    </Box>
  )
}

interface WorkflowWorkbenchShellProps {
  title: ReactNode
  titleLeading?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  rail?: ReactNode
  mobileProgress?: ReactNode
  main: ReactNode
  inspector?: ReactNode
  actionBar?: ReactNode
  width?: 'default' | 'wide' | 'fluid'
}

export function WorkflowWorkbenchShell({
  title,
  titleLeading,
  description,
  meta,
  rail,
  mobileProgress,
  main,
  inspector,
  actionBar,
  width = 'wide',
}: WorkflowWorkbenchShellProps) {
  return (
    <Box
      component="section"
      py={{ base: 'md', md: 'xl' }}
      px={{ base: 'md', md: 'xl' }}
      pb={{ base: 104, md: 112 }}
      style={{ minHeight: '100%', color: 'var(--app-text)' }}
    >
      <Container size={widthMap[width]} px={0} fluid={width === 'fluid'}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end" gap="md" wrap="wrap">
            <Group gap="sm" align="flex-start" wrap="nowrap" maw={800} style={{ minWidth: 0 }}>
              {titleLeading && (
                <Box pt={2} style={{ flex: '0 0 auto' }}>
                  {titleLeading}
                </Box>
              )}
              <Stack gap={6} style={{ minWidth: 0 }}>
                <Title order={1} size="h2" lh={1.12}>
                  {title}
                </Title>
                {description && (
                  <Text c="var(--app-muted)" size="sm" lh={1.6}>
                    {description}
                  </Text>
                )}
              </Stack>
            </Group>
            {meta}
          </Group>

          {mobileProgress && (
            <Box hiddenFrom="md">
              {mobileProgress}
            </Box>
          )}

          <Grid gap="lg" align="flex-start">
            {rail && (
              <Grid.Col span={{ base: 12, lg: 2 }} visibleFrom="lg">
                <Box style={{ position: 'sticky', top: 96 }}>
                  {rail}
                </Box>
              </Grid.Col>
            )}

            <Grid.Col span={{ base: 12, lg: inspector ? (rail ? 7 : 8) : (rail ? 10 : 12) }}>
              <Box style={{ minWidth: 0 }}>
                {main}
              </Box>
            </Grid.Col>

            {inspector && (
              <Grid.Col span={{ base: 12, lg: rail ? 3 : 4 }}>
                <Box
                  style={{
                    minWidth: 0,
                    position: 'sticky',
                    top: 96,
                  }}
                >
                  {inspector}
                </Box>
              </Grid.Col>
            )}
          </Grid>
        </Stack>
      </Container>
      {actionBar}
    </Box>
  )
}

interface WorkflowHeaderBackButtonProps {
  onClick: () => void
  label?: string
}

export function WorkflowHeaderBackButton({ onClick, label = '返回' }: WorkflowHeaderBackButtonProps) {
  return (
    <ActionIcon
      aria-label={label}
      title={label}
      variant="subtle"
      color="gray"
      radius="xl"
      size={40}
      onClick={onClick}
    >
      <ArrowLeftIcon width={22} height={22} />
    </ActionIcon>
  )
}

interface WorkflowRailProps {
  items: WorkflowRailItem[]
  title?: ReactNode
}

export function WorkflowRail({ items, title = '素材处理' }: WorkflowRailProps) {
  return (
    <Box component="nav" aria-label="素材处理流程">
      <WorkflowPanel tone="subtle" p="md" radius="lg" style={{ boxShadow: 'none' }}>
        <Stack gap="sm">
          <Text size="xs" fw={700} c="var(--app-muted)" tt="uppercase">
            {title}
          </Text>
          <Stack gap={4}>
            {items.map((item, index) => {
              const active = item.status === 'current'
              const done = item.status === 'completed'
              const disabled = item.disabled || item.status === 'disabled'
              const interactive = Boolean(item.onSelect) && !disabled
              const visual = railStatusStyles[item.status]
              const content = (
                <Group
                  gap="sm"
                  align="flex-start"
                  wrap="nowrap"
                  opacity={disabled ? 0.62 : 1}
                  style={{
                    border: `1px solid ${visual.itemBorderColor}`,
                    background: visual.itemBackground,
                    borderRadius: 'var(--mantine-radius-md)',
                    padding: 6,
                    transition: 'background-color 140ms ease, border-color 140ms ease, opacity 140ms ease',
                  }}
                >
                  <ThemeIcon
                    size={28}
                    radius="xl"
                    variant={visual.iconVariant}
                    color={visual.iconColor}
                    style={{ flex: '0 0 auto' }}
                  >
                    <Text size="xs" fw={800} c={visual.iconTextColor}>
                      {index + 1}
                    </Text>
                  </ThemeIcon>
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={active ? 800 : done ? 700 : 600} size="sm" c={visual.labelColor}>
                      {item.label}
                    </Text>
                    {item.description && (
                      <Text size="xs" c={visual.descriptionColor} lh={1.35}>
                        {item.description}
                      </Text>
                    )}
                  </Stack>
                </Group>
              )

              return (
                <Box key={item.id}>
                  {interactive ? (
                    <UnstyledButton
                      aria-current={active ? 'step' : undefined}
                      onClick={item.onSelect}
                      style={{
                        width: '100%',
                        borderRadius: 'var(--mantine-radius-md)',
                        padding: 2,
                        cursor: 'pointer',
                      }}
                    >
                      {content}
                    </UnstyledButton>
                  ) : content}
                  {index < items.length - 1 && (
                    <Divider
                      orientation="vertical"
                      ml={13}
                      my={4}
                      h={18}
                      color={done ? railStatusStyles.completed.connectorColor : visual.connectorColor}
                    />
                  )}
                </Box>
              )
            })}
          </Stack>
        </Stack>
      </WorkflowPanel>
    </Box>
  )
}

interface WorkflowActionBarProps {
  children: ReactNode
}

export function WorkflowActionBar({ children }: WorkflowActionBarProps) {
  return (
    <Box
      component="footer"
      role="contentinfo"
      aria-label="素材页操作栏"
      pos="fixed"
      left={0}
      right={0}
      bottom={0}
      px={{ base: 'md', md: 'xl' }}
      py="md"
      style={{
        zIndex: 20,
        background: 'linear-gradient(180deg, transparent, var(--app-bg) 28%)',
        pointerEvents: 'none',
      }}
    >
      <Container size={widthMap.wide} px={0}>
        <WorkflowPanel tone="subtle" p="md" radius="lg" style={{ pointerEvents: 'auto', boxShadow: 'var(--app-shadow-strong)' }}>
          {children}
        </WorkflowPanel>
      </Container>
    </Box>
  )
}

interface WorkflowInspectorPanelProps {
  title: ReactNode
  description?: ReactNode
  badge?: ReactNode
  children: ReactNode
}

export function WorkflowInspectorPanel({ title, description, badge, children }: WorkflowInspectorPanelProps) {
  return (
    <WorkflowPanel tone="subtle" p="md" radius="lg" style={{ boxShadow: 'none' }}>
      <Stack gap="md">
        <Stack gap={4}>
          <Group gap="xs" justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={700}>{title}</Text>
            {badge && <Badge variant="light">{badge}</Badge>}
          </Group>
          {description && (
            <Text size="sm" c="var(--app-muted)" lh={1.55}>
              {description}
            </Text>
          )}
        </Stack>
        {children}
      </Stack>
    </WorkflowPanel>
  )
}

type WorkflowPanelProps = PaperProps &
  ElementProps<'div'> & {
    tone?: WorkflowTone
    children: ReactNode
  }

export function WorkflowPanel({
  tone = 'default',
  children,
  style,
  p = 'lg',
  radius = 'lg',
  ...props
}: WorkflowPanelProps) {
  return (
    <Paper
      withBorder
      p={p}
      radius={radius}
      style={{
        ...panelToneStyles[tone],
        boxShadow: tone === 'default' ? 'var(--app-shadow)' : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </Paper>
  )
}

interface ActionToolbarProps {
  children: ReactNode
  justify?: 'flex-start' | 'flex-end' | 'space-between' | 'center'
}

export function ActionToolbar({ children, justify = 'flex-end' }: ActionToolbarProps) {
  return (
    <Group gap="sm" justify={justify} wrap="wrap">
      {children}
    </Group>
  )
}

interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  tone?: WorkflowTone
}

export function MetricCard({ label, value, icon, tone = 'subtle' }: MetricCardProps) {
  return (
    <WorkflowPanel tone={tone} p="md" radius="md">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        {icon && (
          <ThemeIcon variant="light" color={tone === 'danger' ? 'red' : tone === 'success' ? 'green' : 'brand'}>
            {icon}
          </ThemeIcon>
        )}
        <Stack gap={2}>
          <Text size="xs" c="var(--app-muted)">
            {label}
          </Text>
          <Text fw={700}>{value}</Text>
        </Stack>
      </Group>
    </WorkflowPanel>
  )
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
      {children}
    </SimpleGrid>
  )
}

type MediaSurfaceProps = BoxProps &
  ElementProps<'div'> & {
    children: ReactNode
    ratio?: number
  }

export function MediaSurface({ children, ratio = 16 / 9, style, ...props }: MediaSurfaceProps) {
  return (
    <Box
      style={{
        overflow: 'hidden',
        borderRadius: 'var(--mantine-radius-lg)',
        border: '1px solid var(--app-border)',
        background: 'var(--app-media-bg)',
        ...style,
      }}
      {...props}
    >
      <AspectRatio ratio={ratio}>{children}</AspectRatio>
    </Box>
  )
}

export function MediaControls({ children }: { children: ReactNode }) {
  return (
    <Group gap="sm" justify="space-between" wrap="wrap">
      {children}
    </Group>
  )
}

interface WorkflowStateProps {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  loading?: boolean
  tone?: WorkflowTone
}

export function WorkflowState({
  title,
  description,
  action,
  loading = false,
  tone = 'subtle',
}: WorkflowStateProps) {
  return (
    <Center py={{ base: 56, md: 88 }} w="100%">
      <WorkflowPanel tone={tone} maw={560} w="100%" ta="center">
        <Stack align="center" gap="md">
          {loading && <Loader color="brand" />}
          {title && (
            <Title order={2} size="h3">
              {title}
            </Title>
          )}
          {description && (
            <Text c="var(--app-muted)" size="sm" lh={1.7}>
              {description}
            </Text>
          )}
          {action}
        </Stack>
      </WorkflowPanel>
    </Center>
  )
}
