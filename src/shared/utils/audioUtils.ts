/**
 * 音频工具函数
 * 处理音频相关的操作，如获取时长、格式转换等
 */

/**
 * 获取音频Blob的时长
 * @param audioBlob 音频Blob对象
 * @returns Promise<number> 音频时长（秒）
 */
export function getAudioDuration(audioBlob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    // 检查是否为 mediabunny 预设的时长信息
    if ((audioBlob as any).duration !== undefined) {
      resolve((audioBlob as any).duration)
      return
    }

    // 创建临时的URL对象
    const url = URL.createObjectURL(audioBlob)

    // 创建audio元素
    const audio = new Audio()

    // 设置事件监听器
    const cleanup = () => {
      URL.revokeObjectURL(url)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onError)
    }

    const onLoadedMetadata = () => {
      cleanup()
      resolve(audio.duration)
    }

    const onError = () => {
      cleanup()
      reject(new Error('无法加载音频文件获取时长'))
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('error', onError)

    // 开始加载音频
    audio.src = url

    // 设置超时，防止永久等待
    setTimeout(() => {
      if (!audio.duration) {
        cleanup()
        reject(new Error('获取音频时长超时'))
      }
    }, 10000) // 10秒超时
  })
}

/**
 * 获取远程音频 URL 的时长
 * @param audioUrl 音频 URL
 * @returns Promise<number> 音频时长（秒）
 */
export function getAudioDurationFromUrl(audioUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    let settled = false

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('error', onError)
      clearTimeout(timeoutId)
    }

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const onLoadedMetadata = () => {
      finish(() => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          resolve(audio.duration)
        } else {
          reject(new Error('音频时长无效'))
        }
      })
    }

    const onError = () => {
      finish(() => reject(new Error('无法加载音频文件获取时长')))
    }

    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error('获取音频时长超时')))
    }, 10000)

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('error', onError)
    audio.src = audioUrl
    audio.load()
  })
}

/**
 * 批量获取音频时长
 * @param audioBlobs 音频Blob数组，键为ID，值为Blob
 * @returns Promise<Map<string | number, number>> 音频时长映射
 */
export async function getBatchAudioDurations(
  audioBlobs: Map<string | number, Blob>
): Promise<Map<string | number, number>> {
  const durations = new Map<string | number, number>()
  const promises: Promise<void>[] = []
  
  for (const [id, blob] of audioBlobs.entries()) {
    const promise = getAudioDuration(blob)
      .then(duration => {
        durations.set(id, duration)
      })
      .catch(_error => {
        // 设置默认值为0，表示获取失败
        durations.set(id, 0)
      })
    
    promises.push(promise)
  }
  
  await Promise.all(promises)
  return durations
}

/**
 * 检查音频格式是否支持
 * @param audioBlob 音频Blob对象
 * @returns boolean 是否支持该音频格式
 */
export function isAudioFormatSupported(audioBlob: Blob): boolean {
  const audio = new Audio()
  return audio.canPlayType(audioBlob.type) !== ''
}

/**
 * 获取音频文件的基本信息
 * @param audioBlob 音频Blob对象
 * @returns Promise<AudioInfo> 音频信息
 */
export interface AudioInfo {
  duration: number // 时长（秒）
  size: number // 文件大小（字节）
  type: string // MIME类型
  isSupported: boolean // 浏览器是否支持播放
}

export async function getAudioInfo(audioBlob: Blob): Promise<AudioInfo> {
  const duration = await getAudioDuration(audioBlob)
  
  return {
    duration,
    size: audioBlob.size,
    type: audioBlob.type,
    isSupported: isAudioFormatSupported(audioBlob)
  }
}

/**
 * 创建音频波形数据（简单版本）
 * @param audioBlob 音频Blob对象
 * @param samples 采样点数量
 * @returns Promise<number[]> 波形数据数组
 */
export async function createSimpleWaveform(audioBlob: Blob, samples: number = 100): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader()
    
    fileReader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer
        
        // 创建音频上下文
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioContextClass()
        
        // 解码音频数据
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        
        // 获取第一个声道的数据
        const channelData = audioBuffer.getChannelData(0)
        const sampleSize = Math.floor(channelData.length / samples)
        const waveform: number[] = []
        
        // 对数据进行采样
        for (let i = 0; i < samples; i++) {
          const start = i * sampleSize
          const end = start + sampleSize
          let sum = 0
          let count = 0
          
          // 计算这个区间内的平均绝对值
          for (let j = start; j < end && j < channelData.length; j++) {
            sum += Math.abs(channelData[j])
            count++
          }
          
          waveform.push(count > 0 ? sum / count : 0)
        }
        
        // 关闭音频上下文
        audioContext.close()
        
        resolve(waveform)
      } catch (error) {
        reject(new Error(`创建音频波形失败: ${error}`))
      }
    }
    
    fileReader.onerror = () => {
      reject(new Error('读取音频文件失败'))
    }
    
    fileReader.readAsArrayBuffer(audioBlob)
  })
}

/**
 * 验证音频文件的有效性
 * @param audioBlob 音频Blob对象
 * @returns Promise<boolean> 音频文件是否有效
 */
export async function validateAudioFile(audioBlob: Blob): Promise<boolean> {
  try {
    const duration = await getAudioDuration(audioBlob)
    return duration > 0 && isFinite(duration)
  } catch {
    return false
  }
}

/**
 * 比较两个音频的时长差异
 * @param duration1 第一个音频时长
 * @param duration2 第二个音频时长
 * @returns 时长差异的绝对值
 */
export function calculateDurationDifference(duration1: number, duration2: number): number {
  return Math.abs(duration1 - duration2)
}

/**
 * 检查时长差异是否在容忍范围内
 * @param duration1 第一个时长
 * @param duration2 第二个时长
 * @param tolerance 容忍阈值（秒）
 * @returns 是否在容忍范围内
 */
export function isWithinTolerance(duration1: number, duration2: number, tolerance: number = 0.5): boolean {
  return calculateDurationDifference(duration1, duration2) <= tolerance
}
