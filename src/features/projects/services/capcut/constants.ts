/**
 * 剪映草稿生成 - 常量定义
 * 从 Python 代码移植
 */

// ==================== 时间转换 ====================
/** 1秒 = 1,000,000 微秒 */
export const SEC = 1000000

// ==================== 视频配置 ====================
export const VIDEO_WIDTH = 1920
export const VIDEO_HEIGHT = 1080
export const FPS = 30.0

// ==================== 字幕样式配置 ====================
export const SUBTITLE_FONT_SIZE = 8.0
export const SUBTITLE_FONT_COLOR = [1.0, 1.0, 1.0] // 白色 RGB
export const SUBTITLE_ALPHA = 1.0
export const SUBTITLE_BORDER_COLOR = [0.0, 0.0, 0.0] // 黑色 RGB
export const SUBTITLE_BORDER_WIDTH = 0.08 // 描边宽度（剪映内部值，对应40左右）
export const SUBTITLE_BORDER_ALPHA = 1.0
export const SUBTITLE_POSITION_Y = 0.35 // 字幕位置（屏幕下方）
export const SUBTITLE_MAX_CHARS_PER_LINE = 18 // 每行最多字符数

// ==================== 轨道渲染索引 ====================
/** 视频轨道（主轨道） */
export const RENDER_INDEX_VIDEO = 0
/** 音频轨道 */
export const RENDER_INDEX_AUDIO = 1
/** 字幕轨道 */
export const RENDER_INDEX_SUBTITLE = 15000

// ==================== 工具函数 ====================
/**
 * 将秒转换为微秒
 */
export function secondsToMicroseconds(seconds: number): number {
  return Math.round(seconds * SEC)
}

/**
 * 生成 UUID（剪映使用32位十六进制）
 */
export function generateUUID(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * 获取当前时间戳（微秒）
 */
export function getCurrentTimeMicroseconds(): number {
  return Math.round(Date.now() * 1000)
}
