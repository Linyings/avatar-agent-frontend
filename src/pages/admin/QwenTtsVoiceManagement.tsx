import { useEffect, useState } from 'react'
import { Alert, Anchor, Button, Checkbox, Group, Paper, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { authenticatedFetch } from '@/features/auth/services/authService'

type Catalog = { model: string; voices: { value: string; label: string }[]; enabled_voices: string[] }
const endpoint = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/admin/tts/qwen`

async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || body.message || `请求失败（${response.status}）`)
  }
  return response
}

export default function QwenTtsVoiceManagement() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [voice, setVoice] = useState<string | null>(null)
  const [text, setText] = useState('你以为故事到这里就结束了吗？真正的好戏，现在才刚刚开始！')
  const [audio, setAudio] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setError('')
    authenticatedFetch(`${endpoint}/voices`).then(checked).then(r => r.json()).then((data: Catalog) => {
      if (!active) return
      setCatalog(data); setSelected(data.enabled_voices); setVoice(data.voices[0]?.value || null)
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [reload])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const response = await checked(await authenticatedFetch(`${endpoint}/voices`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled_voices: selected }),
      }))
      const data: Catalog = await response.json()
      setCatalog(data); setSelected(data.enabled_voices); setSaved(true)
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') }
    finally { setSaving(false) }
  }

  async function preview() {
    setPreviewing(true); setError(''); setAudio('')
    try {
      const response = await checked(await authenticatedFetch(`${endpoint}/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice_uri: voice, text }),
      }))
      setAudio(URL.createObjectURL(await response.blob()))
    } catch (e) { setError(e instanceof Error ? e.message : '试听失败') }
    finally { setPreviewing(false) }
  }

  return <Stack gap="lg">
    <Alert title="阿里云千问 · 情绪配音">
      使用 qwen3-tts-instruct-flash，以下为该模型支持的全部官方系统音色，无需购买或克隆音色。语音合成及试听仍产生阿里云调用费用，试听不扣平台积分。
      <Text size="sm" mt="xs">勾选并保存后，PC 用户重新打开搞笑配音项目时会加载已开放音色。至少保留两个音色供不同角色选择。</Text>
      <Anchor href="https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list" target="_blank" rel="noreferrer" size="sm">查看官方音色说明</Anchor>
    </Alert>
    {error && <Alert color="red">{error}</Alert>}
    {saved && <Alert color="green">已保存音色设置</Alert>}
    {!catalog ? <Button variant="light" onClick={() => setReload(v => v + 1)}>重新加载音色</Button> : <>
      <Group justify="space-between">
        <Text fw={600}>官方音色 {catalog.voices.length} 个 · 已选择 {selected.length} 个</Text>
        <Group><Button variant="light" disabled={saving} onClick={() => { setSelected(catalog.voices.map(v => v.value)); setSaved(false) }}>全选</Button>
          <Button loading={saving} disabled={selected.length < 2} onClick={save}>保存开放音色</Button></Group>
      </Group>
      <TextInput placeholder="搜索音色名称或英文标识" value={search} onChange={e => setSearch(e.currentTarget.value)} />
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {catalog.voices.filter(v => `${v.label} ${v.value}`.toLowerCase().includes(search.toLowerCase())).map(v => <Paper key={v.value} withBorder p="md">
          <Checkbox label={v.label} checked={selected.includes(v.value)} disabled={saving} onChange={e => {
            const checked = e.currentTarget.checked
            setSelected(old => checked ? [...old, v.value] : old.filter(id => id !== v.value)); setSaved(false)
          }} />
          <Text size="xs" c="dimmed" mt="xs">{v.value.split(':')[1]}</Text>
        </Paper>)}
      </SimpleGrid>
      <Paper withBorder p="lg"><Stack>
        <Text fw={600}>音色试听</Text>
        <Select label="试听音色" searchable data={catalog.voices} value={voice} onChange={setVoice} />
        <Textarea label="试听文本（最多 200 字）" maxLength={200} value={text} onChange={e => setText(e.currentTarget.value)} />
        <Button loading={previewing} disabled={!voice || !text.trim()} onClick={preview}>生成试听</Button>
        {audio && <audio controls src={audio} style={{ width: '100%' }} />}
      </Stack></Paper>
    </>}
  </Stack>
}
