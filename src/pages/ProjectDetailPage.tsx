import React, { Suspense, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Center,
  CloseButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { ExclamationTriangleIcon } from '@/shared/icons/tabler'
import { useProject } from '@/features/projects'
import { isAvatarProject } from '@/features/projects/utils/inferenceMode'
import { useAuth } from '@/features/auth'
import UserMenu from '@/features/auth/components/UserMenu'
import NotificationCenter from '@/shared/components/feedback/NotificationCenter'
import BrandLogo from '@/shared/components/brand/BrandLogo'
import BrandWordmark from '@/shared/components/brand/BrandWordmark'
import ThemeToggle from '@/shared/components/ui/ThemeToggle'

declare global {
  interface Window {
    __preventNavigation?: boolean
  }
}

const MaterialStage = React.lazy(() => import('@/features/projects/components/stages/MaterialStage'))
const AnalysisStage = React.lazy(() => import('@/features/projects/components/stages/AnalysisStage'))
const DubbingStage = React.lazy(() => import('@/features/projects/components/stages/DubbingStage'))

function StageLoadingState({ label }: { label: string }) {
  return (
    <Center py="xl">
      <Stack align="center" gap="sm">
        <Loader color="brand" />
        <Text c="dimmed">{label}</Text>
      </Stack>
    </Center>
  )
}

interface StageErrorBoundaryProps {
  children: React.ReactNode
}

interface StageErrorBoundaryState {
  error: Error | null
}

class StageErrorBoundary extends React.Component<StageErrorBoundaryProps, StageErrorBoundaryState> {
  state: StageErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ProjectDetailPage] 项目工作流页面渲染失败:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Center mih="calc(100dvh - 72px)" p="xl">
        <Paper maw={560} w="100%" radius="md" p="xl" withBorder>
          <Stack gap="md" align="flex-start">
            <ThemeIcon color="red" variant="light" radius="xl" size={44}>
              <ExclamationTriangleIcon width={22} height={22} />
            </ThemeIcon>
            <Stack gap={4}>
              <Title order={2}>项目工作流暂时不可用</Title>
              <Text c="dimmed">
                当前步骤渲染时出现异常，任务数据已保留。可以重试当前页面，或先返回项目列表。
              </Text>
            </Stack>
            <Text size="sm" c="red">
              {this.state.error.message || '未知渲染错误'}
            </Text>
            <Group gap="sm">
              <Button onClick={this.handleRetry} radius="xl">
                重试
              </Button>
              <Button component={Link} to="/projects" variant="light" radius="xl">
                返回项目列表
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Center>
    )
  }
}

function ProjectDetailHeader() {
  const { isAuthenticated } = useAuth()

  return (
    <Paper
      component="header"
      radius={0}
      px={{ base: 'sm', sm: 'lg' }}
      h={{ base: 64, sm: 72 }}
      style={{
        position: 'fixed',
        insetInline: 0,
        top: 0,
        zIndex: 50,
        borderTop: 0,
        borderLeft: 0,
        borderRight: 0,
        borderBottom: '1px solid var(--app-border)',
      }}
    >
      <Group h="100%" justify="space-between" wrap="nowrap">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Group gap="sm" wrap="nowrap">
            <BrandLogo size={32} />
            <Box visibleFrom="xs">
              <BrandWordmark size={22} />
            </Box>
          </Group>
        </Link>

        <Group gap="sm" wrap="nowrap">
          <ThemeToggle />
          {isAuthenticated && (
            <>
              <NotificationCenter />
              <Box hiddenFrom="sm">
                <UserMenu compact />
              </Box>
              <Box visibleFrom="sm">
                <UserMenu />
              </Box>
            </>
          )}
        </Group>
      </Group>
    </Paper>
  )
}

const ProjectDetailPage: React.FC = () => {
  const { projectId, stage } = useParams<{ projectId: string; stage?: string }>()
  const navigate = useNavigate()
  const { currentProject, isLoading, error, loadProject, clearError } = useProject()

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
    }
  }, [projectId, loadProject])

  const avatarProject = isAvatarProject(currentProject)

  useEffect(() => {
    if (!projectId || !currentProject || isLoading) return

    if (avatarProject) {
      navigate(`/workspace/${projectId}`, { replace: true })
      return
    }

    if (stage === 'frame' || stage === 'avatar' || !stage) {
      navigate(`/projects/${projectId}/material/upload`, { replace: true })
    }
  }, [projectId, stage, currentProject, isLoading, navigate, avatarProject])

  const renderStageContent = () => {
    if (!projectId) return null
    if (avatarProject || stage === 'avatar') return <StageLoadingState label="正在打开工作台..." />

    switch (stage) {
      case 'material':
        return <MaterialStage />
      case 'analysis':
        return <AnalysisStage />
      case 'dubbing':
        return <DubbingStage />
      default:
        return <MaterialStage />
    }
  }

  if (isLoading && !currentProject) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="sm">
          <Loader color="brand" size="lg" />
          <Text c="dimmed">加载项目中...</Text>
        </Stack>
      </Center>
    )
  }

  if (!isLoading && !currentProject) {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="md">
          <Title order={2}>项目未找到</Title>
          <Text c="dimmed">请检查项目 ID 是否正确</Text>
          <Button component={Link} to="/projects" radius="xl">
            返回项目列表
          </Button>
        </Stack>
      </Center>
    )
  }

  return (
    <Box h="100dvh" style={{ overflow: 'hidden', color: 'var(--app-text)' }}>
      <ProjectDetailHeader />

      <Box h="100%" pt={{ base: 64, sm: 72 }} style={{ overflowY: 'auto', boxSizing: 'border-box' }}>
        {error && (
          <Paper
            radius={0}
            px="lg"
            py="md"
            style={{
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
              borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
              background: 'rgba(239, 68, 68, 0.08)',
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon color="red" variant="light" radius="xl">
                  <ExclamationTriangleIcon width={16} height={16} />
                </ThemeIcon>
                <Text size="sm" c="red.2">
                  {error}
                </Text>
              </Group>
              <CloseButton onClick={clearError} aria-label="关闭错误提示" />
            </Group>
          </Paper>
        )}

        <Box component="main" h="100%">
          <StageErrorBoundary key={`${projectId ?? 'unknown'}:${stage ?? 'default'}`}>
            <Suspense fallback={<StageLoadingState label="加载中..." />}>{renderStageContent()}</Suspense>
          </StageErrorBoundary>
        </Box>
      </Box>

    </Box>
  )
}

export default ProjectDetailPage
