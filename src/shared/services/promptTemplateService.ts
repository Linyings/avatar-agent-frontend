const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export type PromptTemplateType = 'fast' | 'fast_comment' | 'fast_video' | 'fast_mixed' | 'frame'

export interface PromptTemplate {
  id: string
  title: string
  title_i18n?: Record<string, string>
  version: string
  type: string
  description?: string
  description_i18n?: Record<string, string>
}

interface PromptTemplateResponse {
  items: PromptTemplate[]
}

class PromptTemplateService {
  async getPromptTemplates(params?: { type?: string; templateType?: PromptTemplateType }): Promise<PromptTemplate[]> {
    const searchParams = new URLSearchParams()
    if (params?.type) {
      searchParams.append('type', params.type)
    }
    if (params?.templateType) {
      searchParams.append('template_type', params.templateType)
    }

    const query = searchParams.toString()
    const endpoint = `${API_BASE_URL}/api/v1/tools/prompt-templates${query ? `?${query}` : ''}`

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || '获取提示词模板失败')
    }

    const data = (await response.json()) as PromptTemplateResponse
    return Array.isArray(data.items) ? data.items : []
  }
}

export const promptTemplateService = new PromptTemplateService()
