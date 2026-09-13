// Real multimodal transport test. No window and no user documents.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {launchBackgroundReader} from './background-reader.mjs';
import {assertNoDockApp} from './mac-app-policy.mjs';
const prepared=JSON.parse(fs.readFileSync('work/qa-native/result.json','utf8'));
const docId=prepared.docId;
const executablePath=path.resolve('dist-electron/mac-arm64/Get It Jacob.app/Contents/MacOS/Get It Jacob');
let app;
try{
 app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:path.resolve('work/native-data')}});
 const page=await app.firstWindow();const base=new URL(page.url()).origin;
 const before=await(await fetch(base+'/api/chat/'+docId)).json();const chat=before.chats[0];
 const suffix=String(Date.now()).slice(-5);const names=['ALIZE '+suffix,'CYGNE '+suffix],values=[61+Math.floor(Math.random()*20),21+Math.floor(Math.random()*20)],captures=[];
 for(let i=0;i<2;i++){
  const c=createCanvas(900,400),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,400);ctx.fillStyle='#202020';ctx.font='bold 54px Arial';ctx.fillText(names[i],70,100);ctx.font='42px Arial';ctx.fillText(`Capacité : ${values[i]} MW`,70,190);ctx.fillStyle=i?'#375d88':'#aa6038';ctx.fillRect(70,240,values[i]*7,70);
  const r=await fetch(base+'/api/captures/'+docId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageIndex:i,dataUrl:c.toDataURL('image/png'),width:900,height:400})});assert.equal(r.status,201);captures.push((await r.json()).capture);
 }
 const after=await(await fetch(base+'/api/chat/'+docId)).json();assert.deepEqual(after,before,'adding images never creates a chat message');
 const payload={action:'send',chatId:chat.id,requestId:crypto.randomUUID(),pageIndex:2,captureIds:captures.map(c=>c.id),message:'Lis uniquement les deux captures jointes à cette question. Pour chacune, donne le nom du projet et sa capacité avec son unité. Ce sont des données de test distinctes du PDF. Réponds très brièvement.'};
 const start=Date.now();const r=await fetch(base+'/api/chat/'+docId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,200);const raw=await r.text();const events=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5)));const done=events.find(e=>e.type==='done');assert(done,raw);const answer=done.reply.content;
 for(const name of names)assert(answer.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(name),answer);
 for(const value of values)assert(answer.includes(String(value)),answer);assert(answer.includes('MW'),answer);
 assert.deepEqual(done.chat.messages.at(-2).captures.map(c=>c.id),payload.captureIds);
 const duplicate=await fetch(base+'/api/chat/'+docId,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const replay=(await duplicate.text()).split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(e=>e.type==='done');assert.equal(replay.timing.replayed,true);assert.equal(replay.chat.messages.length,done.chat.messages.length);
 assertNoDockApp(executablePath);
 const result={pass:true,elapsedMs:Date.now()-start,answer,timing:done.timing,captureCount:captures.length,idempotentRecovery:true,unchangedChatBeforeSend:true,source:'Synthetic image labels absent from the original PDF, proving attachment pixels reached the model.'};fs.writeFileSync('work/capture-native-result.json',JSON.stringify(result,null,2));console.log('NATIVE CAPTURES PASS',JSON.stringify(result));
}finally{await app?.close();}
