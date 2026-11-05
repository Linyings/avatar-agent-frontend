import type {
  VideoFile,
  VideoAnalysis,
  CreativeIntentType,
  SubtitleResult
} from '@/shared/types'

/**
 * 视频智能分析服务
 * 通过分析视频特征自动推荐最适合的创作意图和参数
 */
class VideoAnalysisService {
  private static instance: VideoAnalysisService
  private analysisCache = new Map<string, VideoAnalysis>()

  static getInstance(): VideoAnalysisService {
    if (!VideoAnalysisService.instance) {
      VideoAnalysisService.instance = new VideoAnalysisService()
    }
    return VideoAnalysisService.instance
  }

  /**
   * 分析视频文件并生成智能推荐
   */
  async analyzeVideo(
    videoFile: VideoFile,
    subtitleResult?: SubtitleResult
  ): Promise<VideoAnalysis> {
    if (!videoFile.file) {
      return this.getFallbackAnalysis(videoFile)
    }

    const videoWithFile = videoFile as VideoFile & { file: File }
    const cacheKey = this.generateCacheKey(videoWithFile)

    // 检查缓存
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!
    }

    try {
      // 并行执行多项分析
      const [
        basicMetrics,
        audioAnalysis,
        visualAnalysis,
        contentAnalysis
      ] = await Promise.all([
        this.analyzeBasicMetrics(videoWithFile),
        this.analyzeAudio(videoWithFile, subtitleResult),
        this.analyzeVisual(videoWithFile),
        this.analyzeContent(videoWithFile, subtitleResult)
      ])

      // 综合分析结果生成最终报告
      const analysis = this.generateAnalysisReport(
        basicMetrics,
        audioAnalysis,
        visualAnalysis,
        contentAnalysis
      )

      // 缓存结果
      this.analysisCache.set(cacheKey, analysis)

      return analysis
    } catch (error) {
      console.error('视频分析失败:', error)

      // 返回基础分析结果
      return this.getFallbackAnalysis(videoFile)
    }
  }

  /**
   * 分析基础视频指标
   */
  private async analyzeBasicMetrics(videoFile: VideoFile & { file: File }): Promise<{
    duration: number
    aspectRatio: number
    fileSize: number
    estimatedBitrate: number
  }> {
    return {
      duration: videoFile.duration || 0,
      aspectRatio: videoFile.width && videoFile.height
        ? videoFile.width / videoFile.height
        : 16/9,
      fileSize: videoFile.file.size,
      estimatedBitrate: videoFile.file.size / (videoFile.duration || 1) * 8 / 1000 // kbps
    }
  }

  /**
   * 分析音频特征
   */
  private async analyzeAudio(
    videoFile: VideoFile,
    subtitleResult?: SubtitleResult
  ): Promise<{
    hasAudio: boolean
    hasCaptions: boolean
    dialogueDensity: 'low' | 'medium' | 'high'
    hasMusic: boolean
    language: string
  }> {
    // 基于字幕信息分析对话密集度
    let dialogueDensity: 'low' | 'medium' | 'high' = 'medium'
    let language = 'zh-CN'
    let hasCaptions = false

    if (subtitleResult && subtitleResult.segments) {
      hasCaptions = true
      const totalDuration = videoFile.duration || 1
      const textLength = subtitleResult.segments.reduce((sum, seg) => sum + seg.text.length, 0)
      const density = textLength / totalDuration

      if (density < 10) {
        dialogueDensity = 'low'
      } else if (density > 30) {
        dialogueDensity = 'high'
      } else {
        dialogueDensity = 'medium'
      }

      // 简单的语言检测
      const sampleText = subtitleResult.segments.slice(0, 5).map(s => s.text).join(' ')
      language = this.detectLanguage(sampleText)
    }

    return {
      hasAudio: true, // 假设大多数视频都有音频
      hasCaptions,
      dialogueDensity,
      hasMusic: Math.random() > 0.5, // 简化实现，实际需要音频分析
      language
    }
  }

  /**
   * 分析视觉特征
   */
  private async analyzeVisual(videoFile: VideoFile & { file: File }): Promise<{
    paceRhythm: 'slow' | 'medium' | 'fast'
    complexity: 'simple' | 'medium' | 'complex'
    sceneTypes: string[]
  }> {
    const duration = videoFile.duration || 0
    const fileSize = videoFile.file.size

    // 基于文件大小和时长估算视觉复杂度
    const sizePerSecond = fileSize / duration

    let paceRhythm: 'slow' | 'medium' | 'fast' = 'medium'
    let complexity: 'simple' | 'medium' | 'complex' = 'medium'

    if (sizePerSecond < 1000000) { // < 1MB/s
      paceRhythm = 'slow'
      complexity = 'simple'
    } else if (sizePerSecond > 5000000) { // > 5MB/s
      paceRhythm = 'fast'
      complexity = 'complex'
    }

    return {
      paceRhythm,
      complexity,
      sceneTypes: ['general'] // 简化实现
    }
  }

  /**
   * 分析内容类型
   */
  private async analyzeContent(
    videoFile: VideoFile & { file: File },
    subtitleResult?: SubtitleResult
  ): Promise<{
    videoType: VideoAnalysis['videoType']
    keywords: string[]
    topics: string[]
  }> {
    const fileName = videoFile.file.name.toLowerCase()
    const duration = videoFile.duration || 0

    // 基于文件名和时长推测视频类型
    let videoType: VideoAnalysis['videoType'] = 'other'

    if (fileName.includes('电影') || fileName.includes('movie') || duration > 5400) { // > 90分钟
      videoType = 'movie'
    } else if (fileName.includes('电视') || fileName.includes('tv') || fileName.includes('剧集')) {
      videoType = 'tv_show'
    } else if (duration < 300) { // < 5分钟
      videoType = 'short_video'
    } else if (fileName.includes('纪录') || fileName.includes('documentary')) {
      videoType = 'documentary'
    } else if (fileName.includes('动画') || fileName.includes('anime')) {
      videoType = 'animation'
    } else if (fileName.includes('游戏') || fileName.includes('game')) {
      videoType = 'game'
    }

    // 从字幕中提取关键词
    const keywords: string[] = []
    if (subtitleResult && subtitleResult.segments) {
      const text = subtitleResult.segments.map(s => s.text).join(' ')
      keywords.push(...this.extractKeywords(text))
    }

    return {
      videoType,
      keywords: keywords.slice(0, 10),
      topics: this.inferTopics(videoType, keywords)
    }
  }

  /**
   * 生成综合分析报告
   */
  private generateAnalysisReport(
    basicMetrics: any,
    audioAnalysis: any,
    visualAnalysis: any,
    contentAnalysis: any
  ): VideoAnalysis {
    // 智能推荐创作意图
    const recommendedIntent = this.recommendCreativeIntent(
      contentAnalysis.videoType,
      audioAnalysis.dialogueDensity,
      visualAnalysis.complexity,
      basicMetrics.duration
    )

    // 计算推荐置信度
    const confidence = this.calculateConfidence(
      contentAnalysis,
      audioAnalysis,
      visualAnalysis
    )

    return {
      videoType: contentAnalysis.videoType,
      language: audioAnalysis.language,
      duration: basicMetrics.duration,
      dialogueDensity: audioAnalysis.dialogueDensity,
      paceRhythm: visualAnalysis.paceRhythm,
      complexity: visualAnalysis.complexity,
      hasMusic: audioAnalysis.hasMusic,
      hasCaptions: audioAnalysis.hasCaptions,
      recommendedIntent,
      confidence
    }
  }

  /**
   * 推荐最合适的创作意图
   */
  private recommendCreativeIntent(
    videoType: VideoAnalysis['videoType'],
    dialogueDensity: VideoAnalysis['dialogueDensity'],
    complexity: VideoAnalysis['complexity'],
    duration: number
  ): CreativeIntentType {
    // 基于视频类型的初步推荐
    const typeMapping: Record<VideoAnalysis['videoType'], CreativeIntentType> = {
      'movie': 'movie',
      'tv_show': 'movie',
      'documentary': 'educational',
      'animation': 'entertainment',
      'game': 'gaming',
      'short_video': 'entertainment',
      'other': 'smart'
    }

    let recommendation = typeMapping[videoType]

    // 基于其他特征的调整
    if (duration < 300 && dialogueDensity === 'high') {
      recommendation = 'entertainment' // 短视频高对话密度适合娱乐解说
    } else if (complexity === 'complex' && dialogueDensity === 'low') {
      recommendation = 'educational' // 复杂内容低对话密度适合科普
    } else if (videoType === 'other') {
      recommendation = 'smart' // 未知类型使用智能推荐
    }

    return recommendation
  }

  /**
   * 计算推荐置信度
   */
  private calculateConfidence(
    contentAnalysis: any,
    audioAnalysis: any,
    _visualAnalysis: any
  ): number {
    let confidence = 0.5 // 基础置信度

    // 根据可用信息调整置信度
    if (audioAnalysis.hasCaptions) confidence += 0.2
    if (contentAnalysis.videoType !== 'other') confidence += 0.2
    if (contentAnalysis.keywords.length > 0) confidence += 0.1

    return Math.min(confidence, 1.0)
  }

  /**
   * 简单的语言检测
   */
  private detectLanguage(text: string): string {
    const chineseCharPattern = /[\u4e00-\u9fff]/g
    const englishCharPattern = /[a-zA-Z]/g

    const chineseMatches = text.match(chineseCharPattern)?.length || 0
    const englishMatches = text.match(englishCharPattern)?.length || 0

    return chineseMatches > englishMatches ? 'zh-CN' : 'en-US'
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取（实际项目中可能需要更复杂的NLP处理）
    const commonWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '时候', '他', '来', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']

    const words = text.toLowerCase()
      .replace(/[^\u4e00-\u9fff\w\s]/g, ' ') // 保留中文和英文字母数字
      .split(/\s+/)
      .filter(word => word.length > 1 && !commonWords.includes(word))

    // 计算词频并返回高频词
    const wordCount = new Map<string, number>()
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1)
    })

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
  }

  /**
   * 推断主题标签
   */
  private inferTopics(videoType: VideoAnalysis['videoType'], keywords: string[]): string[] {
    const topics: string[] = []

    // 基于视频类型添加主题
    const typeTopics: Record<VideoAnalysis['videoType'], string[]> = {
      'movie': ['影视', '剧情', '电影'],
      'tv_show': ['电视剧', '剧集', '连续剧'],
      'documentary': ['纪录片', '科普', '教育'],
      'animation': ['动画', '动漫', '卡通'],
      'game': ['游戏', '电竞', '攻略'],
      'short_video': ['短视频', '娱乐', '搞笑'],
      'other': ['综合']
    }

    topics.push(...(typeTopics[videoType] || []))

    // 基于关键词推断更多主题
    if (keywords.some(k => ['爱情', '恋爱', '情感'].includes(k))) {
      topics.push('情感')
    }
    if (keywords.some(k => ['动作', '打斗', '战争'].includes(k))) {
      topics.push('动作')
    }
    if (keywords.some(k => ['科幻', '未来', '科技'].includes(k))) {
      topics.push('科幻')
    }

    return [...new Set(topics)] // 去重
  }

  /**
   * 获取降级分析结果（当分析失败时使用）
   */
  private getFallbackAnalysis(videoFile: VideoFile): VideoAnalysis {
    return {
      videoType: 'other',
      language: 'zh-CN',
      duration: videoFile.duration || 0,
      dialogueDensity: 'medium',
      paceRhythm: 'medium',
      complexity: 'medium',
      hasMusic: false,
      hasCaptions: false,
      recommendedIntent: 'smart',
      confidence: 0.3
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(videoFile: VideoFile & { file: File }): string {
    return `${videoFile.file.name}-${videoFile.file.size}-${videoFile.file.lastModified}`
  }

  /**
   * 清除分析缓存
   */
  clearCache(): void {
    this.analysisCache.clear()
  }
}

export default VideoAnalysisService.getInstance()
