import type { ComposeFinalVideoOutput, FrameDebugRun, GenerateNarrationScriptOutput, GenerateVoiceoverOutput, MatchNarrationVisualsOutput, MergeVideoContextOutput } from '../types'

export const getFrameWorkflowResult = (run: FrameDebugRun | null | undefined) => {
  if (run?.status !== 'success') return null
  const composedOutput = run?.records['compose-final-video']?.output as ComposeFinalVideoOutput | undefined
  if (composedOutput?.pipelineResult) return composedOutput.pipelineResult
  const voiceoverOutput = run?.records['generate-voiceover']?.output as GenerateVoiceoverOutput | undefined
  if (voiceoverOutput?.pipelineResult) return voiceoverOutput.pipelineResult
  const matchedOutput = run?.records['match-narration-visuals']?.output as MatchNarrationVisualsOutput | undefined
  if (matchedOutput?.pipelineResult) return matchedOutput.pipelineResult
  const generatedOutput = run?.records['generate-narration-script']?.output as GenerateNarrationScriptOutput | undefined
  if (generatedOutput?.pipelineResult) return generatedOutput.pipelineResult
  const output = run?.records['merge-video-context']?.output as MergeVideoContextOutput | undefined
  return output?.pipelineResult ?? null
}
