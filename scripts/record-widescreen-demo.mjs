// Fresh, native 4K capture of real app interactions. No endpoint mocks.
// Run after placing the documented Gemini narration WAVs + JSON in artifacts/narration/.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {start} from '../server.mjs';
import {capture,encode,makeCard,pause,hash} from './native-video.mjs';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'artifacts','widescreen-recording');
const narration=process.env.NARRATION_DIR||path.join(root,'artifacts','narration');
await fs.mkdir(out,{recursive:true});
const audio=[];
for(let index=0;index<8;index++){
  const name=`liftcheck-${String(index).padStart(2,'0')}`;
  const metadata=JSON.parse(await fs.readFile(path.join(narration,name+'.json'),'utf8'));
  const file=path.join(narration,name+'.wav');
  if(hash(await fs.readFile(file))!==metadata.sha256)throw Error('Narration hash mismatch: '+name);
  audio.push({...metadata,file});
}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'liftcheck-widescreen-'));
const running=await start({port:0,directory:temp});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:3,reducedMotion:'reduce'});
const page=await context.newPage(),calls=[],errors=[],timeline=[];page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('response',async response=>{
  if(response.url().endsWith('/mcp')&&response.request().postDataJSON()?.id){try{calls.push({observedAt:new Date().toISOString(),request:response.request().postDataJSON(),response:await response.json()});}catch{}}
});
const intro=path.join(out,'intro.png'),outro=path.join(out,'outro.png');
await makeCard(browser,{file:intro,product:'LiftCheck',eyebrow:'The second elevator matters',title:'What if the workaround\nfails too?',subtitle:'A station path is only as useful as its next connection.',footer:'Boston · Assembly / State / Malden Center'});
await makeCard(browser,{file:outro,product:'LiftCheck',eyebrow:'Check the path. Recheck the workaround.',title:'Check the path.\nRecheck the workaround.',subtitle:'Source, setup and reproducible tests: github.com/lumegridai-ops/liftcheck',footer:'3 mapped stations · Published reports only · Alexa device use unverified',closing:true});
let recording,result;
try{
  await page.goto(running.url);await page.getByRole('button',{name:'Check current reports'}).waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(root,'artifacts','desktop-4k.png'),fullPage:true});
  // Enter the visibly labelled failure lab before the first app shot. This is real replay behavior.
  await page.getByRole('button',{name:'2 Close elevator 717'}).scrollIntoViewIfNeeded();
  recording=await capture(page,path.join(out,'frames'));
  async function segment(index,action){const start=recording.now();if(action)await action();await pause(Math.max(500,(audio[index].seconds+.9-(recording.now()-start))*1000));timeline.push({index,start,end:recording.now(),text:audio[index].text});}
  await segment(1,async()=>{
    await pause(900);await page.getByRole('button',{name:'2 Close elevator 717'}).click();await page.locator('.path-box.alternative').waitFor();
    await page.locator('.check-card').scrollIntoViewIfNeeded();await pause(1800);
    await page.screenshot({path:path.join(root,'artifacts','alternative-4k.png'),fullPage:true});
  });
  await segment(2,async()=>{
    await page.getByRole('button',{name:'3 Also close 719'}).click();await page.locator('.status-badge.blocked').waitFor();await page.locator('.check-card').scrollIntoViewIfNeeded();
    await pause(3700);await page.getByRole('button',{name:'4 Expire the feed'}).click();await page.locator('.status-badge.unknown').waitFor();await page.locator('.check-card').scrollIntoViewIfNeeded();
  });
  await segment(3,async()=>{
    await page.getByRole('button',{name:'Check current reports'}).scrollIntoViewIfNeeded();await pause(1000);
    await page.getByRole('button',{name:'Check current reports'}).click();await page.locator('.check-card').waitFor();
    await page.locator('#source-pill.live').waitFor();
    await page.locator('.check-card').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','live-check-4k.png'),fullPage:true});
  });
  await segment(4,async()=>{
    await page.getByRole('button',{name:'+ Add this check to a saved journey'}).click();await page.getByLabel('Journey name').fill('My morning station');
    await pause(900);await page.getByRole('button',{name:'Save journey',exact:true}).click();await pause(1200);await page.reload();
    await page.getByRole('button',{name:'My morning station 1 station check',exact:true}).click();await page.locator('.check-card').waitFor();await page.locator('.check-card').scrollIntoViewIfNeeded();
  });
  await segment(5,async()=>{await page.locator('.connection summary').click();await page.locator('.connection').scrollIntoViewIfNeeded();});
  await segment(6,async()=>{await page.locator('footer').scrollIntoViewIfNeeded();});
  result=await recording.stop();recording=null;
  if(errors.length)throw Error(errors.join('\n'));
  if(!calls.some(c=>c.request?.method==='tools/call'))throw Error('No real MCP tool call was captured');
  await fs.writeFile(path.join(out,'actual-mcp-trace.json'),JSON.stringify(calls,null,2)+'\n');
  const output=path.join(root,'artifacts','liftcheck-demo-4k.mp4');
  const rendered=await encode({...result,audio,timeline,intro,outro,output,directory:out});
  await fs.writeFile(path.join(root,'artifacts','widescreen-demo-manifest.json'),JSON.stringify({recordedAt:new Date().toISOString(),file:path.basename(output),actual_browser_interactions:true,synthetic_outages_visibly_labeled:true,narration:{provider:'Google Gemini',model:audio[0].model,voice:audio[0].voice,synthetic:true},browserErrors:errors,mcp_responses:calls.length,...rendered},null,2)+'\n');
  console.log(JSON.stringify({output,seconds:rendered.probe.format.duration,sha256:rendered.sha256,sourceFrames:rendered.source_frames}));
}finally{if(recording)await recording.stop().catch(()=>{});await context.close();await browser.close();await running.close();await fs.rm(temp,{recursive:true,force:true});}
