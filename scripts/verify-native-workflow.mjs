// Offline UI verification. All API calls are intercepted; no live projects,
// credentials, model providers or WSL services are used.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {extname,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium,expect} from '@playwright/test'

const root=fileURLToPath(new URL('../dist/',import.meta.url))
const evidence=fileURLToPath(new URL('../../backend/data/native-ui-offline/',import.meta.url))
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname))
  if(!path.startsWith(resolve(root)+sep)&&path!==resolve(root)){res.writeHead(403).end();return}
  const file=extname(path)?path:resolve(root,'index.html')
  res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'}).end(await readFile(file))
 }catch{res.writeHead(404).end()}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
let browser
try{
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']})
 const page=await browser.newPage({viewport:{width:1600,height:1000}})
 const errors=[],writes=[]
 page.on('pageerror',e=>errors.push(e.message))
 // Synthetic video with a tone: verifies actual browser video/audio playback.
 await page.goto('about:blank')
 const media=Buffer.from(await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640
  const g=canvas.getContext('2d');g.fillStyle='#183149';g.fillRect(0,0,360,640);g.fillStyle='#fff';g.font='24px sans-serif';g.fillText('原声视频 · 离线测试',50,320)
  const audio=new AudioContext(),tone=audio.createOscillator(),sink=audio.createMediaStreamDestination()
  tone.connect(sink);tone.start();await audio.resume()
  const stream=new MediaStream([...canvas.captureStream(10).getTracks(),...sink.stream.getAudioTracks()])
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'}),chunks=[]
  recorder.ondataavailable=e=>chunks.push(e.data)
  const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start()
  const frames=setInterval(()=>{g.fillStyle='#183149';g.fillRect(0,0,360,640);g.fillStyle='#fff';g.fillText('原声视频 · 离线测试',50,320)},50)
  await new Promise(resolve=>setTimeout(resolve,1200));clearInterval(frames);recorder.stop();await done
  stream.getTracks().forEach(t=>t.stop());tone.stop();await audio.close()
  return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
 }))
 const stages=[['F01','用户需求整理',['F01']],['F01.2','需求分析',['F01.2']],['F01.4','参考素材分析',['F01.4']],['F01.6','导演稿设计',['F01.6']],['F03','解说文案撰写与确认',['F02','F03']],['F04','Seedance 原声口播与时间校准',['F04']],['F10','镜头与专用动效制作',['F05','F06','F07','F08','F09','F10']],['F11','镜头审阅与修改',['F11']]].map(([node,title,members])=>({node,title,members}))
 const input={revision:1,title:'原声视频流程离线验收',topic:'离线测试',script:'测试口播',direction:'',ratio:'9:16',style:'',voice:'',speech_mode:'native-video',use_avatar:true,assets:[]}
 const user={user_id:'offline-user',username:'offline',email:'offline@example.test',is_active:true,is_verified:true,is_admin:false,language:'zh',timezone:'Asia/Shanghai'}
 const state={project:{id:'offline',name:input.title,input},packages:stages.flatMap(s=>s.members.map(node=>({id:node,node,title:s.title,description:s.title,dependencies:[],outputs:[],ready:true,reason:'',version:'3',tool:node,entrypoint:'run'}))),styles:[],voices:[],agent_configured:true,proposal:null,workflow_plan:{nodes:stages.flatMap(s=>s.members),material_plan_pending:true,stages},run:{id:'offline-run',version:'avatar-workflow/3.0',status:'running',stage:'F04/p2',input,script:'测试口播',pause_requested:false,duration:5,segments:[{id:'p1',chapter:'开场',text:'画面与声音一起生成。',start:0,duration:5,native_video:'p1/native.mp4',audio:'p1/audio.wav'},{id:'p2',chapter:'正文',text:'接下来制作专用动效。',start:5,duration:0}],steps:[{id:'F03',status:'succeeded',seconds:1},{id:'F04/p1',status:'succeeded',seconds:1},{id:'F04/p2',status:'running',seconds:1}],needs:[],materials:[],shots:[],artifacts:[{id:'native-p1',name:'原声视频.mp4',media_type:'video/mp4'}]}}
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
  const json=body=>route.fulfill({contentType:'application/json',headers,body:JSON.stringify(body)})
  if(path.startsWith('/api/')){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers})
   if(request.method()!=='GET'){writes.push(path);return route.fulfill({status:405,headers})}
   if(path==='/api/v1/auth/me')return json(user)
   if(path==='/api/v1/agent/project/offline')return json(state)
   if(path==='/api/v1/agent/history')return json({messages:[]})
   if(path==='/api/v1/agent/stream')return route.fulfill({contentType:'text/event-stream',headers,body:': offline\n\n'})
   if(path.endsWith('/artifacts/native-p1'))return route.fulfill({contentType:'video/webm',headers,body:media})
   return json({})
  }
  if(url.origin===origin)return route.continue()
  return route.abort()
 })
 await page.addInitScript(user=>{localStorage.setItem('auth_access_token','offline-ui-test');localStorage.setItem('auth_user',JSON.stringify(user));localStorage.setItem('narratoai-locale','zh')},user)
 await page.goto(origin+'/workspace/offline')
 const card=page.getByTestId('workflow-node-F04/p1')
 await expect(card).toBeAttached()
 await expect(page.getByTestId('workflow-node-F04')).toHaveCount(0)
 await expect(card).toContainText('7.1')
 await expect(page.getByRole('button',{name:'定位正在执行的数字人视频（含原声） · 正文'})).toBeVisible()
 await page.getByRole('button',{name:'查看全部节点',exact:true}).click()
 await page.getByRole('button',{name:'查看数字人视频（含原声） · 开场详情',exact:true}).click()
 const detail=page.getByLabel('步骤详情'),video=detail.locator('video')
 await expect(video).toBeVisible();await expect(detail.locator('audio')).toHaveCount(0)
 const playback=await video.evaluate(async video=>{
  await video.play()
  await new Promise(resolve=>setTimeout(resolve,250))
  const tracks=video.captureStream().getAudioTracks()
  const result={currentTime:video.currentTime,muted:video.muted,volume:video.volume,audioTracks:tracks.length}
  video.pause();return result
 })
 assert.ok(playback.currentTime>0);assert.equal(playback.muted,false);assert.ok(playback.volume>0);assert.equal(playback.audioTracks,1)
 await mkdir(evidence,{recursive:true})
 await page.screenshot({path:resolve(evidence,'before-planning.png')})
 // Advance only the mocked snapshot; wait for the app's ordinary read polling.
 state.run.stage='F07/m1';state.run.steps[2].status='succeeded';state.run.segments[1].native_video='p2/native.mp4'
 state.run.needs=[{id:'a1',kind:'avatar',segment_id:'p1',content:'自然讲解',prompt:'自然讲解'},{id:'m1',kind:'animation',segment_id:'p1',content:'信息图解',prompt:'文字逐句展开'}]
 state.run.steps.push({id:'F05',status:'succeeded',seconds:1},{id:'F06/a1',status:'succeeded',seconds:1},{id:'F07/m1',status:'running',seconds:1})
 state.run.materials=[{need_id:'a1',kind:'avatar',duration:5}]
 await expect(detail.getByRole('button',{name:'保存提示词'})).toBeVisible({timeout:12000})
 await expect(page.getByTestId('workflow-node-F06/a1')).toHaveCount(0)
 await expect(detail.locator('video')).toBeVisible()
 await detail.locator('video').evaluate(async video=>{await video.play();await new Promise(resolve=>setTimeout(resolve,250));video.pause()})
 await page.getByRole('combobox',{name:'定位制作步骤'}).fill('开场')
 await page.getByRole('option',{name:'7.1 数字人视频（含原声） · 开场',exact:true}).click()
 await expect(card.locator('video')).toBeAttached()
 const canvasPlayback=await card.locator('video').evaluate(async video=>{await video.play();await new Promise(resolve=>setTimeout(resolve,250));video.pause();return {currentTime:video.currentTime,muted:video.muted}})
 assert.ok(canvasPlayback.currentTime>0);assert.equal(canvasPlayback.muted,false)
 await page.screenshot({path:resolve(evidence,'after-planning.png')})
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 await writeFile(resolve(evidence,'verification.json'),JSON.stringify({passed:true,offline:true,liveApiRequests:0,writeRequests:writes,pageErrors:errors,playback,canvasPlayback,checks:['独立第6步隐藏','第7步生成节点','画布与详情内视频可播放','音轨未静音','规划前后节点与详情保留']},null,2))
 console.log(JSON.stringify({passed:true,evidence,playback}))
}finally{
 if(browser)await browser.close()
 await new Promise(resolve=>server.close(resolve))
}
