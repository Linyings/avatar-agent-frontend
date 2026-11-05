import {useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {Alert, AspectRatio, Badge, Box, Button, Card, Container, Divider, FileInput, Grid, Group, Image, Loader, Paper, Stack, Text, Textarea, TextInput, ThemeIcon, Title} from '@mantine/core'
import {IconArrowRight, IconCheck, IconDownload, IconMovie, IconPlayerPlay, IconRefresh, IconSparkles, IconUser} from '@tabler/icons-react'
import {avatarMvpService, type AvatarConfig, type AvatarTask} from './avatarMvpService'
import classes from './AvatarMvpPage.module.css'
import {createAvatarRequestId} from './requestId'

const labels: Record<string, string> = {
  queued: '等待执行', running: '正在执行', pending: '等待生成', succeeded: '已完成', failed: '失败', interrupted: '已中断',
  planning: '① 口播稿与分镜', tts: '② 配音', alignment: '② 字级时间戳', semantics: '② 语义标注', generating: '③ 数字人生成', verifying: '③ 素材检查', shotbook: '④ 镜头表', rendering: '⑥ 渲染成片', completed: '⑧ 交付',
}
const isActive = (task: AvatarTask | null) => task?.status === 'running' || task?.status === 'queued'

export default function AvatarMvpPage({projectId}: {projectId?: string}) {
  const [search, setSearch] = useSearchParams()
  const [projectTaskId, setProjectTaskId] = useState('')
  const taskId = projectId ? projectTaskId : (search.get('task_id') || '')
  const [config, setConfig] = useState<AvatarConfig | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [script, setScript] = useState('')
  const [title, setTitle] = useState('')
  const [task, setTask] = useState<AvatarTask | null>(null)
  const [error, setError] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [pollingPaused, setPollingPaused] = useState(false)
  const requestId = useRef('')
  if (!requestId.current) requestId.current = createAvatarRequestId()

  useEffect(() => {
    const controller = new AbortController()
    avatarMvpService.config(controller.signal).then(setConfig).catch(e => {if (!controller.signal.aborted) setError(e.message)})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!photo) {setPhotoUrl(''); return}
    const url = URL.createObjectURL(photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setProjectTaskId('')
    setTask(null)
    setScript('')
    setTitle('')
    setPhoto(null)
    avatarMvpService.latestForProject(projectId, controller.signal).then(found => {
      if (controller.signal.aborted) return
      setProjectTaskId(found?.id || '')
      if (found) {
        setScript(found.script || '')
        setTitle(found.title || '')
      }
    }).catch(e => {if (!controller.signal.aborted) setError((e as Error).message)})
    return () => controller.abort()
  }, [projectId])
  useEffect(() => {
    if (!taskId) {setTask(null); return}
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setPollingPaused(false)
    const poll = async () => {
      try {
        const next = await avatarMvpService.get(taskId, controller.signal)
        if (controller.signal.aborted) return
        setTask(next)
        if (isActive(next)) timer = setTimeout(poll, 2000)
      } catch (e) {
        if (!controller.signal.aborted) {setError((e as Error).message);setPollingPaused(true)}
      }
    }
    void poll()
    return () => {controller.abort();if (timer) clearTimeout(timer)}
  }, [taskId, refresh])
  useEffect(() => {
    setVideoUrl('')
    if (task?.status !== 'succeeded') return
    const controller = new AbortController()
    let url = ''
    avatarMvpService.video(task.id, controller.signal).then(blob => {
      if (!controller.signal.aborted) {url = URL.createObjectURL(blob);setVideoUrl(url)}
    }).catch(e => {if (!controller.signal.aborted) setError(e.message)})
    return () => {controller.abort();if (url) URL.revokeObjectURL(url)}
  }, [task?.id, task?.status])

  const resetRequest = () => {requestId.current = createAvatarRequestId()}
  const submit = async () => {
    if (!photo) return
    setBusy(true);setError('')
    try {
      const next = await avatarMvpService.create(photo, script, title, requestId.current, projectId)
      setTask(next)
      if (projectId) setProjectTaskId(next.id)
      else setSearch({task_id: next.id})
      setRefresh(v => v + 1)
    } catch (e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  const retry = async () => {
    if (!task) return
    setBusy(true);setError('')
    try {setTask(await avatarMvpService.retry(task.id));setRefresh(v => v + 1)}
    catch (e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  const complete = task?.shots.filter(s => s.status === 'succeeded').length || 0
  const elapsed = Object.values(task?.stage_seconds || {}).reduce((sum, v) => sum + v, 0)
  const projectHasRecord = Boolean(projectId && task)
  const uncertainSubmission = task?.shots.some(s => ['submitting', 'unknown'].includes(s.submission || '') && !s.provider_task_id)
  const qualityRejected = task?.shots.some(s => s.submission === 'quality_failed')

  // The legacy DOM translator caches original text nodes and can restore stale
  // counters/status labels. The MVP is Chinese-only and owns its dynamic text.
  return <Container size="xl" py="xl" data-i18n-skip>
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Group gap="xs" mb="sm"><Badge variant="light" color="violet">AGENT STUDIO</Badge><Badge variant="outline" color="gray">MVP</Badge></Group>
          <Title order={1}>让你的表达，成为视频</Title>
          <Text c="dimmed" mt="sm">一张人物照片，一段口播稿。自动生成多角度镜头，完成字幕、动效与剪辑。</Text>
        </Box>
        <ThemeIcon size={56} radius="xl" variant="light" color="violet"><IconSparkles size={28}/></ThemeIcon>
      </Group>
      {error && <Alert color="red" title="操作未完成" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      {(task?.model || config?.model) && <Text size="sm" c="dimmed">视频模型：{task?.provider || config?.provider} / {task?.model || config?.model}</Text>}
      {config && !config.configured && <Alert color="orange" title="服务准备中">{config.message}</Alert>}
      {config && !config.baseline_approved && <Alert color="blue" title="首条基准片验证">先制作一条三镜样片，人工确认人物、视角、声音和嘴型效果，再开放后续制作。</Alert>}
      <Grid gap="xl">
        <Grid.Col span={{base: 12, md: 5}}>
          <Card withBorder radius="lg" p="xl">
            <Stack gap="lg">
              <Group gap="sm"><ThemeIcon variant="light" radius="md"><IconUser size={20}/></ThemeIcon><Title order={3}>准备你的口播</Title></Group>
              <FileInput label="人物照片" description="单人正面或轻微侧脸，JPG / PNG，256–4096px，不超过8MB" placeholder="选择一张清晰的人物照片" accept="image/png,image/jpeg" value={photo} onChange={f => {setPhoto(f);resetRequest()}} clearable disabled={busy || isActive(task) || projectHasRecord}/>
              {photoUrl && <Image src={photoUrl} h={190} fit="contain" radius="md" alt="人物参考照片" bg="var(--mantine-color-default-hover)"/>}
              <TextInput label="视频标题" placeholder="可选，为这条视频起个名字" maxLength={40} value={title} onChange={e => {setTitle(e.currentTarget.value);resetRequest()}} disabled={busy || isActive(task) || projectHasRecord}/>
              <Textarea label="中文口播稿" description="至少三个完整句子。建议先试约15秒，配音最长30秒。" placeholder="第一句吸引注意。第二句说明核心内容。第三句总结观点。" minRows={7} maxLength={240} value={script} onChange={e => {setScript(e.currentTarget.value);resetRequest()}} disabled={busy || isActive(task) || projectHasRecord}/>
              <Text ta="right" size="xs" c="dimmed">{script.length} / 240</Text>
              <Paper withBorder p="md" radius="md"><Group gap="xs"><Badge color="violet" variant="light">{task?.voice || config?.voice || '默认'} 固定音色</Badge><Badge color="gray" variant="light">9:16 竖屏</Badge><Badge color="gray" variant="light">3 个机位</Badge></Group></Paper>
              {projectHasRecord ? <Alert color="gray">这个项目已有制作记录。要换照片或口播稿，请新建一个数字人口播项目；当前项目可以继续重试这一条。</Alert> : <Button size="md" radius="md" leftSection={<IconSparkles size={18}/>} rightSection={<IconArrowRight size={18}/>} onClick={submit} loading={busy && !task} disabled={!config?.configured || !photo || !script.trim() || busy || isActive(task)}>生成口播视频</Button>}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{base: 12, md: 7}}>
          <Stack gap="lg">
            <Card withBorder radius="lg" p="xl">
              <Group justify="space-between" mb="lg"><Title order={3}>成片预览</Title>{task && <Badge color={task.status === 'succeeded' ? 'teal' : task.status === 'failed' ? 'red' : 'violet'}>{labels[task.status] || task.status}</Badge>}</Group>
              <AspectRatio ratio={9 / 16} maw={290} mx="auto" className={classes.preview}>
                {videoUrl ? <video aria-label="数字人口播成片" src={videoUrl} controls playsInline/> : <Stack align="center" justify="center" gap="md" p="xl">
                  <ThemeIcon size={72} radius="xl" variant="light" color="gray">{isActive(task) ? <Loader size={28}/> : <IconPlayerPlay size={32}/>}</ThemeIcon>
                  <Text fw={600} ta="center">{task ? labels[task.stage] || '正在准备视频' : '你的第一条口播视频'}</Text>
                  <Text size="sm" c="dimmed" ta="center">{task ? '生成结果会在这里显示' : '正面 · 左前方 · 右前方\n三镜头，让表达更生动'}</Text>
                </Stack>}
              </AspectRatio>
              {videoUrl && <Button component="a" href={videoUrl} download="avatar.mp4" fullWidth mt="lg" leftSection={<IconDownload size={18}/>}>下载 MP4</Button>}
            </Card>
            <Card withBorder radius="lg" p="xl">
              <Group justify="space-between"><Group gap="sm"><IconMovie size={20}/><Title order={4}>制作进度</Title></Group>{task && <Text size="sm" c="dimmed">{complete} / 3 镜头</Text>}</Group>
              <Divider my="md"/>
              <Stack gap="sm">
                {(task?.shots || [{id:'shot-1',angle:'正面',framing:'中景',status:'pending',clip:{duration:0}},{id:'shot-2',angle:'左前方20度',framing:'半身',status:'pending',clip:{duration:0}},{id:'shot-3',angle:'右前方20度',framing:'近景',status:'pending',clip:{duration:0}}]).map((shot,i) => <Paper key={shot.id} withBorder radius="md" p="md">
                  <Group justify="space-between"><Group gap="sm"><ThemeIcon variant="light" color={shot.status === 'succeeded' ? 'teal' : 'gray'} radius="xl">{shot.status === 'succeeded' ? <IconCheck size={16}/> : i + 1}</ThemeIcon><Box><Text size="sm" fw={600}>{shot.angle} · {shot.framing}</Text>{shot.clip.duration > 0 && <Text size="xs" c="dimmed">{shot.clip.duration.toFixed(1)} 秒</Text>}</Box></Group><Badge variant="light" color={shot.status === 'failed' ? 'red' : 'gray'}>{labels[shot.status] || shot.status}</Badge></Group>
                  {shot.error && <Text c="red" size="sm" mt="sm">{shot.error}</Text>}
                </Paper>)}
              </Stack>
              {task?.error && <Alert color="red" mt="md">{task.error}</Alert>}
              {task && <Text size="xs" c="dimmed" mt="md">时长 {task.duration.toFixed(1)} 秒 · 已记录阶段耗时 {elapsed.toFixed(1)} 秒</Text>}
              {task?.status === 'succeeded' && task.review_required && <Alert mt="md" color="blue">成片已生成，请检查三镜人物一致性、真实视角变化和嘴型同步。</Alert>}
              {task && ['failed', 'interrupted'].includes(task.status) && <>
                {qualityRejected && <Alert mt="md" color="orange">请先检查样片。重试将重新生成未通过的镜头，可能再次产生第三方费用。</Alert>}
                {uncertainSubmission && <Alert mt="md" color="orange">提交状态待确认，请先在 RunningHub 核对任务记录。</Alert>}
                <Button mt="md" variant="light" leftSection={<IconRefresh size={16}/>} loading={busy} disabled={uncertainSubmission} onClick={retry}>重试失败步骤</Button>
              </>}
              {pollingPaused && <Button mt="md" variant="subtle" onClick={() => {setError('');setRefresh(v => v + 1)}}>重新查询状态</Button>}
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  </Container>
}
