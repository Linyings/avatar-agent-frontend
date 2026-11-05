import { describe, expect, it } from 'vitest'
import {
  NARRATION_CHARACTERS_PER_SELECTED_EVENT,
  computeAdvertisementRanges,
  normalizeStorySegments,
  selectSegmentsForCut,
} from '../../services/frameSegmentSelector'

const buildPool = (count: number) => normalizeStorySegments({
  events: Array.from({ length: count }, (_, index) => {
    const start = 104.64 + index * 20
    return {
      event_id: `event-${String(index + 1).padStart(3, '0')}`,
      start,
      end: start + 18,
      description: `剧情事件 ${index + 1}`,
      importance: index < Math.ceil(count / 3) ? 'high' : index < Math.ceil(count * 2 / 3) ? 'medium' : 'low',
      evidence: [`subtitle-${index + 1}`],
    }
  }),
  subtitleSegments: [],
  sourceDurationSeconds: 3600,
}).pool

describe('normalizeStorySegments', () => {
  it('culls events with invalid timestamps and reports reasons', () => {
    const { pool, exclusions, rawCount } = normalizeStorySegments({
      events: [
        { event_id: 'a', start: 10, end: 20, description: '正常事件' },
        { event_id: 'b', description: '缺时间戳' },
        { event_id: 'c', start: 30, end: 10, description: '倒序事件' },
        { event_id: 'd', start: 0, end: 50, description: '片头曲呈现主创名单' },
        { event_id: 'e', start: 60, end: 70 },
      ],
      subtitleSegments: [],
      sourceDurationSeconds: 3600,
    })
    expect(rawCount).toBe(5)
    expect(pool.map(item => item.event_id)).toEqual(['a'])
    expect(exclusions.map(item => item.reason)).toEqual([
      'missing_start', 'reversed_range', 'opening_or_ending_song', 'missing_description',
    ])
  })

  it('removes advertisement events before they can become narration or original footage', () => {
    const { pool, exclusions } = normalizeStorySegments({
      events: [
        { event_id: 'plot', start: 10, end: 20, description: '福贵回家面对家人' },
        { event_id: 'gambling-ad', start: 30, end: 40, description: '博彩平台注册送体验金' },
        { event_id: 'website-ad', start: 50, end: 60, description: '扫描二维码访问网站观看全集' },
        { event_id: 'inserted-ad', start: 70, end: 80, description: '与剧情无关的插播内容', type: 'advertisement' },
      ],
      subtitleSegments: [],
      sourceDurationSeconds: 120,
    })

    expect(pool.map(item => item.event_id)).toEqual(['plot'])
    expect(exclusions).toEqual([
      { event_id: 'gambling-ad', reason: 'advertisement' },
      { event_id: 'website-ad', reason: 'advertisement' },
      { event_id: 'inserted-ad', reason: 'advertisement' },
    ])
  })
})

  it('builds padded advertisement ranges from event evidence and subtitles', () => {
    const ranges = computeAdvertisementRanges({
      events: [
        { event_id: 'event-ad', start: 30, end: 40, description: '博彩平台注册送体验金' },
      ],
      subtitleSegments: [
        { startTime: 50, endTime: 55, text: '扫码访问网站观看全集' },
      ],
      sourceDurationSeconds: 100,
    })

    expect(ranges).toEqual([
      { start: 29, end: 41, type: 'advertisement' },
      { start: 49, end: 56, type: 'advertisement' },
    ])
  })

describe('selectSegmentsForCut', () => {
  it('selects 10 of 33 events at 30% and splits them 5/5 at 50%', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(33), selectionRatio: 0.3, narrationRatio: 0.5 })

    expect(selection.keepCount).toBe(10)
    expect(selection.narrationSegments).toHaveLength(5)
    expect(selection.originalSegments).toHaveLength(5)
    expect(selection.narrationSegments.length * NARRATION_CHARACTERS_PER_SELECTED_EVENT).toBe(400)
  })

  it('splits seven selected events into three narration and four original events at 50%', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(7), selectionRatio: 1, narrationRatio: 0.5 })

    expect(selection.keepCount).toBe(7)
    expect(selection.narrationSegments).toHaveLength(3)
    expect(selection.originalSegments).toHaveLength(4)
  })

  it('selects by priority and splits by both ratios (N=30, s1=0.3, s2=0.5)', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(30), selectionRatio: 0.3, narrationRatio: 0.5 })
    expect(selection.keepCount).toBe(9)
    expect(selection.narrationSegments).toHaveLength(4)
    expect(selection.originalSegments).toHaveLength(5)
    expect(selection.narrationSegments.every(item => item.priority === 'high')).toBe(true)
    expect(selection.estimatedDurationMs).toBeGreaterThan(0)
    expect(selection.skeleton).toHaveLength(9)
    expect(selection.skeleton.every(item => item.softCharacters > 0)).toBe(true)
  })

  it('scales with the sliders (N=40, s1=0.5, s2=0.6 → 20 → 12/8)', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(40), selectionRatio: 0.5, narrationRatio: 0.6 })
    expect(selection.keepCount).toBe(20)
    expect(selection.narrationSegments).toHaveLength(12)
    expect(selection.originalSegments).toHaveLength(8)
  })

  it('keeps at least one narration segment for a positive ratio', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(3), selectionRatio: 0.34, narrationRatio: 0.5 })
    expect(selection.keepCount).toBe(2)
    expect(selection.narrationSegments).toHaveLength(1)
    expect(selection.originalSegments).toHaveLength(1)
  })

  it('orders the skeleton chronologically', () => {
    const selection = selectSegmentsForCut({ pool: buildPool(12), selectionRatio: 0.5, narrationRatio: 0.5 })
    const starts = selection.skeleton.map(item => item.start)
    expect([...starts].sort((left, right) => left - right)).toEqual(starts)
  })

  it('derives narration characters from selected event count, not source window duration', () => {
    const normalized = normalizeStorySegments({
      events: [
        { event_id: 'short', start: 10, end: 20, description: '短事件', importance: 'high' },
        { event_id: 'long', start: 100, end: 400, description: '长事件', importance: 'high' },
      ],
      subtitleSegments: [],
      sourceDurationSeconds: 600,
    })

    const selection = selectSegmentsForCut({
      pool: normalized.pool,
      selectionRatio: 1,
      narrationRatio: 1,
    })
    const narrationBudgets = selection.skeleton
      .filter(item => item.type === 'narration')
      .map(item => item.softCharacters)

    expect(narrationBudgets).toEqual([
      NARRATION_CHARACTERS_PER_SELECTED_EVENT,
      NARRATION_CHARACTERS_PER_SELECTED_EVENT,
    ])
    expect(narrationBudgets.reduce((total, value) => total + value, 0)).toBe(160)
  })

  it('supports narration-only and original-only modes', () => {
    const narrationOnly = selectSegmentsForCut({ pool: buildPool(10), selectionRatio: 0.3, narrationRatio: 1 })
    expect(narrationOnly.originalSegments).toHaveLength(0)
    expect(narrationOnly.narrationSegments).toHaveLength(3)
    const originalOnly = selectSegmentsForCut({ pool: buildPool(10), selectionRatio: 0.3, narrationRatio: 0 })
    expect(originalOnly.narrationSegments).toHaveLength(0)
    expect(originalOnly.originalSegments).toHaveLength(3)
  })

  it('drops silent segments from the original set when dialogue data exists', () => {
    const normalized = normalizeStorySegments({
      events: Array.from({ length: 6 }, (_, index) => {
        const start = 104.64 + index * 20
        return {
          event_id: `event-${String(index + 1).padStart(3, '0')}`,
          start,
          end: start + 18,
          description: `剧情事件 ${index + 1}`,
          importance: index < 3 ? 'high' : 'medium',
          evidence: [],
        }
      }),
      // 字幕只覆盖前 4 个事件窗口：第 5、6 个事件为哑片段
      subtitleSegments: Array.from({ length: 4 }, (_, index) => ({
        startTime: 104.64 + index * 20,
        endTime: 104.64 + index * 20 + 18,
        text: '对白字幕'.repeat(3),
      })),
      sourceDurationSeconds: 3600,
    })
    const selection = selectSegmentsForCut({ pool: normalized.pool, selectionRatio: 1, narrationRatio: 0.5 })
    // 6 条全入选，前 3 条（高优先级）做解说；后 3 条原片中第 5、6 条是哑片段，
    // 被密度修正移出且无递补候选。
    expect(selection.narrationSegments).toHaveLength(3)
    expect(selection.originalSegments).toHaveLength(1)
  })
})
