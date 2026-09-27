import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../../dist/server/index.js';
import {HostedJourneyStore} from '../../hosted/store.mjs';

// Real SQLite executes the production migration and prepared SQL. Runtime wiring
// is checked separately under workerd and on the public deployment.
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../drizzle/0000_chilly_starjammers.sql',import.meta.url),'utf8'));
  return {sql,prepare(query) {
    const stmt=sql.prepare(query);
    return {bind(...values) {return {
      async first(){return stmt.get(...values)??null;},
      async run(){return {meta:{changes:stmt.run(...values).changes}};},
    };}};
  }};
}
const base='https://liftcheck.example';
const leg={stationId:'place-astao',fromId:'door-astao-foley',toId:'70278'};
function rpc(db,cookie,name,args={},extra={}) {
  return worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25',Cookie:cookie,...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,method:name.startsWith('tools/')||name==='initialize'?name:'tools/call',params:name==='initialize'?{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}:name==='tools/list'?{}:{name,arguments:args}})}),{DB:db});
}
async function cookie() {return (await worker.fetch(new Request(base+'/'),{})).headers.get('set-cookie').split(';')[0];}
async function tool(db,c,name,args) {const r=await rpc(db,c,name,args);assert.equal(r.status,200);return (await r.json()).result;}

test('hosted MCP negotiates actual protocol and exposes all six SDK tools',async()=>{
  const db=database(),c=await cookie();
  assert.equal((await (await rpc(db,c,'initialize')).json()).result.protocolVersion,'2025-11-25');
  assert.equal((await (await rpc(db,c,'tools/list')).json()).result.tools.length,6);
  const primary=await tool(db,c,'run_assembly_replay',{scenario:'primary'});
  assert.equal(primary.structuredContent.checks[0].result.status,'alternate_entrance');
  assert.equal((await tool(db,c,'run_assembly_replay',{scenario:'both'})).structuredContent.checks[0].result.status,'blocked');
  assert.equal((await tool(db,c,'run_assembly_replay',{scenario:'stale'})).structuredContent.checks[0].result.status,'unknown');
  db.sql.close();
});
test('browser identities are isolated and saved SQL state survives new request/store instances',async()=>{
  const db=database(),a=await cookie(),b=await cookie();assert.notEqual(a,b);
  const saved=(await tool(db,a,'save_journey',{name:'Morning <route>',legs:[leg],expectedRevision:0})).structuredContent;
  assert.equal(saved.revision,1);
  assert.deepEqual((await tool(db,a,'get_saved_journeys')).structuredContent,saved);
  assert.deepEqual((await tool(db,b,'get_saved_journeys')).structuredContent,{revision:0,journeys:[]});
  assert.equal((await tool(db,b,'check_journey',{journeyId:saved.journeys[0].id})).isError,true);
  assert.equal((await tool(db,a,'save_journey',{name:'Stale',legs:[leg],expectedRevision:0})).isError,true);
  db.sql.close();
});
test('concurrent revision-zero insert permits exactly one save',async()=>{
  const db=database();const one=new HostedJourneyStore(db,'same'),two=new HostedJourneyStore(db,'same');
  const results=await Promise.allSettled([one.save({name:'one',legs:[leg],expectedRevision:0}),two.save({name:'two',legs:[leg],expectedRevision:0})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await one.read()).journeys.length,1);assert.equal((await one.read()).revision,1);db.sql.close();
});
test('hosted boundary rejects foreign origins, large bodies, invalid JSON and extra public APIs',async()=>{
  const db=database(),c=await cookie();
  assert.equal((await rpc(db,c,'get_saved_journeys',{}, {Origin:'https://evil.example'})).status,403);
  for(const body of ['[]','{bad',JSON.stringify({oversized:'x'.repeat(33000)})]) {
    const result=await worker.fetch(new Request(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body}),{DB:db});assert.equal(result.status,400);
  }
  assert.equal((await worker.fetch(new Request(base+'/api/tools/save_journey'),{DB:db})).status,404);
  assert.equal((await worker.fetch(new Request(base+'/mcp'),{DB:db})).status,405);
  db.sql.close();
});
test('opaque cookie and hosting copy accurately describe browser scope',async()=>{
  const r=await worker.fetch(new Request(base+'/'),{}),html=await r.text(),c=r.headers.get('set-cookie');
  assert.match(c,/^__Host-liftcheck=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.match(html,/Hosted prototype/);assert.match(html,/other browsers have separate journeys/i);
  assert.match(r.headers.get('cache-control'),/no-store/);
});
