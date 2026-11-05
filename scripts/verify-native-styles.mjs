// Read-only UI smoke: uses the saved local account; never starts a model run.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:8080';
const access={};for(const line of fs.readFileSync(path.join(process.env.LOCALAPPDATA,'AiCat/AvatarMVP/LOCAL_ACCESS.txt'),'utf8').split(/\r?\n/)){const at=line.indexOf(': ');if(at>0&&access[line.slice(0,at)]===undefined)access[line.slice(0,at)]=line.slice(at+2)}
const out=path.resolve(process.argv[2]||'test-results/mg-native');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];let modelStarts=0;
page.setDefaultTimeout(20000);
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/avatar-mvp/**',route=>{const req=route.request();if(req.method()==='POST'&&/\/runs(?:\?|$)/.test(req.url())){modelStarts++;return route.abort()}return route.continue()});
try{
 await page.goto(base+'/login');await page.locator('#email').fill(access.Email);await page.locator('#password').fill(access.Password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');
 const catalogReady=page.waitForResponse(r=>r.url().endsWith('/avatar-mvp/catalog')&&r.status()===200);
 await page.goto(base+'/avatar-mvp');await page.getByRole('heading',{name:'从内容到完整视频'}).waitFor();
 const response=await (await catalogReady).json();const styles=(response.data||response).styles.filter(s=>!s.legacy);
 if(styles.length!==15||styles.some(s=>!s.published||s.preview_kind!=='upstream-original'))throw new Error('All 15 original templates must be published');
 const names=styles.map(s=>s.name);
 for(const name of names){await page.getByRole('button',{name:'选择'+name,exact:true}).click();await page.waitForTimeout(150);console.log(JSON.stringify({selected:name,display:await page.getByRole('combobox',{name:/动效风格/}).inputValue()}));await page.waitForFunction(name=>[...document.querySelectorAll('input')].some(e=>e.value===name),name)}
 await page.getByRole('button',{name:'选择'+names[0],exact:true}).click();
 await page.waitForFunction(name=>{const v=[...document.querySelectorAll('video')].find(v=>v.getAttribute('aria-label')===name+'原版演示');return v&&v.readyState>=2&&!v.paused},names[0]);
 const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewport:[innerWidth,innerHeight],videos:[...document.querySelectorAll('video')].map(v=>({w:v.getBoundingClientRect().width,h:v.getBoundingClientRect().height}))}));console.log(JSON.stringify({dimensions}));
 await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:false});
 await page.getByRole('button',{name:'案例与源码',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByText('原版模板演示',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'查看原提示词',exact:true}).click();await dialog.locator('pre').waitFor();
 await dialog.getByRole('button',{name:'查看参考原片',exact:true}).click();await dialog.getByText('参考原片（用于对照，不是本次项目产物）',{exact:true}).waitFor();
 await page.waitForFunction(()=>{const d=document.querySelector('[role=dialog]');return d&&[...d.querySelectorAll('video')].every(v=>v.readyState>=2)});
 const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载源码与制作包',exact:true}).click();const file=await downloaded;await file.saveAs(path.join(out,file.suggestedFilename()));
 await page.screenshot({path:path.join(out,'style-details.png'),fullPage:false});await page.keyboard.press('Escape');
 await page.reload();await page.getByRole('button',{name:'选择'+names[0],exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'gallery-mobile.png'),fullPage:false});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 if(errors.length||modelStarts||overflow)throw new Error(JSON.stringify({errors,modelStarts,overflow}));
 const report={login:'passed',native_style_options:styles.length,selection:'passed',dynamic_thumbnail_playing:true,preview_and_reference_decoded:true,prompt:'passed',source_download:file.suggestedFilename(),refresh:'passed',mobile_overflow:false,page_errors:errors,model_run_starts:modelStarts};fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){console.log(JSON.stringify({url:page.url(),dimensions:await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}))}));await page.screenshot({path:path.join(out,'failure.png'),fullPage:false}).catch(()=>{});throw e}finally{await browser.close()}

