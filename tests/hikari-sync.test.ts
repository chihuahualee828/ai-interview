import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {stringify} from 'yaml';
import {readSnapshot,importSnapshot,DATA_REPOSITORY,type Snapshot} from '../scripts/lib/hikari-sync.ts';
import {answerContentHash,answerInputHash} from '../scripts/lib/answers.ts';
import {hash} from '../scripts/lib/pipeline.ts';

const question=JSON.parse(readFileSync('data/questions/Q0001.json','utf8'));
const answer={...JSON.parse(readFileSync('data/answers/Q0001.json','utf8')),model:'codex-source-reviewed',inputHash:answerContentHash(question),status:'ready'};
const upstream=JSON.parse(readFileSync('data/state/upstream.json','utf8'));
function write(root:string,path:string,value:unknown) {
 mkdirSync(dirname(join(root,path)),{recursive:true});
 writeFileSync(join(root,path),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
}
function fixture() {
 const temp=mkdtempSync(join(tmpdir(),'hikari-sync-test-')),repository=join(temp,'upstream'),root=join(temp,'fork');
 mkdirSync(repository);mkdirSync(root);
 const git=(...args:string[])=>execFileSync('git',['-C',repository,...args],{stdio:'pipe',encoding:'utf8'});
 git('init');git('config','user.name','Test');git('config','user.email','test@example.invalid');
 const commit=()=>{git('add','.');git('commit','--allow-empty','-m','fixture');return readSnapshot(repository);};
 for(const path of [repository,root]) {
  write(path,'data/questions/Q0001.json',question);
  write(path,'data/answers/Q0001.json',answer);
  write(path,'data/state/upstream.json',upstream);
 }
 cpSync('lang',join(root,'lang'),{recursive:true});
 write(root,'.env','PRIVATE LOCAL SENTINEL');
 write(root,'src/app.ts','LOCAL APP SENTINEL');
 write(root,'data/state/generation.json',{Q0001:{status:'pending',attempts:4}});
 return {root,repository,git,commit,cleanup:()=>rmSync(temp,{recursive:true,force:true})};
}
function files(root:string):Record<string,string> {
 const result:Record<string,string>={};
 const walk=(path:string)=>{for(const entry of readdirSync(join(root,path),{withFileTypes:true})) {
  const name=join(path,entry.name);
  if(entry.isDirectory())walk(name);else result[name]=readFileSync(join(root,name),'utf8');
 }};
 walk('data');return result;
}

test('imports a pinned snapshot, retains exact answer status, and never imports application code or generation state',async()=>{
 const f=fixture();try {
  const remote={...answer,status:'stale'};
  write(f.repository,'data/answers/Q0001.json',remote);
  write(f.repository,'scripts/run-me.js','throw new Error("must not execute");');
  write(f.repository,'.env','REMOTE SENTINEL');
  write(f.repository,'data/state/generation.json',{remote:'must not copy'});
  const snapshot=f.commit();
  assert.equal(snapshot.files.size,3);
  // The repository can move after capture; every imported blob remains from the captured commit.
  write(f.repository,'data/answers/Q0001.json',answer);f.commit();
  await importSnapshot(f.root,snapshot);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root,'data/answers/Q0001.json'),'utf8')),remote);
  const manifest=JSON.parse(readFileSync(join(f.root,'data/state/hikari-sync.json'),'utf8'));
  assert.equal(manifest.commit,snapshot.commit);assert.equal(manifest.repository,DATA_REPOSITORY);
  assert.equal(readFileSync(join(f.root,'.env'),'utf8'),'PRIVATE LOCAL SENTINEL');
  assert.equal(readFileSync(join(f.root,'src/app.ts'),'utf8'),'LOCAL APP SENTINEL');
  assert(!existsSync(join(f.root,'scripts/run-me.js')));
  assert.deepEqual(JSON.parse(readFileSync(join(f.root,'data/state/generation.json'),'utf8')),{Q0001:{status:'pending',attempts:4}});
  const first=files(f.root);await importSnapshot(f.root,snapshot);assert.deepEqual(files(f.root),first);
 } finally {f.cleanup();}
});

test('preserves fork community answers and local overrides while untouched upstream overrides follow upstream',async()=>{
 const f=fixture();try {
  const localAnswer=structuredClone(answer);localAnswer.locales.en.title='Local correction';
  write(f.root,'data/overrides/Q0001.json',{pin:true,answer:localAnswer});
  const meta={questionId:'Q0001',locale:'en',title:'Community title',intent:'Local contribution.',hint:['Think carefully.'],authors:['contributor'],updatedAt:'2026-10-19T00:00:00Z',reviewedAgainst:answerInputHash(question,[],'community','community-v1'),sourceUrls:[question.source.repo,question.source.url]};
  const markdown=`---\n${stringify(meta)}---\n\n## Principle\nLocal reasoning.\n\n## Trade-off\nLocal trade-offs.\n\n## Implementation\nLocal implementation.\n\n## Production\nLocal operations.\n`;
  write(f.root,'content/community/Q0001/en.md',markdown);
  write(f.repository,'data/overrides/Q0001.json',{pin:true,answer});
  await importSnapshot(f.root,f.commit());
  assert.equal(readFileSync(join(f.root,'content/community/Q0001/en.md'),'utf8'),markdown);
  assert.equal(JSON.parse(readFileSync(join(f.root,'data/overrides/Q0001.json'),'utf8')).answer.locales.en.title,'Local correction');
  rmSync(join(f.root,'data/overrides/Q0001.json'));
  await importSnapshot(f.root,f.commit());
  const revised=structuredClone(answer);revised.locales.en.title='Updated upstream correction';
  write(f.repository,'data/overrides/Q0001.json',{pin:true,answer:revised});
  await importSnapshot(f.root,f.commit());
  assert.equal(JSON.parse(readFileSync(join(f.root,'data/overrides/Q0001.json'),'utf8')).answer.locales.en.title,'Updated upstream correction');
  rmSync(join(f.repository,'data/overrides/Q0001.json'));await importSnapshot(f.root,f.commit());
  assert(!existsSync(join(f.root,'data/overrides/Q0001.json')));
  assert.equal(readFileSync(join(f.root,'content/community/Q0001/en.md'),'utf8'),markdown);
 } finally {f.cleanup();}
});

test('validation failure and removed question IDs leave the complete existing dataset unchanged',async()=>{
 const f=fixture();try {
  const before=files(f.root),snapshot=f.commit();
  const broken:Snapshot={...snapshot,files:new Map(snapshot.files)};
  broken.files.set('data/answers/Q0001.json',JSON.stringify({...answer,inputHash:'0'.repeat(64)}));
  await assert.rejects(importSnapshot(f.root,broken),/failed local validation/);
  assert.deepEqual(files(f.root),before);
  broken.files.delete('data/questions/Q0001.json');
  await assert.rejects(importSnapshot(f.root,broken),/Upstream removed Q0001/);
  assert.deepEqual(files(f.root),before);
 } finally {f.cleanup();}
});

test('a newly introduced untranslated tag fails safely under the fork dictionaries',async()=>{
 const f=fixture();try {
  const snapshot=f.commit(),before=files(f.root);
  const q={...question,tags:[...question.tags,'unsupported-new-topic']};
  const {original,topic,group,companies,tags,originalAnswer,links}=q;
  q.contentHash=hash({original,topic,group,companies,tags,originalAnswer,links});
  snapshot.files.set('data/questions/Q0001.json',JSON.stringify(q));
  await assert.rejects(importSnapshot(f.root,snapshot),/failed local validation/);
  assert.deepEqual(files(f.root),before);
 } finally {f.cleanup();}
});

test('rejects upstream symlinks, malformed JSON, unsafe paths, wrong identities and oversized files before import',()=>{
 for(const kind of ['symlink','malformed','path','identity','state','oversized']) {
  const f=fixture();try {
   if(kind==='symlink') {rmSync(join(f.repository,'data/answers/Q0001.json'));symlinkSync('../../.env',join(f.repository,'data/answers/Q0001.json'));}
   if(kind==='malformed')write(f.repository,'data/answers/Q0001.json','{broken');
   if(kind==='path')write(f.repository,'data/questions/unexpected.json',{});
   if(kind==='identity')write(f.repository,'data/answers/Q0001.json',{...answer,questionId:'Q0002'});
   if(kind==='state')write(f.repository,'data/state/upstream.json',{...upstream,unexpected:'not public provenance'});
   if(kind==='oversized')write(f.repository,'data/answers/Q0001.json',' '.repeat(1024*1024+1));
   assert.throws(()=>f.commit());
  } finally {f.cleanup();}
 }
});

test('rejects local data symlinks without modifying their target',async()=>{
 const f=fixture();try {
  const snapshot=f.commit();
  symlinkSync('../../.env',join(f.root,'data/answers/Q0002.json'));
  await assert.rejects(importSnapshot(f.root,snapshot),/Symlinks/);
  assert.equal(readFileSync(join(f.root,'.env'),'utf8'),'PRIVATE LOCAL SENTINEL');
 } finally {f.cleanup();}
});
