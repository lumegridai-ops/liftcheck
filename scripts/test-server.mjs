import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {start} from '../server.mjs';
import {replaySnapshot} from '../src/alerts.mjs';
const directory=mkdtempSync(path.join(tmpdir(),'liftcheck-browser-'));
const running=await start({port:4330,directory,source:{snapshot:async()=>replaySnapshot('clear')}});
console.log(`Browser fixture server ${running.url}; all check sources are explicitly replay, not live.`);
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await running.close();rmSync(directory,{recursive:true,force:true});process.exit(0);});
