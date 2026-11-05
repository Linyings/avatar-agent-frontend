import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import type { FrameDebugRun, GenerateVoiceoverOutput, MergeVideosOutput } from '../../workflow/frame'
import { resolveMergedVideoFile } from '../../workflow/frame/utils/media'
import TimelineReviewEditor from './TimelineReviewEditor'
import styles from './TimelineReviewEditor.module.css'
import { reviewItems, approveTimeline } from './reviewWorkflow'
import { regenerateTimelineVoice } from './timelineVoiceover'
import { scriptGenerationServiceV2 } from '../../services/scriptGenerationServiceV2'
import { getWorkflowClientInstanceId } from '@/shared/workflowRuns/identity'

export default function TimelineReviewModal({ run, onConfirm, onSave, onClose }: {
  run: FrameDebugRun; onConfirm(run: FrameDebugRun): Promise<void>; onSave(run: FrameDebugRun): Promise<void>; onClose(): void;
}) {
  const [current, setCurrent] = useState(run)
  const [items, setItems] = useState(() => reviewItems(run))
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [valid, setValid] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const merged = run.records['merge-videos']?.output as MergeVideosOutput
  useEffect(() => {
    let live = true
    resolveMergedVideoFile(merged).then(value => { if (live) setFile(value) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [merged])
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await action() } catch (e) { if (active.current) setError(e instanceof Error ? e.message : '审核操作失败') }
    finally { if (active.current) setBusy(false) }
  }
  const identity = (step: string) => {
    if (!run.workflowRunId || !run.workflowInputHash) throw new Error('工作流身份缺失，请恢复任务后重试')
    return { workflowRunId: run.workflowRunId, workflowInputHash: run.workflowInputHash,
      workflowStepId: `${step}.manual-${crypto.randomUUID()}`, clientInstanceId: getWorkflowClientInstanceId() }
  }
  return <Modal opened onClose={() => { if (!busy) onClose() }} size="min(1400px, 96vw)" title="核对成片画面时间线"
    closeOnClickOutside={false} classNames={{ content: styles.modalContent, body: styles.modalBody, header: styles.modalHeader }}>
    <Stack className={styles.modalLayout}>
      {error && <Alert color="red">{error}</Alert>}
      {file && <TimelineReviewEditor taskId={run.projectId} sourceFile={file} sourceDuration={merged.video.duration}
        items={items} t={s => s} onChange={setItems} disabled={busy} onValidationChange={v => setValid(v.valid)}
        onRegenerate={id => void perform(async () => {
          const item = items.find(entry => entry._id === id)!
          const response = await scriptGenerationServiceV2.generateNarrationDraftStream({
            project_id: run.projectId, model_profile: 'pro', model_operation: 'narration_segment',
            video_config: {} as never,
            video_context: { narrative_context: current.records['understand-narrative']?.output,
              chapter: { chapter_id: item.chapter_id, event_ids: item.event_ids },
              segment_payload: item, item_count_range: { minimum: 1, maximum: 1 } },
            custom_prompt: `仅重写这一段解说，目标80字，建议56-104字。保留原意与事实，不引入新人物或事件。原文：${item.text}`,
          }, { workflowIdentity: identity('generate-narration-script') })
          const text = response.items?.[0]?.text?.trim()
          if (response.items?.length !== 1 || !text) throw new Error('模型未返回单段有效文案')
          if (active.current) setItems(previous => previous.map(entry => entry._id === id ? { ...entry, text } : entry))
        })}
        onRegenerateVoice={id => void perform(async () => {
          const record = current.records['generate-voiceover']!
          const output = record.output as GenerateVoiceoverOutput
          const result = await regenerateTimelineVoice({ projectId: run.projectId, voices: output.voiceoverResult,
            items, itemId: id, workflowIdentity: identity('generate-voiceover') })
          const next = { ...current, records: { ...current.records, 'generate-voiceover': { ...record,
            output: { ...output, timelineReviewApproved: false, voiceoverResult: result.voices,
              pipelineResult: { ...output.pipelineResult, voiceoverResult: result.voices } } } } }
          await onSave(next)
          if (active.current) { setCurrent(next); setItems(result.items) }
        })} />}
      <Group justify="flex-end">
        <Button variant="default" disabled={busy} onClick={onClose}>稍后审核</Button>
        <Button loading={busy} disabled={!file || !valid} onClick={() => void perform(async () => {
          await onConfirm(approveTimeline(current, items))
        })}>确认时间线并继续</Button>
      </Group>
    </Stack>
  </Modal>
}
