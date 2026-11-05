import React, { useCallback, useEffect, useState } from 'react'
import { ActionIcon, Alert, Button, Group, Text } from '@mantine/core'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SparklesIcon, XMarkIcon } from '@/shared/icons/tabler'
import FrameInferenceSetupStep from './material/steps/FrameInferenceSetupStep'
import { useProject } from '../../contexts/ProjectContext'
import type { LegacyModelLevel } from '../../types/material/videoConfig.types'
import { isRetiredInferenceMode, resolveInferenceMode } from '../../utils/inferenceMode'
import { WorkflowPageShell, WorkflowState } from '@/shared/components/ui/WorkflowPrimitives'

type MaterialStageStep = 'upload' | 'config'

const RETIRED_MODE_LABELS: Record<LegacyModelLevel, string> = {
  shallow: '旧推理模式',
  deep: '旧推理模式',
}

function RetiredInferenceModeNotice({
  mode,
  onBack,
}: {
  mode: LegacyModelLevel
  onBack: () => void
}) {
  const label = RETIRED_MODE_LABELS[mode]

  return (
    <WorkflowState
      title={`${label}已下线`}
      description="该项目使用的旧生成流程已移除，不能继续运行或重新生成。通用模式仍可用于新建项目。"
      tone="subtle"
      action={
        <Button color="brand" onClick={onBack}>
          返回项目列表
        </Button>
      }
    />
  )
}

const MaterialStage: React.FC = () => {
  const navigate = useNavigate()
  const { step, stage } = useParams<{ step?: string; stage?: string; projectId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentProject } = useProject()

  const [showRegenerateNotice, setShowRegenerateNotice] = useState(false)

  const inferenceMode = resolveInferenceMode(
    currentProject?.id,
    currentProject?.metadata?.inference_mode
  ) ?? 'frame'
  const retiredMode = isRetiredInferenceMode(inferenceMode) ? inferenceMode : null
  const isMaterialStageRoute = stage === 'material' || !stage
  const searchParamsString = searchParams.toString()
  const hasFrameFinalVideo = Boolean(currentProject?.artifacts.final_video?.key)

  const currentStep = (step as MaterialStageStep) || 'upload'

  useEffect(() => {
    setShowRegenerateNotice(searchParams.get('intent') === 'regenerate')
  }, [searchParams])

  const dismissRegenerateNotice = useCallback(() => {
    setShowRegenerateNotice(false)
    const hasIntent = searchParams.get('intent') === 'regenerate'
    if (!hasIntent) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('intent')
    nextParams.delete('source')
    nextParams.delete('mode')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!currentProject?.id) return
    if (!isMaterialStageRoute) return

    const query = searchParamsString ? `?${searchParamsString}` : ''

    if (!step) {
      navigate(`/projects/${currentProject.id}/material/upload${query}`, { replace: true })
      return
    }

    if (currentStep === 'config') {
      if (retiredMode) {
        navigate(`/projects/${currentProject.id}/material/upload${query}`, { replace: true })
        return
      }

      const nextParams = new URLSearchParams(searchParamsString)
      if (hasFrameFinalVideo && !nextParams.has('preview')) {
        nextParams.set('preview', 'final')
      }
      const frameQuery = nextParams.toString() ? `?${nextParams.toString()}` : ''
      navigate(`/projects/${currentProject.id}/material/upload${frameQuery}`, { replace: true })
    }
  }, [
    currentProject?.id,
    currentStep,
    hasFrameFinalVideo,
    isMaterialStageRoute,
    navigate,
    retiredMode,
    searchParamsString,
    step,
  ])

  const handleBack = () => {
    navigate('/projects')
  }

  return (
    <WorkflowPageShell width="fluid">
      {showRegenerateNotice && !retiredMode && (
        <Alert
          color="green"
          variant="light"
          title="已从剪辑脚本返回素材阶段"
          icon={<SparklesIcon width={18} height={18} />}
        >
          <Group justify="space-between" align="flex-start" gap="md" wrap="nowrap">
            <Text size="sm" c="var(--app-muted)">
              我们已直接为你打开通用模式工作台，调整完参数后即可重新提交。
            </Text>
            <ActionIcon variant="subtle" color="gray" onClick={dismissRegenerateNotice} aria-label="关闭提醒">
              <XMarkIcon width={16} height={16} />
            </ActionIcon>
          </Group>
        </Alert>
      )}

      {retiredMode ? (
        <RetiredInferenceModeNotice mode={retiredMode} onBack={handleBack} />
      ) : (
        <FrameInferenceSetupStep />
      )}
    </WorkflowPageShell>
  )
}

export default MaterialStage
