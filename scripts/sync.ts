import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DATA_REPOSITORY,readSnapshot,importSnapshot} from './lib/hikari-sync.ts';

async function main() {
 if(process.argv.length>2)throw new Error('npm run sync imports Hikari data; README parsing and article-refresh flags are no longer supported.');
 const temp=await mkdtemp(join(tmpdir(),'recall-hikari-'));
 try {
  const repository=join(temp,'snapshot.git');
  // Public read-only fetch. No token, upstream checkout, hooks or upstream scripts.
  execFileSync('git',['-c','core.hooksPath=/dev/null','clone','--bare','--depth=1','--single-branch','--branch','main','--no-tags',`${DATA_REPOSITORY}.git`,repository],{stdio:'pipe',timeout:180000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  const result=await importSnapshot(process.cwd(),readSnapshot(repository));
  console.log(`Imported ${result.files} data files from ${DATA_REPOSITORY} at ${result.commit}. No model requests made.`);
 } finally {await rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
