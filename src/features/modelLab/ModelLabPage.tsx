import {useCallback,useEffect,useMemo,useState} from 'react'
import {Alert,Badge,Button,Checkbox,Group,Modal,NumberInput,Paper,Radio,SimpleGrid,Stack,Table,Text,Textarea,TextInput,Title} from '@mantine/core'
import {mediaBlob} from '@/features/agent/studioService'
import {createLabRun,getLabRun,getMediaModels,labFileURL,listLabRuns,rateLabResult,setDefaultModel,type LabResult,type LabRun,type LabSummary,type MediaKind,type MediaModel} from './modelLabService'

const MAX_MODELS=8
const KINDS:{value:MediaKind;label:string}[]=[
  {value:'music',label:'背景音乐'},{value:'sfx',label:'音效'},{value:'t2i',label:'文生图'},{value:'i2i',label:'图生图'},
  {value:'t2v',label:'文生视频'},{value:'i2v',label:'图生视频'},{value:'r2v',label:'参考图生视频'},{value:'enhance',label:'画质增强'},{value:'avatar',label:'数字人口型'},
]
const isVideo=(k:MediaKind)=>k==='t2v'||k==='i2v'||k==='r2v'
const needsImages=(k:MediaKind)=>k==='i2i'||k==='i2v'||k==='r2v'||k==='avatar'
const statusLabel:Record<string,string>={queued:'排队中',submitting:'提交中',running:'生成中',succeeded:'成功',failed:'失败',unknown:'待确认'}

function ResultMedia({run,result}:{run:string;result:LabResult}){
  const [url,setURL]=useState('')
  useEffect(()=>{
    if(!result.file)return
    const ctrl=new AbortController();let created=''
    mediaBlob(labFileURL(run,result.file),ctrl.signal).then(u=>{created=u;setURL(u)}).catch(()=>{})
    return()=>{ctrl.abort();if(created)URL.revokeObjectURL(created)}
  },[run,result.file])
  if(!url)return null
  if(result.media==='audio')return <audio controls src={url} style={{width:'100%'}}/>
  if(result.media==='image')return <img src={url} alt={result.name} style={{width:'100%',borderRadius:6}}/>
  return <video controls src={url} style={{width:'100%',borderRadius:6}}/>
}

function ResultCard({run,result,isDefault,onRate,onDefault}:{run:LabRun;result:LabResult;isDefault:boolean;onRate:(score:number)=>void;onDefault:()=>void}){
  return <Paper component="article" aria-label={result.name} withBorder p="sm" radius="md">
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600} size="sm" lineClamp={2}>{result.name}</Text>
        <Badge color={result.status==='succeeded'?'green':result.status==='failed'?'red':'gray'}>{statusLabel[result.status]??result.status}</Badge>
      </Group>
      <Text size="xs" c="dimmed">{result.family} · 耗时 {result.seconds.toFixed(1)} 秒{result.cost?` · 费用 ${result.cost}`:''}</Text>
      {result.error&&<Text size="xs" c="red">{result.error}</Text>}
      <ResultMedia run={run.id} result={result}/>
      {result.status==='succeeded'&&<>
        <Radio.Group value={result.score?String(result.score):''} onChange={v=>onRate(Number(v))} label="评分">
          <Group gap="xs">{[1,2,3,4,5].map(n=><Radio key={n} value={String(n)} label={`${n} 分`}/>)}</Group>
        </Radio.Group>
        <Group gap="xs"><Button size="xs" variant="light" onClick={onDefault}>设为默认</Button>{isDefault&&<Badge size="sm" color="teal">当前默认</Badge>}</Group>
      </>}
      {result.sent&&<details><summary style={{fontSize:12,cursor:'pointer'}}>请求参数</summary><pre style={{fontSize:11,whiteSpace:'pre-wrap',margin:0}}>{JSON.stringify(result.sent,null,1)}</pre></details>}
    </Stack>
  </Paper>
}

export default function ModelLabPage(){
  const [models,setModels]=useState<MediaModel[]>([])
  const [defaults,setDefaults]=useState<Record<string,string>>({})
  const [kind,setKind]=useState<MediaKind>('music')
  const [selected,setSelected]=useState<string[]>([])
  const [prompt,setPrompt]=useState('')
  const [lyrics,setLyrics]=useState('')
  const [images,setImages]=useState('')
  const [video,setVideo]=useState('')
  const [audio,setAudio]=useState('')
  const [duration,setDuration]=useState<number|string>(5)
  const [ratio,setRatio]=useState('9:16')
  const [resolution,setResolution]=useState('720p')
  const [confirming,setConfirming]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [runs,setRuns]=useState<LabRun[]>([])
  const [summary,setSummary]=useState<LabSummary[]>([])
  const [current,setCurrent]=useState<LabRun|null>(null)

  const refreshRuns=useCallback(()=>listLabRuns().then(r=>{setRuns(r.runs);setSummary(r.summary)}).catch(e=>setError(String(e?.message??e))),[])
  useEffect(()=>{
    getMediaModels().then(r=>{setModels(r.models);setDefaults(r.defaults??{})}).catch(e=>setError(String(e?.message??e)))
    void refreshRuns()
  },[refreshRuns])
  useEffect(()=>{
    if(!current||current.status!=='running')return
    const timer=window.setInterval(()=>{getLabRun(current.id).then(r=>{setCurrent(r);if(r.status!=='running')void refreshRuns()}).catch(()=>{})},4000)
    return()=>window.clearInterval(timer)
  },[current,refreshRuns])

  const ofKind=useMemo(()=>models.filter(m=>m.kind===kind),[models,kind])
  const families=useMemo(()=>{
    const out=new Map<string,MediaModel[]>()
    for(const m of ofKind)out.set(m.family,[...(out.get(m.family)??[]),m])
    return [...out.entries()]
  },[ofKind])
  const chosen=ofKind.filter(m=>selected.includes(m.id))
  const wantsLyrics=chosen.some(m=>m.capabilities.needs_lyrics)

  const changeKind=(k:string)=>{setKind(k as MediaKind);setSelected([])}
  const toggle=(id:string,on:boolean)=>setSelected(s=>on?(s.length>=MAX_MODELS||s.includes(id)?s:[...s,id]):s.filter(x=>x!==id))
  const submit=async()=>{
    setBusy(true);setError('')
    try{
      const run=await createLabRun({kind,prompt,lyrics:lyrics||undefined,
        images:needsImages(kind)?images.split(/\s+/).filter(Boolean):undefined,
        video:kind==='enhance'?video||undefined:undefined,
        audio:kind==='avatar'?audio||undefined:undefined,
        duration:isVideo(kind)?Number(duration)||undefined:undefined,
        ratio:kind==='enhance'||kind==='music'||kind==='sfx'||kind==='avatar'?undefined:ratio,
        resolution:isVideo(kind)||kind==='enhance'?resolution:undefined,
        models:selected,confirm:selected.length})
      setCurrent(run);setConfirming(false);void refreshRuns()
    }catch(e){setError(e instanceof Error?e.message:String(e));setConfirming(false)}
    finally{setBusy(false)}
  }
  const open=async(id:string)=>{try{setCurrent(await getLabRun(id))}catch(e){setError(e instanceof Error?e.message:String(e))}}
  const rate=async(model:string,score:number)=>{
    if(!current)return
    await rateLabResult(current.id,model,score,'')
    setCurrent(c=>c&&{...c,results:c.results.map(r=>r.model===model?{...r,score}:r)})
  }
  const makeDefault=async(model:string)=>{
    if(!current)return
    const r=await setDefaultModel(current.kind,model);setDefaults(r.defaults)
  }

  return <Stack p="md" gap="md" maw={1400} mx="auto">
    <Title order={3}>模型对比实验室</Title>
    <Text size="sm" c="dimmed">同一份输入同时提交给多个模型，并排比较效果、耗时和费用。每个模型提交一个付费订单，单次最多 {MAX_MODELS} 个。</Text>
    {error&&<Alert color="red" withCloseButton onClose={()=>setError('')}>{error}</Alert>}
    <Radio.Group value={kind} onChange={changeKind} label="类别">
      <Group gap="md" mt={4}>{KINDS.map(k=><Radio key={k.value} value={k.value} label={k.label}/>)}</Group>
    </Radio.Group>
    <Paper withBorder p="sm" radius="md">
      <div role="group" aria-label="可选模型">
        <Group justify="space-between" mb="xs"><Text fw={600} size="sm">可选模型（{ofKind.length}）</Text><Text size="xs" c="dimmed">已选 {selected.length}/{MAX_MODELS}</Text></Group>
        <Stack gap="xs">{families.map(([family,list])=><div key={family}>
          <Text size="xs" fw={600} c="dimmed" mb={4}>{family}</Text>
          <SimpleGrid cols={{base:1,sm:2,lg:3}} spacing={6}>{list.map(m=><Group key={m.id} gap={6} wrap="nowrap">
            <Checkbox size="xs" label={m.name} checked={selected.includes(m.id)} disabled={!selected.includes(m.id)&&selected.length>=MAX_MODELS} onChange={e=>toggle(m.id,e.currentTarget.checked)}/>
            {defaults[kind]===m.id&&<Badge size="xs" color="teal">默认</Badge>}
            {m.channel&&<Badge size="xs" variant="outline">{m.channel}</Badge>}
          </Group>)}</SimpleGrid>
        </div>)}</Stack>
      </div>
    </Paper>
    <Paper withBorder p="sm" radius="md"><Stack gap="xs">
      <Textarea label="提示词" autosize minRows={2} value={prompt} onChange={e=>setPrompt(e.currentTarget.value)}/>
      {wantsLyrics&&<Textarea label="歌词" autosize minRows={3} value={lyrics} onChange={e=>setLyrics(e.currentTarget.value)}/>}
      {needsImages(kind)&&<Textarea label="参考图片地址" description="https 地址，每行一个；第一张作为首帧" autosize minRows={2} value={images} onChange={e=>setImages(e.currentTarget.value)}/>}
      {kind==='enhance'&&<TextInput label="视频地址" value={video} onChange={e=>setVideo(e.currentTarget.value)}/>}
      {kind==='avatar'&&<TextInput label="驱动音频地址" description="https 地址；口型严格跟随这段声音" value={audio} onChange={e=>setAudio(e.currentTarget.value)}/>}
      <Group grow>
        {isVideo(kind)&&<NumberInput label="时长（秒）" min={1} max={15} value={duration} onChange={setDuration}/>}
        {kind!=='music'&&kind!=='sfx'&&kind!=='enhance'&&kind!=='avatar'&&<TextInput label="画面比例" value={ratio} onChange={e=>setRatio(e.currentTarget.value)}/>}
        {(isVideo(kind)||kind==='enhance')&&<TextInput label="分辨率" value={resolution} onChange={e=>setResolution(e.currentTarget.value)}/>}
      </Group>
      <Group justify="flex-end"><Button disabled={selected.length===0} onClick={()=>setConfirming(true)}>开始对比</Button></Group>
    </Stack></Paper>
    <Modal opened={confirming} onClose={()=>setConfirming(false)} title="确认提交付费订单">
      <Stack>
        <Text size="sm">将为所选的每个模型各提交一次，共 {selected.length} 个付费订单。已提交的订单无法撤回。</Text>
        <Group justify="flex-end"><Button variant="default" onClick={()=>setConfirming(false)}>取消</Button><Button loading={busy} onClick={submit}>确认提交</Button></Group>
      </Stack>
    </Modal>
    {current&&<section aria-label="对比结果">
      <Group justify="space-between" mb="xs"><Text fw={600}>对比结果 · {current.id}</Text><Badge>{current.status==='running'?'进行中':'已完成'}</Badge></Group>
      {current.request?.prompt&&<Text size="xs" c="dimmed" mb="xs">提示词：{current.request.prompt}</Text>}
      <SimpleGrid cols={{base:1,sm:2,lg:4}}>{current.results.map(r=><ResultCard key={r.model} run={current} result={r} isDefault={defaults[current.kind]===r.model} onRate={s=>void rate(r.model,s)} onDefault={()=>void makeDefault(r.model)}/>)}</SimpleGrid>
    </section>}
    <Paper withBorder p="sm" radius="md">
      <Text fw={600} size="sm" mb="xs">历史实验</Text>
      {runs.length===0?<Text size="xs" c="dimmed">还没有实验</Text>:<Stack gap={4}>{runs.map(r=><Group key={r.id} justify="space-between">
        <Text size="xs">{r.created_at?.slice(0,16).replace('T',' ')} · {KINDS.find(k=>k.value===r.kind)?.label??r.kind} · {r.results.length} 个模型 · {r.request?.prompt?.slice(0,40)}</Text>
        <Button size="compact-xs" variant="subtle" aria-label={`查看 ${r.id}`} onClick={()=>void open(r.id)}>查看</Button>
      </Group>)}</Stack>}
    </Paper>
    {summary.length>0&&<Paper withBorder p="sm" radius="md">
      <Text fw={600} size="sm" mb="xs">模型汇总</Text>
      <Table fz="xs" striped><Table.Thead><Table.Tr><Table.Th>模型</Table.Th><Table.Th>类别</Table.Th><Table.Th>成功/次数</Table.Th><Table.Th>平均评分</Table.Th><Table.Th>平均耗时</Table.Th><Table.Th>最近费用</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{summary.map(s=><Table.Tr key={s.model}><Table.Td>{s.name}</Table.Td><Table.Td>{s.kind}</Table.Td><Table.Td>{s.success}/{s.runs}</Table.Td><Table.Td>{s.avg_score?s.avg_score.toFixed(1):'-'}</Table.Td><Table.Td>{s.avg_seconds.toFixed(1)} 秒</Table.Td><Table.Td>{s.last_cost??'-'}</Table.Td></Table.Tr>)}</Table.Tbody></Table>
    </Paper>}
  </Stack>
}
