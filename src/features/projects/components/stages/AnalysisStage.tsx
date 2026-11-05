import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Alert, Badge, Button, Group, Paper, Stack, Stepper, Text, ThemeIcon, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import {
  SparklesIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  DocumentTextIcon
} from '@/shared/icons/tabler'
import { useProject } from '../../contexts/ProjectContext'
import ProjectService from '../../services/projectService'
import ScriptTable from '@/shared/components/ui/ScriptTable'
import type { ScriptItem } from '@/shared/types'
import {
  WorkflowActionBar,
  WorkflowHeaderBackButton,
  WorkflowPanel,
  WorkflowRail,
  WorkflowState,
  WorkflowWorkbenchShell,
  type WorkflowRailItem,
} from '@/shared/components/ui/WorkflowPrimitives'
import { resolveInferenceMode } from '../../utils/inferenceMode'

// AnalysisStage 组件
const AnalysisStage: React.FC = () => {
  const navigate = useNavigate()
  const {
    currentProject,
    isSaving,
    saveAiScript,
    stageStatus,
    updateStageStatus
  } = useProject()

  // 使用 useRef 来跟踪保存状态，防止无限循环
  const savingRef = useRef(false)

  // 脚本数据状态（简化版）
  const [scriptData, setScriptData] = useState<ScriptItem[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isRedirectingToMaterial, setIsRedirectingToMaterial] = useState(false)

  const inferenceMode = resolveInferenceMode(
    currentProject?.id,
    currentProject?.metadata?.inference_mode
  )
  const isAdvancedMode = inferenceMode === 'frame'
  const hasUploadedVideo = Boolean(currentProject?.artifacts.source_video)
  const canResetAnalysisStage = Boolean(stageStatus?.analysis)
  const scriptCount = scriptData.length
  const navigateToProjectStep = useCallback((path: string) => {
    if (!currentProject?.id) return
    navigate(`/projects/${currentProject.id}${path}`)
  }, [currentProject?.id, navigate])

  useEffect(() => {
    if (!isAdvancedMode || !currentProject?.id) return
    navigate(`/projects/${currentProject.id}/material/upload?preview=final`, { replace: true })
  }, [currentProject?.id, isAdvancedMode, navigate])

  const railItems: WorkflowRailItem[] = [
    { id: 'upload', label: '上传视频', status: 'completed', description: '素材已处理', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'crop', label: '裁剪视频', status: 'completed', description: '范围已确认', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'recognize', label: '识别字幕', status: 'completed', description: 'ASR / OCR / SRT', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'review', label: '校对字幕', status: 'completed', description: '字幕可用于分析', onSelect: () => navigateToProjectStep('/material/upload') },
    { id: 'config', label: '配置参数', status: 'completed', description: '策略已生成', onSelect: () => navigateToProjectStep('/material/config?section=quick') },
    { id: 'preview-script', label: '预览脚本', status: 'current', description: scriptCount > 0 ? `${scriptCount} 条脚本` : '等待脚本数据' },
    {
      id: 'dubbing',
      label: '配音制作',
      status: scriptCount > 0 ? 'upcoming' : 'disabled',
      description: '进入下一步',
      disabled: scriptCount === 0,
      onSelect: scriptCount > 0 ? () => navigateToProjectStep('/dubbing') : undefined,
    },
    { id: 'compose', label: '合成视频', status: 'disabled', description: '最终输出', disabled: true },
  ]
  const activeRailIndex = Math.max(0, railItems.findIndex((item) => item.status === 'current'))
  const mobileProgress = (
    <WorkflowPanel tone="subtle" p="md" radius="lg">
      <Stepper active={activeRailIndex} size="xs" allowNextStepsSelect={false}>
        {railItems.map((item) => (
          <Stepper.Step key={item.id} label={item.label} />
        ))}
      </Stepper>
    </WorkflowPanel>
  )

  const pageMeta = (
    <Group gap="xs" wrap="wrap" justify="flex-end">
      <Badge variant="light" size="lg">当前 · 预览脚本</Badge>
      <Badge variant="outline" color="gray" size="lg">脚本 · {scriptCount} 条</Badge>
      {hasChanges && (
        <Badge color="yellow" variant="light" size="lg" leftSection={<span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />}>
          有未保存更改
        </Badge>
      )}
    </Group>
  )

  // 简化的数据加载逻辑
  const loadScriptData = useCallback(async () => {
    if (!currentProject?.id || isAdvancedMode) return

    setIsLoadingData(true)
    setDataError(null)

    try {
      // 直接调用获取AI脚本接口
      const scriptData = await ProjectService.getProjectAiScript(currentProject.id)
      console.log('获取到的AI脚本数据(原始):', scriptData)

      if (scriptData?.items) {
        // 使用智能转换函数将后端数据转换为前端格式
        const { smartConvertToFrontendBatch } = await import('@/shared/utils/scriptDataAdapter')
        const convertedItems = smartConvertToFrontendBatch(scriptData.items)
        console.log('转换后的脚本数据:', convertedItems)
        setScriptData(convertedItems)
      } else {
        setScriptData([])
        console.log('没有找到脚本数据，显示空状态')
      }
    } catch (error) {
      console.error('加载脚本数据失败:', error)
      setDataError('加载脚本数据失败，请检查网络连接或稍后重试')
      setScriptData([])
    } finally {
      setIsLoadingData(false)
    }
  }, [currentProject?.id, isAdvancedMode])

  // 初始加载脚本数据
  useEffect(() => {
    loadScriptData()
  }, [loadScriptData])

  // 处理脚本数据变化
  const handleScriptDataChange = useCallback((newData: ScriptItem[]) => {
    setScriptData(newData)
    setHasChanges(true)
  }, [])

  // 自动保存脚本数据（防抖）
  useEffect(() => {
    if (!hasChanges || scriptData.length === 0) return

    const saveTimeout = setTimeout(async () => {
      if (!currentProject?.id || savingRef.current) return

      savingRef.current = true
      try {
        // 将前端数据转换为新格式后保存
        const { convertFrontendToNewBatch } = await import('@/shared/utils/scriptDataAdapter')
        const newFormatItems = convertFrontendToNewBatch(scriptData)

        const scriptContent = {
          items: newFormatItems,
          updated_at: new Date().toISOString()
        }

        await saveAiScript(scriptContent)
        setHasChanges(false)
        console.log('脚本数据已自动保存(新格式):', scriptContent)
      } catch (error) {
        console.error('自动保存失败:', error)
      } finally {
        savingRef.current = false
      }
    }, 2000) // 2秒防抖

    return () => clearTimeout(saveTimeout)
  }, [scriptData, hasChanges, currentProject?.id, saveAiScript])

  // 重新生成脚本 - 直接跳转到合适的素材步骤
  const handleRegenerate = useCallback(() => {
    if (!currentProject?.id) return

    const targetStep = isAdvancedMode && hasUploadedVideo ? 'config' : 'upload'
    const params = new URLSearchParams({ intent: 'regenerate', source: 'analysis' })
    if (isAdvancedMode && inferenceMode) {
      params.set('mode', inferenceMode)
    }

    if (canResetAnalysisStage) {
      updateStageStatus('analysis', {
        completed: false,
        hasAiScript: false
      })
    }

    setIsRedirectingToMaterial(true)
    navigate(`/projects/${currentProject.id}/material/${targetStep}?${params.toString()}`)
  }, [
    canResetAnalysisStage,
    currentProject?.id,
    hasUploadedVideo,
    inferenceMode,
    isAdvancedMode,
    navigate,
    updateStageStatus
  ])

  // 导航到脚本阶段
  const handleViewScript = () => {
    if (currentProject?.id) {
      navigate(`/projects/${currentProject.id}/dubbing`)
    }
  }

  // 下载脚本
  const handleDownloadScript = async () => {
    if (scriptData.length === 0) return

    // 将前端数据转换为新格式后下载
    const { convertFrontendToNewBatch } = await import('@/shared/utils/scriptDataAdapter')
    const newFormatItems = convertFrontendToNewBatch(scriptData)

    const dataToDownload = {
      items: newFormatItems,
      updated_at: new Date().toISOString(),
      total_items: newFormatItems.length
    }

    const blob = new Blob([JSON.stringify(dataToDownload, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentProject?.name || 'project'}_script.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const mainContent = isLoadingData ? (
    <WorkflowState loading title="正在加载项目数据..." />
  ) : (
    <Stack gap="lg">
      {dataError && (
        <Alert
          color="red"
          variant="light"
          title="数据加载失败"
          icon={<ExclamationTriangleIcon width={20} height={20} />}
        >
          <Group justify="space-between" align="flex-start" gap="md">
            <Text size="sm">{dataError}</Text>
            <Button variant="outline" color="red" size="sm" onClick={loadScriptData}>
              重新加载
            </Button>
          </Group>
        </Alert>
      )}

      {scriptData.length > 0 ? (
        <ScriptTable data={scriptData} onChange={handleScriptDataChange} />
      ) : !dataError ? (
        <Paper withBorder p="xl" radius="lg" ta="center" style={{ background: 'var(--app-surface)' }}>
          <Stack align="center" gap="md">
            <ThemeIcon color="gray" variant="light" size={64} radius="xl">
              <DocumentTextIcon width={32} height={32} />
            </ThemeIcon>
            <Title order={3}>还没有脚本数据</Title>
            <Text c="var(--app-muted)" size="sm">
              点击“重新生成”按钮返回素材页面，重新生成 AI 脚本
            </Text>
            <Button
              color="brand"
              onClick={handleRegenerate}
              disabled={isRedirectingToMaterial || !currentProject?.id}
              loading={isRedirectingToMaterial}
              leftSection={<SparklesIcon width={18} height={18} />}
            >
              重新生成
            </Button>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  )

  const actionBar = (
    <WorkflowActionBar>
      <Group justify="space-between" gap="md" wrap="wrap">
        <Text size="sm" c="var(--app-muted)">
          {hasChanges ? '脚本修改后会自动保存。' : '确认脚本后进入配音制作。'}
        </Text>
        <Group gap="sm" wrap="wrap">
          {scriptData.length > 0 && (
            <Button
              variant="light"
              color="gray"
              onClick={handleDownloadScript}
              leftSection={<ArrowDownTrayIcon width={16} height={16} />}
            >
              导出
            </Button>
          )}
          <Button
            variant="light"
            color="brand"
            onClick={handleRegenerate}
            disabled={isSaving || isRedirectingToMaterial || !currentProject?.id}
            loading={isRedirectingToMaterial}
            leftSection={<SparklesIcon width={16} height={16} />}
          >
            重新生成
          </Button>
          <Button
            color="brand"
            onClick={handleViewScript}
            disabled={scriptData.length === 0}
            rightSection={<ArrowRightIcon width={16} height={16} />}
            title="进入剪辑阶段下一步，继续完善脚本与时间轴"
          >
            下一步
          </Button>
        </Group>
      </Group>
    </WorkflowActionBar>
  )

  if (isAdvancedMode) {
    return <WorkflowState loading title="正在打开通用模式结果..." />
  }

  return (
    <WorkflowWorkbenchShell
      title="剪辑脚本编辑"
      titleLeading={<WorkflowHeaderBackButton onClick={() => navigate('/projects')} />}
      description="检查生成脚本，调整旁白节奏和分镜内容。"
      width="wide"
      meta={pageMeta}
      rail={<WorkflowRail items={railItems} title="内容生成流程" />}
      mobileProgress={mobileProgress}
      main={mainContent}
      actionBar={actionBar}
    />
  )
}

export default AnalysisStage
