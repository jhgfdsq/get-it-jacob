// Headless, isolated document data. AI transport is mocked, durable drafts are real.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {launchBackgroundReader} from './background-reader.mjs';import {assertNoDockApp} from './mac-app-policy.mjs';
const docId=JSON.parse(fs.readFileSync('work/qa-native/result.json')).docId;
const data=fs.mkdtempSync(path.resolve('work/passages-ui-'));
fs.cpSync(path.join('work/native-data/docs',docId),path.join(data,'docs',docId),{recursive:true});
fs.writeFileSync(path.join(data,'docs',docId,'chat-drafts.json'),JSON.stringify({drafts:{'chat-a':{text:'Compare ces passages.',attached:{pageIndex:0,selection:'Ancien passage conservé.'},captures:[]}},outbox:{}}));
const executablePath=process.env.TEST_APP_EXECUTABLE??path.resolve('dist-electron/mac-arm64/Get It Jacob.app/Contents/MacOS/Get It Jacob');
let app,page,base,failNext=true;const sent=[],errors=[];
const chats=[{id:'chat-a',title:'Discussion A',messages:[]},{id:'chat-b',title:'Discussion B',messages:[]}];
async function start(){
 app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:data}});page=await app.firstWindow();await page.setViewportSize({width:1440,height:960});base=new URL(page.url()).origin;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/chat/'+docId,async route=>{
  const r=route.request();if(r.method()==='GET')return route.fulfill({json:{chats}});
  const b=r.postDataJSON();assert.equal(b.action,'send');sent.push(b);
  if(failNext){failNext=false;return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'error',error:'Coupure simulée'})+'\n\n'});}
  const chat=chats.find(c=>c.id===b.chatId);chat.messages.push({role:'user',content:b.message,pageIndex:b.pageIndex,passages:b.passages,ts:1},{role:'assistant',content:'Tous les passages ont été reçus.',ts:2});
  return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'done',chat,reply:chat.messages.at(-1)})+'\n\n'});
 });
 await page.goto(base+'/viewer/'+docId);await page.locator('.pdf-selectable-text span').first().waitFor();
}
const draftPanel=()=>page.getByLabel('Passages joints au brouillon',{exact:true});
async function select(index,needle){
 await page.locator(`[data-page="${index}"]`).evaluate(el=>el.scrollIntoView({block:'center'}));
 const text=page.locator(`[data-page="${index}"] .pdf-selectable-text span`).filter({hasText:needle}).first();await text.scrollIntoViewIfNeeded();const b=await text.boundingBox();assert(b);
 await page.mouse.move(b.x+1,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width-1,b.y+b.height/2,{steps:15});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('[title="Ajouter le texte sélectionné au chat"]')?.disabled===false);
 await page.getByRole('button',{name:'Discuter',exact:true}).click();
}
async function savedCount(n){for(let i=0;i<60;i++){const j=await(await fetch(base+'/api/chat/'+docId+'/drafts')).json();if(j.drafts['chat-a']?.passages?.length===n)return j;await page.waitForTimeout(50);}throw Error('Draft count not saved '+n);}
try{
 await start();await draftPanel().getByText('Passage 1 · page 1',{exact:true}).waitFor();
 await select(0,'Projet Saphir');await select(1,'La capacité augmente');assert.equal(await draftPanel().locator('details').count(),3);assert.equal(sent.length,0);
 await page.getByRole('button',{name:'Retirer le passage 1',exact:true}).click();assert.equal(await draftPanel().locator('details').count(),2);
 const saved=await savedCount(2);const expected=saved.drafts['chat-a'].passages;assert.deepEqual(expected.map(p=>p.pageIndex),[0,1]);assert(expected.every(p=>p.selection.length>5));
 await page.getByRole('button',{name:'Discussion B',exact:true}).click();assert.equal(await draftPanel().count(),0);
 await page.getByRole('button',{name:'Discussion A',exact:true}).click();assert.equal(await draftPanel().locator('details').count(),2);
 await page.screenshot({path:path.join(data,'stacked.png')});
 await app.close();await start();await draftPanel().getByText('Passage 2 · page 2',{exact:true}).waitFor();assert.equal(sent.length,0);
 await page.getByRole('button',{name:'Envoyer (Entrée)',exact:true}).click();await page.getByRole('button',{name:/Réessayer \(page/}).waitFor();assert.deepEqual(sent[0].passages,expected);
 // A later selection must stay in the next draft while retrying the original context.
 await select(0,'Document de validation');await savedCount(1);
 await page.getByRole('button',{name:/Réessayer \(page/}).click();await page.getByText('Tous les passages ont été reçus.',{exact:true}).waitFor();assert.deepEqual(sent[1],sent[0]);assert.equal(await draftPanel().locator('details').count(),1);
 assert.equal(await page.locator('[data-reader-chat] section details').count(),3);
 assert.deepEqual(errors,[]);assertNoDockApp(executablePath);
 const result={pass:true,data,executablePath,checks:['legacy draft preserved','multiple real PDF selections appended','individual removal','per-chat drafts','restart on new port','all passages and original pages sent together','retry preserves exact payload','new selection preserved after retry'],aiCalls:0};
 fs.writeFileSync(path.join(data,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await app?.close();}
