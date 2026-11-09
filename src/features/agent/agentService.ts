/**
 * AgentService — 前端 Agent API 封装
 * C-03 修复：所有请求使用 authenticatedFetch（带 Bearer token）
 * SSE 改为 fetch + ReadableStream（EventSource 不支持自定义 header）
 */
import { authenticatedFetch } from '@/features/auth/services/authService'
import type {AgentActivity} from './studioService'

export interface ChatInput {
  projectId: string
  message: string
  requestId?: string
  turnId?: string
  accept?: boolean
}

export interface Proposal {
  id: string
  rowIds: number[]
  revision: number
  lines: string[]
  affectedSteps: string[]
  applied: boolean
  createdAt: string
}

export interface ChatOutput {
  reply: string
  proposal?: Proposal
  status: 'ok' | 'conflict' | 'error' | 'needs_action'
  turnId: string
}

export interface ConfirmChoice {
  key: string
  label: string
  description?: string
  recommended?: boolean
  danger?: boolean
}

export interface QuestionEvent {
  type: 'question'
  turnId: string
  questionId: string
  title: string
  subtitle?: string
  body?: string
  choices: ConfirmChoice[]
  allowCustom: boolean
  customPlaceholder?: string
}

export interface ToolEvent {
  type: 'tool'
  turnId: string
  callId: string
  tool: string
  status: 'running' | 'done' | 'error'
  detail?: string
}

export type AgentStreamEvent =
  | { type: 'thinking'; turnId: string; delta: string }
  | ToolEvent
  | QuestionEvent
  | { type: 'question_closed'; questionId: string }
  | { type: 'node_status'; turnId?: string; nodes: Record<string, string> }
  | { type: 'connected'; projectId: string }
  | { type: 'workflow_state'; run_id:string; stage:string; status:string }
  | { type: 'agent_activity'; activity:AgentActivity }

export interface PreProductionPlan {
  id: string
  projectId: string
  userId: string
  currentStep: string
  scriptDirection?: {
    title: string; audience: string; style: string
    estDuration: string; structure: string
  }
  productionMethod?: {
    avatarEnabled: boolean; animationType: string; realFootage: boolean
    aspectRatio: string; voiceId: string; angleMode: string
  }
  materialNeeds?: Array<{
    id: number; type: string; duration: string
    content: string; segmentId: number
  }>
  finalExpectation?: {
    totalDuration: string; pacingStyle: string; aspectRatio: string
    voiceConfirmed: boolean; description: string
  }
  status: 'draft' | 'confirmed'
  confirmedAt?: string
}

// UUID fallback for non-secure contexts (M-09 修复)
function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback: timestamp + random
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

const BASE = '/api/v1/agent'

// ── Chat ──────────────────────────────────────

export async function sendChat(input: ChatInput): Promise<ChatOutput> {
  const res = await authenticatedFetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      requestId: input.requestId ?? safeUUID(),
      turnId: input.turnId ?? safeUUID(),
    }),
  })
  if (!res.ok) { const body=await res.json().catch(()=>({})); throw new Error(body.detail ?? body.error ?? `请求失败（${res.status}）`) }
  return res.json()
}

export async function stopAgent(projectId: string): Promise<void> {
  await authenticatedFetch(`${BASE}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
}

export async function confirmProposal(projectId: string, revision: number): Promise<void> {
  const res = await authenticatedFetch(`${BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, accept: true, revision }),
  })
  if (!res.ok) throw new Error(`Confirm proposal failed: ${res.status}`)
}

export async function confirmQuestion(
  projectId: string,
  questionId: string,
  choiceKey: string,
  customText?: string,
): Promise<void> {
  const res = await authenticatedFetch(`${BASE}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, questionId, choiceKey, customText }),
  })
  if (!res.ok) throw new Error(`Confirm question failed: ${res.status}`)
}

export async function getHistory(projectId: string): Promise<{ messages: any[] }> {
  const res = await authenticatedFetch(`${BASE}/history?projectId=${projectId}`)
  if (!res.ok) throw new Error(`Get history failed: ${res.status}`)
  return res.json()
}

// ── SSE Stream（fetch + ReadableStream，支持 Authorization header）──

export function subscribeAgentStream(
  projectId: string,
  onEvent: (event: AgentStreamEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  const controller = new AbortController()
  // NEW-C-02 修复：使用 Map 维护插入顺序，实现正确的 LRU 淘汰
  const processedEvents = new Map<string, number>()
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  async function connect() {
    try {
      const res = await authenticatedFetch(
        `${BASE}/stream?projectId=${encodeURIComponent(projectId)}`,
        {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        },
      )
      if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed: ${res.status}`)
      }

      // 连接建立成功，重置退避计数
      retry = 0
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) throw new Error('实时连接已关闭')
        buf += decoder.decode(value, { stream: true })

        // SSE 帧以 \n\n 分隔
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''

        for (const frame of frames) {
          const dataLine = frame.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          const json = dataLine.slice(6).trim()
          if (!json) continue
          try {
            const parsed = JSON.parse(json) as {type?: string}
            // SSE may carry the type in the event field rather than JSON.
            if (!parsed.type) {
              const namedType = frame.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim()
              if (namedType) parsed.type = namedType
            }
            const event = parsed as AgentStreamEvent

            // NEW-C-02：生成事件唯一键并去重。
            // thinking / node_status 是"状态更新型"事件：同一 turnId 下会有多个
            // 合法增量（多轮模型调用、多次节点刷新），参与去重会被整段丢弃，
            // 因此只有真正幂等的离散事件才按 ID 去重。
            const isStateUpdate = event.type === 'thinking' || event.type === 'node_status' || event.type === 'connected' || event.type === 'workflow_state' || event.type === 'agent_activity'
            const turnId = 'turnId' in event ? event.turnId : ''
            const eventKey = isStateUpdate
              ? ''
              : `${event.type}:${turnId}:${
                  event.type === 'tool' ? `${(event as ToolEvent).callId}:${(event as ToolEvent).status}` :
                  event.type === 'question' ? (event as QuestionEvent).questionId :
                  event.type === 'question_closed' ? (event as { type: 'question_closed'; questionId: string }).questionId :
                  ''
                }`

            if (eventKey && processedEvents.has(eventKey)) {
              continue // 静默丢弃重复消息
            }
            
            // Map 保持插入顺序，删除最早的条目
            if (processedEvents.size >= 500) {
              const firstKey = processedEvents.keys().next().value
              if (firstKey) processedEvents.delete(firstKey)
            }
            
            processedEvents.set(eventKey, Date.now())
            onEvent(event)
          } catch {
            // 忽略单帧解析错误
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || controller.signal.aborted) return

      // 流中断（服务重启、网络抖动、代理超时）时自动重连，
      // 否则工作台对话窗口会永久收不到后续事件。
      onError?.(err as Error)
      retry += 1
      const delay = Math.min(1000 * 2 ** (retry - 1), 15000)
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (!controller.signal.aborted) connect()
      }, delay)
    }
  }

  connect()
  return () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    controller.abort()
  }
}

// ── Pre-production ────────────────────────────

export async function startPreProduction(
  projectId: string,
  userId: string,
  topic: string,
): Promise<{ plan: PreProductionPlan; question: QuestionEvent }> {
  const res = await authenticatedFetch(`${BASE}/pre-production/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, userId, topic }),
  })
  if (!res.ok) throw new Error(`Start pre-production failed: ${res.status}`)
  return res.json()
}

export async function confirmPreProductionStep(
  projectId: string,
  step: string,
  choiceKey: string,
  customText?: string,
): Promise<{ plan: PreProductionPlan; question?: QuestionEvent; complete: boolean }> {
  const res = await authenticatedFetch(`${BASE}/pre-production/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, step, choiceKey, customText }),
  })
  if (!res.ok) throw new Error(`Confirm pre-production step failed: ${res.status}`)
  return res.json()
}

export async function getPreProduction(
  projectId: string,
): Promise<{ plan: PreProductionPlan; question?: QuestionEvent }> {
  const res = await authenticatedFetch(
    `${BASE}/pre-production/get?projectId=${projectId}`,
  )
  if (!res.ok) throw new Error(`Get pre-production failed: ${res.status}`)
  return res.json()
}
