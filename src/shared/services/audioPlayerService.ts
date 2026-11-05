

export interface AudioPlayerState {
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  error: string | null
}

export interface AudioPlayerOptions {
  autoPlay?: boolean
  volume?: number
  loop?: boolean
}

/**
 * 简化的音频播放服务
 * 使用 HTML5 Audio 元素
 */
export class AudioPlayerService {
  private static instance: AudioPlayerService | null = null
  private directAudioElement: HTMLAudioElement | null = null
  private state: AudioPlayerState = {
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    error: null
  }
  private stateListeners: Array<(state: AudioPlayerState) => void> = []

  private constructor() {}

  public static getInstance(): AudioPlayerService {
    if (!AudioPlayerService.instance) {
      AudioPlayerService.instance = new AudioPlayerService()
    }
    return AudioPlayerService.instance
  }


  /**
   * 从 URL 加载音频文件
   * 直接使用 Audio 元素，完全绕过 CORS 限制
   */
  async loadFromUrl(audioUrl: string): Promise<void> {
    this.updateState({ isLoading: true, error: null })

    this.stop()

    try {
      await this.loadWithDirectAudio(audioUrl)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '音频加载失败'

      this.updateState({
        isLoading: false,
        error: errorMessage
      })

      throw error instanceof Error ? error : new Error(errorMessage)
    }
  }


  /**
   * 使用 Audio 元素直接播放（无 CORS 限制）
   */
  private async loadWithDirectAudio(audioUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.src = audioUrl

      const onLoadedMetadata = () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        audio.removeEventListener('error', onError)

        this.directAudioElement = audio
        this.updateState({
          isLoading: false,
          duration: audio.duration || 0,
          currentTime: 0
        })

        this.setupDirectAudioListeners()
        resolve()
      }

      const onError = () => {
        audio.removeEventListener('loadedmetadata', onLoadedMetadata)
        audio.removeEventListener('error', onError)
        reject(new Error('音频链接无效或无法播放'))
      }

      audio.addEventListener('loadedmetadata', onLoadedMetadata)
      audio.addEventListener('error', onError)
      audio.load()
    })
  }

  /**
   * 设置 Audio 元素的事件监听器
   */
  private setupDirectAudioListeners(): void {
    if (!this.directAudioElement) return

    // 播放时间更新
    this.directAudioElement.addEventListener('timeupdate', () => {
      if (this.directAudioElement) {
        this.updateState({
          currentTime: this.directAudioElement.currentTime
        })
      }
    })

    // 播放结束
    this.directAudioElement.addEventListener('ended', () => {
      this.updateState({
        isPlaying: false,
        currentTime: this.directAudioElement?.duration || 0
      })
    })

    // 播放开始
    this.directAudioElement.addEventListener('play', () => {
      this.updateState({ isPlaying: true })
    })

    // 暂停
    this.directAudioElement.addEventListener('pause', () => {
      this.updateState({ isPlaying: false })
    })

    // 错误处理
    this.directAudioElement.addEventListener('error', () => {
      this.updateState({
        isPlaying: false,
        error: '音频播放错误'
      })
    })
  }

  /**
   * 播放音频
   */
  play(): void {
    if (!this.directAudioElement) {
      this.updateState({ error: '没有可播放的音频' })
      return
    }

    try {
      this.directAudioElement.play()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '播放失败'
      this.updateState({ error: errorMessage })
    }
  }


  /**
   * 暂停音频
   */
  pause(): void {
    if (this.directAudioElement && !this.directAudioElement.paused) {
      this.directAudioElement.pause()
    }
  }

  /**
   * 停止音频
   */
  stop(): void {
    if (this.directAudioElement) {
      this.directAudioElement.pause()
      this.directAudioElement.currentTime = 0
      this.directAudioElement = null
    }
    this.updateState({
      isPlaying: false,
      currentTime: 0
    })
  }

  /**
   * 跳转到指定时间
   */
  seek(time: number): void {
    if (!this.directAudioElement) return

    const duration = this.directAudioElement.duration || 0
    this.directAudioElement.currentTime = Math.max(0, Math.min(time, duration))
  }

  /**
   * 设置音量
   */
  setVolume(volume: number): void {
    if (this.directAudioElement) {
      this.directAudioElement.volume = Math.max(0, Math.min(1, volume))
    }
  }


  /**
   * 获取当前状态
   */
  getState(): AudioPlayerState {
    return { ...this.state }
  }

  /**
   * 监听状态变化
   */
  onStateChange(listener: (state: AudioPlayerState) => void): () => void {
    this.stateListeners.push(listener)
    return () => {
      const index = this.stateListeners.indexOf(listener)
      if (index > -1) {
        this.stateListeners.splice(index, 1)
      }
    }
  }

  /**
   * 更新状态并通知监听器
   */
  private updateState(updates: Partial<AudioPlayerState>): void {
    this.state = { ...this.state, ...updates }
    this.stateListeners.forEach(listener => listener(this.state))
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stop()
    this.stateListeners = []
    AudioPlayerService.instance = null
  }
}

// 导出单例实例
export const audioPlayer = AudioPlayerService.getInstance()
