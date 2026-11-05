/**
 * 格式化相对时间，将日期字符串转换为相对时间表示
 * @param dateString - 日期字符串
 * @returns 相对时间字符串，如 "刚刚最后编辑"、"2小时前最后编辑"
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      return '刚刚最后编辑'
    }
    return `${diffHours}小时前最后编辑`
  } else if (diffDays === 1) {
    return '1天前最后编辑'
  } else if (diffDays < 7) {
    return `${diffDays}天前最后编辑`
  } else if (diffDays < 30) {
    const diffWeeks = Math.floor(diffDays / 7)
    return `${diffWeeks}周前最后编辑`
  } else {
    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths}月前最后编辑`
  }
}