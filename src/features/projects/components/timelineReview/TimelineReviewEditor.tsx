import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import {
  IconAlertTriangle,
  IconArrowsHorizontal,
  IconMovie,
  IconPlayerPause,
  IconPlayerPlay,
  IconZoomIn,
  IconZoomOut,
  IconSparkles,
} from '@tabler/icons-react'
import { formatNarrationTimelineTime } from './reviewTypes'
import type { DesktopTimelineReviewItem } from './reviewTypes'
import styles from './TimelineReviewEditor.module.css'
import { timelineNarrationRange } from './timelineNarrationRange'
import { localAudioStorageService } from '@/shared/services/localAudioStorageService'

type Translate = (source: string) => string
type DragMode = 'move' | 'resize-start' | 'resize-end'
type PreviewMode = 'sequence' | 'single' | 'source'

interface Props {
  taskId: string
  items: DesktopTimelineReviewItem[]
  sourceFile: File
  sourceDuration: number
  disabled?: boolean
  regeneratingItemId?: number | null
  onRegenerate?(itemId: number): void
  onRegenerateVoice?(itemId: number): void
  regeneratingVoiceId?: number | null
  error?: string | null
  t: Translate
  onChange(items: DesktopTimelineReviewItem[]): void
  onValidationChange?(validation: TimelineReviewValidation): void
}

interface TimelineLayout {
  item: DesktopTimelineReviewItem
  index: number
  role: 'narration' | 'original'
}

interface DragState {
  itemId: number
  pointerId: number
  mode: DragMode
  startClientX: number
  originalStart: number
  originalEnd: number
}

interface PanState {
  pointerId: number
  startClientX: number
  startScrollLeft: number
}

interface PreviewState {
  mode: PreviewMode
  itemIds: number[]
  activeIndex: number
}

interface PendingPreviewStart {
  itemId: number
  sourceTime: number
  autoplay: boolean
}

export interface TimelineReviewValidation {
  valid: boolean
  issues: string[]
}

const MIN_DURATION_SECONDS = 0.5
const MAX_PIXELS_PER_SECOND = 40
const DEFAULT_PIXELS_PER_SECOND = 4
const FILMSTRIP_FRAME_COUNT = 18

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(Math.max(value, minimum), maximum)
)

const roleOf = (item: DesktopTimelineReviewItem): 'narration' | 'original' => (
  item.text.trim() ? 'narration' : 'original'
)


const tickIntervalForScale = (pixelsPerSecond: number): number => {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return candidates.find(candidate => candidate * pixelsPerSecond >= 76) ?? 1_200
}

export const validateTimelineReviewItems = (
  items: DesktopTimelineReviewItem[],
  sourceDurationSeconds?: number,
): TimelineReviewValidation => {
  const issues: string[] = []
  let previousEnd = Number.NEGATIVE_INFINITY
  items.forEach((item, index) => {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start) {
      issues.push(`第 ${index + 1} 个片段的入点或出点无效`)
      return
    }
    if (sourceDurationSeconds && item.end > sourceDurationSeconds + 0.01) {
      issues.push(`第 ${index + 1} 个片段超出素材总时长`)
    }
    if (item.start < previousEnd - 0.01) {
      issues.push(`第 ${index + 1} 个片段与上一片段重叠或顺序倒置`)
    }
    if (roleOf(item) === 'narration' && !item.text.trim()) {
      issues.push(`第 ${index + 1} 个解说片段缺少文案`)
    }
    previousEnd = Math.max(previousEnd, item.end)
  })
  return { valid: issues.length === 0, issues }
}

const clampRange = (
  mode: DragMode,
  start: number,
  end: number,
  delta: number,
  minimum: number,
  maximum: number,
): { start: number; end: number } => {
  const snappedDelta = Math.round(delta * 10) / 10
  const duration = end - start
  if (mode === 'move') {
    const nextStart = clamp(start + snappedDelta, minimum, Math.max(minimum, maximum - duration))
    return { start: nextStart, end: nextStart + duration }
  }
  if (mode === 'resize-start') {
    return { start: clamp(start + snappedDelta, minimum, end - MIN_DURATION_SECONDS), end }
  }
  return { start, end: clamp(end + snappedDelta, start + MIN_DURATION_SECONDS, maximum) }
}

const itemDuration = (item: DesktopTimelineReviewItem): number => Math.max(0, item.end - item.start, item.voiceDuration ?? 0)

const timelineItemsDuration = (items: DesktopTimelineReviewItem[]): number => (
  items.reduce((total, item) => total + itemDuration(item), 0)
)

const previewElapsedBefore = (
  itemIds: number[],
  activeIndex: number,
  items: DesktopTimelineReviewItem[],
): number => itemIds.slice(0, activeIndex).reduce((total, itemId) => {
  const item = items.find(candidate => candidate._id === itemId)
  return total + (item ? itemDuration(item) : 0)
}, 0)

const locatePreviewElapsed = (
  items: DesktopTimelineReviewItem[],
  elapsed: number,
): { index: number; sourceTime: number; elapsed: number } | null => {
  if (!items.length) return null
  const total = timelineItemsDuration(items)
  const clampedElapsed = clamp(elapsed, 0, total)
  let remaining = clampedElapsed
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const duration = itemDuration(item)
    if (remaining < duration || index === items.length - 1) {
      return {
        index,
        sourceTime: clamp(item.start + remaining, item.start, item.end),
        elapsed: clampedElapsed,
      }
    }
    remaining -= duration
  }
  return null
}

const locateSourceTimeInPreview = (
  items: DesktopTimelineReviewItem[],
  sourceTime: number,
  snapToNext: boolean,
): { index: number; sourceTime: number; elapsed: number } | null => {
  let elapsed = 0
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (sourceTime >= item.start && sourceTime <= item.end) {
      return {
        index,
        sourceTime: clamp(sourceTime, item.start, item.end),
        elapsed: elapsed + clamp(sourceTime - item.start, 0, itemDuration(item)),
      }
    }
    if (sourceTime < item.start) {
      return snapToNext ? { index, sourceTime: item.start, elapsed } : null
    }
    elapsed += itemDuration(item)
  }
  if (!snapToNext || !items.length) return null
  const index = items.length - 1
  const item = items[index]
  return {
    index,
    sourceTime: item.start,
    elapsed: Math.max(0, elapsed - itemDuration(item)),
  }
}

export default function DesktopTimelineReviewEditor({
  items,
  sourceFile,
  sourceDuration,
  disabled = false,
  regeneratingItemId,
  onRegenerate,
  onRegenerateVoice,
  regeneratingVoiceId,
  error,
  t,
  onChange,
  onValidationChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const holdingAudioRef = useRef(false)
  const [voiceUrls, setVoiceUrls] = useState<Record<number, string>>({})
  const dragRef = useRef<DragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const playheadDragRef = useRef<number | null>(null)
  const mediaReadyRef = useRef(false)
  const pendingPreviewStartRef = useRef<PendingPreviewStart | null>(null)
  const itemIdsSignatureRef = useRef('')
  const previewStateRef = useRef<PreviewState>({
    mode: 'sequence',
    itemIds: items.map(item => item._id),
    activeIndex: 0,
  })
  const roleByIdRef = useRef(new Map(items.map(item => [item._id, roleOf(item)])))
  const [selectedId, setSelectedId] = useState(items[0]?._id ?? null)
  const [sourceDurationSeconds, setSourceDurationSeconds] = useState(
    sourceDuration,
  )
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND)
  const [viewportWidth, setViewportWidth] = useState(720)
  const [playhead, setPlayhead] = useState(items[0]?.start ?? 0)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [filmstripUrls, setFilmstripUrls] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sequence')
  const [previewElapsed, setPreviewElapsed] = useState(0)

  const duration = Math.max(1, sourceDurationSeconds, ...items.map(item => item.end))
  const canvasWidth = Math.max(viewportWidth, duration * pixelsPerSecond)
  const effectivePixelsPerSecond = canvasWidth / duration
  const fitPixelsPerSecond = viewportWidth / duration
  const maximumPixelsPerSecond = Math.max(MAX_PIXELS_PER_SECOND, fitPixelsPerSecond)
  const tickInterval = tickIntervalForScale(effectivePixelsPerSecond)
  const ticks = useMemo(() => Array.from(
    { length: Math.floor(duration / tickInterval) + 1 },
    (_, index) => index * tickInterval,
  ), [duration, tickInterval])
  const itemRole = (item: DesktopTimelineReviewItem): 'narration' | 'original' => (
    roleByIdRef.current.get(item._id) ?? roleOf(item)
  )
  const layouts = useMemo<TimelineLayout[]>(() => items.map((item, index) => ({
    item,
    index,
    role: itemRole(item),
  })), [items])
  const selectedIndex = Math.max(0, items.findIndex(item => item._id === selectedId))
  const selected = items[selectedIndex]
  const finalPreviewDuration = useMemo(() => timelineItemsDuration(items), [items])
  const voiceSignature = items.map(item => `${item._id}:${item.voiceAudioKey ?? ''}`).join('|')
  const hasGeneratedVoices = items.some(item => item.voiceText !== undefined)
  useEffect(() => {
    let active = true
    const urls: Record<number, string> = {}
    void Promise.all(items.filter(item => item.voiceAudioKey).map(async item => {
      const blob = await localAudioStorageService.getAudioBlob(item.voiceAudioKey!).catch(() => null)
      if (blob && active) urls[item._id] = URL.createObjectURL(blob)
    })).then(() => { if (active) setVoiceUrls(urls) })
    return () => {
      active = false
      audioRef.current?.pause()
      Object.values(urls).forEach(url => URL.revokeObjectURL(url))
    }
  }, [voiceSignature])
  const validation = useMemo(() => {
    const base = validateTimelineReviewItems(items, sourceDurationSeconds || undefined)
    const blankNarration = items.flatMap((item, index) => (
      itemRole(item) === 'narration' && !item.text.trim()
        ? [`第 ${index + 1} 个解说片段文案不能为空`]
        : []
    ))
    if (hasGeneratedVoices) items.forEach((item, index) => {
      if (itemRole(item) === 'narration' && (item.text.trim() !== item.voiceText?.trim() || !item.voiceAudioKey || !voiceUrls[item._id])) {
        blankNarration.push(`第 ${index + 1} 段文案与配音不一致，请重新生成本段配音`)
      }
      if ((item.voiceDuration ?? 0) > item.end - item.start + 0.05) {
        blankNarration.push(`第 ${index + 1} 段画面短于实际配音，请延长画面或调整文案后重生成配音`)
      }
    })
    return { valid: base.valid && blankNarration.length === 0, issues: [...base.issues, ...blankNarration] }
  },
    [items, sourceDurationSeconds, voiceUrls],
  )

  useEffect(() => {
    onValidationChange?.(validation)
  }, [onValidationChange, validation])

  useLayoutEffect(() => {
    const signature = items.map(item => item._id).join('|')
    if (signature === itemIdsSignatureRef.current) return
    itemIdsSignatureRef.current = signature
    items.forEach((item) => {
      if (!roleByIdRef.current.has(item._id)) roleByIdRef.current.set(item._id, roleOf(item))
    })
    const state = previewStateRef.current
    if (state.mode === 'sequence') {
      const currentId = state.itemIds[state.activeIndex]
      const activeIndex = Math.max(0, items.findIndex(item => item._id === currentId))
      previewStateRef.current = {
        mode: 'sequence',
        itemIds: items.map(item => item._id),
        activeIndex,
      }
    }
    if (items.some(item => item._id === selectedId)) return
    const first = items[0]
    setSelectedId(first?._id ?? null)
    setPreviewMode('sequence')
    setPreviewElapsed(0)
    setPlayhead(first?.start ?? 0)
    if (first && videoRef.current) videoRef.current.currentTime = first.start
  }, [items, selectedId])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    const update = () => setViewportWidth(Math.max(1, viewport.clientWidth || 720))
    update()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setSourceDurationSeconds(sourceDuration)
    const url = URL.createObjectURL(sourceFile)
    setPlaybackUrl(url)
    mediaReadyRef.current = false
    let active = true
    const frames: string[] = []
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.src = url
    let timer: ReturnType<typeof setTimeout>
    let cancelWait: (() => void) | undefined
    const wait = (event: string) => new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); video.removeEventListener(event, done); cancelWait = undefined; resolve() }
      cancelWait = () => { clearTimeout(timer); video.removeEventListener(event, done); reject(new Error('cancelled')) }
      video.addEventListener(event, done, { once: true })
      timer = setTimeout(() => cancelWait?.(), 10000)
    })
    setFilmstripUrls([])
    void (async () => {
      await wait('loadedmetadata')
      const canvas = document.createElement('canvas')
      canvas.width = 160; canvas.height = 90
      for (let i = 0; i < FILMSTRIP_FRAME_COUNT && active; i++) {
        const ready = wait('seeked')
        video.currentTime = (i + 0.5) / FILMSTRIP_FRAME_COUNT * sourceDuration
        await ready
        if (!active) return
        canvas.getContext('2d')?.drawImage(video, 0, 0, 160, 90)
        frames.push(canvas.toDataURL('image/jpeg', 0.65))
        setFilmstripUrls([...frames])
      }
    })().catch(() => undefined)
    return () => { active = false; cancelWait?.(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
  }, [sourceFile, sourceDuration])

  const replaceItem = (itemId: number, patch: Partial<DesktopTimelineReviewItem>) => {
    stopPlayback()
    onChange(items.map(item => item._id === itemId ? { ...item, ...patch } : item))
  }

  const selectItem = (item: DesktopTimelineReviewItem) => {
    audioRef.current?.pause()
    holdingAudioRef.current = false
    const video = videoRef.current
    if (video && !video.paused) video.pause()
    previewStateRef.current = { mode: 'single', itemIds: [item._id], activeIndex: 0 }
    setPreviewMode('single')
    setPreviewElapsed(0)
    setSelectedId(item._id)
    setPlayhead(item.start)
    syncVoice(item, 0, false)
    if (video) video.currentTime = item.start
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>, item: DesktopTimelineReviewItem, mode: DragMode) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    selectItem(item)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      itemId: item._id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      originalStart: item.start,
      originalEnd: item.end,
    }
  }

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (playheadDragRef.current === event.pointerId) {
        const canvas = canvasRef.current
        if (!canvas) return
        seekSourceTime((event.clientX - canvas.getBoundingClientRect().left) / effectivePixelsPerSecond)
        return
      }
      const drag = dragRef.current
      if (drag?.pointerId === event.pointerId) {
        const draggedItem = items.find(item => item._id === drag.itemId)
        if (!draggedItem) return
        const range = clampRange(
          drag.mode,
          drag.originalStart,
          drag.originalEnd,
          (event.clientX - drag.startClientX) / effectivePixelsPerSecond,
          0,
          duration,
        )
        replaceItem(drag.itemId, range)
        setPlayhead(drag.mode === 'resize-start' ? range.start : range.end)
      }
      const pan = panRef.current
      const viewport = viewportRef.current
      if (pan?.pointerId === event.pointerId && viewport) {
        viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startClientX)
      }
    }
    const finish = (event: PointerEvent) => {
      if (playheadDragRef.current === event.pointerId) playheadDragRef.current = null
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
      if (panRef.current?.pointerId === event.pointerId) {
        panRef.current = null
        setIsPanning(false)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [duration, effectivePixelsPerSecond, items, onChange, voiceUrls])

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-timeline-interactive]')) return
    const viewport = viewportRef.current
    if (!viewport) return
    event.preventDefault()
    panRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startScrollLeft: viewport.scrollLeft }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsPanning(true)
  }

  const seekSourceTime = (nextTime: number) => {
    audioRef.current?.pause()
    holdingAudioRef.current = false
    const next = clamp(nextTime, 0, duration)
    const video = videoRef.current
    if (video && !video.paused) video.pause()
    if (video) video.currentTime = next
    const mapped = locateSourceTimeInPreview(items, next, false)
    if (mapped) {
      previewStateRef.current = {
        mode: 'sequence',
        itemIds: items.map(item => item._id),
        activeIndex: mapped.index,
      }
      setPreviewMode('sequence')
      setPreviewElapsed(mapped.elapsed)
      setSelectedId(items[mapped.index]._id)
      syncVoice(items[mapped.index], next - items[mapped.index].start, false)
    } else {
      if (video) video.muted = true
      previewStateRef.current = { mode: 'source', itemIds: [], activeIndex: 0 }
      setPreviewMode('source')
      setPreviewElapsed(0)
    }
    setPlayhead(next)
  }

  const startPlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    playheadDragRef.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const canvas = canvasRef.current
    if (canvas) {
      seekSourceTime((event.clientX - canvas.getBoundingClientRect().left) / effectivePixelsPerSecond)
    }
  }

  const movePlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (playheadDragRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (canvas) {
      seekSourceTime((event.clientX - canvas.getBoundingClientRect().left) / effectivePixelsPerSecond)
    }
  }

  const finishPlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (playheadDragRef.current !== event.pointerId) return
    playheadDragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
  }

  const zoomTimeline = (factor: number, anchorOffset?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const offset = clamp(anchorOffset ?? viewport.clientWidth / 2, 0, viewport.clientWidth)
    const anchorTime = (viewport.scrollLeft + offset) / effectivePixelsPerSecond
    const nextScale = clamp(
      effectivePixelsPerSecond * factor,
      fitPixelsPerSecond,
      maximumPixelsPerSecond,
    )
    setPixelsPerSecond(nextScale)
    const updateScroll = () => {
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = Math.max(0, anchorTime * nextScale - offset)
      }
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(updateScroll)
    else updateScroll()
  }

  const handleTimelineWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.deltaY && !event.deltaX) return
    event.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const anchorOffset = clamp(event.clientX - rect.left, 0, viewport.clientWidth)
    zoomTimeline(event.deltaY < 0 || event.deltaX < 0 ? 1.2 : 1 / 1.2, anchorOffset)
  }

  const activatePreviewItem = async (
    state: PreviewState,
    item: DesktopTimelineReviewItem,
    sourceTime: number,
    elapsed: number,
    autoplay = true,
  ) => {
    const video = videoRef.current
    if (!video) return
    if (!autoplay) video.pause()
    previewStateRef.current = state
    setPreviewMode(state.mode)
    setPreviewElapsed(elapsed)
    setSelectedId(item._id)
    setPlayhead(sourceTime)
    holdingAudioRef.current = false
    syncVoice(item, Math.max(0, elapsed - previewElapsedBefore(state.itemIds, state.activeIndex, items)), autoplay && video.readyState > 0)
    const pending = { itemId: item._id, sourceTime, autoplay }
    if (!mediaReadyRef.current && video.readyState === 0) {
      pendingPreviewStartRef.current = pending
      video.currentTime = sourceTime
      return
    }
    mediaReadyRef.current = true
    pendingPreviewStartRef.current = null
    video.currentTime = sourceTime
    if (autoplay) await video.play()
  }

  const playItem = async (item: DesktopTimelineReviewItem) => {
    await activatePreviewItem(
      { mode: 'single', itemIds: [item._id], activeIndex: 0 },
      item,
      item.start,
      0,
    )
  }

  const seekFinalPreview = async (nextElapsed: number, autoplay = false) => {
    const location = locatePreviewElapsed(items, nextElapsed)
    if (!location) return
    const item = items[location.index]
    await activatePreviewItem(
      { mode: 'sequence', itemIds: items.map(candidate => candidate._id), activeIndex: location.index },
      item,
      location.sourceTime,
      location.elapsed,
      autoplay,
    )
  }

  const playAll = async () => {
    const video = videoRef.current
    if (!video || !items.length) return
    const state = previewStateRef.current
    const activeId = state.itemIds[state.activeIndex]
    const active = items.find(item => item._id === activeId)
    const canResume = state.mode === 'sequence'
      && active
      && previewElapsed < finalPreviewDuration - 0.04
      && video.currentTime >= active.start - 0.04
      && video.currentTime < active.end - 0.04
    if (canResume) {
      syncVoice(active, Math.max(0, video.currentTime - active.start), true)
      await video.play()
      return
    }
    const location = locateSourceTimeInPreview(items, playhead, true)
    const nextElapsed = location?.elapsed ?? 0
    await seekFinalPreview(nextElapsed < finalPreviewDuration - 0.04 ? nextElapsed : 0, true)
  }

  const stopPlayback = () => {
    holdingAudioRef.current = false
    audioRef.current?.pause()
    videoRef.current?.pause()
    setPlaying(false)
  }

  const syncVoice = (item: DesktopTimelineReviewItem, elapsed: number, autoplay: boolean) => {
    // Reapply routing on every seek/resume, not just automatic clip transitions.
    const narration = itemRole(item) === 'narration'
    if (videoRef.current) videoRef.current.muted = narration
    const audio = audioRef.current
    if (!audio) return
    if (!narration) { audio.pause(); audio.muted = true; return }
    audio.muted = false
    const url = voiceUrls[item._id]
    if (!url || item.text.trim() !== item.voiceText?.trim()) { audio.pause(); return }
    if (audio.getAttribute('src') !== url) audio.src = url
    audio.currentTime = Math.min(elapsed, item.voiceDuration ?? elapsed)
    if (autoplay && elapsed < (item.voiceDuration ?? 0)) void audio.play().catch(() => setPlaying(false))
    else audio.pause()
  }

  const playCurrentPreview = async () => {
    const video = videoRef.current
    const state = previewStateRef.current
    if (!video) return
    if (state.mode === 'source') {
      const snapped = locateSourceTimeInPreview(items, playhead, true)
      if (snapped) await seekFinalPreview(snapped.elapsed, true)
      return
    }
    if (state.mode === 'single') {
      const current = items.find(item => item._id === state.itemIds[0])
      if (current && video.currentTime >= current.start && video.currentTime < current.end - 0.04) {
        syncVoice(current, Math.max(0, video.currentTime - current.start), true)
        await video.play()
        return
      }
      if (current) {
        await playItem(current)
        return
      }
    }
    await playAll()
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    const state = previewStateRef.current
    if (!video || video.seeking || playheadDragRef.current !== null) return
    if (state.mode === 'source') {
      setPlayhead(video.currentTime)
      return
    }
    const currentId = state.itemIds[state.activeIndex]
    const current = items.find(item => item._id === currentId)
    if (!current) return
    // Metadata/seek events can report zero before the requested frame is loaded.
    if (video.currentTime < current.start - 0.04) {
      if (mediaReadyRef.current) video.currentTime = current.start
      return
    }
    setPlayhead(video.currentTime)
    const elapsedBefore = previewElapsedBefore(state.itemIds, state.activeIndex, items)
    const localElapsed = holdingAudioRef.current ? (audioRef.current?.currentTime ?? 0) : video.currentTime - current.start
    setPreviewElapsed(elapsedBefore + clamp(localElapsed, 0, itemDuration(current)))
    if (video.currentTime < current.end - 0.04) return
    if (current.voiceDuration && localElapsed < current.voiceDuration - 0.04 && voiceUrls[current._id]
      && current.text.trim() === current.voiceText?.trim()) {
      holdingAudioRef.current = true
      video.pause()
      if (Math.abs(video.currentTime - current.end) > 0.04) video.currentTime = current.end
      return
    }
    holdingAudioRef.current = false
    const nextIndex = state.activeIndex + 1
    const nextId = state.itemIds[nextIndex]
    const next = items.find(item => item._id === nextId)
    if (!next) {
      video.pause()
      audioRef.current?.pause()
      setPlaying(false)
      if (Math.abs(video.currentTime - current.end) > 0.04) video.currentTime = current.end
      setPlayhead(current.end)
      setPreviewElapsed(state.mode === 'sequence' ? finalPreviewDuration : itemDuration(current))
      return
    }
    previewStateRef.current = { ...state, activeIndex: nextIndex }
    setSelectedId(next._id)
    video.currentTime = next.start
    syncVoice(next, 0, true)
    void video.play()
  }

  useEffect(() => {
    if (!playing) return
    let frame: number
    const tick = () => { handleTimeUpdate(); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, items, voiceUrls])

  const handlePreviewLoaded = () => {
    mediaReadyRef.current = true
    const state = previewStateRef.current
    const video = videoRef.current
    if (!video) return
    const pending = pendingPreviewStartRef.current
    if (pending) {
      pendingPreviewStartRef.current = null
      const item = items.find(candidate => candidate._id === pending.itemId)
      video.currentTime = pending.sourceTime
      if (item) syncVoice(item, Math.max(0, pending.sourceTime - item.start), pending.autoplay)
      if (pending.autoplay) void video.play()
      return
    }
    if (state.mode === 'source') {
      video.currentTime = playhead
      return
    }
    const current = items.find(item => item._id === state.itemIds[state.activeIndex]) ?? items[0]
    if (!current || !video) return
    const elapsedBefore = state.mode === 'sequence'
      ? previewElapsedBefore(state.itemIds, state.activeIndex, items)
      : 0
    const localElapsed = clamp(previewElapsed - elapsedBefore, 0, itemDuration(current))
    const sourceTime = Math.min(current.end, current.start + localElapsed)
    video.currentTime = sourceTime
    syncVoice(current, localElapsed, false)
    setSelectedId(current._id)
    setPlayhead(sourceTime)
  }

  if (!selected) return <Text size="sm" c="dimmed">{t('暂无可审核的成片时间线')}</Text>

  const selectedRole = itemRole(selected)
  const selectedRange = timelineNarrationRange(selected)
  const selectedInvalid = selectedRole === 'narration' && !selectedRange.valid
  const selectedDuration = selected.end - selected.start
  const previewTotal = previewMode === 'single' ? itemDuration(selected) : finalPreviewDuration
  const previewCurrent = previewMode === 'single'
    ? clamp(previewElapsed, 0, itemDuration(selected))
    : clamp(previewElapsed, 0, finalPreviewDuration)
  const selectedOutsideEvidence = selectedRole === 'narration'
    && Number.isFinite(selected.source_start)
    && Number.isFinite(selected.source_end)
    && (selected.start < selected.source_start! - 0.01 || selected.end > selected.source_end! + 0.01)

  const warningKey = JSON.stringify([error, validation.issues])
  const hasWarning = !validation.valid || Boolean(error)

  return (
    <Stack gap="md" className={styles.reviewContent} data-testid="desktop-timeline-review-editor">
      <audio ref={audioRef} onEnded={handleTimeUpdate} />
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Text size="sm" fw={600}>{t('成片画面时间轴')}</Text>
          <Badge color="teal" variant="light">{`${items.filter(item => itemRole(item) === 'original').length} ${t('段原片')}`}</Badge>
          <Badge color="blue" variant="light">{`${items.filter(item => itemRole(item) === 'narration').length} ${t('段解说')}`}</Badge>
        </Group>
        <Group gap="xs">
          {hasWarning && dismissedWarning === warningKey ? (
            <Tooltip label={t('查看时间线问题')}><ActionIcon color="red" variant="light" aria-label={t('查看时间线问题')}
              onClick={() => setDismissedWarning(null)}><IconAlertTriangle size={17} /></ActionIcon></Tooltip>
          ) : null}
          <Button
            size="xs"
            variant="light"
            data-testid="final-preview-play-all"
            leftSection={playing ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
            disabled={!playbackUrl}
            onClick={() => playing ? stopPlayback() : void playAll()}
          >
            {playing ? t('暂停预览') : t('播放成片预览')}
          </Button>
          <Tooltip label={t('缩小时间轴')}><ActionIcon aria-label={t('缩小时间轴')} variant="default" size="sm" onClick={() => zoomTimeline(1 / 1.5)}><IconZoomOut size={15} /></ActionIcon></Tooltip>
          <Tooltip label={t('适应窗口')}><ActionIcon aria-label={t('适应窗口')} variant="default" size="sm" onClick={() => {
            setPixelsPerSecond(fitPixelsPerSecond)
            if (viewportRef.current) viewportRef.current.scrollLeft = 0
          }}><IconArrowsHorizontal size={15} /></ActionIcon></Tooltip>
          <Tooltip label={t('放大时间轴')}><ActionIcon aria-label={t('放大时间轴')} variant="default" size="sm" onClick={() => zoomTimeline(1.5)}><IconZoomIn size={15} /></ActionIcon></Tooltip>
        </Group>
      </Group>

      {hasWarning && dismissedWarning !== warningKey ? (
          <Alert className={styles.validationToast} data-testid="timeline-validation-toast"
            color="red" radius="sm" p="sm" withCloseButton closeButtonLabel={t('收起错误提示')}
            onClose={() => setDismissedWarning(warningKey)} icon={<IconAlertTriangle size={17} />} title={t('时间线需要调整后才能继续')}>
            {error ? <Text size="xs">{error}</Text> : null}
            {validation.issues.map(issue => <Text key={issue} size="xs">{issue}</Text>)}
          </Alert>
      ) : null}

      <div className={styles.timelineShell}>
        <div className={styles.labels} aria-hidden="true">
          <div>{t('时间')}</div>
          <div><IconMovie size={15} />{t('素材')}</div>
          <div>{t('原片 / 解说')}</div>
        </div>
        <div ref={viewportRef} className={styles.viewport} data-testid="final-timeline-viewport" onWheel={handleTimelineWheel}>
          <div
            ref={canvasRef}
            data-testid="final-timeline-canvas"
            className={`${styles.canvas} ${isPanning ? styles.panning : ''}`}
            style={{ width: canvasWidth, '--grid-width': `${tickInterval * effectivePixelsPerSecond}px` } as CSSProperties}
            onPointerDown={startPan}
          >
            <div
              className={styles.ruler}
              data-timeline-interactive
              onPointerDown={startPlayheadDrag}
              onPointerMove={movePlayheadDrag}
              onPointerUp={finishPlayheadDrag}
              onPointerCancel={finishPlayheadDrag}
            >
              {ticks.map(tick => <span key={tick} style={{ left: tick * effectivePixelsPerSecond }}>{formatNarrationTimelineTime(tick)}</span>)}
            </div>
            <div className={styles.filmstrip}>
              {(filmstripUrls.length ? filmstripUrls : Array.from({ length: FILMSTRIP_FRAME_COUNT }, () => '')).map((url, index) => (
                <div key={`${index}-${url}`} style={{ width: `${100 / FILMSTRIP_FRAME_COUNT}%`, ...(url ? { backgroundImage: `url(${url})` } : {}) }} />
              ))}
            </div>
            <div className={styles.clipTrack}>
              {layouts.map(({ item, index, role }) => {
                const isSelected = item._id === selected._id
                return (
                  <div
                    key={item._id}
                    className={`${styles.clip} ${role === 'narration' ? styles.narration : styles.original} ${isSelected ? styles.selected : ''} ${role === 'narration' && !timelineNarrationRange(item).valid ? styles.invalid : ''}`}
                    data-invalid={role === 'narration' && !timelineNarrationRange(item).valid}
                    style={{ left: item.start * effectivePixelsPerSecond, width: Math.max(14, (item.end - item.start) * effectivePixelsPerSecond) }}
                    data-timeline-interactive
                    data-testid={`final-timeline-clip-${item._id}`}
                  >
                    <button type="button" disabled={disabled} className={styles.clipBody} onPointerDown={event => startDrag(event, item, 'move')} onDoubleClick={() => void playItem(item)}>
                      <strong>{`${index + 1}. ${role === 'narration' ? t('解说') : t('原片')}`}</strong>
                      <span>{role === 'narration' ? item.text : t('保留原片声音')}</span>
                    </button>
                    <button type="button" aria-label={t('调整片段入点')} disabled={disabled} className={`${styles.handle} ${styles.handleStart}`} onPointerDown={event => startDrag(event, item, 'resize-start')} />
                    <button type="button" aria-label={t('调整片段出点')} disabled={disabled} className={`${styles.handle} ${styles.handleEnd}`} onPointerDown={event => startDrag(event, item, 'resize-end')} />
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              role="slider"
              aria-label={t('时间轴播放头')}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={Number(playhead.toFixed(1))}
              aria-valuetext={formatNarrationTimelineTime(playhead)}
              className={styles.playhead}
              style={{ left: playhead * effectivePixelsPerSecond }}
              data-timeline-interactive
              onPointerDown={startPlayheadDrag}
              onPointerMove={movePlayheadDrag}
              onPointerUp={finishPlayheadDrag}
              onPointerCancel={finishPlayheadDrag}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const step = event.shiftKey ? 1 : 0.1
                seekSourceTime(playhead + (event.key === 'ArrowLeft' ? -step : step))
              }}
            ><span /></button>
          </div>
        </div>
      </div>

      <section className={styles.editor}>
        <div className={`${styles.preview} ${selectedInvalid ? styles.invalid : ''}`}>
          {playbackUrl ? (
            <>
              <video
                ref={videoRef}
                src={playbackUrl}
                preload="metadata"
                playsInline
                aria-label={t('成片画面预览')}
                data-testid="final-cut-preview"
                onLoadedMetadata={handlePreviewLoaded}
                onPlay={() => {
                  setPlaying(true)
                  const state = previewStateRef.current
                  const active = items.find(item => item._id === state.itemIds[state.activeIndex])
                  if (active) syncVoice(active, Math.max(0, videoRef.current!.currentTime - active.start), true)
                }}
                onPause={() => { if (!holdingAudioRef.current) { setPlaying(false); audioRef.current?.pause() } }}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleTimeUpdate}
                onClick={() => playing ? stopPlayback() : void playCurrentPreview()}
              />
              {!playing ? (
                <button
                  type="button"
                  className={styles.previewCenterButton}
                  aria-label={t('播放成片预览')}
                  data-testid="final-preview-center-play"
                  onClick={() => void playCurrentPreview()}
                ><IconPlayerPlay size={28} /></button>
              ) : null}
              <div className={styles.previewControls}>
                <ActionIcon
                  size="md"
                  radius="xl"
                  variant="filled"
                  color="blue"
                  aria-label={playing ? t('暂停成片预览') : t('播放成片预览')}
                  onClick={() => playing ? stopPlayback() : void playCurrentPreview()}
                >{playing ? <IconPlayerPause size={17} /> : <IconPlayerPlay size={17} />}</ActionIcon>
                <input
                  type="range"
                  aria-label={previewMode === 'single' ? t('本段预览进度') : t('成片预览进度')}
                  min={0}
                  max={Math.max(0.1, previewTotal)}
                  step={0.1}
                  value={previewCurrent}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value)
                    if (previewMode === 'single') {
                      const video = videoRef.current
                      const bounded = clamp(next, 0, itemDuration(selected))
                      if (video) video.currentTime = Math.min(selected.end, selected.start + bounded)
                      syncVoice(selected, bounded, Boolean(video && !video.paused))
                      setPlayhead(Math.min(selected.end, selected.start + bounded))
                      setPreviewElapsed(bounded)
                      return
                    }
                    void seekFinalPreview(next, Boolean(videoRef.current && !videoRef.current.paused))
                  }}
                />
                <span>{`${formatNarrationTimelineTime(previewCurrent)} / ${formatNarrationTimelineTime(previewTotal)}`}</span>
              </div>
            </>
          ) : <div className={styles.previewEmpty}><IconMovie size={36} /><span>{t('视频预览不可用')}</span></div>}
          <div className={styles.previewLabel}>{`${selectedRole === 'narration' ? t('解说画面') : t('原片')} · ${formatNarrationTimelineTime(selected.start)} - ${formatNarrationTimelineTime(selected.end)}`}</div>
        </div>
        <Stack gap="sm" className={styles.editorBody}>
          <Group justify="space-between">
            <div>
              <Text fw={600}>{`${t('第')} ${selectedIndex + 1} ${t('段')} · ${selectedRole === 'narration' ? t('解说') : t('原片')}`}</Text>
              <Text size="xs" c="dimmed">{`${t('画面时长')} ${selectedDuration.toFixed(1)}s`}</Text>
            </div>
            <Button size="xs" variant="light" leftSection={<IconPlayerPlay size={15} />} disabled={!playbackUrl} onClick={() => void playItem(selected)}>{t('播放本段')}</Button>
          </Group>
          <Group grow wrap="nowrap">
            <NumberInput label={t('画面入点（秒）')} value={Number(selected.start.toFixed(1))} min={0} max={selected.end - MIN_DURATION_SECONDS} step={0.1} decimalScale={1} disabled={disabled} onChange={(value) => {
              const start = Number(value)
              if (Number.isFinite(start)) replaceItem(selected._id, { start })
            }} />
            <NumberInput label={t('画面出点（秒）')} value={Number(selected.end.toFixed(1))} min={selected.start + MIN_DURATION_SECONDS} max={duration} step={0.1} decimalScale={1} disabled={disabled} onChange={(value) => {
              const end = Number(value)
              if (Number.isFinite(end)) replaceItem(selected._id, { end })
            }} />
          </Group>
          {selectedRole === 'narration' ? (
            <>
              <Group justify="space-between">
                <Badge color={selectedInvalid ? 'red' : 'blue'} variant="light">
                  {`${selectedRange.actual} 字 · 目标 ${selectedRange.target} · 允许 ${selectedRange.minimum}-${selectedRange.maximum}`}
                </Badge>
                <Button size="xs" variant="light" leftSection={<IconPlayerPlay size={15} />}
                  loading={regeneratingVoiceId === selected._id}
                  disabled={disabled || !selected.text.trim() || !onRegenerateVoice}
                  onClick={() => onRegenerateVoice?.(selected._id)}>{t('重新生成本段配音')}</Button>
                <Button size="xs" variant="light" leftSection={<IconSparkles size={15} />}
                  loading={regeneratingItemId === selected._id}
                  disabled={disabled || !onRegenerate}
                  onClick={() => onRegenerate?.(selected._id)}>{t('AI 重写本段')}</Button>
              </Group>
              {hasGeneratedVoices ? <Text size="xs" c={selected.text.trim() === selected.voiceText?.trim() ? 'dimmed' : 'red'}>
                {selected.text.trim() !== selected.voiceText?.trim() ? t('文案已修改，请重新生成本段配音')
                  : `${t('实际配音')} ${(selected.voiceDuration ?? 0).toFixed(1)}s`}
              </Text> : null}
              {Number.isFinite(selected.source_start) && Number.isFinite(selected.source_end) ? (
                <Text size="xs" c="dimmed">
                  {`${t('AI 证据参考范围')} ${formatNarrationTimelineTime(selected.source_start!)} - ${formatNarrationTimelineTime(selected.source_end!)}`}
                </Text>
              ) : null}
              {selectedOutsideEvidence ? (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                  {t('当前人工调整超出 AI 证据参考范围，请确认画面仍与这段解说匹配。')}
                </Alert>
              ) : null}
              <Textarea aria-label={t('解说文案')} rows={4} styles={{ input: { resize: 'none', overflowY: 'auto' } }} value={selected.text} disabled={disabled}
                error={selectedInvalid ? t('字数偏离建议范围，可接受偏差并继续，也可手动修改或使用 AI 重写') : undefined}
                data-i18n-skip onChange={event => replaceItem(selected._id, { text: event.currentTarget.value })} />
            </>
          ) : (
            <Alert color="teal" variant="light">{t('该片段保留原片声音，拖动片段或左右手柄可调整画面区间。')}</Alert>
          )}
        </Stack>
      </section>
    </Stack>
  )
}
