import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
const command=process.platform==='win32'?'pnpm.cmd':'pnpm';
function run(args,env=process.env){const result=spawnSync(command,args,{stdio:'inherit',shell:process.platform==='win32',env});if(result.status!==0)process.exit(result.status??1);}
run(['db:generate']);run(['db:migrate']);
const local=readFileSync('.env','utf8').split(/\r?\n/).find(s=>s.startsWith('DATABASE_URL='))?.slice(13);
const url=new URL(process.env.TEST_DATABASE_URL??process.env.DATABASE_URL??local);
if(!process.env.TEST_DATABASE_URL&&url.hostname==='localhost'&&url.port==='55432')url.pathname='/duali_test';
if(!url.pathname.endsWith('_test'))throw new Error('Use TEST_DATABASE_URL ending in _test');
run(['db:migrate'],{...process.env,DATABASE_URL:url.toString()});
for(const gate of ['build','lint','typecheck','test'])run([gate]);
