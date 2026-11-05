/**
 * 视频配置常量定义
 * 集中管理所有选项和配置项
 */

import type {
  ClipMode,
  StyleOption,
  TypeScriptOption
} from '../types/material/videoConfig.types'

// ==================== 语言选项 ====================

export const LANGUAGE_OPTIONS = [
  '中文',
  '英语',
  '日语',
  '韩语',
  '俄语',
  '意大利语'
] as const

export const LANGUAGE_ICONS: Record<string, string> = {
  '中文': '🇨🇳',
  '英语': '🇺🇸',
  '日语': '🇯🇵',
  '韩语': '🇰🇷',
  '俄语': '🇷🇺',
  '意大利语': '🇮🇹'
}

// ==================== 风格选项 ====================

export const STYLE_OPTIONS: StyleOption[] = [
  {
    value: 'default',
    name: '默认风格',
    description: '文案要求先将整个视频中最吸引人的部分放开头，偏口语化表达'
  },
  {
    value: 'white_talk',
    name: '口语化叙述',
    description: '接地气的口语化表达，不使用排比句和总结内容'
  },
  {
    value: 'high_energy_white_talk',
    name: '高能白话风',
    description: '视频开头直接上最炸裂的画面，用跟兄弟聊天的口气'
  },
  {
    value: 'animal_world',
    name: '动物世界',
    description: '知识渊博但脑洞大开的"伪专家"风格，一本正经地胡说八道'
  },
  {
    value: 'live_shopping',
    name: '直播带货',
    description: '建立对主播的信任，提炼产品价值，使用"向导"口吻'
  },
  {
    value: 'news_broadcast',
    name: '新闻联播',
    description: '新闻联播风格，以"据报道"、"据新华社"等词开头'
  },
  {
    value: 'guide_style',
    name: '引导式开头',
    description: '情感引导，直接切入普通人都会有的痛点'
  },
  {
    value: 'youmo_style',
    name: '吐槽式开头',
    description: '风趣幽默、犀利的吐槽或评论，各种玩梗'
  },
  {
    value: 'deep_analysis',
    name: '深度解析',
    description: '聚焦于电影的核心主题，深度分析关键情节、角色动机和象征意义'
  },
  {
    value: 'slow_down',
    name: '放慢节奏',
    description: '聚焦情感共鸣点，挖掘人性的温暖和生活的美好'
  },
  {
    value: 'movie_secretary',
    name: '电影解密师',
    description: '提出颠覆性的核心论点，通过"抽丝剥茧"展示关键证据'
  },
  {
    value: 'soul_story',
    name: '灵魂故事',
    description: '绝对口语化，真诚不套路，像在深夜的酒馆里讲故事'
  },
  {
    value: 'movie_intro',
    name: '电影解说（爆款开头）',
    description: '电影化语言+强钩子结构，3秒内抓住观众注意力'
  },
  {
    value: 'short_story_comic',
    name: '短剧漫剧',
    description: '高能反转+情绪冲突+悬念钩子，句句爆点、节奏紧凑'
  }
]

// ==================== 文案类型选项 ====================

export const TYPE_SCRIPT_OPTIONS: TypeScriptOption[] = [
  {
    value: 'default',
    label: '标准解说文案',
    description: 'AI根据视频内容自动生成解说文案'
  },
  {
    value: 'reference',
    label: '参考改写',
    description: '提供参考文案,AI基于此进行改写优化',
    placeholder: '请输入参考文案内容...'
  },
  {
    value: 'previous',
    label: '根据剧情提要生成后续解说',
    description: '基于前情提要,生成后续剧情的解说',
    placeholder: '请输入剧情提要...'
  }
]

// ==================== 人称视角选项 ====================

export const PERSON_VIEW_OPTIONS = [
  {
    value: 'first_person' as const,
    label: '第一人称',
    description: '"我看到..."，代入感强',
    icon: '👤'
  },
  {
    value: 'third_person' as const,
    label: '第三人称',
    description: '"他/她..."，客观叙述',
    icon: '👥'
  }
]

// ==================== 视频剪辑模式 ====================

export interface ClipModeOption {
  value: ClipMode
  title: string
  description: string
  highlight?: string
}

export const CLIP_MODE_OPTIONS: ClipModeOption[] = [
  {
    value: 'narration_only',
    title: '仅解说',
    description: '解说覆盖全程，适合强调节奏与信息密度的内容。',
    highlight: '声音统一，节奏可控'
  },
  {
    value: 'original_only',
    title: '仅原片',
    description: '保留视频原声，不额外添加解说，突出画面氛围。',
    highlight: '保留现场氛围'
  },
  {
    value: 'smart_mix',
    title: '智能穿插',
    description: 'AI 智能判断原片与解说段落，混合呈现精彩镜头。',
    highlight: '自动平衡画面与解说'
  }
]

// ==================== 分镜预设 ====================

export interface StoryboardPreset {
  value: number
  label: string
  description?: string
}

export const STORYBOARD_PRESETS: StoryboardPreset[] = [
  { value: 8, label: '8 个分镜', description: '短视频常用结构' },
  { value: 16, label: '16 个分镜', description: '节奏适中，覆盖更多信息' },
  { value: 24, label: '24 个分镜', description: '细节完整，适合剧情类' },
  { value: 36, label: '36 个分镜', description: '长视频或解构复杂剧情时使用' }
]

// ==================== 文案字数预设 ====================

export interface WordCountPreset {
  value: string
  label: string
  description?: string
}

export const WORD_COUNT_PRESETS: WordCountPreset[] = [
  { value: '500-800', label: '500-800 字', description: '短视频 / 高速节奏' },
  { value: '800-1200', label: '800-1200 字', description: '常规节奏 / 资讯类' },
  { value: '1200-1800', label: '1200-1800 字', description: '剧情解说 / 信息更丰富' },
  { value: '1800-2500', label: '1800-2500 字', description: '电影解析 / 长内容' },
  { value: '2500-3500', label: '2500-3500 字', description: '深度解析 / 长视频' }
]

// ==================== 音频倍速预设 ====================

export const AUDIO_SPEED_PRESETS = [
  { label: '慢速', value: 3.5, desc: '舒缓节奏' },
  { label: '舒适', value: 4.0, desc: '轻松自然' },
  { label: '标准', value: 4.5, desc: '推荐使用' },
  { label: '适中', value: 5.0, desc: '均衡节奏' },
  { label: '快速', value: 5.5, desc: '节奏紧凑' },
  { label: '紧凑', value: 6.0, desc: '信息密集' },
  { label: '极速', value: 6.5, desc: '超快节奏' }
]

// ==================== 原片占比预设 ====================

export const ORG_RATIO_MARKS = {
  20: '20%',
  30: '30%',
  40: '40%',
  50: '50%',
  60: '60%'
}
