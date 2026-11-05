/**
 * 视频URL工具函数
 *
 * 用于处理视频URL存储和解析
 * - 存储格式：单个URL或逗号分隔的多个URL
 * - 解析：兼容单个和多个URL
 */

/**
 * 解析视频URL字符串（支持单个URL或逗号分隔的多个URL）
 *
 * @param urlString - 视频URL字符串（可能是单个URL或逗号分隔的多个URL）
 * @returns URL数组
 *
 * @example
 * parseVideoUrls('https://example.com/video.mp4')
 * // => ['https://example.com/video.mp4']
 *
 * @example
 * parseVideoUrls('url1.mp4,url2.mp4,url3.mp4')
 * // => ['url1.mp4', 'url2.mp4', 'url3.mp4']
 */
export function parseVideoUrls(urlString: string | null | undefined): string[] {
  if (!urlString) return []

  // 如果包含逗号，说明是多个URL
  if (urlString.includes(',')) {
    return urlString
      .split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0)
  }

  // 单个URL（普通上传或单段视频）
  return [urlString.trim()]
}

/**
 * 获取主视频URL（第一个URL）
 *
 * @param urlString - 视频URL字符串
 * @returns 主视频URL，如果没有则返回 null
 *
 * @example
 * getPrimaryVideoUrl('url1.mp4,url2.mp4,url3.mp4')
 * // => 'url1.mp4'
 */
export function getPrimaryVideoUrl(urlString: string | null | undefined): string | null {
  const urls = parseVideoUrls(urlString)
  return urls.length > 0 ? urls[0] : null
}

/**
 * 获取所有视频分段的URL
 *
 * @param urlString - 视频URL字符串
 * @returns 所有视频URL数组
 *
 * @example
 * getAllVideoUrls('url1.mp4,url2.mp4,url3.mp4')
 * // => ['url1.mp4', 'url2.mp4', 'url3.mp4']
 */
export function getAllVideoUrls(urlString: string | null | undefined): string[] {
  return parseVideoUrls(urlString)
}

/**
 * 将视频URL数组拼接成字符串
 *
 * @param urls - 视频URL数组
 * @returns 逗号分隔的URL字符串
 *
 * @example
 * joinVideoUrls(['url1.mp4', 'url2.mp4', 'url3.mp4'])
 * // => 'url1.mp4,url2.mp4,url3.mp4'
 */
export function joinVideoUrls(urls: string[]): string {
  return urls.filter(url => url.length > 0).join(',')
}

/**
 * 检查是否为多分段视频
 *
 * @param urlString - 视频URL字符串
 * @returns 是否为多分段视频
 *
 * @example
 * isMultiSegmentVideo('url1.mp4,url2.mp4')
 * // => true
 *
 * @example
 * isMultiSegmentVideo('url1.mp4')
 * // => false
 */
export function isMultiSegmentVideo(urlString: string | null | undefined): boolean {
  const urls = parseVideoUrls(urlString)
  return urls.length > 1
}

/**
 * 获取视频分段数量
 *
 * @param urlString - 视频URL字符串
 * @returns 分段数量
 *
 * @example
 * getVideoSegmentCount('url1.mp4,url2.mp4,url3.mp4')
 * // => 3
 */
export function getVideoSegmentCount(urlString: string | null | undefined): number {
  return parseVideoUrls(urlString).length
}
