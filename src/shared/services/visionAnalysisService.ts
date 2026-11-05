/**
 * 视觉分析服务（通过后端 SiliconFlow VLM 代理调用）
 * 处理图像分析和批量处理
 */

import { aiToolsService, convertAnalysisResponse } from './aiToolsService'
import type { FrameAnalysisResult } from '@/shared/types'

export class VisionAnalysisService {
  private static instance: VisionAnalysisService
  private isConfigValid: boolean

  private constructor() {
    // 不再需要前端直连模型配置，统一通过后端调用
    this.isConfigValid = true
  }

  public static getInstance(): VisionAnalysisService {
    if (!VisionAnalysisService.instance) {
      VisionAnalysisService.instance = new VisionAnalysisService()
    }
    return VisionAnalysisService.instance
  }

  /**
   * 批量分析图像帧组 (新的后端API方式)
   */
  public async analyzeFrameGroup(images: Array<{ canvas?: HTMLCanvasElement; imageUrl?: string }>): Promise<FrameAnalysisResult[]> {
    try {
      if (!this.isConfigValid) {
        return [{
          success: false,
          error: '服务未就绪，请稍后重试'
        }]
      }

      if (images.length === 0) {
        return [{
          success: false,
          error: '没有可分析的图片'
        }]
      }

      // 调用后端 API 进行批量分析
      const response = await aiToolsService.analyzeImages(images)

      // 转换后端返回的结构化数据为前端格式
      const results = convertAnalysisResponse(response)

      return results

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分析失败'
      console.error('帧组分析失败:', error)

      return [{
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      }]
    }
  }

  /**
   * 分析单个帧 (兼容性方法，实际调用批量分析)
   */
  public async analyzeFrame(canvas: HTMLCanvasElement): Promise<FrameAnalysisResult> {
    try {
      // 调用新的批量分析方法
      const results = await this.analyzeFrameGroup([{ canvas }])

      // 返回第一个结果
      return results[0] || {
        success: false,
        error: '分析失败',
        timestamp: Date.now()
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分析失败'
      console.error('帧分析失败:', error)

      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      }
    }
  }

  /**
   * 通过 URL 分析图片（用于恢复的帧）
   */
  public async analyzeFrameByUrl(imageUrl: string): Promise<FrameAnalysisResult> {
    try {
      // 调用新的批量分析方法
      const results = await this.analyzeFrameGroup([{ imageUrl }])

      // 返回第一个结果
      return results[0] || {
        success: false,
        error: '分析失败',
        timestamp: Date.now()
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分析失败'
      console.error('URL图片分析失败:', error)

      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now()
      }
    }
  }


  /**
   * 批量分析帧（使用新的后端批量接口）
   */
  public async analyzeFrames(
    canvases: HTMLCanvasElement[],
    onProgress?: (progress: number) => void
  ): Promise<FrameAnalysisResult[]> {
    try {
      // 转换为统一的图片格式
      const images = canvases.map(canvas => ({ canvas }))

      // 调用新的批量分析方法
      const results = await this.analyzeFrameGroup(images)

      // 模拟进度更新
      if (onProgress) {
        onProgress(100)
      }

      return results

    } catch (error) {
      console.error('批量帧分析失败:', error)

      // 返回错误结果
      return canvases.map((_, _index) => ({
        success: false,
        error: error instanceof Error ? error.message : '分析失败',
        timestamp: Date.now()
      }))
    }
  }

  /**
   * 检查配置状态（现在总是就绪，因为通过后端调用）
   */
  public isReady(): boolean {
    return this.isConfigValid
  }

  /**
   * 获取配置错误信息（现在总是返回 null）
   */
  public getConfigError(): string | null {
    return null
  }
}

// 导出单例实例
export const visionAnalysisService = VisionAnalysisService.getInstance()
