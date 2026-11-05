// 文件验证工具
export interface FileValidationResult {
  valid: boolean
  warningLevel: 'none' | 'info' | 'warning' | 'error'
  issues: FileValidationIssue[]
  fileInfo: FileInfo
  recommendations: string[]
}

export interface FileValidationIssue {
  type: 'format' | 'size' | 'encoding' | 'duration' | 'resolution'
  severity: 'info' | 'warning' | 'error'
  message: string
  details?: any
}

export interface FileInfo {
  name: string
  size: number // bytes
  type: string
  extension: string
  sizeFormatted: string
  estimatedProcessingTime?: string
}

// 支持的视频格式配置
const SUPPORTED_FORMATS = {
  // 完全支持的格式
  excellent: [
    { ext: 'mp4', mimeTypes: ['video/mp4'], codecs: ['H.264', 'H.265'] },
    { ext: 'webm', mimeTypes: ['video/webm'], codecs: ['VP8', 'VP9'] },
  ],
  // 一般支持的格式
  good: [
    { ext: 'mov', mimeTypes: ['video/quicktime'], codecs: ['H.264'] },
    { ext: 'avi', mimeTypes: ['video/x-msvideo'], codecs: ['H.264'] },
    { ext: 'mkv', mimeTypes: ['video/x-matroska'], codecs: ['H.264', 'H.265'] },
  ],
  // 可能有兼容性问题的格式
  limited: [
    { ext: 'flv', mimeTypes: ['video/x-flv'], codecs: ['H.264'] },
    { ext: 'wmv', mimeTypes: ['video/x-ms-wmv'], codecs: ['WMV'] },
    { ext: '3gp', mimeTypes: ['video/3gpp'], codecs: ['H.264'] },
  ]
}

// 文件大小分级（字节）
const SIZE_LIMITS = {
  small: 50 * 1024 * 1024,      // 50MB
  medium: 200 * 1024 * 1024,    // 200MB
  large: 500 * 1024 * 1024,     // 500MB
  huge: 1024 * 1024 * 1024,     // 1GB
  extreme: 2 * 1024 * 1024 * 1024 // 2GB
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 估算处理时间
const estimateProcessingTime = (fileSize: number, devicePerformance?: 'low' | 'medium' | 'high'): string => {
  // 基于文件大小的基础处理时间（秒）
  const baseTime = fileSize / (10 * 1024 * 1024) // 假设每10MB需要1秒

  // 根据设备性能调整
  const performanceMultiplier = {
    high: 0.5,
    medium: 1.0,
    low: 2.0
  }

  const multiplier = performanceMultiplier[devicePerformance || 'medium']
  const totalSeconds = Math.ceil(baseTime * multiplier)

  if (totalSeconds < 60) {
    return `约 ${totalSeconds} 秒`
  } else if (totalSeconds < 3600) {
    const minutes = Math.ceil(totalSeconds / 60)
    return `约 ${minutes} 分钟`
  } else {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.ceil((totalSeconds % 3600) / 60)
    return `约 ${hours} 小时 ${minutes} 分钟`
  }
}

// 检查文件扩展名
const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || ''
}

// 检查文件格式支持
const checkFormatSupport = (file: File): FileValidationIssue[] => {
  const issues: FileValidationIssue[] = []
  const extension = getFileExtension(file.name)

  // 查找格式支持级别
  let supportLevel: 'excellent' | 'good' | 'limited' | 'unsupported' = 'unsupported'

  for (const [level, formats] of Object.entries(SUPPORTED_FORMATS)) {
    if (formats.some(format => format.ext === extension)) {
      supportLevel = level as any
      break
    }
  }

  switch (supportLevel) {
    case 'excellent':
      issues.push({
        type: 'format',
        severity: 'info',
        message: `${extension.toUpperCase()} 格式完全支持，处理效果最佳`,
      })
      break

    case 'good':
      issues.push({
        type: 'format',
        severity: 'info',
        message: `${extension.toUpperCase()} 格式支持良好`,
      })
      break

    case 'limited':
      issues.push({
        type: 'format',
        severity: 'warning',
        message: `${extension.toUpperCase()} 格式支持有限，可能存在兼容性问题`,
      })
      break

    case 'unsupported':
    default:
      issues.push({
        type: 'format',
        severity: 'error',
        message: `${extension.toUpperCase()} 格式不受支持，请选择 MP4、WebM、MOV 或 AVI 格式`,
      })
      break
  }

  // 检查 MIME 类型
  if (file.type && !file.type.startsWith('video/')) {
    issues.push({
      type: 'format',
      severity: 'warning',
      message: '文件的 MIME 类型表明这可能不是视频文件',
      details: { mimeType: file.type }
    })
  }

  return issues
}

// 检查文件大小
const checkFileSize = (fileSize: number): FileValidationIssue[] => {
  const issues: FileValidationIssue[] = []

  if (fileSize > SIZE_LIMITS.extreme) {
    issues.push({
      type: 'size',
      severity: 'error',
      message: `文件过大 (${formatFileSize(fileSize)})，可能导致浏览器崩溃`,
      details: { size: fileSize, limit: SIZE_LIMITS.extreme }
    })
  } else if (fileSize > SIZE_LIMITS.huge) {
    issues.push({
      type: 'size',
      severity: 'warning',
      message: `文件很大 (${formatFileSize(fileSize)})，处理时间可能很长`,
      details: { size: fileSize }
    })
  } else if (fileSize > SIZE_LIMITS.large) {
    issues.push({
      type: 'size',
      severity: 'warning',
      message: `文件较大 (${formatFileSize(fileSize)})，建议保持页面打开并连接电源`,
      details: { size: fileSize }
    })
  } else if (fileSize > SIZE_LIMITS.medium) {
    issues.push({
      type: 'size',
      severity: 'info',
      message: `文件大小适中 (${formatFileSize(fileSize)})，处理时间约几分钟`,
      details: { size: fileSize }
    })
  } else {
    issues.push({
      type: 'size',
      severity: 'info',
      message: `文件较小 (${formatFileSize(fileSize)})，处理速度较快`,
      details: { size: fileSize }
    })
  }

  return issues
}

// 生成建议
const generateRecommendations = (issues: FileValidationIssue[], fileInfo: FileInfo): string[] => {
  const recommendations: string[] = []

  const hasFormatError = issues.some(i => i.type === 'format' && i.severity === 'error')
  const hasLargeFile = issues.some(i => i.type === 'size' && (i.severity === 'warning' || i.severity === 'error'))
  const hasFormatWarning = issues.some(i => i.type === 'format' && i.severity === 'warning')

  if (hasFormatError) {
    recommendations.push('请转换为 MP4 格式后重试，这是兼容性最佳的视频格式')
  }

  if (hasFormatWarning) {
    recommendations.push('建议使用 MP4 或 WebM 格式以获得最佳处理效果')
  }

  if (hasLargeFile) {
    recommendations.push('处理大文件时请确保：')
    recommendations.push('• 关闭其他标签页和应用程序以释放内存')
    recommendations.push('• 连接电源适配器，避免设备进入省电模式')
    recommendations.push('• 保持网络连接稳定，以便上传处理结果')

    if (fileInfo.size > SIZE_LIMITS.huge) {
      recommendations.push('• 考虑使用视频编辑软件压缩文件大小')
    }
  }

  return recommendations
}

// 获取文件基本信息
const getFileInfo = (file: File): FileInfo => {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    extension: getFileExtension(file.name),
    sizeFormatted: formatFileSize(file.size),
  }
}

// 主要的文件验证函数
export const validateVideoFile = (
  file: File,
  devicePerformance?: 'low' | 'medium' | 'high'
): FileValidationResult => {
  const fileInfo = getFileInfo(file)

  // 添加处理时间估算
  fileInfo.estimatedProcessingTime = estimateProcessingTime(file.size, devicePerformance)

  const issues: FileValidationIssue[] = []

  // 检查文件格式
  issues.push(...checkFormatSupport(file))

  // 检查文件大小
  issues.push(...checkFileSize(file.size))

  // 确定整体验证结果
  const errorIssues = issues.filter(i => i.severity === 'error')
  const warningIssues = issues.filter(i => i.severity === 'warning')

  const valid = errorIssues.length === 0
  let warningLevel: 'none' | 'info' | 'warning' | 'error' = 'none'

  if (errorIssues.length > 0) {
    warningLevel = 'error'
  } else if (warningIssues.length > 0) {
    warningLevel = 'warning'
  } else if (issues.some(i => i.severity === 'info')) {
    warningLevel = 'info'
  }

  const recommendations = generateRecommendations(issues, fileInfo)

  return {
    valid,
    warningLevel,
    issues,
    fileInfo,
    recommendations
  }
}

// 检查是否为视频文件（基于扩展名和MIME类型的快速检查）
export const isVideoFile = (file: File): boolean => {
  const extension = getFileExtension(file.name)
  const videoExtensions = [
    ...SUPPORTED_FORMATS.excellent.map(f => f.ext),
    ...SUPPORTED_FORMATS.good.map(f => f.ext),
    ...SUPPORTED_FORMATS.limited.map(f => f.ext)
  ]

  return videoExtensions.includes(extension) || file.type.startsWith('video/')
}

// 获取推荐的文件大小限制（基于设备性能）
export const getRecommendedSizeLimit = (devicePerformance: 'low' | 'medium' | 'high'): number => {
  switch (devicePerformance) {
    case 'high':
      return SIZE_LIMITS.huge // 1GB
    case 'medium':
      return SIZE_LIMITS.large // 500MB
    case 'low':
    default:
      return SIZE_LIMITS.medium // 200MB
  }
}