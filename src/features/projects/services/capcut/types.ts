/**
 * 剪映草稿生成 - 内部类型定义
 */

// ==================== 媒体信息类型 ====================

export interface VideoInfo {
  width: number
  height: number
  duration: number // 微秒
  path: string
  file: File
}

export type DraftVideoMetadata = Pick<VideoInfo, 'width' | 'height' | 'duration'>

export interface AudioInfo {
  duration: number // 微秒
  path: string
  blob: Blob
}

export interface ExtraAudioAsset {
  fileName: string
  blob: Blob
  duration?: number // 秒
  targetStart?: number // 秒
  targetDuration?: number // 秒
  volume?: number
}

export interface NarrationAudioAsset {
  itemId: number
  blob: Blob
  duration?: number // 秒
}

// ==================== 素材类型 ====================

export interface VideoMaterial {
  id: string
  path: string
  type: 'video'
  duration: number
  width: number
  height: number
  material_name: string
  create_time: number
  crop: {
    lower_left_x: number
    lower_left_y: number
    lower_right_x: number
    lower_right_y: number
    upper_left_x: number
    upper_left_y: number
    upper_right_x: number
    upper_right_y: number
  }
  extra_type_option: number
  source_platform: number
}

export interface AudioMaterial {
  app_id: number
  category_id: string
  category_name: string
  check_flag: number
  copyright_limit_type: string
  duration: number
  effect_id: string
  formula_id: string
  id: string
  intensifies_path: string
  is_ai_clone_tone: boolean
  is_text_edit_overdub: boolean
  is_ugc: boolean
  local_material_id: string
  music_id: string
  name: string
  path: string
  remote_url: string
  query: string
  request_id: string
  resource_id: string
  search_id: string
  source_from: string
  source_platform: number
  team_id: string
  text_id: string
  tone_category_id: string
  tone_category_name: string
  tone_effect_id: string
  tone_effect_name: string
  tone_platform: string
  tone_second_category_id: string
  tone_second_category_name: string
  tone_speaker: string
  tone_type: string
  type: 'extract_music'
  video_id: string
  wave_points: unknown[]
}

export interface TextContent {
  styles: Array<{
    fill: {
      alpha: number
      content: {
        render_type: string
        solid: {
          alpha: number
          color: number[]
        }
      }
    }
    range: [number, number]
    size: number
    bold: boolean
    italic: boolean
    underline: boolean
    strokes: Array<{
      content: {
        solid: {
          alpha: number
          color: number[]
        }
      }
      width: number
    }>
  }>
  text: string
}

export interface TextMaterial {
  id: string
  content: string // JSON.stringify(TextContent)
  type: 'text'
  typesetting: number
  alignment: number
  letter_spacing: number
  line_spacing: number
  line_feed: number
  line_max_width: number
  force_apply_line_max_width: boolean
  check_flag: number
  font_category_id: string
  font_category_name: string
  font_id: string
  font_name: string
  font_path: string
  font_resource_id: string
  font_size: number
  font_source_platform: number
  font_team_id: string
  font_title: string
  font_url: string
  fonts: unknown[]
  fixed_width: number
  fixed_height: number
}

// ==================== 片段类型 ====================

export interface TimeRange {
  start: number
  duration: number
}

export interface Clip {
  alpha: number
  flip: {
    horizontal: boolean
    vertical: boolean
  }
  rotation: number
  scale: {
    x: number
    y: number
  }
  transform: {
    x: number
    y: number
  }
}

export interface VideoSegment {
  id: string
  material_id: string
  target_timerange: TimeRange
  source_timerange: TimeRange
  speed: number
  volume: number
  enable_adjust: boolean
  enable_color_curves: boolean
  enable_color_match_adjust: boolean
  enable_color_wheels: boolean
  enable_lut: boolean
  enable_smart_color_adjust: boolean
  extra_material_refs: unknown[]
  hdr_settings: {
    intensity: number
    mode: number
    nits: number
  }
  uniform_scale: {
    on: boolean
    value: number
  }
  clip: Clip
  common_keyframes: unknown[]
  render_index?: number
}

export interface AudioSegment {
  id: string
  material_id: string
  target_timerange: TimeRange
  source_timerange: TimeRange
  speed: number
  volume: number
  extra_material_refs: unknown[]
  clip: null
  hdr_settings: null
  common_keyframes: unknown[]
  render_index?: number
}

export interface TextSegment {
  id: string
  material_id: string
  target_timerange: TimeRange
  source_timerange: null
  speed: number
  volume: number
  extra_material_refs: unknown[]
  clip: Clip
  common_keyframes: unknown[]
  render_index?: number
}

// ==================== 轨道类型 ====================

export interface Track {
  id: string
  type: 'video' | 'audio' | 'text'
  name: string
  segments: Array<VideoSegment | AudioSegment | TextSegment>
  attribute: number
  flag: number
  is_default_name: boolean
}

// ==================== 草稿类型 ====================

export interface Draft {
  canvas_config: {
    height: number
    ratio: string
    width: number
  }
  color_space: number
  config: {
    adjust_max_index: number
    attachment_info: unknown[]
    combination_max_index: number
    export_range: null
    extract_audio_last_index: number
    lyrics_recognition_id: string
    lyrics_sync: boolean
    lyrics_taskinfo: unknown[]
    maintrack_adsorb: boolean
    material_save_mode: number
    multi_language_current: string
    multi_language_list: unknown[]
    multi_language_main: string
    multi_language_mode: string
    original_sound_last_index: number
    record_audio_last_index: number
    sticker_max_index: number
    subtitle_keywords_config: null
    subtitle_recognition_id: string
    subtitle_sync: boolean
    subtitle_taskinfo: unknown[]
    system_font_list: unknown[]
    video_mute: boolean
    zoom_info_params: null
  }
  cover: null
  create_time: number
  duration: number
  extra_info: null
  fps: number
  free_render_index_mode_on: boolean
  group_container: null
  id: string
  keyframe_graph_list: unknown[]
  keyframes: {
    adjusts: unknown[]
    audios: unknown[]
    effects: unknown[]
    filters: unknown[]
    handwrites: unknown[]
    stickers: unknown[]
    texts: unknown[]
    videos: unknown[]
  }
  last_modified_platform: {
    app_id: number
    app_source: string
    app_version: string
    os: string
  }
  materials: {
    ai_translates: unknown[]
    audio_balances: unknown[]
    audio_effects: unknown[]
    audio_fades: unknown[]
    audio_track_indexes: unknown[]
    audios: AudioMaterial[]
    beats: unknown[]
    canvases: unknown[]
    chromas: unknown[]
    color_curves: unknown[]
    digital_humans: unknown[]
    drafts: unknown[]
    effects: unknown[]
    flowers: unknown[]
    green_screens: unknown[]
    handwrites: unknown[]
    hsl: unknown[]
    images: unknown[]
    log_color_wheels: unknown[]
    loudnesses: unknown[]
    manual_deformations: unknown[]
    masks: unknown[]
    material_animations: unknown[]
    material_colors: unknown[]
    multi_language_refs: unknown[]
    placeholders: unknown[]
    plugin_effects: unknown[]
    primary_color_wheels: unknown[]
    realtime_denoises: unknown[]
    shapes: unknown[]
    smart_crops: unknown[]
    smart_relights: unknown[]
    sound_channel_mappings: unknown[]
    speeds: unknown[]
    stickers: unknown[]
    tail_leaders: unknown[]
    text_templates: unknown[]
    texts: TextMaterial[]
    time_marks: unknown[]
    transitions: unknown[]
    video_effects: unknown[]
    video_trackings: unknown[]
    videos: VideoMaterial[]
    vocal_beautifys: unknown[]
    vocal_separations: unknown[]
  }
  mutable_config: null
  name: string
  new_version: string
  relationships: unknown[]
  render_index_track_mode_on: boolean
  retouch_cover: null
  source: string
  static_cover_image_path: string
  time_marks: null
  tracks: Track[]
  update_time: number
  version: number
}

export interface DraftMetaInfo {
  draft_id: string
  draft_name: string
  draft_cover_path: string
  draft_fold_path: string
  draft_materials_path: string
  draft_root_path: string
  tm_draft_create: number
  tm_draft_modified: number
  tm_duration: number
}

// ==================== 导出进度回调 ====================

export interface ExportProgress {
  stage: 'downloading' | 'building' | 'creating' | 'writing' | 'exporting' | 'complete'
  message: string
  progress: number // 0-100
  currentItem?: number
  totalItems?: number
}

export type ProgressCallback = (progress: ExportProgress) => void

// ==================== 导出策略和浏览器能力 ====================

/**
 * 导出策略类型
 */
export type ExportStrategy = 'filesystem' | 'zip' | 'blocked'

/**
 * 浏览器能力检测结果
 */
export interface BrowserCapability {
  /** 是否支持 File System Access API */
  supportsFileSystemAPI: boolean
  /** 导出策略 */
  strategy: ExportStrategy
  /** 主要提示信息 */
  message: string
  /** 限制或警告信息 */
  limitations?: string[]
}
