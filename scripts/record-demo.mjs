// Records actual browser interactions with a real server. Replay alerts are explicitly labeled.
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {start} from '../server.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts','recording');
await fs.mkdir(out,{recursive:true});
const texts=[
  'LiftCheck checks the station entrance and platform you actually use. This is the working application, recorded with synthetic narration. It checks published pathways and reports, not physical accessibility.',
  'This button fetches current M B T A reports and traces the selected station path. The result names every elevator, shows relevant advisories, and links to its sources. No reported closure is deliberately weaker than saying an elevator works.',
  'Save the station check under an example journey, then reload. The saved entrance and platform persist. A journey can hold four station checks, evaluated together from one complete alert snapshot.',
  'Now the labeled failure replay. These outages are invented over the real Assembly map. Closing elevator seven seventeen affects the Foley entrance. The alternative starts at Revolution Drive and depends on elevators seven eighteen and seven nineteen. The outdoor route to that entrance has not been checked.',
  'Close seven nineteen too. LiftCheck withdraws the alternative. It does not repeat a workaround whose own elevator is unavailable. Expire the feed, and the answer becomes unknown, with no path offered.',
  'Every visible action calls the actual self hosted M C P server using Streamable H T T P. The source, tests and evidence are reproducible. Fifty three checks passed, including independent review and browser stories. Real Alexa device use and rider validation remain untested.'
];
const audio=[];
for(let i=0;i<texts.length;i++){
  const txt=path.join(out,`segment-${i}.txt`),file=path.join(out,`segment-${i}.aiff`);
  await fs.writeFile(txt,texts[i]);
  execFileSync('say',['-v','Samantha (English (US))','-r','172','-f',txt,'-o',file]);
  audio.push({file,duration:Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim())});
}
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'liftcheck-demo-'));
const running=await start({port:0,directory});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1024},recordVideo:{dir:out,size:{width:1440,height:1024}}});
const page=await context.newPage(),video=page.video(),calls=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',async response=>{
  if(response.url().endsWith('/mcp')&&response.request().postDataJSON()?.id){
    try {calls.push({observedAt:new Date().toISOString(),request:response.request().postDataJSON(),response:await response.json()});}catch{}
  }
});
const started=Date.now(),offsets=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function segment(index,action){
  offsets[index]=(Date.now()-started)/1000;
  const begin=Date.now();
  if(action)await action();
  await pause(Math.max(300,audio[index].duration*1000+600-(Date.now()-begin)));
}
try{
  await page.goto(running.url);await page.getByRole('button',{name:'Check current reports'}).waitFor();
  await page.screenshot({path:path.join(root,'artifacts','desktop.png'),fullPage:true});
  await segment(0);
  await segment(1,async()=>{
    await page.getByRole('button',{name:'Check current reports'}).click();
    await page.locator('.check-card').waitFor();
    await page.evaluate(()=>scrollTo({top:195,behavior:'smooth'}));
    await page.screenshot({path:path.join(root,'artifacts','live-check.png'),fullPage:true});
  });
  await segment(2,async()=>{
    await page.getByRole('button',{name:'+ Add this check to a saved journey'}).click();
    await page.getByLabel('Journey name').fill('Example morning');
    await pause(1000);await page.getByRole('button',{name:'Save journey',exact:true}).click();
    await pause(1500);await page.reload();
    await page.getByRole('button',{name:'Example morning 1 station check',exact:true}).click();
    await page.locator('.check-card').waitFor();await page.evaluate(()=>scrollTo({top:225,behavior:'smooth'}));
  });
  await segment(3,async()=>{
    await page.getByRole('button',{name:'2 Close elevator 717'}).click();
    await page.locator('.path-box.alternative').waitFor();await page.evaluate(()=>scrollTo({top:225,behavior:'smooth'}));
    await page.screenshot({path:path.join(root,'artifacts','alternative.png'),fullPage:true});
  });
  await segment(4,async()=>{
    await page.getByRole('button',{name:'3 Also close 719'}).click();
    await page.locator('.status-badge.blocked').waitFor();await page.evaluate(()=>scrollTo({top:225,behavior:'smooth'}));
    await page.screenshot({path:path.join(root,'artifacts','withdrawn.png'),fullPage:true});
    await pause(7000);await page.getByRole('button',{name:'4 Expire the feed'}).click();
    await page.locator('.status-badge.unknown').waitFor();await page.evaluate(()=>scrollTo({top:225,behavior:'smooth'}));
  });
  await segment(5,async()=>{
    await page.locator('.connection summary').click();await page.locator('.connection').scrollIntoViewIfNeeded();
  });
  await pause(700);
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
  await fs.writeFile(path.join(root,'artifacts','mcp-demo-trace.json'),JSON.stringify(calls,null,2));
  await context.close();const source=await video.path();await browser.close();await running.close();await fs.rm(directory,{recursive:true,force:true});
  const filters=audio.map((item,i)=>`[${i+1}:a]adelay=${Math.round(offsets[i]*1000)}:all=1[a${i}]`);
  filters.push(audio.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${audio.length}:duration=longest:normalize=0,apad,alimiter=limit=0.95[a]`);
  const output=path.join(root,'artifacts','liftcheck-demo.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,...audio.flatMap(a=>['-i',a.file]),'-filter_complex',filters.join(';'),'-map','0:v','-map','[a]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',output]);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',output],{encoding:'utf8'}));
  await fs.writeFile(path.join(root,'artifacts','demo-manifest.json'),JSON.stringify({recordedAt:new Date().toISOString(),source:'Actual automated browser recording; synthetic narration; source modes preserved in trace.',offsets,texts,probe},null,2));
  await fs.writeFile(path.join(root,'docs','DEMO-TRANSCRIPT.md'),'# Demonstration transcript\n\nActual application capture; synthetic narration. Live reports were genuinely fetched during recording; synthetic outages are visibly labeled. No Alexa device or voice-agent conversation is depicted.\n\n'+texts.join('\n\n')+'\n');
  console.log(JSON.stringify({output,duration:probe.format.duration,bytes:probe.format.size,mcpResponses:calls.length,browserErrors:errors}));
}catch(error){await context.close().catch(()=>{});await browser.close().catch(()=>{});await running.close().catch(()=>{});throw error;}
