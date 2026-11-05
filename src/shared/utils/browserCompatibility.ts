// 浏览器兼容性检测工具
export interface CompatibilityResult {
  compatible: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  issues: CompatibilityIssue[]
  deviceInfo: DeviceInfo
  recommendations: string[]
}

export interface CompatibilityIssue {
  feature: string
  supported: boolean
  severity: 'warning' | 'error' | 'critical'
  message: string
}

export interface DeviceInfo {
  userAgent: string
  platform: string
  memory?: number // GB
  hardwareConcurrency?: number // CPU cores
  connection?: {
    effectiveType: string
    downlink: number
  }
  estimatedPerformance: 'low' | 'medium' | 'high'
}

// 检测 WebAssembly 支持
const checkWebAssemblySupport = (): CompatibilityIssue => {
  const supported = 'WebAssembly' in window
  return {
    feature: 'WebAssembly',
    supported,
    severity: supported ? 'warning' : 'critical',
    message: supported
      ? 'WebAssembly 支持正常'
      : 'WebAssembly 不受支持，核心视频处理功能将无法使用'
  }
}

// 检测 Canvas 支持
const checkCanvasSupport = (): CompatibilityIssue => {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const supported = !!ctx
    return {
      feature: 'Canvas API',
      supported,
      severity: supported ? 'warning' : 'critical',
      message: supported
        ? 'Canvas API 支持正常'
        : 'Canvas API 不受支持，图像处理功能将无法使用'
    }
  } catch (error) {
    return {
      feature: 'Canvas API',
      supported: false,
      severity: 'critical',
      message: 'Canvas API 检测失败'
    }
  }
}

// 检测 File API 支持
const checkFileAPISupport = (): CompatibilityIssue => {
  const supported = 'File' in window && 'FileReader' in window && 'FileList' in window && 'Blob' in window
  return {
    feature: 'File API',
    supported,
    severity: supported ? 'warning' : 'critical',
    message: supported
      ? 'File API 支持正常'
      : 'File API 不受支持，文件处理功能将无法使用'
  }
}

// 检测 IndexedDB 支持
const checkIndexedDBSupport = (): CompatibilityIssue => {
  const supported = 'indexedDB' in window
  return {
    feature: 'IndexedDB',
    supported,
    severity: supported ? 'warning' : 'error',
    message: supported
      ? 'IndexedDB 支持正常'
      : 'IndexedDB 不受支持，本地缓存功能将受限'
  }
}

// 检测 Web Workers 支持
const checkWebWorkersSupport = (): CompatibilityIssue => {
  const supported = 'Worker' in window
  return {
    feature: 'Web Workers',
    supported,
    severity: supported ? 'warning' : 'error',
    message: supported
      ? 'Web Workers 支持正常'
      : 'Web Workers 不受支持，后台处理功能将受限'
  }
}

// 检测 Notification API 支持
const checkNotificationSupport = (): CompatibilityIssue => {
  const supported = 'Notification' in window
  return {
    feature: 'Notification API',
    supported,
    severity: 'warning',
    message: supported
      ? 'Notification API 支持正常'
      : '通知功能不可用，无法发送处理完成通知'
  }
}

// 检测浏览器类型和版本
const getBrowserInfo = () => {
  const userAgent = navigator.userAgent

  // 检测主流浏览器的最低版本要求
  const browserChecks = [
    {
      name: 'Chrome',
      regex: /Chrome\/(\d+)/,
      minVersion: 80,
      supported: true
    },
    {
      name: 'Firefox',
      regex: /Firefox\/(\d+)/,
      minVersion: 70,
      supported: true
    },
    {
      name: 'Safari',
      regex: /Version\/(\d+).*Safari/,
      minVersion: 13,
      supported: true
    },
    {
      name: 'Edge',
      regex: /Edg\/(\d+)/,
      minVersion: 80,
      supported: true
    },
    {
      name: 'Internet Explorer',
      regex: /MSIE|Trident/,
      minVersion: 999, // IE 完全不支持
      supported: false
    }
  ]

  for (const browser of browserChecks) {
    const match = userAgent.match(browser.regex)
    if (match) {
      const version = parseInt(match[1] || '0')
      return {
        name: browser.name,
        version,
        supported: browser.supported && version >= browser.minVersion,
        minVersion: browser.minVersion
      }
    }
  }

  return {
    name: 'Unknown',
    version: 0,
    supported: false,
    minVersion: 0
  }
}

// 获取设备信息
const getDeviceInfo = (): DeviceInfo => {
  const nav = navigator as any

  // 估算设备性能
  const memory = nav.deviceMemory || 0
  const cores = nav.hardwareConcurrency || 0

  let estimatedPerformance: 'low' | 'medium' | 'high' = 'medium'
  if (memory >= 8 && cores >= 8) {
    estimatedPerformance = 'high'
  } else if (memory <= 2 || cores <= 2) {
    estimatedPerformance = 'low'
  }

  // 网络信息
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    memory,
    hardwareConcurrency: cores,
    connection: connection ? {
      effectiveType: connection.effectiveType || 'unknown',
      downlink: connection.downlink || 0
    } : undefined,
    estimatedPerformance
  }
}

// 生成建议
const generateRecommendations = (issues: CompatibilityIssue[], deviceInfo: DeviceInfo): string[] => {
  const recommendations: string[] = []

  const criticalIssues = issues.filter(i => i.severity === 'critical' && !i.supported)
  const browserInfo = getBrowserInfo()

  if (criticalIssues.length > 0) {
    if (!browserInfo.supported) {
      recommendations.push(`建议使用最新版本的 Chrome (${browserInfo.minVersion}+)、Firefox (70+)、Safari (13+) 或 Edge (80+) 浏览器`)
    } else {
      recommendations.push('您的浏览器缺少关键功能支持，请升级到最新版本')
    }
  }

  if (deviceInfo.estimatedPerformance === 'low') {
    recommendations.push('您的设备性能较低，建议关闭其他应用程序以获得最佳性能')
    recommendations.push('处理大视频文件时可能需要更长时间，建议选择较小的文件或降低处理质量')
  }

  if (deviceInfo.connection && deviceInfo.connection.effectiveType === 'slow-2g') {
    recommendations.push('网络连接较慢，上传大文件可能需要较长时间')
  }

  if (!issues.find(i => i.feature === 'IndexedDB')?.supported) {
    recommendations.push('浏览器不支持本地缓存，处理失败时无法保存中间结果')
  }

  return recommendations
}

// 主要的兼容性检测函数
export const checkBrowserCompatibility = (): CompatibilityResult => {
  const issues = [
    checkWebAssemblySupport(),
    checkCanvasSupport(),
    checkFileAPISupport(),
    checkIndexedDBSupport(),
    checkWebWorkersSupport(),
    checkNotificationSupport()
  ]

  const deviceInfo = getDeviceInfo()
  const browserInfo = getBrowserInfo()

  // 添加浏览器版本检查
  if (!browserInfo.supported) {
    issues.push({
      feature: 'Browser Version',
      supported: false,
      severity: 'critical',
      message: `${browserInfo.name} ${browserInfo.version} 版本过低，建议升级到 ${browserInfo.minVersion}+ 版本`
    })
  }

  const criticalIssues = issues.filter(i => i.severity === 'critical' && !i.supported)
  const errorIssues = issues.filter(i => i.severity === 'error' && !i.supported)

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  let compatible = true

  if (criticalIssues.length > 0) {
    riskLevel = 'critical'
    compatible = false
  } else if (errorIssues.length > 0 || deviceInfo.estimatedPerformance === 'low') {
    riskLevel = 'high'
  } else if (deviceInfo.estimatedPerformance === 'medium') {
    riskLevel = 'medium'
  }

  const recommendations = generateRecommendations(issues, deviceInfo)

  return {
    compatible,
    riskLevel,
    issues,
    deviceInfo,
    recommendations
  }
}

// 检查特定功能是否可用
export const isFeatureSupported = (feature: string): boolean => {
  const result = checkBrowserCompatibility()
  const issue = result.issues.find(i => i.feature === feature)
  return issue?.supported ?? false
}

// 获取性能建议
export const getPerformanceRecommendations = (): {
  maxFileSize: number // MB
  recommendedQuality: 'low' | 'medium' | 'high'
  concurrentProcessing: boolean
} => {
  const deviceInfo = getDeviceInfo()

  switch (deviceInfo.estimatedPerformance) {
    case 'high':
      return {
        maxFileSize: 1000, // 1GB
        recommendedQuality: 'high',
        concurrentProcessing: true
      }
    case 'medium':
      return {
        maxFileSize: 500, // 500MB
        recommendedQuality: 'medium',
        concurrentProcessing: true
      }
    case 'low':
    default:
      return {
        maxFileSize: 200, // 200MB
        recommendedQuality: 'low',
        concurrentProcessing: false
      }
  }
}