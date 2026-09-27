import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile} from 'node:fs/promises';
const preview=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-09-26',host:'127.0.0.1',port:4326,d1Databases:{DB:'liftcheck-local'},d1Persist:'.wrangler/hosted-d1'}));
const db=await preview.getD1Database('DB');
for(const statement of (await readFile('drizzle/0000_chilly_starjammers.sql','utf8')).split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean)) {
  await db.prepare(statement.replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ')).run();
}
console.log(`Hosted preview ready: ${await preview.ready}`);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await preview.dispose();process.exit(0);});
