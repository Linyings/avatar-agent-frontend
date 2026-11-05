import type { NarrativeUnderstandingResponse } from '@/shared/services/aiToolsService'
import type { FrameInferenceAnalysisItem } from '@/features/projects/services/material/frameInferencePipelineService'
import type { NarrativeQuestionAnswerPair } from '../types'

export const workflowRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)

export const workflowText = (value: unknown): string => (
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : ''
)

export const workflowArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const qaPairsFromValue = (value: unknown): NarrativeQuestionAnswerPair[] => (
  workflowArray(value)
    .map((item) => {
      if (typeof item === 'string') {
        const question = item.trim()
        return question ? { question, answer: '' } : null
      }

      const record = workflowRecord(item)
      if (!record) return null
      const question = (
        workflowText(record.question)
        || workflowText(record.q)
        || workflowText(record.title)
        || workflowText(record.text)
      ).trim()
      if (!question) return null
      return {
        question,
        answer: (
          workflowText(record.answer)
          || workflowText(record.a)
          || workflowText(record.confirmed_answer)
          || workflowText(record.confirmedAnswer)
        ),
      }
    })
    .filter((item): item is NarrativeQuestionAnswerPair => Boolean(item))
)

export const mergeNarrativeQuestionAnswerPairs = (...values: unknown[]): NarrativeQuestionAnswerPair[] => {
  const pairs = new Map<string, NarrativeQuestionAnswerPair>()
  values.flatMap(qaPairsFromValue).forEach((pair) => {
    const existing = pairs.get(pair.question)
    if (!existing) {
      pairs.set(pair.question, pair)
      return
    }
    if (pair.answer.trim()) {
      pairs.set(pair.question, { ...existing, answer: pair.answer })
    }
  })
  return [...pairs.values()]
}

export const narrativeQuestionAnswerPairsFromResponse = (
  narrativeUnderstanding: Partial<NarrativeUnderstandingResponse> | null | undefined
): NarrativeQuestionAnswerPair[] => {
  const analysis = workflowRecord(narrativeUnderstanding?.analysis) ?? {}
  return mergeNarrativeQuestionAnswerPairs(
    analysis.open_questions,
    analysis.confirmed_question_answers,
    narrativeUnderstanding?.confirmed_question_answers
  )
}

export const buildNarrativeContextWithConfirmedAnswers = (
  narrativeUnderstanding: Partial<NarrativeUnderstandingResponse>
) => {
  const analysis = workflowRecord(narrativeUnderstanding.analysis)
  if (!analysis) return null

  const questionAnswers = narrativeQuestionAnswerPairsFromResponse(narrativeUnderstanding)
  if (questionAnswers.length === 0) return analysis

  const confirmedAnswers = questionAnswers.filter((item) => item.answer.trim())
  return {
    ...analysis,
    open_questions: questionAnswers,
    confirmed_question_answers: confirmedAnswers,
  }
}

export const sumAnalysisTokens = (analyses: FrameInferenceAnalysisItem[]) => (
  analyses.reduce((sum, item) => sum + (item.response.tokens_consumed || 0), 0)
)

export const narrativeCount = (value: unknown) => (
  Array.isArray(value) ? value.length : 0
)

const STREAM_PREVIEW_BUFFER_LIMIT = 2400

export const appendStreamPreviewChunk = (
  current: string,
  chunk: string,
  maxLength = STREAM_PREVIEW_BUFFER_LIMIT
) => {
  const next = `${current}${chunk}`
  return next.length > maxLength ? next.slice(-maxLength) : next
}

export const streamPreview = (value: string, maxLength = 500) => {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return '等待模型输出...'
  return compact.length > maxLength ? `...${compact.slice(-maxLength)}` : compact
}
