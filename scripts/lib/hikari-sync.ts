import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

export const DATA_REPOSITORY='https://github.com/Hikari-Tsai/ai-interview';
const directories=['questions','answers','sources','overrides'] as const;
const allowed=/^data\/(?:(?:questions|answers|overrides)\/Q\d{4,}\.json|sources\/[a-f0-9]{64}\.json|state\/upstream\.json)$/;
const maxFile=1024*1024, maxTotal=64*1024*1024;
const commitId=z.string().regex(/^[a-f0-9]{40}$/);
const provenance=z.object({commit:commitId,blob:commitId,observedCommit:commitId.optional(),parserVersion:z.string().optional(),repo:z.literal('https://github.com/pallavi-shekhar/ai-engineering-interview-questions-company-wise'),path:z.literal('README.md'),syncedAt:z.string().datetime(),activeCount:z.number().int().positive()}).strict();
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export interface Snapshot {commit:string;files:Map<string,string>}

/** Read only allowlisted, regular JSON blobs. Never check out or execute upstream code. */
export function readSnapshot(repository:string):Snapshot {
 const git=(args:string[])=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',maxBuffer:maxTotal,timeout:60000});
 const commit=git(['rev-parse','HEAD']).trim();
 if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Invalid upstream commit');
 const tree=git(['ls-tree','-r','-z','-l',commit,'--',...directories.map(d=>`data/${d}`),'data/state/upstream.json']);
 const entries=tree.split('\0').filter(Boolean).filter(entry=>entry.endsWith('.json')).map(entry=>{
  const match=entry.match(/^(\d+) (\w+) ([a-f0-9]{40})\s+(\d+)\t(.+)$/);
  if(!match)throw new Error('Invalid upstream tree entry');
  const [,mode,type,oid,bytes,path]=match, size=Number(bytes);
  if(!allowed.test(path)||mode!=='100644'||type!=='blob'||size>maxFile)throw new Error(`Unsupported upstream data file: ${path}`);
  return {oid,size,path};
 });
 if(!entries.length||entries.length>10000||entries.reduce((n,e)=>n+e.size,0)>maxTotal)throw new Error('Upstream dataset is empty or too large');
 const output=execFileSync('git',['-C',repository,'cat-file','--batch'],{input:entries.map(e=>e.oid).join('\n')+'\n',maxBuffer:maxTotal+1024*1024,timeout:60000});
 const files=new Map<string,string>();let offset=0;
 for(const entry of entries) {
  const end=output.indexOf(10,offset);
  if(end<0||output.subarray(offset,end).toString()!==`${entry.oid} blob ${entry.size}`)throw new Error('Invalid upstream blob response');
  offset=end+1;
  const bytes=output.subarray(offset,offset+entry.size);offset+=entry.size;
  if(output[offset++]!==10)throw new Error('Truncated upstream blob');
  const text=bytes.toString('utf8'),value=JSON.parse(text);
  if(entry.path==='data/state/upstream.json')provenance.parse(value);
  const identity=entry.path.match(/^data\/(questions|answers|overrides)\/(Q\d+)\.json$/);
  if(identity) {
   const id=identity[1]==='questions'?value?.id:identity[1]==='answers'?value?.questionId:value?.answer?.questionId;
   if(id!==identity[2])throw new Error(`Upstream file identity mismatch: ${entry.path}`);
  }
  files.set(entry.path,text);
 }
 if(!files.has('data/state/upstream.json')||!entries.some(e=>e.path.startsWith('data/questions/'))||!entries.some(e=>e.path.startsWith('data/answers/')))throw new Error('Upstream snapshot is missing required data');
 return {commit,files};
}

async function exists(path:string) {
 try {await lstat(path);return true;}catch(error:any){if(error.code==='ENOENT')return false;throw error;}
}
async function assertNoSymlinks(path:string):Promise<void> {
 if(!await exists(path))return;
 const stat=await lstat(path);
 if(stat.isSymbolicLink())throw new Error(`Symlinks are not supported in local sync data: ${path}`);
 if(stat.isDirectory())for(const name of await readdir(path))await assertNoSymlinks(join(path,name));
}

/** Validate with this fork's code, dictionaries and community contributions. */
export function validateSnapshot(stage:string) {
 const validator=fileURLToPath(new URL('../validate.ts',import.meta.url));
 const loader=fileURLToPath(new URL('../../node_modules/tsx/dist/loader.mjs',import.meta.url));
 execFileSync(process.execPath,['--import',loader,validator],{cwd:stage,stdio:'pipe',timeout:120000});
}

export async function importSnapshot(root:string,snapshot:Snapshot,validate=validateSnapshot) {
 root=resolve(root);
 // Keep every existing permalink (including ones used by private answers).
 const oldQuestions=await exists(join(root,'data/questions'))?await readdir(join(root,'data/questions')):[];
 for(const name of oldQuestions.filter(n=>/^Q\d+\.json$/.test(n))) {
  if(!snapshot.files.has(`data/questions/${name}`))throw new Error(`Upstream removed ${name}; review before importing`);
 }
 for(const path of ['data','lang','content/community','.private'])await assertNoSymlinks(join(root,path));
 await mkdir(join(root,'.private'),{recursive:true});
 const stage=await mkdtemp(join(root,'.private/hikari-sync-'));
 let backedUp=false;
 try {
  const data=join(root,'data');
  if(await exists(data))await cp(data,join(stage,'data'),{recursive:true});
  await cp(join(root,'lang'),join(stage,'lang'),{recursive:true});
  if(await exists(join(root,'content/community')))await cp(join(root,'content/community'),join(stage,'content/community'),{recursive:true});
  const manifestPath=join(root,'data/state/hikari-sync.json');
  const previous=await exists(manifestPath)?JSON.parse(await readFile(manifestPath,'utf8')):undefined;
  const localOverrides=new Map<string,string>();
  const overrideDir=join(root,'data/overrides');
  if(await exists(overrideDir))for(const name of await readdir(overrideDir)) {
   if(!/^Q\d+\.json$/.test(name))continue;
   const path=`data/overrides/${name}`,text=await readFile(join(root,path),'utf8');
   // Locally edited overrides win. Unedited imported overrides follow upstream.
   if(digest(text)!==previous?.overrides?.[path])localOverrides.set(path,text);
  }
  for(const dir of directories) {
   await rm(join(stage,'data',dir),{recursive:true,force:true});
   await mkdir(join(stage,'data',dir),{recursive:true});
  }
  const overrides:Record<string,string>={};
  for(const [path,text] of snapshot.files) {
   if(!allowed.test(path))throw new Error('Unexpected snapshot path');
   await mkdir(dirname(join(stage,path)),{recursive:true});
   await writeFile(join(stage,path),text);
   if(path.startsWith('data/overrides/'))overrides[path]=digest(text);
  }
  for(const [path,text] of localOverrides)await writeFile(join(stage,path),text);
  await writeFile(join(stage,'data/state/hikari-sync.json'),JSON.stringify({repository:DATA_REPOSITORY,commit:snapshot.commit,overrides},null,2)+'\n');
  try {validate(stage);}catch {throw new Error('Upstream data failed local validation; existing data was kept. Check source compatibility, tag translations and local community/override records.');}
  // All network, parsing and validation work finishes before the current data is touched.
  if(await exists(data)){await rename(data,join(stage,'previous-data'));backedUp=true;}
  try {await rename(join(stage,'data'),data);}
  catch(error){if(backedUp){await rename(join(stage,'previous-data'),data);backedUp=false;}throw error;}
  backedUp=false;
  return {commit:snapshot.commit,files:snapshot.files.size};
 } finally {
  // Preserve the backup if an OS error prevented rollback.
  if(!backedUp)await rm(stage,{recursive:true,force:true});
 }
}
