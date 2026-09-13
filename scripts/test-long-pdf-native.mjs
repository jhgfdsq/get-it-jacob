// Native large-document admission test; explicitly cancels initial AI preparation.
import {launchBackgroundReader} from './background-reader.mjs';
import fs from 'node:fs';import path from 'node:path';
import {assertNoDockApp,readOwnMacApps} from './mac-app-policy.mjs';
const executablePath=path.resolve('dist-electron/mac-arm64/Get It Jacob.app/Contents/MacOS/Get It Jacob');
const env={...process.env,GETIT_DATA_DIR:path.resolve('work/native-data')};delete env.ELECTRON_RUN_AS_NODE;delete env.CODEX_BINARY_PATH;
const app=await launchBackgroundReader({executablePath,env,timeout:60000});
try {
 const page=await app.firstWindow();await page.waitForURL('http://127.0.0.1:**',{timeout:60000});
 const response=page.waitForResponse(r=>r.url().endsWith('/api/upload')&&r.request().method()==='POST');
 await page.locator('input[type=file]').setInputFiles('work/205-pages.pdf');
 const result=await response;const data=await result.json();
 if(result.status()!==200||data.numPages!==205)throw Error(JSON.stringify(data));
 const stop=page.getByRole('button',{name:'Arrêter et conserver les pages terminées'});await stop.waitFor();
 if(await page.locator('progress').getAttribute('max')!=='205')throw Error('Wrong progress coverage');
 const dock=assertNoDockApp(executablePath);
 await page.screenshot({path:'work/qa-native/205-pages.png'});
 await stop.click();
 const base=new URL(page.url()).origin;
 let state;for(let i=0;i<30;i++){state=await(await fetch(base+'/api/preparation/'+data.docId)).json();if(state.status==='error')break;await page.waitForTimeout(100);}
 if(state.status!=='error')throw Error('Cancellation not acknowledged');
 fs.writeFileSync('work/qa-native/long-native-result.json',JSON.stringify({pass:true,pages:data.numPages,uploadStatus:result.status(),progressMax:205,preparation:'cancelled explicitly after admission',dock},null,2));
 console.log('NATIVE205 ADMISSION, DOCK AND CANCELLATION PASS');
}finally{await app.close();}
await new Promise(r=>setTimeout(r,1000));
if(readOwnMacApps(executablePath).length)throw Error('Native app still registered after closing');
console.log('NO RESIDUAL DOCK PROCESS PASS');
