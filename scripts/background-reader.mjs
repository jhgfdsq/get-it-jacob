// Test the packaged server and reader in a headless browser. Never launch the
// main macOS application, create a visible window or activate another app.
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';
export async function launchBackgroundReader({executablePath,env}) {
 const root=path.resolve(executablePath,'../../..');
 execFileSync('codesign',['--verify','--deep','--strict',root],{stdio:'pipe'});
 const resources=path.join(root,'Contents/Resources/app');
 const standalone=path.join(resources,'.next/standalone');
 const helper=path.join(root,'Contents/Frameworks/Get It Jacob Helper.app/Contents/MacOS/Get It Jacob Helper');
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://127.0.0.1:${port}`;
 fs.mkdirSync(env.GETIT_DATA_DIR,{recursive:true});
 const log=fs.openSync(path.join(env.GETIT_DATA_DIR,'background-test-server.log'),'a');
 const child=spawn(helper,[path.join(standalone,'server-watchdog.cjs')],{cwd:standalone,detached:true,stdio:['ignore',log,log],env:{...env,ELECTRON_RUN_AS_NODE:'1',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',GETIT_DISABLE_ANALYTICS:'1',PORT:String(port),HOSTNAME:'127.0.0.1',CODEX_BINARY_PATH:path.join(resources,'electron/codex-bin/aarch64-apple-darwin/codex/codex')}});
 fs.closeSync(log);let browser;let launchError;child.on('error',e=>{launchError=e;});
 async function close(){await browser?.close();try{process.kill(-child.pid,'SIGTERM');}catch{}await new Promise(r=>setTimeout(r,400));}
 try {
  let ready=false;
  for(let n=0;n<150;n++){if(launchError)throw launchError;if(child.exitCode!=null)throw Error('Background server exited');try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
  if(!ready)throw Error('Background server did not start');
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:820}});await page.goto(base);
  return {firstWindow:async()=>page,close};
 }catch(error){await close();throw error;}
}
