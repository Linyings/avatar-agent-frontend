import { expect, type Page, type Route } from '@playwright/test'

export const API_BASE_URL = 'http://127.0.0.1:8787'
const DEFAULT_PASSWORD = '12345678'
const MOCK_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'

type ProjectRecord = {
  id: string
  name: string
  status: string
  updated_at: string
  created_at: string
  preview_image_url: string | null
  thumbnail_url: string | null
  video_url: string | null
  subtitle: Record<string, unknown>
  video_config: Record<string, unknown> | null
  ai_analysis_script: { items: Array<Record<string, unknown>> } | null
  project_metadata: Record<string, unknown>
  workflow_revision: number
  workflow_step_hashes: Record<string, string>
}

type MockUser = {
  user_id: string
  username: string
  email: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  language: string
  is_active: boolean
  is_verified: boolean
  is_admin: boolean
  email_verified_at: string | null
  created_at: string
  last_login_at: string | null
}

type NotificationRecord = {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  data: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  expires_at: string | null
  created_at: string
}

type MockState = {
  currentUser: MockUser | null
  registerCounter: number
  projectCounter: number
  notificationCounter: number
  projects: ProjectRecord[]
  users: Record<string, MockUser>
  notifications: NotificationRecord[]
  workflowWrites: Record<string, number>
}

const jsonHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'content-type': 'application/json'
}

const textHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'content-type': 'text/event-stream; charset=utf-8'
}

const buildAdminUser = () => ({
  user_id: 'user-admin',
  username: 'admin',
  email: 'admin@163.com',
  display_name: 'Admin',
  avatar_url: null,
  timezone: 'Asia/Shanghai',
  language: 'zh',
  is_active: true,
  is_verified: true,
  is_admin: true,
  email_verified_at: '2026-04-20T00:00:00.000Z',
  created_at: '2026-04-20T00:00:00.000Z',
  last_login_at: '2026-04-23T00:00:00.000Z'
})

const buildSubtitle = () => ({
  '1': { start_time: 0, end_time: 3.2, subtitle: '第一句原始字幕' },
  '2': { start_time: 3.2, end_time: 6.8, subtitle: '第二句原始字幕' }
})

const buildVideoConfig = () => ({
  model_level: 'frame',
  source_language: '中文',
  target_language: '中文',
  audio_speed: 4.5,
  word_count_mode: 'custom',
  word_count: '800-1200',
  storyboard_mode: 'custom',
  storyboard_count: 12,
  style_mode: 'template-hot-blooded',
  person_view: 'third_person',
  clip_mode: 'smart_mix',
  mix_ratio: 40,
  help_text: '',
  type_script: 'default',
  type_script_value: '',
  narration_input_mode: 'ai',
  custom_prompt_enabled: false,
  custom_prompt_text: ''
})

const buildInitialProjects = (): ProjectRecord[] => [
  {
    id: 'project-existing',
    name: '已存在项目',
    status: 'draft',
    updated_at: '2026-04-23T08:00:00.000Z',
    created_at: '2026-04-20T08:00:00.000Z',
    preview_image_url: null,
    thumbnail_url: null,
    video_url: MOCK_VIDEO_URL,
    subtitle: buildSubtitle(),
    video_config: buildVideoConfig(),
    ai_analysis_script: {
      items: [
        {
          id: '1',
          text: '老项目脚本第一句',
          start: 0,
          end: 3.2,
          org: '第一句原始字幕'
        }
      ]
    },
    workflow_revision: 1,
    workflow_step_hashes: {},
    project_metadata: {
      inference_mode: 'frame',
      source_video_url: MOCK_VIDEO_URL,
      source_video_object_key: 'videos/existing.mp4',
      language: 'zh-CN'
    }
  }
]

const createProjectRecord = (state: MockState, name: string): ProjectRecord => {
  state.projectCounter += 1
  const id = `project-e2e-${state.projectCounter}`
  return {
    id,
    name,
    status: 'draft',
    updated_at: '2026-04-23T09:00:00.000Z',
    created_at: '2026-04-23T09:00:00.000Z',
    preview_image_url: null,
    thumbnail_url: null,
    video_url: MOCK_VIDEO_URL,
    subtitle: buildSubtitle(),
    video_config: buildVideoConfig(),
    ai_analysis_script: null,
    workflow_revision: 1,
    workflow_step_hashes: {},
    project_metadata: {
      inference_mode: 'frame',
      source_video_url: MOCK_VIDEO_URL,
      source_video_object_key: `videos/${id}.mp4`,
      language: 'zh-CN'
    }
  }
}

const createState = (): MockState => ({
  currentUser: null,
  registerCounter: 0,
  projectCounter: 0,
  notificationCounter: 0,
  projects: buildInitialProjects(),
  users: {
    'user-admin': buildAdminUser(),
  },
  notifications: [],
  workflowWrites: {}
})

const upsertUser = (state: MockState, user: MockUser) => {
  state.users[user.user_id] = user
}

const buildNotificationRecord = (
  state: MockState,
  userId: string,
  notification: Partial<NotificationRecord> & Pick<NotificationRecord, 'title' | 'message'>
): NotificationRecord => {
  state.notificationCounter += 1
  return {
    id: `notification-${state.notificationCounter}`,
    user_id: userId,
    type: notification.type ?? 'system',
    title: notification.title,
    message: notification.message,
    data: notification.data ?? {},
    is_read: notification.is_read ?? false,
    read_at: notification.read_at ?? null,
    expires_at: notification.expires_at ?? null,
    created_at: notification.created_at ?? new Date().toISOString(),
  }
}

const getProjectById = (state: MockState, projectId: string) => {
  const project = state.projects.find(item => item.id === projectId)
  expect(project, `未找到项目 ${projectId}`).toBeTruthy()
  return project as ProjectRecord
}

const mergeProject = (project: ProjectRecord, payload: Record<string, unknown>) => {
  if ('project_metadata' in payload) {
    const nextMetadata = payload.project_metadata as Record<string, unknown>
    project.project_metadata = {
      ...project.project_metadata,
      ...nextMetadata
    }
  }

  if ('subtitle' in payload) {
    project.subtitle = (payload.subtitle as Record<string, unknown>) ?? {}
  }

  if ('video_config' in payload) {
    project.video_config = (payload.video_config as Record<string, unknown>) ?? null
  }

  if ('ai_analysis_script' in payload) {
    project.ai_analysis_script = (payload.ai_analysis_script as ProjectRecord['ai_analysis_script']) ?? null
  }

  if ('video_context' in payload) {
    project.project_metadata = {
      ...project.project_metadata,
      video_context: payload.video_context
    }
  }

  if ('video_url' in payload) {
    project.video_url = (payload.video_url as string | null) ?? null
  }

  for (const [key, value] of Object.entries(payload)) {
    if (['project_metadata', 'subtitle', 'video_config', 'ai_analysis_script', 'video_context', 'video_url'].includes(key)) {
      continue
    }
    ;(project as Record<string, unknown>)[key] = value
  }

  project.updated_at = '2026-04-23T09:30:00.000Z'
}

const hashFor = (step: string, payload: unknown) => `${step}-${JSON.stringify(payload).length}-${Date.now()}`

const workflowSummary = (project: ProjectRecord) => ({
  project_id: project.id,
  workflow_revision: project.workflow_revision,
  workflow_root: {
    project_id: project.id,
    revision: project.workflow_revision,
    status: 'active',
    current_step: null
  },
  video_source: {
    video_url: project.video_url,
    video_context: project.project_metadata.video_context ?? { items: project.subtitle },
    content_hash: project.workflow_step_hashes['video-source']
  },
  subtitles: {
    ...project.subtitle,
    content_hash: project.workflow_step_hashes.subtitles
  },
  config: {
    ...(project.video_config ?? {}),
    content_hash: project.workflow_step_hashes.config
  },
  script: {
    ...(project.ai_analysis_script ?? { items: [] }),
    content_hash: project.workflow_step_hashes.script
  },
  voiceover: {
    content_hash: project.workflow_step_hashes.voiceover
  },
  updated_at: project.updated_at
})

const applyWorkflowStep = (state: MockState, project: ProjectRecord, step: string, payload: Record<string, unknown>) => {
  const data = Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data as Record<string, unknown> | null
    : payload
  const contentHash = hashFor(step, data)
  project.workflow_revision += 1
  project.workflow_step_hashes[step] = contentHash
  state.workflowWrites[step] = (state.workflowWrites[step] ?? 0) + 1

  if (step === 'video-source') {
    if (data && Object.prototype.hasOwnProperty.call(data, 'video_url')) {
      project.video_url = data.video_url as string | null
    }
    if (data && Object.prototype.hasOwnProperty.call(data, 'video_context')) {
      project.project_metadata.video_context = data.video_context
    }
  }
  if (step === 'subtitles') {
    project.subtitle = (data as Record<string, unknown>) ?? {}
  }
  if (step === 'config') {
    project.video_config = (data as Record<string, unknown>) ?? null
  }
  if (step === 'script') {
    project.ai_analysis_script = (data as ProjectRecord['ai_analysis_script']) ?? null
  }
  project.updated_at = '2026-04-23T09:30:00.000Z'

  return {
    project_id: project.id,
    step,
    workflow_revision: project.workflow_revision,
    content_hash: contentHash,
    input_hash: contentHash,
    payload_hash: contentHash,
    dependency_hash: payload.dependency_hash ?? '',
    [`${step === 'video-source' ? 'video_source' : step}`]: data ?? {}
  }
}

const buildSseBody = (events: Array<{ event: string; data: Record<string, unknown> }>) =>
  events
    .map(item => `event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`)
    .join('')

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  })

const fulfillSse = (route: Route, body: string) =>
  route.fulfill({
    status: 200,
    headers: textHeaders,
    body
  })

const handleApiRoute = async (route: Route, state: MockState) => {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()
  const path = url.pathname

  if (method === 'OPTIONS') {
    await route.fulfill({
      status: 204,
      headers: jsonHeaders,
      body: ''
    })
    return
  }

  if (method === 'POST' && path === '/api/v1/auth/login') {
    const payload = request.postDataJSON() as { email: string; password: string }
    const isAdmin = payload.email === 'admin@163.com' && payload.password === DEFAULT_PASSWORD
    const nextUser: MockUser = {
      ...(isAdmin ? buildAdminUser() : {
        user_id: `user-${payload.email}`,
        username: payload.email.split('@')[0],
        email: payload.email,
        display_name: payload.email.split('@')[0],
        avatar_url: null,
        timezone: 'Asia/Shanghai',
        language: 'zh',
        is_active: true,
        is_verified: true,
        is_admin: false,
        email_verified_at: '2026-04-23T00:00:00.000Z',
        created_at: '2026-04-23T00:00:00.000Z',
        last_login_at: '2026-04-23T00:00:00.000Z'
      })
    }
    state.currentUser = nextUser
    upsertUser(state, nextUser)

    await fulfillJson(route, {
      user_id: nextUser.user_id,
      username: nextUser.username,
      email: nextUser.email,
      tokens: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token'
      }
    })
    return
  }

  if (method === 'POST' && path === '/api/v1/auth/register') {
    state.registerCounter += 1
    const payload = request.postDataJSON() as { username: string; email: string }
    const nextUser: MockUser = {
      user_id: `registered-${state.registerCounter}`,
      username: payload.username,
      email: payload.email,
      display_name: payload.username,
      avatar_url: null,
      timezone: 'Asia/Shanghai',
      language: 'zh',
      is_active: true,
      is_verified: false,
      is_admin: false,
      email_verified_at: null,
      created_at: '2026-04-23T00:00:00.000Z',
      last_login_at: '2026-04-23T00:00:00.000Z'
    }
    state.currentUser = nextUser
    upsertUser(state, nextUser)

    await fulfillJson(route, {
      success: true,
      message: '注册成功'
    })
    return
  }

  if (method === 'POST' && path === '/api/v1/auth/request-email-code') {
    await fulfillJson(route, { success: true, message: '验证码已发送' })
    return
  }

  if (method === 'GET' && path === '/api/v1/auth/me') {
    await fulfillJson(route, state.currentUser ?? buildAdminUser())
    return
  }

  if (method === 'POST' && path === '/api/v1/auth/logout') {
    state.currentUser = null
    await fulfillJson(route, { success: true, message: '已退出登录' })
    return
  }

  if (method === 'GET' && path === '/api/v1/system/notifications') {
    const currentUserId = String(state.currentUser?.user_id ?? '')
    const type = url.searchParams.get('type')
    const isRead = url.searchParams.get('is_read')
    const limit = Number(url.searchParams.get('limit') ?? '20')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    const now = new Date()

    const notifications = state.notifications
      .filter((item) => item.user_id === currentUserId)
      .filter((item) => !item.expires_at || new Date(item.expires_at) >= now)
      .filter((item) => (type ? item.type === type : true))
      .filter((item) => {
        if (isRead === 'true') return item.is_read
        if (isRead === 'false') return !item.is_read
        return true
      })
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(offset, offset + limit)

    await fulfillJson(route, notifications)
    return
  }

  if (method === 'GET' && path === '/api/v1/system/notifications/stats') {
    const currentUserId = String(state.currentUser?.user_id ?? '')
    const now = new Date()
    const notifications = state.notifications
      .filter((item) => item.user_id === currentUserId)
      .filter((item) => !item.expires_at || new Date(item.expires_at) >= now)

    const byType = notifications.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1
      return acc
    }, {})
    const unreadCount = notifications.filter((item) => !item.is_read).length
    const readCount = notifications.length - unreadCount

    await fulfillJson(route, {
      total_count: notifications.length,
      unread_count: unreadCount,
      read_count: readCount,
      by_type: byType,
      total: notifications.length,
      unread: unreadCount,
      read: readCount,
    })
    return
  }

  if (method === 'PUT' && path === '/api/v1/system/notifications/read-all') {
    const currentUserId = String(state.currentUser?.user_id ?? '')
    const readAt = new Date().toISOString()
    state.notifications = state.notifications.map((item) =>
      item.user_id === currentUserId
        ? { ...item, is_read: true, read_at: readAt }
        : item
    )
    await fulfillJson(route, { success: true, message: '全部通知已标记为已读' })
    return
  }

  const markReadMatch = path.match(/^\/api\/v1\/system\/notifications\/([^/]+)\/read$/)
  if (markReadMatch && method === 'PUT') {
    const currentUserId = String(state.currentUser?.user_id ?? '')
    const targetId = markReadMatch[1]
    const targetNotification = state.notifications.find((item) => item.id === targetId && item.user_id === currentUserId)
    expect(targetNotification, `未找到通知 ${targetId}`).toBeTruthy()

    const readAt = new Date().toISOString()
    state.notifications = state.notifications.map((item) =>
      item.id === targetId && item.user_id === currentUserId
        ? { ...item, is_read: true, read_at: readAt }
        : item
    )
    await fulfillJson(route, {
      ...targetNotification,
      is_read: true,
      read_at: readAt,
    })
    return
  }

  const deleteNotificationMatch = path.match(/^\/api\/v1\/system\/notifications\/([^/]+)$/)
  if (deleteNotificationMatch && method === 'DELETE') {
    const currentUserId = String(state.currentUser?.user_id ?? '')
    const targetId = deleteNotificationMatch[1]
    state.notifications = state.notifications.filter((item) => !(item.id === targetId && item.user_id === currentUserId))
    await fulfillJson(route, { success: true, message: '通知已删除' })
    return
  }

  if (method === 'POST' && path === '/api/v1/admin/notifications/broadcast') {
    const payload = request.postDataJSON() as {
      title: string
      message: string
      type?: string
      expires_at?: string | null
      data?: Record<string, unknown>
    }
    const publishedAt = new Date().toISOString()
    const activeUsers = Object.values(state.users).filter((item) => item.is_active)

    for (const user of activeUsers) {
      state.notifications.unshift(buildNotificationRecord(state, user.user_id, {
        type: payload.type ?? 'system',
        title: payload.title,
        message: payload.message,
        data: {
          ...(payload.data ?? {}),
          source: 'admin_announcement',
          audience: 'all_active_users',
        },
        expires_at: payload.expires_at ?? null,
        created_at: publishedAt,
      }))
    }

    await fulfillJson(route, {
      success: true,
      created_count: activeUsers.length,
      target_user_count: activeUsers.length,
      published_at: publishedAt,
    }, 201)
    return
  }

  if (method === 'GET' && path === '/api/v1/system/settings/public') {
    await fulfillJson(route, {
      settings: {
        tts_voices: [
          {
            uri: 'voice://basic-female',
            name: '晴川',
            type: 'basic',
            sample_url: 'https://cdn.example.com/voices/basic-female.mp3'
          },
          {
            uri: 'voice://advanced-female',
            name: '青霜',
            type: 'advanced',
            sample_url: 'https://cdn.example.com/voices/advanced-female.mp3'
          }
        ]
      }
    })
    return
  }

  if (method === 'GET' && path === '/api/v1/tools/prompt-templates') {
    await fulfillJson(route, {
      items: [
        {
          id: 'template-hot-blooded',
          title: '热血解说',
          version: 'v1',
          type: 'fast_video',
          description: '适合爽点、冲突感强的视频解说。'
        },
        {
          id: 'template-documentary',
          title: '纪实旁白',
          version: 'v1',
          type: 'fast_video',
          description: '适合平稳、观察式的纪实表达。'
        }
      ]
    })
    return
  }

  if (method === 'GET' && path === '/api/v1/token-packages/packages') {
    await fulfillJson(route, {
      packages: [],
      total: 0
    })
    return
  }

  if (method === 'GET' && path === '/api/v1/token-accounts/balance') {
    await fulfillJson(route, {
      user_id: 'user-admin',
      total_tokens: 1000000,
      used_tokens: 0,
      remaining_tokens: 1000000,
      total_recharged: '0.00',
      last_recharge_at: null,
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-23T00:00:00.000Z'
    })
    return
  }

  if (method === 'POST' && path === '/api/v1/projects/') {
    const payload = request.postDataJSON() as { name: string; project_metadata?: Record<string, unknown> }
    const project = createProjectRecord(state, payload.name)
    if (payload.project_metadata) {
      project.project_metadata = {
        ...project.project_metadata,
        ...payload.project_metadata
      }
    }
    state.projects.unshift(project)
    await fulfillJson(route, project, 201)
    return
  }

  if (method === 'GET' && path === '/api/v1/projects/') {
    await fulfillJson(route, {
      projects: state.projects,
      total: state.projects.length,
      has_more: false
    })
    return
  }

  const projectMatch = path.match(/^\/api\/v1\/projects\/([^/]+)$/)
  if (projectMatch) {
    const project = getProjectById(state, projectMatch[1])

    if (method === 'GET') {
      await fulfillJson(route, project)
      return
    }

    if (method === 'PUT') {
      const payload = request.postDataJSON() as Record<string, unknown>
      mergeProject(project, payload)
      await fulfillJson(route, project)
      return
    }
  }

  const workflowSummaryMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/workflow$/)
  if (workflowSummaryMatch && method === 'GET') {
    const project = getProjectById(state, workflowSummaryMatch[1])
    await fulfillJson(route, workflowSummary(project))
    return
  }

  const workflowStepMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/workflow\/steps\/([^/]+)$/)
  if (workflowStepMatch) {
    const project = getProjectById(state, workflowStepMatch[1])
    const step = workflowStepMatch[2]

    if (method === 'PUT') {
      const payload = request.postDataJSON() as Record<string, unknown>
      await fulfillJson(route, applyWorkflowStep(state, project, step, payload))
      return
    }
  }

  const subtitleMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/subtitle$/)
  if (subtitleMatch && method === 'GET') {
    const project = getProjectById(state, subtitleMatch[1])
    await fulfillJson(route, project.subtitle)
    return
  }

  const videoConfigMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/video_config$/)
  if (videoConfigMatch && method === 'GET') {
    const project = getProjectById(state, videoConfigMatch[1])
    await fulfillJson(route, { video_config: project.video_config })
    return
  }

  const videoContextMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/video_context$/)
  if (videoContextMatch && method === 'GET') {
    const project = getProjectById(state, videoContextMatch[1])
    await fulfillJson(route, {
      items: project.subtitle
    })
    return
  }

  const aiScriptMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/ai-script$/)
  if (aiScriptMatch && method === 'GET') {
    const project = getProjectById(state, aiScriptMatch[1])
    await fulfillJson(route, project.ai_analysis_script ?? { items: [] })
    return
  }

  if (method === 'POST' && path === '/api/v1/tools/generate-script-stream') {
    await fulfillSse(route, buildSseBody([
      {
        event: 'stage',
        data: {
          stage: 'script_generate',
          message: '正在一次性生成解说文案与匹配画面...'
        }
      },
      {
        event: 'thinking_delta',
        data: { delta: '先梳理故事线，再匹配镜头。' }
      },
      {
        event: 'answer_delta',
        data: { delta: '{"items":[' }
      },
      {
        event: 'usage',
        data: {
          prompt_tokens: 120,
          completion_tokens: 80,
          total_tokens: 200
        }
      },
      {
        event: 'completed',
        data: {
          items: [
            {
              id: '1',
              text: '第一句 AI 解说词',
              start: 0,
              end: 3.2,
              org: '第一句原始字幕'
            },
            {
              id: '2',
              text: '第二句 AI 解说词',
              start: 3.2,
              end: 6.8,
              org: '第二句原始字幕'
            }
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 80,
            total_tokens: 200
          },
          model: 'mock-playwright',
          request_id: 'req-script-e2e'
        }
      }
    ]))
    return
  }

  if (method === 'POST' && path === '/api/v1/tools/generate-narration-stream') {
    await fulfillSse(route, buildSseBody([
      {
        event: 'stage',
        data: {
          stage: 'narration_generate',
          message: '正在生成解说文案...'
        }
      },
      {
        event: 'completed',
        data: {
          narration_text: '这是一段生成好的旁白文案。',
          usage: {
            prompt_tokens: 60,
            completion_tokens: 50,
            total_tokens: 110
          },
          model: 'mock-playwright',
          request_id: 'req-narration-e2e'
        }
      }
    ]))
    return
  }

  if (method === 'POST' && path === '/api/v1/tools/match-scenes-stream') {
    await fulfillSse(route, buildSseBody([
      {
        event: 'stage',
        data: {
          stage: 'scene_match_generate',
          message: '正在匹配画面并生成剪辑脚本...'
        }
      },
      {
        event: 'completed',
        data: {
          items: [
            {
              id: '1',
              text: '第一句 AI 解说词',
              start: 0,
              end: 3.2,
              org: '第一句原始字幕'
            },
            {
              id: '2',
              text: '第二句 AI 解说词',
              start: 3.2,
              end: 6.8,
              org: '第二句原始字幕'
            }
          ],
          usage: {
            prompt_tokens: 40,
            completion_tokens: 35,
            total_tokens: 75
          },
          model: 'mock-playwright',
          request_id: 'req-match-e2e'
        }
      }
    ]))
    return
  }

  if (method === 'POST' && path === '/api/v1/tools/text-to-speech-with-uri') {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': '*',
        'content-type': 'audio/mpeg'
      },
      body: 'mock-mp3'
    })
    return
  }

  if (method === 'GET' && path.startsWith('/mock-audio/')) {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'audio/mpeg'
      },
      body: 'mock-mp3'
    })
    return
  }

  await route.abort()
}

export async function setupMockApi(page: Page) {
  const state = createState()
  await page.route('**/api/v1/**', async route => {
    await handleApiRoute(route, state)
  })
  await page.route('**/mock-audio/**', async route => {
    await handleApiRoute(route, state)
  })
  await page.route(`${API_BASE_URL}/**`, async route => {
    await handleApiRoute(route, state)
  })
  return state
}
