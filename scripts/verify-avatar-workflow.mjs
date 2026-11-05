// Read-only browser acceptance: no generation/retry/stop requests are made.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';

const [runId,outputArg]=process.argv.slice(2);
assert(runId,'run ID required');
const output=path.resolve(outputArg||'../docs/evidence/v22/browser');await fs.mkdir(output,{recursive:true});
const accessFile=path.join(process.env.LOCALAPPDATA,'AiCat','AvatarMVP','LOCAL_ACCESS.txt');
const access=Object.fromEntries((await fs.readFile(accessFile,'utf8')).split(/\r?\n/).filter(s=>s.includes(': ')).map(s=>{const i=s.indexOf(': ');return [s.slice(0,i).trim(),s.slice(i+2).trim()]}));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});const page=await context.newPage();const errors=[];let tokenUrl=false;
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const u=new URL(request.url());if(u.searchParams.has('jwt')||u.searchParams.has('access_token'))tokenUrl=true});
try{
 await page.goto('http://127.0.0.1:8080/login');await page.locator('#email').fill(access.Email);await page.locator('#password').fill(access.Password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname!='/login');
 await page.goto('http://127.0.0.1:8080/avatar-mvp?run_id='+encodeURIComponent(runId));
 await page.getByRole('heading',{name:'制作完成',exact:true}).waitFor({timeout:30000});
 await page.screenshot({path:path.join(output,'workflow-reminders.png'),fullPage:true});
 for(let i=0;i<50;i++){
  const button=page.getByRole('button',{name:'知道了',exact:true});if(!await button.isVisible())break;await button.click();await page.waitForTimeout(350);
 }
 const video=page.locator('video[aria-label="video"]');await video.waitFor();await video.scrollIntoViewIfNeeded();
 await video.evaluate(async element=>{await element.play()});
 await page.waitForFunction(()=>{const v=document.querySelector('video[aria-label="video"]');return v?.currentTime>.2},{timeout:20000});
 const media=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,playing:!v.paused}));assert(media.playing&&media.duration>0);
 await page.screenshot({path:path.join(output,'workflow-playback.png'),fullPage:true});
 const security=await page.evaluate(async id=>{
  const p=`/api/v1/avatar-mvp/runs/${encodeURIComponent(id)}/artifacts/video`;
  const anonymous=await fetch(p);const range=await fetch(p,{headers:{Authorization:'Bearer '+localStorage.getItem('auth_access_token'),Range:'bytes=0-127'}});
  return {anonymous:anonymous.status,range:range.status,bytes:(await range.arrayBuffer()).byteLength};
 },runId);assert.equal(security.anonymous,401);assert.equal(security.range,206);assert.equal(security.bytes,128);
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'下载 口播成片.mp4',exact:true}).click();const download=await downloadEvent;await download.saveAs(path.join(output,'browser-download.mp4'));assert.equal(await download.failure(),null);
 await page.reload();await page.getByRole('heading',{name:'制作完成',exact:true}).waitFor({timeout:30000});assert(new URL(page.url()).searchParams.get('run_id')===runId);assert(!tokenUrl);assert.deepEqual(errors,[]);
 // Exercise local input selection without saving or starting any project.
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 await page.getByRole('combobox',{name:'数字人机位（可选）',exact:true}).click();
 await page.getByRole('option',{name:'正面',exact:true}).click();await page.getByRole('option',{name:'左前方20度',exact:true}).click();
 assert.equal(await page.getByLabel('制作要求（可选）',{exact:true}).inputValue(),'请使用正面、左前方20度机位拍摄上半身口播。');
 assert.deepEqual(errors,[]);
 const report={run_id:runId,login:'passed',refresh:'passed',preview:media,download:'passed',two_angle_selection:'passed (unsaved; no generation)',security,token_in_url:tokenUrl,page_errors:errors};await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){
 await fs.writeFile(path.join(output,'browser-failure.json'),JSON.stringify({run_id:runId,error:error.message,page_errors:errors},null,2));
 if(new URL(page.url()).pathname!=='/login')await page.screenshot({path:path.join(output,'workflow-failure.png'),fullPage:false}).catch(()=>{});
 throw error;
}finally{await browser.close()}
