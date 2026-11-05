/**
 * 版本信息工具
 * 用于获取和管理应用版本信息
 */

// 从 package.json 导入版本号
// 注意：Vite 会在构建时自动处理这个导入
import packageJson from '../../../package.json'

/**
 * 版本信息接口
 */
export interface VersionInfo {
  /** 完整版本号 (如: 1.1.0) */
  version: string
  /** 主版本号 */
  major: number
  /** 次版本号 */
  minor: number
  /** 修订版本号 */
  patch: number
  /** 版本前缀 (如: v) */
  prefix: string
  /** 完整版本字符串 (如: v1.1.0) */
  fullVersion: string
}

/**
 * 解析版本号字符串
 * @param versionString 版本号字符串 (如: "1.1.0")
 * @returns 解析后的版本信息
 */
function parseVersion(versionString: string): VersionInfo {
  const parts = versionString.split('.')
  const major = parseInt(parts[0] || '0', 10)
  const minor = parseInt(parts[1] || '0', 10)
  const patch = parseInt(parts[2] || '0', 10)

  return {
    version: versionString,
    major,
    minor,
    patch,
    prefix: 'v',
    fullVersion: `v${versionString}`
  }
}

/**
 * 获取当前应用版本信息
 * @returns 版本信息对象
 */
export function getVersionInfo(): VersionInfo {
  return parseVersion(packageJson.version)
}

/**
 * 获取版本号字符串 (如: "v1.1.0")
 * @returns 版本号字符串
 */
export function getVersion(): string {
  return `v${packageJson.version}`
}

/**
 * 比较两个版本号
 * @param v1 版本1
 * @param v2 版本2
 * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const version1 = parseVersion(v1)
  const version2 = parseVersion(v2)

  if (version1.major !== version2.major) {
    return version1.major > version2.major ? 1 : -1
  }
  if (version1.minor !== version2.minor) {
    return version1.minor > version2.minor ? 1 : -1
  }
  if (version1.patch !== version2.patch) {
    return version1.patch > version2.patch ? 1 : -1
  }
  return 0
}

// 导出默认版本信息
export default {
  getVersionInfo,
  getVersion,
  compareVersions
}
