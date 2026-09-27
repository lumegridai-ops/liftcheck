import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.LIFTCHECK_QA_URL??'https://liftcheck.dgkv.chatgpt.site';
const page=await fetch(base,{redirect:'manual'});assert.equal(page.status,200);assert.match(await page.text(),/Hosted prototype/);
const cookieOf=response=>response.headers.getSetCookie().find(s=>s.startsWith('__Host-liftcheck=')).split(';')[0];
const cookie=cookieOf(page);let id=0;
async function rpc(method,params,scope=cookie){const r=await fetch(base+'/api/mcp',{method:'POST',headers:{Cookie:scope,Origin:base,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});assert.equal(r.status,200);return(await r.json()).result;}
async function tool(name,args={},scope=cookie){const r=await rpc('tools/call',{name,arguments:args},scope);if(r.isError)throw new Error(r.content[0].text);return r.structuredContent;}
const init=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'public-qa',version:'1'}});
const count=(await rpc('tools/list',{})).tools.length;assert.equal(init.protocolVersion,'2025-11-25');assert.equal(count,6);
const statuses=[];for(const scenario of ['primary','both','stale'])statuses.push((await tool('run_assembly_replay',{scenario})).checks[0].result.status);assert.deepEqual(statuses,['alternate_entrance','blocked','unknown']);
const saved=await tool('save_journey',{name:'Public hosting QA',legs:[{stationId:'place-astao',fromId:'door-astao-foley',toId:'70278'}],expectedRevision:0});assert.equal((await tool('get_saved_journeys')).journeys[0].id,saved.journeys[0].id);
const other=cookieOf(await fetch(base));assert.equal((await tool('get_saved_journeys',{},other)).journeys.length,0);
const live=await tool('check_journey',{journeyId:saved.journeys[0].id});assert.equal(live.source.mode,'live');
const receipt={at:new Date().toISOString(),url:base,anonymousStatus:page.status,signInRequired:false,protocol:init.protocolVersion,tools:count,replayStatuses:statuses,savedReload:true,visitorIsolation:true,liveSource:live.source,status:live.checks[0].result.status};
await writeFile('artifacts/public-hosting-qa.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
