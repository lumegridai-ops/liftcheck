import express from 'express';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createNetwork } from './src/engine.mjs';
import { AlertSource } from './src/alerts.mjs';
import { JourneyStore } from './src/store.mjs';
import { LiftCheckService } from './src/service.mjs';
import { createMcpServer } from './src/mcp.mjs';

export function createApp(service) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const hosts = [`127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}`];
    if (!hosts.includes(req.headers.host) || (req.headers.origin && !hosts.some(host => req.headers.origin === `http://${host}`))) {
      return res.status(403).json({error: 'This server accepts requests only from its local page or local MCP client.'});
    }
    res.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({limit: '32kb', strict: true}));
  app.get('/health', (_req,res) => res.json({product: 'LiftCheck', status: 'ok', transport: 'Streamable HTTP', protocol: '2025-11-25'}));
  app.post('/api/tools/:name', async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({error: 'Use JSON.'});
    try {res.json(await service.invoke(req.params.name, req.body));}
    catch (error) {res.status(400).json({error: error.name === 'ZodError' ? 'Check the required fields and try again.' : error.message});}
  });
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer(service);
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true});
    res.on('close', () => {transport.close().catch(() => {}); server.close().catch(() => {});});
    try {await server.connect(transport); await transport.handleRequest(req, res, req.body);}
    catch {if (!res.headersSent) res.status(500).json({jsonrpc: '2.0', error: {code: -32603, message: 'MCP request failed.'}, id: req.body?.id ?? null});}
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({error: 'This stateless MCP endpoint accepts POST.'}));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), {dotfiles: 'deny'}));
  app.use((error, _req,res,_next) => res.status(error.status === 413 ? 413 : 400).json({error: error.status === 413 ? 'Request exceeds 32 KB.' : 'Invalid request body.'}));
  return app;
}

export async function start({port = Number(process.env.PORT ?? 4322), directory = process.env.LIFTCHECK_DATA_DIR ?? fileURLToPath(new URL('./runtime', import.meta.url)), source = new AlertSource(), network} = {}) {
  network ??= createNetwork(JSON.parse(readFileSync(new URL('./data/network.json', import.meta.url), 'utf8')));
  const store = new JourneyStore(path.resolve(directory));
  const service = new LiftCheckService({network, store, source});
  const server = http.createServer(createApp(service));
  try {await new Promise((resolve,reject) => {server.once('error',reject); server.listen(port,'127.0.0.1',resolve);});}
  catch (error) {store.close(); throw error;}
  const close = () => new Promise(resolve => {server.close(() => {store.close(); resolve();}); server.closeAllConnections();});
  return {server, service, url: `http://127.0.0.1:${server.address().port}`, close};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const running = await start();
    console.log(`LiftCheck ${running.url}\nMCP ${running.url}/mcp`);
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async () => {await running.close(); process.exit(0);});
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
