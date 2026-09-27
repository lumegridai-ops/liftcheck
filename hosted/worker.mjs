import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createNetwork } from '../src/engine.mjs';
import { AlertSource } from '../src/alerts.mjs';
import { LiftCheckService } from '../src/service.mjs';
import { createMcpServer } from '../src/mcp.mjs';
import { HostedJourneyStore } from './store.mjs';
import rawNetwork from '../data/network.json';
import assets from './assets.generated.mjs';

const network = createNetwork(rawNetwork), source = new AlertSource();
const cookieName = '__Host-liftcheck';
const headers = {
  'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
}
async function identity(request) {
  const incoming = request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
  const token = /^[a-f0-9]{64}$/.test(incoming ?? '') ? incoming : Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  return {scope:await hash(token),cookie:`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`};
}
function finish(response, cookie) {
  const next = new Response(response.body,{status:response.status,headers:response.headers});
  Object.entries(headers).forEach(([key,value])=>next.headers.set(key,value));
  if (cookie) next.headers.set('Set-Cookie',cookie);
  return next;
}
function error(status, message) { return Response.json({error:message},{status}); }
async function budget(db, scope) {
  const minute = Math.floor(Date.now()/60_000);
  const row = await db.prepare(`INSERT INTO lift_request_budgets (scope, window, count) VALUES (?, ?, 1)
    ON CONFLICT(scope) DO UPDATE SET window=excluded.window,
    count=CASE WHEN lift_request_budgets.window=excluded.window THEN lift_request_budgets.count+1 ELSE 1 END
    RETURNING count`).bind(scope,minute).first();
  return row.count <= 90;
}
async function boundedJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Use JSON.');
  const reader=request.body?.getReader();
  if (!reader) throw new Error('Send a JSON object.');
  const chunks=[];let length=0;
  try { for (;;) { const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>32768)throw new Error('Request exceeds 32 KB.');chunks.push(value); } }
  finally { await reader.cancel().catch(()=>{}); }
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
  if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') throw new Error('Send one JSON object.');
  return parsed;
}
export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    const origin=request.headers.get('origin');
    if (origin && origin!==url.origin) return finish(error(403,'Use this site or a same-origin client.'));
    if (request.method==='OPTIONS') return finish(error(405,'Cross-origin access is not enabled.'));
    if (url.pathname==='/health') return finish(Response.json({product:'LiftCheck',status:'ok',transport:'Streamable HTTP',protocol:'2025-11-25',hosting:'OpenAI Sites'}));
    if (Object.hasOwn(assets,url.pathname) && ['GET','HEAD'].includes(request.method)) {
      const a=assets[url.pathname];
      const body=request.method==='HEAD'?null:(a.encoding==='base64'?Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)):a.body);
      const id=url.pathname==='/'?await identity(request):null;
      return finish(new Response(body,{headers:{'Content-Type':a.type}}),id?.cookie);
    }
    if (url.pathname!=='/api/mcp') return finish(error(404,'Not found.'));
    if (request.method!=='POST') return finish(error(405,'This stateless MCP endpoint accepts POST.'));
    const id=await identity(request);
    try {
      if (!env.DB) throw new Error('Storage binding unavailable');
      const parsed=await boundedJson(request);
      if (!await budget(env.DB,id.scope)) return finish(new Response(JSON.stringify({error:'Please wait a minute before more checks.'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60'}}),id.cookie);
      const service=new LiftCheckService({network,source,store:new HostedJourneyStore(env.DB,id.scope)});
      const server=createMcpServer(service);
      const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
      try {
        await server.connect(transport);
        const response=await transport.handleRequest(request,{parsedBody:parsed});
        return finish(response,id.cookie);
      } finally { await server.close(); }
    } catch (e) {
      const bad=['Use JSON.','Send a JSON object.','Send one JSON object.','Request exceeds 32 KB.'].includes(e.message)||e instanceof SyntaxError||e instanceof TypeError;
      if (!bad) console.error('LiftCheck hosted request failed',e.name);
      return finish(error(bad?400:503,bad?'The request must be a JSON object under 32 KB.':'Saved data is temporarily unavailable. Keep your draft and try again.'),id.cookie);
    }
  },
};
