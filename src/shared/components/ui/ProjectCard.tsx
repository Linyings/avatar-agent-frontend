import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Card,
  Group,
  Image,
  Overlay,
  Stack,
  Text,
} from '@mantine/core'
import { TrashIcon } from '@/shared/icons/tabler'
import type { Project } from '@/features/projects'
import StatusBadge from './StatusBadge'
import DefaultThumbnail from './DefaultThumbnail'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useProjectPreviewUrl } from '@/shared/hooks/useProjectPreviewUrl'
import type { ProjectInferenceMode } from '@/features/projects/types/material/videoConfig.types'
import { isAvatarProject, readStoredInferenceMode } from '@/features/projects/utils/inferenceMode'
import { getFrameWorkflowResumeSummary } from '@/features/projects/workflow/frame'

interface ProjectCardProps {
  project: Project
  className?: string
  isDeleting?: boolean
  onDeleteProject?: (projectId: string) => void | Promise<void>
}

const ACCENT_COLOR = 'var(--app-brand-accent)'
const MUTED_TEXT = 'var(--app-muted)'

const PROJECT_MODE_LABELS: Record<ProjectInferenceMode, string> = {
  shallow: '已下线',
  deep: '已下线',
  frame: '通用模式',
  avatar: '数字人口播',
}

const PROJECT_MODE_TONES: Record<ProjectInferenceMode, { bg: string; color: string; border: string }> = {
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

const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  draft: '草稿',
  processing: '处理中',
  completed: '已完成',
  archived: '已导出',
}

const shouldShowStatusLabel = (status: Project['status']) => status !== 'draft'

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
  const tone = PROJECT_MODE_TONES[mode]

  return (
    <Box
      aria-label={`项目类型：${PROJECT_MODE_LABELS[mode]}`}
      pos="absolute"
      left="sm"
      top="sm"
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
      {PROJECT_MODE_LABELS[mode]}
    </Box>
  )
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  className = '',
  isDeleting = false,
  onDeleteProject,
}) => {
  const [hovered, setHovered] = useState(false)
  const [imageError, setImageError] = useState(false)

  const getLastEditedText = (updatedAt: string) => {
    try {
      const distance = formatDistanceToNow(new Date(updatedAt), {
        addSuffix: true,
        locale: zhCN,
      })
      return `${distance}最后编辑`
    } catch {
      return '最近编辑'
    }
  }

  const previewImageUrl = useProjectPreviewUrl(project)
  const projectMode = resolveProjectMode(project)
  const resumeSummary = getFrameWorkflowResumeSummary(project)
  const showStatus = shouldShowStatusLabel(project.status)

  useEffect(() => {
    setImageError(false)
  }, [previewImageUrl])

  const hasValidThumbnail = Boolean(previewImageUrl) && !imageError
  const showDeleteAction = hovered || isDeleting

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!onDeleteProject || isDeleting) return
    void onDeleteProject(project.id)
  }

  return (
    <Card
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      padding={0}
      radius="xl"
      style={{
        overflow: 'hidden',
        background: 'var(--app-surface)',
        border: `1px solid ${hovered ? 'var(--app-brand-soft-border-strong)' : 'var(--app-border)'}`,
        boxShadow: hovered ? 'var(--app-shadow-strong)' : 'var(--app-shadow)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease',
        opacity: isDeleting ? 0.5 : 1,
        pointerEvents: isDeleting ? 'none' : undefined,
      }}
      withBorder
    >
      <Card.Section>
        <Box pos="relative">
          <Box
            component={Link}
            to={`/projects/${project.id}`}
            style={{
              display: 'block',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <AspectRatio ratio={16 / 9}>
              {hasValidThumbnail ? (
                <Image
                  alt={`${project.name} preview`}
                  fit="cover"
                  onError={() => setImageError(true)}
                  src={previewImageUrl ?? undefined}
                  style={{
                    transform: hovered ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 300ms ease',
                  }}
                />
              ) : (
                <Box
                  style={{
                    height: '100%',
                    transform: hovered ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 300ms ease',
                  }}
                >
                  <DefaultThumbnail status={project.status} />
                </Box>
              )}
            </AspectRatio>

            <Overlay
              gradient="linear-gradient(180deg, rgba(0, 0, 0, 0) 35%, rgba(0, 0, 0, 0.3) 100%)"
              opacity={hovered ? 1 : 0}
              style={{ transition: 'opacity 200ms ease' }}
            />
          </Box>

          {showStatus && (
            <Box pos="absolute" right="sm" top="sm">
              {resumeSummary.available ? (
                <Badge color="yellow" radius="xl" size="xs" variant="light">
                  可继续
                </Badge>
              ) : (
                <StatusBadge status={project.status} size="sm" />
              )}
            </Box>
          )}

          {projectMode && <ProjectModeBadge mode={projectMode} />}

          {project.is_public && (
            <Box pos="absolute" left="sm" top={44}>
              <Badge color="blue" radius="xl" size="xs" variant="light">
                公开
              </Badge>
            </Box>
          )}

          {onDeleteProject && (
            <Box
              pos="absolute"
              right={project.is_public ? 48 : undefined}
              left={project.is_public ? undefined : 'sm'}
              top={44}
              style={{
                opacity: showDeleteAction ? 1 : 0,
                transition: 'opacity 200ms ease',
              }}
            >
              <ActionIcon
                aria-label="删除项目"
                color="red"
                disabled={isDeleting}
                loading={isDeleting}
                onClick={handleDeleteClick}
                radius="xl"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  color: '#f87171',
                }}
                title="删除项目"
                variant="filled"
              >
                <TrashIcon height={16} width={16} />
              </ActionIcon>
            </Box>
          )}
        </Box>
      </Card.Section>

      <Stack gap="sm" p="sm">
        <Stack gap={6}>
          <Text
            component={Link}
            fw={600}
            lineClamp={2}
            size="md"
            style={{
              color: hovered ? ACCENT_COLOR : 'var(--app-text)',
              lineHeight: 1.35,
              textDecoration: 'none',
              transition: 'color 200ms ease',
            }}
            to={`/projects/${project.id}`}
          >
            {project.name}
          </Text>

          {project.description && (
            <Text c={MUTED_TEXT} lineClamp={2} size="xs">
              {project.description}
            </Text>
          )}

          {project.tags && project.tags.length > 0 && (
            <Group gap={6}>
              {project.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  radius="sm"
                  size="xs"
                  style={{
                    backgroundColor: 'var(--app-brand-soft-bg)',
                    border: '1px solid var(--app-brand-soft-border)',
                    color: ACCENT_COLOR,
                  }}
                  variant="filled"
                >
                  {tag}
                </Badge>
              ))}
              {project.tags.length > 3 && (
                <Text c={MUTED_TEXT} size="xs">
                  +{project.tags.length - 3}
                </Text>
              )}
            </Group>
          )}

          <Group c={MUTED_TEXT} gap={6} wrap="nowrap">
            <Text c="inherit" size="xs" truncate>
              {getLastEditedText(project.updated_at)}
            </Text>
            <Text c="inherit" size="xs">
              ·
            </Text>
            <Text c="inherit" size="xs" truncate>
              {new Date(project.created_at).toLocaleDateString('zh-CN')}
            </Text>
          </Group>
        </Stack>

        <Group justify="space-between" wrap="nowrap">
          <Text
            component={Link}
            fw={600}
            size="xs"
            style={{
              color: ACCENT_COLOR,
              textDecoration: 'none',
            }}
            to={`/projects/${project.id}`}
          >
            {resumeSummary.available ? '继续处理' : project.status === 'completed' || project.status === 'archived' ? '查看项目' : '编辑项目'}
          </Text>

          {showStatus && (
            <Text c={MUTED_TEXT} size="xs">
              {resumeSummary.available
                ? `已完成 ${resumeSummary.completedCount}/${resumeSummary.totalCount}`
                : PROJECT_STATUS_LABELS[project.status]}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

export default ProjectCard
