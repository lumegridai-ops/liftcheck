import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {build} from 'esbuild';

const entries=[['/','public/index.html','text/html; charset=utf-8'],['/app.js','public/app.js','text/javascript; charset=utf-8'],['/style.css','public/style.css','text/css; charset=utf-8'],['/fonts/IBMPlexSans-Variable.ttf','public/fonts/IBMPlexSans-Variable.ttf','font/ttf'],['/fonts/OFL.txt','public/fonts/OFL.txt','text/plain; charset=utf-8']];
entries.push(['/wayfinding.css','public/wayfinding.css','text/css; charset=utf-8']);
const assets={};
for(const [url,file,type] of entries){
  const bytes=await readFile(file); const binary=file.endsWith('.ttf');let body=binary?bytes.toString('base64'):bytes.toString();
  if(url==='/') body=body.replace('Local prototype','Hosted prototype').replace('Connect an MCP client to this local server.','Connect an MCP client to this server.');
  if(url==='/') body=body.replace('<div id="saved-list"','<p class="muted">Saved for this browser using a private cookie. Clearing cookies loses access; other browsers have separate journeys.</p><div id="saved-list"');
  if(url==='/app.js') body=body.replaceAll('/mcp','/api/mcp');
  assets[url]={body,type,encoding:binary?'base64':'text'};
}
await writeFile('hosted/assets.generated.mjs',`export default ${JSON.stringify(assets)};\n`);
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['hosted/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Built hosted LiftCheck with shared engine, MCP SDK, D1 and actual UI assets.');
