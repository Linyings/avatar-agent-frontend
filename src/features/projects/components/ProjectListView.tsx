import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionIcon,
  Alert,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Modal,
  Image,
  Pagination,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  ArrowUpTrayIcon,
  ClockIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  Squares2X2Icon,
  TableCellsIcon,
  TrashIcon,
} from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog'
import type { Project, ProjectStatus } from '@/features/projects/types/project'
import type { ModelLevel, ProjectInferenceMode } from '@/features/projects/types/material/videoConfig.types'
import { formatRelativeTime } from '@/shared/utils/dateHelpers'
import { useProjectPreviewUrl } from '@/shared/hooks/useProjectPreviewUrl'
import { isAvatarProject, readStoredInferenceMode } from '@/features/projects/utils/inferenceMode'
import { getFrameWorkflowResumeSummary } from '@/features/projects/workflow/frame'

export type ProjectListViewMode = 'table' | 'card'
export type ProjectCreateKind = 'frame' | 'avatar'
export type ProjectModeFilter = ModelLevel | 'avatar' | 'all'

export interface ProjectStatusPresentation {
  label: string
  visible: boolean
}

export interface ProjectListPaginationProps {
  currentPage: number
  pageSize: number
  total: number
  onPageChange(page: number): void
}

export interface ProjectListViewProps {
  projects: Project[]
  isLoading: boolean
  isCreatingProject: boolean
  deletingId: string | null
  error: string | null
  searchQuery: string
  selectedMode: ProjectModeFilter
  sortBy: string
  viewMode: ProjectListViewMode
  resolveStatusPresentation?(project: Project): ProjectStatusPresentation | undefined
  deleteConfirmId?: string | null
  onDeleteConfirmIdChange?(projectId: string | null): void
  pagination?: ProjectListPaginationProps
  onSearchQueryChange(value: string): void
  onSelectedModeChange(value: ProjectModeFilter): void
  onSortByChange(value: string): void
  onViewModeChange(value: ProjectListViewMode): void
  onCreateProject(kind: ProjectCreateKind): void
  onDeleteProject(projectId: string): void
  onClearError(): void
}

const statusLabel: Record<ProjectStatus, string> = {
  draft: '草稿',
  processing: '处理中',
  completed: '已完成',
  archived: '已导出',
}

const statusTone: Record<ProjectStatus, { bg: string; color: string }> = {
  draft: { bg: 'var(--app-surface-alt)', color: 'var(--app-muted)' },
  processing: { bg: 'var(--app-brand-soft-bg)', color: 'var(--app-brand-accent)' },
  completed: { bg: 'rgba(34, 197, 94, 0.14)', color: '#22c55e' },
  archived: { bg: 'var(--app-surface-alt)', color: 'var(--app-muted)' },
}

const projectModeLabel: Record<ProjectInferenceMode, string> = {
  shallow: '已下线',
  deep: '已下线',
  frame: '通用模式',
  avatar: '数字人口播',
}

const projectModeOptions: Array<{ value: ProjectModeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'frame', label: '通用模式' },
  { value: 'avatar', label: '数字人口播' },
]

const projectModeTone: Record<ProjectInferenceMode, { bg: string; color: string; border: string }> = {
  shallow: {
    bg: 'linear-gradient(135deg, #64748b, #94a3b8)',
    color: '#ffffff',
    border: 'rgb(203 213 225 / 70%)',
  },
  deep: {
    bg: 'linear-gradient(135deg, #64748b, #94a3b8)',
    color: '#ffffff',
    border: 'rgb(203 213 225 / 70%)',
  },
  frame: {
    bg: 'linear-gradient(135deg, #0f766e, #2dd4bf)',
    color: '#ffffff',
    border: 'rgb(94 234 212 / 70%)',
  },
  avatar: {
    bg: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
    color: '#ffffff',
    border: 'rgb(196 181 253 / 70%)',
  },
}

const shouldShowStatusLabel = (status: ProjectStatus) => status !== 'draft'

const isProjectMode = (value: unknown): value is ProjectInferenceMode => (
  value === 'shallow' || value === 'deep' || value === 'frame' || value === 'avatar'
)

const resolveProjectMode = (project: Project): ProjectInferenceMode | null => {
  if (isAvatarProject(project)) return 'avatar'

  const metadataMode = project.metadata?.inference_mode
  if (isProjectMode(metadataMode)) return metadataMode

  const configMode = (project.workflow.stages.config?.data as { model_level?: unknown } | undefined)?.model_level
  if (isProjectMode(configMode)) return configMode

  return readStoredInferenceMode(project.id) ?? null
}

function ProjectModeBadge({ mode }: { mode: ProjectInferenceMode }) {
  const tone = projectModeTone[mode]

  return (
    <Box
      aria-label={`项目类型：${projectModeLabel[mode]}`}
      pos="absolute"
      left={10}
      top={10}
      px={9}
      py={5}
      style={{
        zIndex: 2,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        boxShadow: '0 10px 22px rgb(15 23 42 / 20%)',
        color: tone.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0,
        lineHeight: 1.2,
        textAlign: 'center',
        textShadow: '0 1px 2px rgb(15 23 42 / 32%)',
        pointerEvents: 'none',
      }}
    >
      {projectModeLabel[mode]}
    </Box>
  )
}

const softSurfaceStyle = {
  border: '1px solid var(--app-border)',
  background: 'var(--app-surface-alt)',
  boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 8%)',
} as const

const toolbarControlStyle = {
  border: '1px solid var(--app-input-border)',
  background: 'var(--app-input-bg)',
  boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 16%), 0 10px 24px rgba(15, 23, 42, 0.05)',
} as const

const toolbarActionStyle = {
  '--ai-hover': 'var(--app-brand-soft-bg)',
  color: 'var(--app-muted)',
  transition: 'background var(--app-transition), color var(--app-transition), box-shadow var(--app-transition)',
} as const

const skeletonCardStyle = {
  border: '1px solid var(--app-border)',
  boxShadow: 'var(--app-shadow)',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, var(--app-surface), var(--app-surface-alt))',
} as const

export function ProjectListView({
  projects,
  isLoading,
  isCreatingProject,
  deletingId,
  error,
  searchQuery,
  selectedMode,
  sortBy,
  viewMode,
  resolveStatusPresentation,
  deleteConfirmId: controlledDeleteConfirmId,
  onDeleteConfirmIdChange,
  pagination,
  onSearchQueryChange,
  onSelectedModeChange,
  onSortByChange,
  onViewModeChange,
  onCreateProject,
  onDeleteProject,
  onClearError,
}: ProjectListViewProps) {
  const [uncontrolledDeleteConfirmId, setUncontrolledDeleteConfirmId] = useState<string | null>(null)
  const [createKindOpen, setCreateKindOpen] = useState(false)
  const isDeleteConfirmControlled = controlledDeleteConfirmId !== undefined
  const deleteConfirmId = isDeleteConfirmControlled ? controlledDeleteConfirmId : uncontrolledDeleteConfirmId

  const setDeleteConfirmId = (projectId: string | null) => {
    if (!isDeleteConfirmControlled) {
      setUncontrolledDeleteConfirmId(projectId)
    }
    onDeleteConfirmIdChange?.(projectId)
  }

  const sortOptions = [
    { value: 'updated_at', label: '\u6309\u65e5\u671f\u6392\u5e8f' },
    { value: 'name', label: '\u6309\u540d\u79f0\u6392\u5e8f' },
    { value: 'status', label: '\u6309\u72b6\u6001\u6392\u5e8f' },
  ]

  const visibleProjects = projects.filter((project) => {
    if (selectedMode === 'all') return true
    const mode = resolveProjectMode(project)
    if (selectedMode === 'avatar') return mode === 'avatar'
    return mode === selectedMode || mode === null
  })

  const handleRequestDelete = (projectId: string) => {
    setDeleteConfirmId(projectId)
  }

  const handleConfirmDelete = () => {
    if (!deleteConfirmId) return

    onDeleteProject(deleteConfirmId)
    setDeleteConfirmId(null)
  }
  return (
    <AppPageShell py={{ base: 28, md: 48 }} gap={34}>
        {error && (
          <Alert color="red" variant="light">
            <Stack gap={8}>
              <Text size="sm">{error}</Text>
              <Button onClick={() => onClearError()} variant="subtle" color="red" size="compact-sm" justify="start">
                关闭
              </Button>
            </Stack>
          </Alert>
        )}

        <Group justify="space-between" align="flex-start" gap="lg">
          <TextInput
            w={{ base: '100%', md: 500 }}
            placeholder="搜索项目..."
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            leftSection={<MagnifyingGlassIcon width={20} height={20} />}
            styles={{
              input: {
                height: 48,
                borderRadius: 'var(--mantine-radius-md)',
                color: 'var(--app-text)',
                ...toolbarControlStyle,
              },
            }}
          />

          <Group gap={10} wrap="wrap">
            <Group gap={4} p={4} h={44} style={{ borderRadius: 14, ...toolbarControlStyle }}>
              <ActionIcon
                aria-label="卡片视图"
                variant={viewMode === 'card' ? 'filled' : 'subtle'}
                color="brand"
                radius={10}
                size={34}
                onClick={() => onViewModeChange('card')}
                style={viewMode === 'card' ? { boxShadow: '0 8px 18px rgba(63, 124, 255, 0.22)' } : toolbarActionStyle}
              >
                <Squares2X2Icon width={17} height={17} />
              </ActionIcon>
              <ActionIcon
                aria-label="列表视图"
                variant={viewMode === 'table' ? 'filled' : 'subtle'}
                color="brand"
                radius={10}
                size={34}
                onClick={() => onViewModeChange('table')}
                style={viewMode === 'table' ? { boxShadow: '0 8px 18px rgba(63, 124, 255, 0.22)' } : toolbarActionStyle}
              >
                <TableCellsIcon width={17} height={17} />
              </ActionIcon>
            </Group>
            <Select
              comboboxProps={{ withinPortal: false }}
              value={sortBy}
              onChange={(value) => value && onSortByChange(value)}
              data={sortOptions}
              w={136}
              styles={{
                input: {
                  height: 44,
                  minHeight: 44,
                  borderRadius: 14,
                  color: 'var(--app-text)',
                  fontWeight: 600,
                  ...toolbarControlStyle,
                },
                dropdown: {
                  borderRadius: 14,
                },
              }}
            />
            <Button
              onClick={() => setCreateKindOpen(true)}
              leftSection={<PlusIcon width={16} height={16} />}
              color="brand"
              radius={14}
              size="md"
              h={44}
              px={18}
              loading={isCreatingProject}
              disabled={isCreatingProject}
              styles={{
                root: {
                  background: 'linear-gradient(135deg, var(--mantine-color-brand-6), var(--mantine-color-brand-5))',
                  boxShadow: '0 12px 26px rgba(63, 124, 255, 0.28)',
                  border: '1px solid var(--app-brand-soft-border-strong)',
                },
              }}
            >
              新建项目
            </Button>
          </Group>
        </Group>

        <Group gap={24} style={{ borderBottom: '1px solid var(--app-border)' }}>
          {projectModeOptions.map((option) => {
            const active = selectedMode === option.value
            return (
              <UnstyledButton
                key={option.value}
                onClick={() => onSelectedModeChange(option.value)}
                style={{
                  color: active ? 'var(--app-brand-accent)' : 'var(--app-muted)',
                  borderBottom: active ? '2px solid var(--app-brand-accent)' : '2px solid transparent',
                  paddingBottom: 14,
                  marginBottom: -1,
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Text size="sm">{option.label}</Text>
              </UnstyledButton>
            )
          })}
        </Group>

        {visibleProjects.length === 0 && !isLoading ? (
          <EmptyProjects
            hasFilter={Boolean(searchQuery || selectedMode !== 'all')}
            isCreatingProject={isCreatingProject}
            onClear={() => {
              onSearchQueryChange('')
              onSelectedModeChange('all')
            }}
            onCreate={() => setCreateKindOpen(true)}
          />
        ) : viewMode === 'table' ? (
          <ProjectListRows
            projects={visibleProjects}
            isLoading={isLoading}
            resolveStatusPresentation={resolveStatusPresentation}
          />
        ) : (
          <ProjectCards
            projects={visibleProjects}
            isLoading={isLoading}
            deletingId={deletingId}
            onDeleteProject={handleRequestDelete}
            resolveStatusPresentation={resolveStatusPresentation}
          />
        )}

      {pagination && (
        <Pagination
          value={pagination.currentPage}
          total={Math.ceil(pagination.total / pagination.pageSize)}
          onChange={pagination.onPageChange}
        />
      )}

      <Modal opened={createKindOpen} onClose={() => setCreateKindOpen(false)} title="选择项目类型" centered>
        <Stack gap="sm">
          <Button
            onClick={() => {
              setCreateKindOpen(false)
              onCreateProject('frame')
            }}
          >
            新建通用模式项目
          </Button>
          <Text size="sm" c="dimmed">上传素材，按通用流程剪辑。</Text>
          <Button
            variant="light"
            onClick={() => {
              setCreateKindOpen(false)
              onCreateProject('avatar')
            }}
          >
            新建数字人口播项目
          </Button>
          <Text size="sm" c="dimmed">从空白开始。照片、口播稿和制作记录只属于这个项目，不会带入以前的任务。</Text>
        </Stack>
      </Modal>

      <ConfirmDialog
        cancelText="取消"
        confirmText={deletingId !== null ? '删除中...' : '删除'}
        isOpen={!!deleteConfirmId}
        message="确定要删除这个项目吗？此操作无法撤销。"
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleConfirmDelete}
        title="删除项目"
        type="danger"
      />
    </AppPageShell>
  )
}

function EmptyProjects({
  hasFilter,
  isCreatingProject,
  onClear,
  onCreate,
}: {
  hasFilter: boolean
  isCreatingProject: boolean
  onClear: () => void
  onCreate: () => void
}) {
  return (
    <Center py={96}>
      {hasFilter ? (
        <Stack align="center" gap="sm">
          <ThemeIcon size={72} radius="xl" variant="light" color="gray" style={softSurfaceStyle}>
            <FolderOpenIcon width={32} height={32} />
          </ThemeIcon>
          <Title order={3}>未找到项目</Title>
          <Text c="dimmed">尝试调整搜索条件或筛选器</Text>
          <Button onClick={onClear} variant="subtle" color="brand">
            清除筛选条件
          </Button>
        </Stack>
      ) : (
        <Stack align="center" gap="sm">
          <ThemeIcon size={72} radius="xl" variant="light" color="gray" style={softSurfaceStyle}>
            <ArrowUpTrayIcon width={32} height={32} />
          </ThemeIcon>
          <Title order={3}>暂无项目</Title>
          <Text c="dimmed">创建你的第一个视频剪辑项目</Text>
          <Button
            onClick={onCreate}
            leftSection={<PlusIcon width={20} height={20} />}
            radius="xl"
            loading={isCreatingProject}
            disabled={isCreatingProject}
          >
            创建项目
          </Button>
        </Stack>
      )}
    </Center>
  )
}

function ProjectCards({
  projects,
  isLoading,
  deletingId,
  onDeleteProject,
  resolveStatusPresentation,
}: {
  projects: Project[]
  isLoading: boolean
  deletingId: string | null
  onDeleteProject: (projectId: string) => void
  resolveStatusPresentation?: ProjectListViewProps['resolveStatusPresentation']
}) {
  const rows = isLoading ? Array.from({ length: 6 }) : projects

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} spacing={{ base: 'md', lg: 'md' }}>
      {rows.map((item, index) => {
        if (isLoading) {
          return <ProjectCardSkeleton key={index} index={index} />
        }

        const project = item as Project

        return (
          <ProjectCardGridItem
            key={project.id}
            project={project}
            isDeleting={deletingId === project.id}
            onDeleteProject={onDeleteProject}
            resolveStatusPresentation={resolveStatusPresentation}
          />
        )
      })}
    </SimpleGrid>
  )
}

function ProjectCardSkeleton({ index }: { index: number }) {
  return (
    <Card
      data-testid="project-card-loading-skeleton"
      data-project-loading="true"
      padding={0}
      radius={8}
      style={{
        ...skeletonCardStyle,
        animationDelay: `${index * 90}ms`,
      }}
    >
      <Card.Section pos="relative" bg="var(--app-media-bg)">
        <AspectRatio ratio={16 / 9}>
          <Box data-testid="project-card-skeleton-media" pos="relative" h="100%" w="100%">
            <Skeleton height="100%" radius={0} opacity={0.45} />
            <Box pos="absolute" left={12} top={12}>
              <Skeleton height={24} width={68} radius="xl" opacity={0.5} />
            </Box>
            <Box pos="absolute" right={12} top={12}>
              <Skeleton height={30} width={30} radius="xl" opacity={0.45} />
            </Box>
          </Box>
        </AspectRatio>
      </Card.Section>

      <Stack p={14} gap="sm">
        <Skeleton height={18} radius="xl" width="70%" opacity={0.5} />
        <Group gap={8} wrap="nowrap">
          <Skeleton height={14} width={14} radius="xl" opacity={0.45} />
          <Skeleton height={14} radius="xl" width="48%" opacity={0.42} />
          <Skeleton height={14} radius="xl" width="24%" opacity={0.35} />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Skeleton height={18} radius="xl" width={72} opacity={0.48} />
          <Skeleton height={24} radius="xl" width={58} opacity={0.38} />
        </Group>
      </Stack>
    </Card>
  )
}

function ProjectCardGridItem({
  project,
  isDeleting,
  onDeleteProject,
  resolveStatusPresentation,
}: {
  project: Project
  isDeleting: boolean
  onDeleteProject: (projectId: string) => void
  resolveStatusPresentation?: ProjectListViewProps['resolveStatusPresentation']
}) {
  const imageUrl = useProjectPreviewUrl(project)
  const tone = statusTone[project.status]
  const projectMode = resolveProjectMode(project)
  const resumeSummary = getFrameWorkflowResumeSummary(project)
  const statusPresentation = resolveStatusPresentation?.(project)
  const showStatus = statusPresentation?.visible ?? shouldShowStatusLabel(project.status)

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isDeleting) {
      onDeleteProject(project.id)
    }
  }

  return (
    <Card
      padding={0}
      radius={8}
      bg="var(--app-surface)"
      style={{
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--app-shadow)',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 4%))',
        opacity: isDeleting ? 0.55 : 1,
      }}
    >
      <Card.Section pos="relative" bg="var(--app-media-bg)">
        <Link to={`/projects/${project.id}`} style={{ display: 'block', color: 'inherit' }}>
          <AspectRatio ratio={16 / 9}>
            <Box pos="relative" h="100%" w="100%">
              {imageUrl ? (
                <Image src={imageUrl} alt={project.name} h="100%" fit="cover" />
              ) : (
                <Center h="100%" bg="var(--app-media-bg)">
                  <Text c="dimmed" size="sm">暂无预览</Text>
                </Center>
              )}
            </Box>
          </AspectRatio>
        </Link>
        {projectMode && <ProjectModeBadge mode={projectMode} />}
        <ActionIcon
          aria-label={`删除项目 ${project.name}`}
          title={`删除项目 ${project.name}`}
          color="red"
          radius="xl"
          size={32}
          loading={isDeleting}
          disabled={isDeleting}
          onClick={handleDeleteClick}
          pos="absolute"
          top={10}
          right={10}
          variant="filled"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.48)',
            border: '1px solid rgb(255 255 255 / 18%)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <TrashIcon width={16} height={16} />
        </ActionIcon>
      </Card.Section>

      <Stack p={14} gap="sm">
        <Text size="md" c="var(--app-text)" lineClamp={1}>
          {project.name}
        </Text>
        <Group gap={6} c="var(--app-muted)" wrap="nowrap">
          <ClockIcon width={14} height={14} />
          <Text size="xs" truncate>{formatRelativeTime(project.updated_at)}</Text>
          <Text size="xs" truncate>{formatDate(project.created_at)}</Text>
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Link to={`/projects/${project.id}`}>
            <Group gap={6} c="var(--app-brand-accent)">
              <PencilIcon width={15} height={15} />
              <Text size="xs">{projectMode === 'avatar' ? '打开项目' : resumeSummary.available ? '继续处理' : '编辑项目'}</Text>
            </Group>
          </Link>
          {showStatus && (
            <Text size="xs" px={8} py={4} bg={tone.bg} c={tone.color} style={{ borderRadius: 999, flexShrink: 0 }}>
              {statusPresentation?.label ?? (resumeSummary.available
                ? `可继续 · 已完成 ${resumeSummary.completedCount}/${resumeSummary.totalCount}`
                : statusLabel[project.status])}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

function ProjectListRows({
  projects,
  isLoading,
  resolveStatusPresentation,
}: {
  projects: Project[]
  isLoading: boolean
  resolveStatusPresentation?: ProjectListViewProps['resolveStatusPresentation']
}) {
  const rows = isLoading ? Array.from({ length: 5 }) : projects

  return (
    <Stack
      gap={0}
      bg="var(--app-surface)"
      style={{ border: '1px solid var(--app-border)', borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--app-shadow)' }}
    >
      {rows.map((item, index) => {
        if (isLoading) {
          return (
            <Group
              key={index}
              justify="space-between"
              h={78}
              px="lg"
              wrap="nowrap"
              data-project-loading="true"
              style={{ borderBottom: '1px solid var(--app-border)', animationDelay: `${index * 90}ms` }}
            >
              <Stack gap={8} flex={1}>
                <Skeleton height={16} radius="xl" width="32%" opacity={0.5} />
                <Skeleton height={12} radius="xl" width="18%" opacity={0.4} />
              </Stack>
              <Skeleton height={26} radius="xl" width={74} opacity={0.4} />
            </Group>
          )
        }

        const project = item as Project
        const tone = statusTone[project.status]
        const projectMode = resolveProjectMode(project)
        const resumeSummary = getFrameWorkflowResumeSummary(project)
        const statusPresentation = resolveStatusPresentation?.(project)
        const showStatus = statusPresentation?.visible ?? shouldShowStatusLabel(project.status)
        return (
          <Link key={project.id} to={`/projects/${project.id}`} style={{ display: 'block', color: 'var(--app-text)' }}>
            <Group
              justify="space-between"
              px="lg"
              py="md"
              wrap="nowrap"
              style={{
                borderBottom: index < projects.length - 1 ? '1px solid var(--app-border)' : undefined,
              }}
            >
              <Stack gap={2}>
                <Text fw={600}>{project.name}</Text>
                {projectMode && (
                  <Badge
                    radius="sm"
                    size="xs"
                    variant="filled"
                    w="fit-content"
                    style={{
                      background: projectModeTone[projectMode].bg,
                      color: projectModeTone[projectMode].color,
                    }}
                  >
                    {projectModeLabel[projectMode]}
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  {formatRelativeTime(project.updated_at)}
                </Text>
              </Stack>
              {showStatus ? (
                <Text size="xs" px={10} py={6} bg={tone.bg} c={tone.color} style={{ borderRadius: 999 }}>
                  {statusPresentation?.label ?? (resumeSummary.available
                    ? `可继续 · 已完成 ${resumeSummary.completedCount}/${resumeSummary.totalCount}`
                    : statusLabel[project.status])}
                </Text>
              ) : (
                <Text size="xs" c="var(--app-muted)">
                  最近更新
                </Text>
              )}
            </Group>
          </Link>
        )
      })}
    </Stack>
  )
}

function formatDate(dateString: string) {
  try {
    return new Date(dateString).toLocaleDateString('zh-CN')
  } catch {
    return '-'
  }
}
