/**
 * 剪映草稿生成 - 素材构建器
 * 负责创建视频、音频、文本素材对象
 */

import {
  generateUUID,
  getCurrentTimeMicroseconds,
  SUBTITLE_FONT_SIZE,
  SUBTITLE_FONT_COLOR,
  SUBTITLE_ALPHA,
  SUBTITLE_BORDER_COLOR,
  SUBTITLE_BORDER_WIDTH,
  SUBTITLE_BORDER_ALPHA
} from './constants'
import type {
  VideoInfo,
  AudioInfo,
  VideoMaterial,
  AudioMaterial,
  TextMaterial,
  TextContent
} from './types'

/**
 * 创建视频素材对象
 */
export function createVideoMaterial(
  videoInfo: VideoInfo,
  materialId?: string
): VideoMaterial {
  const id = materialId || generateUUID()

  return {
    id,
    path: videoInfo.path,
    type: 'video',
    duration: videoInfo.duration,
    width: videoInfo.width,
    height: videoInfo.height,
    material_name: videoInfo.file.name,
    create_time: getCurrentTimeMicroseconds(),
    crop: {
      lower_left_x: 0.0,
      lower_left_y: 1.0,
      lower_right_x: 1.0,
      lower_right_y: 1.0,
      upper_left_x: 0.0,
      upper_left_y: 0.0,
      upper_right_x: 1.0,
      upper_right_y: 0.0
    },
    extra_type_option: 0,
    source_platform: 0
  }
}

/**
 * 创建音频素材对象
 * 注意：type 必须是 "extract_music" 而不是 "audio"
 */
export function createAudioMaterial(
  audioInfo: AudioInfo,
  materialId?: string
): AudioMaterial {
  const id = materialId || generateUUID()
  const fileName = audioInfo.path.split(/[/\\]/).pop() || 'audio.mp3'

  return {
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 1,
    copyright_limit_type: 'none',
    duration: audioInfo.duration,
    effect_id: '',
    formula_id: '',
    id,
    intensifies_path: '',
    is_ai_clone_tone: false,
    is_text_edit_overdub: false,
    is_ugc: false,
    local_material_id: id,
    music_id: id,
    name: fileName,
    path: audioInfo.path,
    remote_url: '',
    query: '',
    request_id: '',
    resource_id: '',
    search_id: '',
    source_from: '',
    source_platform: 0,
    team_id: '',
    text_id: '',
    tone_category_id: '',
    tone_category_name: '',
    tone_effect_id: '',
    tone_effect_name: '',
    tone_platform: '',
    tone_second_category_id: '',
    tone_second_category_name: '',
    tone_speaker: '',
    tone_type: '',
    type: 'extract_music', // 关键：必须是 extract_music
    video_id: '',
    wave_points: []
  }
}

/**
 * 创建文本素材对象（字幕）
 */
export function createTextMaterial(text: string, materialId?: string): TextMaterial {
  const id = materialId || generateUUID()

  // 构建文本内容和样式
  const textContent: TextContent = {
    styles: [
      {
        fill: {
          alpha: 1.0,
          content: {
            render_type: 'solid',
            solid: {
              alpha: SUBTITLE_ALPHA,
              color: SUBTITLE_FONT_COLOR
            }
          }
        },
        range: [0, text.length],
        size: SUBTITLE_FONT_SIZE,
        bold: false,
        italic: false,
        underline: false,
        strokes: [
          {
            content: {
              solid: {
                alpha: SUBTITLE_BORDER_ALPHA,
                color: SUBTITLE_BORDER_COLOR
              }
            },
            width: SUBTITLE_BORDER_WIDTH
          }
        ]
      }
    ],
    text
  }

  return {
    id,
    content: JSON.stringify(textContent),
    type: 'text',
    typesetting: 0, // 0: 横排, 1: 竖排
    alignment: 1, // 0: 左对齐, 1: 居中, 2: 右对齐
    letter_spacing: 0.0,
    line_spacing: 0.02,
    line_feed: 1,
    line_max_width: 0.82,
    force_apply_line_max_width: true,
    check_flag: 15, // 7 + 8 (基础 + 描边)
    font_category_id: '',
    font_category_name: '',
    font_id: '',
    font_name: '',
    font_path: '',
    font_resource_id: '',
    font_size: 15.0,
    font_source_platform: 0,
    font_team_id: '',
    font_title: 'none',
    font_url: '',
    fonts: [],
    fixed_width: -1,
    fixed_height: -1
  }
}
