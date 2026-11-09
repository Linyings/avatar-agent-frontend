/**
 * L-01 修复：通用错误提示转换工具
 * 将技术性错误消息转换为用户友好的中文提示
 */

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  statusText?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  // 网络错误
  'Failed to fetch': '网络连接失败，请检查网络后重试',
  'Network request failed': '网络请求失败，请稍后重试',
  'NetworkError': '网络错误，请检查连接',
  'timeout': '请求超时，请重试',
  
  // 认证错误
  'Unauthorized': '登录已过期，请重新登录',
  'Forbidden': '无权限访问，请联系管理员',
  '401': '登录已过期，请重新登录',
  '403': '无权限访问此功能',
  
  // 服务器错误
  '500': '服务器内部错误，请稍后重试',
  '502': '服务暂时不可用，请稍后重试',
  '503': '服务维护中，请稍后再试',
  '504': '服务响应超时，请重试',
  
  // Agent 相关错误
  'project not found': '项目不存在或已被删除',
  'project not owned': '无权访问该项目',
  'LLM response timeout': 'AI 响应超时，请重试',
  'tool execution failed': '操作执行失败，请重试',
  'proposal expired': '提案已过期，项目内容已变化',
  'conflict': '项目内容已被修改，请刷新后重试',
  
  // 数据验证错误
  'invalid input': '输入格式不正确，请检查',
  'required field': '必填字段缺失',
  'validation failed': '数据验证失败，请检查输入',
}

/**
 * 将错误转换为用户友好的提示
 */
export function getUserFriendlyError(error: unknown, fallback = '操作失败，请重试'): string {
  if (!error) return fallback
  
  // 字符串错误
  if (typeof error === 'string') {
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.includes(key)) return message
    }
    return error
  }
  
  // 对象错误
  const err = error as ErrorLike
  
  // 检查状态码
  if (err.status) {
    const statusKey = String(err.status)
    if (ERROR_MESSAGES[statusKey]) {
      return ERROR_MESSAGES[statusKey]
    }
  }
  
  // 检查错误代码
  if (err.code && ERROR_MESSAGES[err.code]) {
    return ERROR_MESSAGES[err.code]
  }
  
  // 检查错误消息
  if (err.message) {
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (err.message.includes(key)) return message
    }
    // 如果消息看起来是英文技术错误，使用 fallback
    if (/^[A-Z][a-z]+Error:/.test(err.message) || err.message.includes('Exception')) {
      return fallback
    }
    // 如果是中文或合理的描述，直接返回
    if (/[\u4e00-\u9fa5]/.test(err.message) || err.message.length < 100) {
      return err.message
    }
  }
  
  // 检查 statusText
  if (err.statusText && ERROR_MESSAGES[err.statusText]) {
    return ERROR_MESSAGES[err.statusText]
  }
  
  return fallback
}

/**
 * 格式化错误用于 toast 显示
 */
export function formatErrorForToast(error: unknown): { title: string; description?: string } {
  const message = getUserFriendlyError(error)
  
  // 如果错误消息很长，拆分为标题和描述
  if (message.length > 30 && message.includes('，')) {
    const [title, ...rest] = message.split('，')
    return {
      title: title + '，',
      description: rest.join('，'),
    }
  }
  
  return { title: message }
}
