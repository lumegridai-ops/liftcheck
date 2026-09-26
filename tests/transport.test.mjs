import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { start } from '../server.mjs';
import { replaySnapshot } from '../src/alerts.mjs';

test('MCP negotiates 2025-11-25 and a discovered tool flow persists across restart', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'liftcheck-mcp-'));
  const source = {snapshot: async () => replaySnapshot('clear')}; // Explicit test replay, not live evidence.
  let running, client;
  try {
    running = await start({port:0,directory,source});
    const init = await fetch(running.url+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'liftcheck-protocol-qa',version:'1'}}})});
    assert.equal((await init.json()).result.protocolVersion,'2025-11-25');
    client = new Client({name:'liftcheck-qa',version:'1'});
    await client.connect(new StreamableHTTPClientTransport(new URL(running.url+'/mcp')));
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(t=>t.name).sort(),['check_journey','check_station_path','get_saved_journeys','get_station_catalog','run_assembly_replay','save_journey']);
    assert.equal(tools.find(t=>t.name==='save_journey').annotations.readOnlyHint,false);
    const call = async (name,args={}) => {
      const result = await client.callTool({name,arguments:args});
      assert.ok(!result.isError,JSON.stringify(result));
      return result.structuredContent;
    };
    const catalog = await call('get_station_catalog');
    const assembly = catalog.stations.find(s=>s.id==='place-astao');
    assert.ok(assembly.entrances.some(e=>e.id==='door-astao-foley'));
    const original = await call('get_saved_journeys');
    const saved = await call('save_journey',{name:'QA example only',legs:[{stationId:assembly.id,fromId:'door-astao-foley',toId:'70278'}],expectedRevision:original.revision});
    const duplicate = await client.callTool({name:'save_journey',arguments:{name:'Retry with stale revision',legs:saved.journeys[0].legs,expectedRevision:original.revision}});
    assert.equal(duplicate.isError,true);
    const report = await call('check_journey',{journeyId:saved.journeys[0].id});
    assert.equal(report.source.mode,'replay');
    assert.equal(report.checks[0].result.status,'no_reported_closure');
    const alternate = await call('run_assembly_replay',{scenario:'primary'});
    assert.equal(alternate.checks[0].result.status,'alternate_entrance');
    assert.equal(alternate.checks[0].result.path,null);
    const blocked = await call('run_assembly_replay',{scenario:'both'});
    assert.equal(blocked.checks[0].result.status,'blocked');
    assert.deepEqual(blocked.checks[0].result.alternatives,[]);
    await client.close(); client=null; await running.close(); running=null;
    running = await start({port:0,directory,source});
    const response = await fetch(running.url+'/api/tools/get_saved_journeys',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.deepEqual(await response.json(),saved);
  } finally {
    if(client) await client.close(); if(running) await running.close(); rmSync(directory,{recursive:true,force:true});
  }
});

test('local HTTP rejects hostile origins, hosts, invented endpoints and unbounded bodies', async () => {
  const directory=mkdtempSync(path.join(tmpdir(),'liftcheck-http-'));
  const running=await start({port:0,directory,source:{snapshot:async()=>replaySnapshot('clear')}});
  try {
    const post = (name,body,headers={}) => fetch(running.url+'/api/tools/'+name,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await post('get_saved_journeys',{}, {Origin:'https://attacker.invalid'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const req=http.request(running.url+'/health',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
    assert.equal(badHost,403);
    assert.equal((await post('check_station_path',{stationId:'place-astao',fromId:'fake',toId:'70278'})).status,400);
    assert.equal((await post('save_journey',{name:'x',legs:[],expectedRevision:0,extra:'no'})).status,400);
    assert.equal((await post('get_saved_journeys',{payload:'x'.repeat(40_000)})).status,413);
    assert.equal((await fetch(running.url+'/mcp')).status,405);
  } finally {await running.close();rmSync(directory,{recursive:true,force:true});}
});
