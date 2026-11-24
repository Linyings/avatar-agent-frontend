// Isolated browser check: real built frontend and real reference media, mocked
// read-only catalog/auth only. Never connects to the running production API.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';

const dist=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const runtime=fileURLToPath(new URL('../../backend/avatar-runtime/',import.meta.url));
const evidence=fileURLToPath(new URL('../../backend/data/wsl-deployment/explainer-styles/offline/',import.meta.url));
const definitions=JSON.parse(await readFile(resolve(runtime,'explainer-styles.json'),'utf8'));
const old=JSON.parse(await readFile(resolve(runtime,'native-styles.json'),'utf8')).map(s=>({...s,published:true,legacy:false,archived:true}));
const styles=definitions.map(s=>({...s,published:true,legacy:false,card_poster:`/api/v1/avatar-mvp/catalog/${s.id}/${s.preview_kind==='reference-poster'?'poster':'card-poster'}`,...(s.preview_kind==='reference-poster'?{}:{preview:`/api/v1/avatar-mvp/catalog/${s.id}/reference`,card_preview:`/api/v1/avatar-mvp/catalog/${s.id}/card-preview`})}));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(path!==dist&&!path.startsWith(dist+sep)){res.writeHead(403).end();return;}
  const file=extname(path)?path:resolve(dist,'index.html');
  res.writeHead(200,{'content-type':mime[extname(file)]??'application/octet-stream'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const user={user_id:'offline-styles',username:'offline',email:'offline@example.test',is_active:true,is_verified:true,is_admin:false,language:'zh',timezone:'Asia/Shanghai'};
let browser;
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
  const json=body=>route.fulfill({contentType:'application/json',headers,body:JSON.stringify(body)});
  if(path.startsWith('/api/')){
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(request.method()!=='GET'){writes.push(path);return route.fulfill({status:405,headers});}
   if(path==='/api/v1/auth/me')return json(user);
   if(path==='/api/v1/avatar-mvp/catalog')return json({styles:[...styles,...old],voices:[]});
   const match=path.match(/^\/api\/v1\/avatar-mvp\/catalog\/(explain-[a-z-]+)\/(card-preview|card-poster|poster|reference)$/);
   if(match){
    const suffix={'card-preview':'-card.mp4','card-poster':'-card.jpg',poster:'-reference.jpg',reference:'-reference.mp4'}[match[2]];
    const file=resolve(runtime,'catalog',match[1]+suffix);
    assert.ok(existsSync(file),`Missing actual preview: ${file}`);
    return route.fulfill({contentType:suffix.endsWith('mp4')?'video/mp4':'image/jpeg',headers,body:await readFile(file)});
   }
   return json({});
  }
  return url.origin===origin?route.continue():route.abort();
 });
 await page.addInitScript(user=>{localStorage.setItem('auth_access_token','offline-styles');localStorage.setItem('auth_user',JSON.stringify(user));localStorage.setItem('narratoai-locale','zh');},user);
 await page.goto(origin+'/');
 await page.getByRole('button',{name:/^动效风格：/}).click();
 const dialog=page.getByRole('dialog',{name:'选择动效风格'});
 await expect(dialog.getByRole('button',{name:/^预览/})).toHaveCount(6);
 const decoded=[];
 for(const s of styles){
  const card=dialog.getByRole('button',{name:'预览'+s.name});
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('img')).toBeVisible();
  await expect.poll(()=>card.locator('img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  if(s.card_preview){
   const video=card.locator('video');
   await expect(video).toBeVisible();
   await expect.poll(()=>video.evaluate(v=>v.readyState),{timeout:15000}).toBeGreaterThanOrEqual(2);
   const sample=await video.evaluate(async v=>{await v.play();const start=v.currentTime;await new Promise(r=>setTimeout(r,250));return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,advanced:v.currentTime>start};});
   assert.ok(sample.width>0&&sample.advanced&&sample.duration<=12.1);decoded.push({id:s.id,...sample});
  }else{await expect(card.locator('video')).toHaveCount(0);await expect(card.getByText('参考封面')).toBeVisible();}
  await card.click();await expect(dialog.getByText(s.description,{exact:true})).toBeVisible();
 }
 await mkdir(evidence,{recursive:true});
 await dialog.getByRole('button',{name:'放大预览'}).click();
 const large=page.getByRole('dialog',{name:styles[5].name});
 if(styles[5].preview){
  await expect(large.locator('video')).toBeVisible();
  await expect.poll(()=>large.locator('video').evaluate(v=>v.readyState),{timeout:30000}).toBeGreaterThanOrEqual(2);
 }else{
  await expect(large.locator('img')).toBeVisible();
  await expect.poll(()=>large.locator('img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 }
 await page.screenshot({path:resolve(evidence,'reference-detail.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await expect(large).toHaveCount(0);
 await page.screenshot({path:resolve(evidence,'six-styles-desktop.png'),fullPage:true});
 await dialog.getByRole('button',{name:'使用此风格'}).click();
 await expect(page.getByRole('button',{name:'动效风格：'+styles[5].name})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:/^动效风格：/}).click();
 await expect(dialog.getByRole('button',{name:/^预览/})).toHaveCount(6);
 await page.screenshot({path:resolve(evidence,'six-styles-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 const report={catalog:6,decoded,poster_only:styles.filter(s=>!s.card_preview).map(s=>s.id),selection:'passed',desktop:'passed',mobile:'passed',writes,errors,live_services_touched:false};
 await writeFile(resolve(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.close();}
