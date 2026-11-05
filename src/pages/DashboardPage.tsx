import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Alert,
  Anchor,
  AspectRatio,
  Box,
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  BellIcon,
  ClockIcon,
  EyeIcon,
  PlusIcon,
  SparklesIcon,
} from '@/shared/icons/tabler'
import AppPageShell from '@/shared/components/ui/AppPageShell'
import { ProjectService, type Project } from '@/features/projects'
import { formatRelativeTime } from '@/shared/utils/dateHelpers'
import { notificationService } from '@/shared/services/notificationService'
import { useProjectPreviewUrl } from '@/shared/hooks/useProjectPreviewUrl'
import { NotificationType, type NotificationResponse } from '@/shared/types/system'

const sectionLabelStyle = {
  letterSpacing: '0.12em',
} as const

const panelStyle = {
  background: 'var(--app-dashboard-panel-bg)',
  border: '1px solid var(--app-border)',
  boxShadow: 'var(--app-shadow)',
  color: 'var(--app-text)',
} as const

const subtlePanelStyle = {
  background: 'var(--app-dashboard-panel-subtle-bg)',
  border: '1px solid var(--app-border-subtle)',
  color: 'var(--app-text)',
} as const

function getStatusLabel(status: Project['status']) {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'processing':
      return '处理中'
    case 'archived':
      return '已导出'
    case 'draft':
    default:
      return '草稿'
  }
}

function shouldShowStatusLabel(status: Project['status']) {
  return status !== 'draft'
}

function isAdminAnnouncement(notification: NotificationResponse) {
  if (notification.type !== NotificationType.SYSTEM) {
    return false
  }

  const data = notification.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }

  return (data as Record<string, unknown>).source === 'admin_announcement'
}

function formatAnnouncementTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    return diffMinutes < 1 ? '刚刚' : `${diffMinutes} 分钟前`
  }

  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  if (diffDays < 7) {
    return `${diffDays} 天前`
  }

  return date.toLocaleDateString('zh-CN')
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<NotificationResponse[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(true)
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<NotificationResponse | null>(null)

  useEffect(() => {
    const fetchRecentProjects = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await ProjectService.getProjects({
          limit: 3,
          sort_by: 'updated_at',
          sort_order: 'desc',
        })
        setProjects(response.projects)
      } catch (err) {
        console.error('获取项目列表失败:', err)
        setError(err instanceof Error ? err.message : '获取项目列表失败')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentProjects()
  }, [])

  useEffect(() => {
    let active = true

    const loadAnnouncements = async (silenceLoading = false) => {
      try {
        if (!silenceLoading && active) {
          setAnnouncementsLoading(true)
        }

        const notifications = await notificationService.getUserNotifications({
          type: NotificationType.SYSTEM,
          limit: 20,
          offset: 0,
        })
        const nextAnnouncements = notifications
          .filter(isAdminAnnouncement)
          .slice(0, 3)

        if (!active) {
          return
        }

        setAnnouncements(nextAnnouncements)
        setAnnouncementsError(null)
      } catch (err) {
        console.error('获取公告失败:', err)
        if (active) {
          setAnnouncementsError(err instanceof Error ? err.message : '获取公告失败')
        }
      } finally {
        if (active) {
          setAnnouncementsLoading(false)
        }
      }
    }

    void loadAnnouncements()

    const timer = window.setInterval(() => {
      void loadAnnouncements(true)
    }, 30000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <AppPageShell py={{ base: 24, md: 34 }} gap={22}>
        <Group justify="space-between" align="flex-end" gap="lg">
          <Stack gap={8} maw={760}>
            <Text size="xs" fw={700} c="var(--app-muted)" tt="uppercase" style={sectionLabelStyle}>
              workspace
            </Text>
            <Title order={1} fw={650} lh={1.12} style={{ color: 'var(--app-text)', fontSize: 'clamp(1.8rem, 3vw, 2.55rem)' }}>
              创作工作台
            </Title>
            <Text c="var(--app-muted)" size="md" lh={1.75}>
              最近项目和重要公告集中在这里，优先回到正在推进的创作。
            </Text>
          </Stack>

          <Group gap="sm" wrap="wrap">
            <Button
              component={Link}
              to="/projects"
              leftSection={<PlusIcon width={16} height={16} />}
              radius="md"
              size="sm"
            >
              新建项目
            </Button>
            <Anchor component={Link} to="/projects" size="sm" fw={600}>
              查看所有项目
            </Anchor>
          </Group>
        </Group>

        <Grid gap="xl" align="stretch">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Paper radius={14} p={{ base: 'md', md: 'xl' }} style={panelStyle} h="100%">
              <Stack gap="lg">
                <Stack gap={4}>
                  <Text size="xs" fw={700} c="var(--app-muted)" tt="uppercase" style={sectionLabelStyle}>
                    recent projects
                  </Text>
                  <Title order={2} fw={600} size="h2">
                    最近项目
                  </Title>
                </Stack>

                {isLoading ? (
                  <Center py={70}>
                    <Loader color="brand" />
                  </Center>
                ) : error ? (
                  <Alert color="red" variant="light">
                    错误：{error}
                  </Alert>
                ) : projects.length === 0 ? (
                  <EmptyProjects />
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {projects.map((project) => (
                      <ProjectPreviewCard key={project.id} project={project} />
                    ))}
                  </SimpleGrid>
                )}
              </Stack>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="xl" h="100%">
              <Paper radius={14} p="xl" style={panelStyle}>
                <Stack gap="lg">
                  <Stack gap={4}>
                    <Text size="xs" fw={700} c="var(--app-muted)" tt="uppercase" style={sectionLabelStyle}>
                      announcements
                    </Text>
                    <Title order={2} fw={600} size="h3">
                      公告栏
                    </Title>
                  </Stack>

                  {announcementsLoading ? (
                    <Center py={32}>
                      <Loader size="sm" color="brand" />
                    </Center>
                  ) : announcementsError ? (
                    <Alert color="red" variant="light">
                      错误：{announcementsError}
                    </Alert>
                  ) : announcements.length === 0 ? (
                    <Paper radius={12} p="lg" style={subtlePanelStyle}>
                      <Stack gap={6}>
                        <Text size="sm" fw={600}>
                          暂无公告
                        </Text>
                        <Text size="sm" c="var(--app-muted)">
                          管理员发布的新公告会显示在这里，并同步到右上角通知中心。
                        </Text>
                      </Stack>
                    </Paper>
                  ) : (
                    <Stack gap={0}>
                      {announcements.map((item, index) => (
                        <UnstyledButton
                          key={item.id}
                          aria-label={`查看公告：${item.title}`}
                          onClick={() => setSelectedAnnouncement(item)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            borderBottom: index < announcements.length - 1 ? '1px solid var(--app-border-subtle)' : undefined,
                            borderRadius: 8,
                            padding: index === 0 ? '0 0 16px' : index < announcements.length - 1 ? '16px 0' : '16px 0 0',
                          }}
                        >
                          <Group align="flex-start" gap="md" wrap="nowrap">
                            <ThemeIcon radius="md" size={38} color="brand" variant="light">
                              <BellIcon width={18} height={18} />
                            </ThemeIcon>
                            <Stack gap={5} flex={1} style={{ minWidth: 0 }}>
                              <Text size="sm" fw={600} lineClamp={1}>
                                {item.title}
                              </Text>
                              <Text size="xs" c="var(--app-muted)" lineClamp={2}>
                                {item.message}
                              </Text>
                              <Group gap={10} c="var(--app-muted)" wrap="nowrap">
                                <Text size="xs" c="inherit">
                                  {formatAnnouncementTime(item.created_at)}
                                </Text>
                                <Group gap={4} c="var(--app-nav-active-text)" wrap="nowrap">
                                  <EyeIcon width={13} height={13} />
                                  <Text size="xs" fw={600} c="inherit">
                                    查看全文
                                  </Text>
                                </Group>
                              </Group>
                            </Stack>
                          </Group>
                        </UnstyledButton>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </AppPageShell>
      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </>
  )
}

function AnnouncementDetailModal({
  announcement,
  onClose,
}: {
  announcement: NotificationResponse | null
  onClose: () => void
}) {
  return (
    <Modal
      opened={Boolean(announcement)}
      onClose={onClose}
      size="lg"
      centered
      title={announcement?.title || '公告详情'}
      styles={{
        content: {
          background: 'var(--app-surface-contrast)',
          color: 'var(--app-text)',
        },
        header: {
          background: 'var(--app-surface-contrast)',
        },
        title: {
          fontWeight: 700,
        },
      }}
    >
      {announcement ? (
        <Stack gap="md">
          <Group gap={8} c="var(--app-muted)">
            <ClockIcon width={15} height={15} />
            <Text size="sm" c="inherit">
              {formatAnnouncementTime(announcement.created_at)}
            </Text>
          </Group>
          <ScrollArea.Autosize mah="60vh" type="auto">
            <Text
              size="sm"
              lh={1.8}
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {announcement.message}
            </Text>
          </ScrollArea.Autosize>
        </Stack>
      ) : null}
    </Modal>
  )
}

function EmptyProjects() {
  return (
    <Paper radius={12} p="xl" style={subtlePanelStyle}>
      <Stack align="center" gap="sm" py={28}>
        <ThemeIcon radius="md" size={52} color="brand" variant="light">
          <SparklesIcon width={24} height={24} />
        </ThemeIcon>
        <Title order={3} fw={600} size="h4">
          还没有项目
        </Title>
        <Text size="sm" c="var(--app-muted)" ta="center">
          创建第一个视频项目，让素材、脚本和成片在这里汇总。
        </Text>
        <Button component={Link} to="/projects" radius="md" leftSection={<PlusIcon width={16} height={16} />}>
          创建项目
        </Button>
      </Stack>
    </Paper>
  )
}

function ProjectPreviewCard({ project }: { project: Project }) {
  const previewUrl = useProjectPreviewUrl(project)
  const showStatus = shouldShowStatusLabel(project.status)

  return (
    <UnstyledButton
      component={Link}
      to={`/projects/${project.id}`}
      style={{
        ...subtlePanelStyle,
        display: 'block',
        overflow: 'hidden',
        borderRadius: 8,
        transition: 'border-color var(--app-transition), transform var(--app-transition), box-shadow var(--app-transition)',
      }}
    >
      <AspectRatio ratio={16 / 9}>
        <Box
          style={{
            backgroundColor: 'var(--app-media-bg)',
            backgroundImage: previewUrl ? `url("${previewUrl}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          {!previewUrl ? (
            <Center h="100%">
              <Text size="xs" c="var(--app-muted)">
                无预览图
              </Text>
            </Center>
          ) : null}
        </Box>
      </AspectRatio>

      <Stack gap="sm" p={12}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fw={650} size="md" lineClamp={1}>
              {project.name}
            </Text>
            <Group gap={6} c="var(--app-muted)" wrap="nowrap">
              <ClockIcon width={14} height={14} />
              <Text size="xs" c="inherit" lineClamp={1}>
                {formatRelativeTime(project.updated_at)}
              </Text>
            </Group>
          </Stack>
          {showStatus && (
            <Text
              size="xs"
              fw={700}
              style={{
                flexShrink: 0,
                color: 'var(--app-nav-active-text)',
                background: 'var(--app-nav-active-bg)',
                border: '1px solid var(--app-brand-soft-border)',
                borderRadius: 999,
                padding: '4px 8px',
              }}
            >
              {getStatusLabel(project.status)}
            </Text>
          )}
        </Group>
      </Stack>
    </UnstyledButton>
  )
}
