/** Explicit local MFA recovery build/test only: no Site or managed backend operation. */
import { readFileSync,writeFileSync,mkdirSync,mkdtempSync,symlinkSync,lstatSync,existsSync,readdirSync,realpathSync,rmSync } from 'node:fs';
import { resolve,join,dirname,relative,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync,spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
const PY_VALIDATE = "import hashlib,io,json,re,sys,tarfile\nfrom pathlib import PurePosixPath\ntry:\n archive_path,proof_path,verification_path,source,version,project=sys.argv[1:]\n proof=json.load(open(proof_path));verified=json.load(open(verification_path));payload=open(archive_path,'rb').read()\n digest=hashlib.sha256(payload).hexdigest()\n if len(payload)>16*1024*1024 or digest!=proof['archive']['sha256'] or digest!=verified['archive_sha256']:raise ValueError()\n if proof['source_commit']!=source or verified['workflow_head_commit']!=source or proof['project_id']!=project or verified['project_id']!=project:raise ValueError()\n if verified.get('workflow_conclusion')!='SUCCESS' or verified.get('local_build_used') is not False or verified.get('all_dist_file_hashes_verified') is not True or not isinstance(verified.get('artifact_id'),int):raise ValueError()\n if proof['payment_changes'] is not False or proof['payments_enabled'] is not False or proof['public_url']!='https://truckcontrolai.com':raise ValueError()\n if not re.fullmatch('[a-f0-9]{64}',verified['github_zip_sha256']):raise ValueError()\n found={};keys=set();js=[];names=set();total=0\n with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tar:\n  for member in tar:\n   p=PurePosixPath(member.name)\n   if p.is_absolute() or '..' in p.parts or '\\\\' in member.name or member.name in names or not(member.isfile() or member.isdir()):raise ValueError()\n   names.add(member.name)\n   if member.isfile():\n    if member.name!='.openai/hosting.json' and not member.name.startswith('dist/'):raise ValueError()\n    if member.size>16*1024*1024:raise ValueError()\n    raw=tar.extractfile(member).read();total+=len(raw)\n    if total>64*1024*1024:raise ValueError()\n    found[member.name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}\n    if member.name=='.openai/hosting.json':hosting=json.loads(raw)\n    if member.name=='dist/release.json':release=json.loads(raw)\n    if member.name.endswith('.js'):\n     keys.update(x.decode() for x in re.findall(rb'\\bsb_publishable_[A-Za-z0-9_-]{20,160}\\b',raw));js.append(raw)\n expected={x['path']:{'bytes':x['bytes'],'sha256':x['sha256']} for x in proof['files']}\n if len(expected)!=len(proof['files']) or set(found)!=(set(expected)|{'.openai/hosting.json'}):raise ValueError()\n if any(found[n]!=v for n,v in expected.items()):raise ValueError()\n if hosting.get('project_id')!=project or hosting.get('static',{}).get('directory')!='dist':raise ValueError()\n if release!=proof['output'] or release.get('sourceCommit')!=source or release.get('version')!=version or release.get('channel')!='production' or release.get('sourceDirty') is not False or release.get('companyConnectionBundled') is not True:raise ValueError()\n if len(keys)!=1 or not any(b'https://kkkemaycedexymrpaqtp.supabase.co' in x for x in js):raise ValueError()\n print(json.dumps({'publicKey':next(iter(keys)),'input_archive_sha256':digest,'input_ci_run':verified['workflow_run'],'input_artifact_id':verified['artifact_id'],'input_zip_sha256':verified['github_zip_sha256']}))\nexcept Exception:\n sys.stderr.write('verified_ci_input_required\\n');raise SystemExit(1)\n";
const toolRoot=dirname(fileURLToPath(import.meta.url)),project='appgprj_6ae655e56db481918fe18adfe9df8b66';
const backend='https://kkkemaycedexymrpaqtp.supabase.co';
class Failure extends Error { constructor(code){super(code);this.fixedCode=code;} }
const requireValue=(ok,code)=>{if(!ok)throw new Failure(code);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const argv=process.argv.slice(2),mode=argv.shift(),args={};
while(argv.length){const k=argv.shift(),v=argv.shift();requireValue(k?.startsWith('--')&&v&&!(k in args),'invalid_arguments');args[k]=v;}
requireValue(['--build','--verify-local'].includes(mode),'choose_build_or_verify_local');
const allowed=['--source-root','--expected-source','--expected-version','--ci-tar','--ci-proof','--ci-verification','--worktree','--output','--expected-totp-sha256','--expected-cases'];
requireValue(Object.keys(args).every(k=>allowed.includes(k)),'unknown_argument');
const source=args['--expected-source'],version=args['--expected-version'];
requireValue(/^[a-f0-9]{40}$/.test(source??'')&&/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version??''),'exact_source_and_version_required');
requireValue(args['--worktree']&&args['--output'],'worktree_and_output_required');
const worktree=resolve(args['--worktree']),output=resolve(args['--output']),proofPath=join(output,'truckcontrol-mfa-recovery-package.json');
requireValue(worktree.startsWith('/workspace/worktrees/')&&output.startsWith('/workspace/artifacts/'),'isolated_workspace_paths_required');
const exec=(file,parts,cwd,env=process.env,code='local_command_failed')=>{
 const result=spawnSync(file,parts,{cwd,env,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});
 requireValue(!result.error&&result.status===0,code);
 return result.stdout;
};
const git=(cwd,...parts)=>exec('git',parts,cwd,process.env,'git_source_check_failed').toString().trim();
function childEnv(){
 const env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith('VITE_')||key.startsWith('PLAYWRIGHT_JSON_')||/^(?:OPENAI_API_KEY|STRIPE_SECRET_KEY|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|RESEND_API_KEY|GOOGLE_CLIENT_SECRET)$/.test(key))delete env[key];
 return env;
}
function readJson(path){requireValue(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'regular_input_file_required');return JSON.parse(readFileSync(path,'utf8'));}
function scanOutput(root){
 const records=[];
 const visit=dir=>{
  for(const name of readdirSync(dir)){
   const path=join(dir,name),stat=lstatSync(path);requireValue(!stat.isSymbolicLink(),'output_symlink_refused');
   if(stat.isDirectory())visit(path);
   else{
    requireValue(stat.isFile(),'regular_output_required');
    const key=relative(root,path).split(sep).join('/'),raw=readFileSync(path);
    requireValue(!/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key)$/i.test(key),'sensitive_output_path_refused');
    if(/\.(?:js|css|html|json)$/.test(key))requireValue(!/(?:\bsb_secret_[A-Za-z0-9_-]{16,}|\bsk-proj-[A-Za-z0-9_-]{24,}|\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9._~+/-]{16,}|\bwhsec_[A-Za-z0-9]{16,}|\bGOCSPX[-_][A-Za-z0-9_-]{16,}|\bre_[A-Za-z0-9_]{30,})/.test(raw.toString('utf8')),'secret_shaped_output_refused');
    records.push({path:'dist/'+key,bytes:raw.length,sha256:digest(raw)});
   }
  }
 };
 visit(root);return records.sort((a,b)=>a.path.localeCompare(b.path));
}
function metadata(){
 requireValue(git(worktree,'rev-parse','HEAD')===source&&!git(worktree,'status','--porcelain'),'clean_recovery_source_required');
 const hosting=readJson(join(worktree,'.openai/hosting.json')),release=readJson(join(worktree,'dist/release.json')),pwa=readJson(join(worktree,'dist/manifest.webmanifest'));
 requireValue(hosting.project_id===project&&hosting.static?.directory==='dist','production_identity_required');
 requireValue(release.sourceCommit===source&&release.sourceDirty===false&&release.version===version&&release.channel==='production'&&release.companyConnectionBundled===true&&release.registrationForcedClosed===false,'exact_connected_recovery_release_required');
 requireValue(pwa.start_url==='/'&&pwa.scope==='/'&&pwa.display==='standalone','pwa_scope_required');
 return release;
}
async function build(){
 requireValue(args['--source-root']&&args['--ci-tar']&&args['--ci-proof']&&args['--ci-verification']&&/^[a-f0-9]{64}$/.test(args['--expected-totp-sha256']??''),'verified_ci_inputs_and_enforcement_hash_required');
 const root=resolve(args['--source-root']);
 requireValue(!existsSync(worktree)&&!existsSync(output),'new_isolated_paths_required');
 requireValue(git(root,'rev-parse','HEAD')===source&&!git(root,'status','--porcelain'),'clean_final_production_source_required');
 requireValue(/^https:\/\/github\.com\/smartscaneuskadi\/TruckControl-AI(?:\.git)?$/.test(git(root,'remote','get-url','github')),'exclusive_repository_required');
 const pkg=readJson(join(root,'package.json')),hosting=readJson(join(root,'.openai/hosting.json'));
 requireValue(pkg.version===version&&hosting.project_id===project&&hosting.static?.directory==='dist','source_version_or_site_mismatch');
 requireValue(pkg.scripts?.['build:production']==='node scripts/build-production.mjs'&&!pkg.scripts?.['prebuild:production']&&!pkg.scripts?.['postbuild:production'],'reviewed_production_builder_required');
 requireValue(!readFileSync(join(root,'scripts/build-production.mjs'),'utf8').includes('VITE_MFA_ENROLLMENT_ENABLED'),'builder_must_preserve_explicit_recovery_flag');
 for(const filename of ['.env','.env.local','.env.production','.env.production.local'])requireValue(!git(root,'ls-files','--',filename),'committed_dotenv_refused');
 const sqlPaths=git(root,'ls-tree','-r','--name-only',source,'supabase/migrations').split('\n').filter(p=>/\/\d{14}_optional_totp_session_protection\.sql$/.test(p));
 requireValue(sqlPaths.length===1,'one_canonical_totp_migration_required');
 const sqlHash=digest(readFileSync(join(root,sqlPaths[0])));requireValue(sqlHash===args['--expected-totp-sha256'],'server_enforcement_source_hash_mismatch');
 const backendTree=git(root,'rev-parse',source+':supabase');
 const modules=realpathSync(join(root,'node_modules'));
 const checked=[];
 for(const [name,pin] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
  requireValue(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(pin),'exact_dependency_pins_required');
  const installed=readJson(join(modules,name,'package.json'));requireValue(installed.version===pin,'existing_dependency_graph_mismatch');checked.push({name,version:pin});
 }
 for(const path of ['--ci-tar','--ci-proof','--ci-verification'])requireValue(existsSync(resolve(args[path])),'ci_input_missing');
 let connection=JSON.parse(exec('python3',['-c',PY_VALIDATE,resolve(args['--ci-tar']),resolve(args['--ci-proof']),resolve(args['--ci-verification']),source,version,project],root,childEnv(),'verified_ci_input_required').toString());
 requireValue(/^sb_publishable_[A-Za-z0-9_-]{20,160}$/.test(connection.publicKey),'public_ci_connection_required');
 mkdirSync(dirname(worktree),{recursive:true});git(root,'worktree','add','--detach',worktree,source);
 symlinkSync(modules,join(worktree,'node_modules'),'dir');
 requireValue(!git(worktree,'status','--porcelain'),'worktree_must_remain_clean');
 const env={...childEnv(),VITE_SUPABASE_URL:backend,VITE_SUPABASE_PUBLISHABLE_KEY:connection.publicKey,VITE_MFA_ENROLLMENT_ENABLED:'false',VITE_RELEASE_CHANNEL:'production',VITE_COMMERCIAL_MODE:'true',VITE_AUTH_MAIL_PROVIDER:'resend'};
 const input={archive_sha256:connection.input_archive_sha256,workflow_run:connection.input_ci_run,artifact_id:connection.input_artifact_id,github_zip_sha256:connection.input_zip_sha256};
 delete connection.publicKey;connection=null;
 // Captured build output stays only in RAM and is never written or printed.
 const result=spawnSync('npm',['run','build:production'],{cwd:worktree,env,stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});
 delete env.VITE_SUPABASE_PUBLISHABLE_KEY;
 requireValue(!result.error&&result.status===0,'recovery_build_failed_no_raw_logs_retained');
 const release=metadata(),files=scanOutput(join(worktree,'dist'));
 const scripts=files.filter(f=>f.path.endsWith('.js')).map(f=>readFileSync(join(worktree,f.path),'utf8')).join('\n').replace(/\\u([a-f0-9]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
 for(const label of ['tc_verified_session','Confirma tu autenticador','Quitar autenticador','Descartar configuración','La activación de nuevos autenticadores todavía no está disponible'])requireValue(scripts.includes(label),'mfa_recovery_controls_missing');
 requireValue(git(worktree,'rev-parse','HEAD:supabase')===backendTree&&digest(readFileSync(join(worktree,sqlPaths[0])))===sqlHash,'backend_or_enforcement_source_changed');
 mkdirSync(output,{recursive:true});const archiveName='truckcontrol-mfa-recovery-'+source+'.tar.gz',archivePath=join(output,archiveName);
 exec('tar',['-czf',archivePath,'.openai/hosting.json','dist'],worktree,childEnv(),'recovery_archive_failed');
 const raw=readFileSync(archivePath);
 const proof={mode:'recovery',source_commit:source,version,project_id:project,public_url:'https://truckcontrolai.com',input_ci_package:input,output:release,enrollment_enabled:false,enrollment_build_flag:'false',server_enforcement_retained:true,enforcement_sql:{filename:sqlPaths[0].split('/').pop(),sha256:sqlHash},backend_tree_unchanged:backendTree,production_or_sql_mutations:0,provider_calls:0,model_calls:0,payment_calls:0,dependency_installations:0,existing_dependency_versions_verified:checked,public_connection_handling:'Only memory/private child environment and the necessary existing public browser bundle. No standalone key, dotenv, proof field, logs or source mutation.',archive:{name:archiveName,bytes:raw.length,sha256:digest(raw)},files,local_mfa_acceptance:{status:'not_run',managed_auth:false,physical_devices:false},source_pushed:false,version_saved:false,published:false,warning:'Recovery frontend only. Keep SQL75 and factor challenges/management. Root must verify local acceptance and control any later save/deploy.'};
 writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify({mode:'recovery',source_commit:source,version,enrollment_enabled:false,server_enforcement_retained:true,archive_sha256:proof.archive.sha256,archive_bytes:raw.length,files:files.length,local_tests:'not_run',published:false}));
}
async function runAsync(parts,cwd,env){
 return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,parts,{cwd,env,stdio:['ignore','pipe','pipe']});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.on('error',()=>reject(new Failure('local_browser_child_failed')));
  child.on('close',code=>resolve({code,out,err}));
 });
}
async function verifyLocal(){
 const proof=readJson(proofPath);
 requireValue(proof.mode==='recovery'&&proof.source_commit===source&&proof.version===version&&proof.enrollment_enabled===false&&proof.server_enforcement_retained===true,'matching_recovery_proof_required');
 metadata();const inventory=scanOutput(join(worktree,'dist'));
 requireValue(JSON.stringify(inventory)===JSON.stringify(proof.files),'recovery_output_drifted');
 requireValue(digest(readFileSync(join(output,proof.archive.name)))===proof.archive.sha256,'recovery_archive_drifted');
 requireValue(existsSync('/usr/bin/chromium'),'existing_chromium_required');
 const testsOutput=join(output,'local-acceptance');mkdirSync(testsOutput,{recursive:true});
 const shadow=mkdtempSync(join(toolRoot,'.recovery-test-')),dist=join(worktree,'dist');
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
 const server=createServer((request,response)=>{
  try{
   if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
   const url=new URL(request.url,'http://127.0.0.1'),name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=resolve(dist,name);
   if(!file.startsWith(dist+sep)||!existsSync(file)||!lstatSync(file).isFile()){response.writeHead(404);response.end();return;}
   response.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});
   response.end(request.method==='HEAD'?undefined:readFileSync(file));
  }catch{response.writeHead(404);response.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const p of ['package.json','src','node_modules'])symlinkSync(join(worktree,p),join(shadow,p),p==='package.json'?'file':'dir');
  mkdirSync(join(shadow,'tests/recovery'),{recursive:true});
  const inputFiles=[];
  for(const p of ['tests/mfa-browser/default-off.spec.ts','tests/mfa-browser/fixture.ts']){
   let text=readFileSync(join(worktree,p),'utf8');inputFiles.push({path:p,sha256:digest(Buffer.from(text))});
   if(p.endsWith('fixture.ts')){
    const passthrough=/if\s*\(\s*\[\s*'UNUSED'\s*\]\)/;
    const block=/if\s*\(\s*\[\s*"http:\/\/127\.0\.0\.1:4204",\s*"http:\/\/127\.0\.0\.1:4205",\s*"http:\/\/127\.0\.0\.1:4206",?\s*\]\.includes\(url\.origin\)\s*\)\s*return route\.continue\(\);/g;
    requireValue([...text.matchAll(block)].length===1,'fixture_passthrough_changed');
    text=text.replace(block,'if (url.origin === '+JSON.stringify(origin)+') return route.fallback();').replaceAll('http://127.0.0.1:9999',backend);
   }else{
    const paths=inventory.map(f=>'/'+f.path.slice('dist/'.length));paths.push('/');
    text+='\ntest.beforeEach(async ({ context, page }) => {\n'+
     'await context.route("**/*", route => { const r=route.request(),u=new URL(r.url()),h=r.headers(); if(u.origin==='+JSON.stringify(origin)+'&&r.method()==="GET"&&'+JSON.stringify(paths)+'.includes(u.pathname)&&!h.authorization&&!h.apikey)return route.continue();return route.abort("blockedbyclient");});\n'+
     'await context.routeWebSocket(/.*/, s => s.close());const r=await page.goto("/release.json");expect(r?.status()).toBe(200);const m=await r.json();expect(m.sourceCommit).toBe('+JSON.stringify(source)+');expect(m.version).toBe('+JSON.stringify(version)+');expect(m.channel).toBe("production");expect(m.sourceDirty).toBe(false);});\n';
   }
   writeFileSync(join(shadow,'tests/recovery',p.split('/').pop()),text);
  }
  const config={testDir:join(shadow,'tests/recovery'),testMatch:'default-off.spec.ts',workers:2,timeout:60000,expect:{timeout:8000},retries:0,outputDir:join(testsOutput,'results'),reporter:[['json']],use:{baseURL:origin,locale:'es-ES',serviceWorkers:'block',storageState:{cookies:[],origins:[]},screenshot:'off',trace:'off',launchOptions:{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}}};
  const configPath=join(shadow,'playwright.config.ts');
  writeFileSync(configPath,'import {defineConfig,devices} from "@playwright/test"; const c='+JSON.stringify(config)+'; export default defineConfig({...c,projects:[{name:"recovery-windows",use:{...devices["Desktop Chrome"],viewport:{width:1440,height:1000}}},{name:"recovery-android",use:{...devices["Pixel 7"]}}]});\n');
  const command=[join(worktree,'node_modules/@playwright/test/cli.js'),'test','--config',configPath],env=childEnv();
  const run=await runAsync(command,worktree,env);
  let report;try{report=JSON.parse(run.out);}catch{throw new Failure('local_browser_json_receipt_missing');}
  const redact=v=>typeof v==='string'?v.replace(/\bsb_publishable_[A-Za-z0-9_-]{20,160}\b/g,'[public-key-redacted]'):Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,redact(x)])):v;
  writeFileSync(join(testsOutput,'results.json'),JSON.stringify(redact(report),null,2)+'\n');
  const specs=[];const visit=s=>{for(const x of s.specs??[])specs.push(x.title);for(const x of s.suites??[])visit(x);};for(const s of report.suites??[])visit(s);
  requireValue(specs.some(x=>x.includes('enrollment defaults off'))&&specs.some(x=>x.includes('existing TOTP is challenged'))&&specs.some(x=>x.includes('pending cleanup')),'required_recovery_behaviour_cases_missing');
  const expected=args['--expected-cases']===undefined?6:Number(args['--expected-cases']),stats=report.stats;
  requireValue(run.code===0&&stats.expected===expected&&stats.unexpected===0&&stats.skipped===0&&stats.flaky===0&&!report.errors?.length,'local_recovery_acceptance_failed');
  metadata();
  const scope={source_commit:source,version,cases:stats.expected,stats,enrollment_disabled_and_existing_challenge_verified:true,pending_cleanup_verified:true,backend_transport:'fictional intercepted HTTP; all unmatched nonlocal HTTP and all WSS blocked',actual_provider_or_managed_auth_calls:0,model_calls:0,payment_calls:0,devices:'Desktop Chrome/Pixel7 emulation, not physical devices',service_workers:'blocked',native_managed_acceptance:false,managed_restore:false,input_files:inputFiles,trace_and_screenshots:'off; JSON receipt redacts any public-key-shaped string',published:false};
  writeFileSync(join(testsOutput,'scope.json'),JSON.stringify(scope,null,2)+'\n');
  proof.local_mfa_acceptance={status:'PASS',cases:stats.expected,enrollment_off:true,existing_challenge:true,pending_cleanup:true,transport:'fictional intercepted HTTP only',physical_devices:false,managed_auth:false};
  writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({source_commit:source,mode:'recovery',local_cases:stats.expected,passed:true,enrollment_enabled:false,server_enforcement_retained:true,published:false}));
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(shadow,{recursive:true,force:true});}
}
try{if(mode==='--build')await build();else await verifyLocal();}
catch(error){console.error(JSON.stringify({recovery_helper_failed:true,code:error instanceof Failure?error.fixedCode:'unexpected_local_recovery_failure',published:false,production_mutated:false}));process.exitCode=1;}

