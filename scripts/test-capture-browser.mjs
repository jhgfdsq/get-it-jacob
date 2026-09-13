// End-to-end reader controls in the packaged server, without windows or AI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchBackgroundReader} from './background-reader.mjs';
import {assertNoDockApp} from './mac-app-policy.mjs';
const docId=JSON.parse(fs.readFileSync('work/qa-native/result.json','utf8')).docId;
const data=fs.mkdtempSync(path.resolve('work/capture-ui-'));
fs.cpSync(path.resolve('work/native-data/docs',docId),path.join(data,'docs',docId),{recursive:true});
fs.rmSync(path.join(data,'docs',docId,'captures'),{recursive:true,force:true});
fs.rmSync(path.join(data,'docs',docId,'chat-drafts.json'),{force:true});
const qa=path.join(data,'qa');fs.mkdirSync(qa);
const executablePath=path.resolve('dist-electron/mac-arm64/Get It Jacob.app/Contents/MacOS/Get It Jacob');
let app;
const requests=[],sent=[],errors=[],captures=[];
let failNext=false, emptyChats=false, holdSend=false, releaseSend;
const chats=[{id:'chat-a',title:'Discussion A',createdAt:1,updatedAt:1,messages:[]},{id:'chat-b',title:'Discussion B',createdAt:2,updatedAt:2,messages:[]}];
try{
 app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:data}});
 let page=await app.firstWindow();await page.setViewportSize({width:1440,height:960});
 const base=new URL(page.url()).origin;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const r=route.request(),u=new URL(r.url());requests.push({path:u.pathname,method:r.method()});
  if(u.pathname.includes('/health'))return route.fulfill({json:{ok:true,kind:null,message:null,serial:0,lastOkAt:Date.now()}});
  if(u.pathname==='/api/provider/status'||u.pathname.includes('/account')||u.pathname.includes('/auth'))return route.fulfill({json:{provider:'codex',label:'ChatGPT',installed:true,authenticated:true,account:{name:'Compte de test',email:null,planType:'plus'},exposesLimits:true,rateLimits:{primary:{usedPercent:12,windowDurationMins:300,resetsAt:null},secondary:null}}});
  if(u.pathname===`/api/chat/${docId}`){
   if(r.method()==='GET')return route.fulfill({json:{chats:emptyChats?[]:chats}});
   const b=r.postDataJSON();
   if(b.action==='create'){const c={id:crypto.randomUUID(),title:'Nouvelle discussion',createdAt:Date.now(),updatedAt:Date.now(),messages:[]};chats.unshift(c);return route.fulfill({json:{chat:c}});}
   assert.equal(b.action,'send');sent.push(b);if(holdSend)await new Promise(resolve=>{releaseSend=resolve;});
   if(failNext){failNext=false;return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'error',error:'Coupure simulée'})+'\n\n'});}
   const c=chats.find(c=>c.id===b.chatId);assert(c);
   c.messages.push({role:'user',content:b.message,pageIndex:b.pageIndex,selection:b.selection,captures:b.captureIds.map(id=>captures.find(c=>c.id===id)),requestId:b.requestId,ts:Date.now()},{role:'assistant',content:'Les captures et la question ont bien été reçues.',ts:Date.now()});
   return route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'done',chat:c,reply:c.messages.at(-1)})+'\n\n'});
  }
  if(r.method()==='POST' && u.pathname===`/api/captures/${docId}`){const response=await route.fetch();const result=await response.json();assert.equal(response.status(),201,JSON.stringify(result));captures.push(result.capture);return route.fulfill({response});}
  if(r.method()==='POST')assert(u.pathname.endsWith('/touch')||u.pathname==='/api/settings','Unexpected automatic work '+u.pathname);
  await route.continue();
 });
 await page.goto(base+'/viewer/'+docId);
 const toolbar=page.getByRole('toolbar',{name:'Outils du document'});
 await page.locator('[data-page="0"] .pdf-selectable-text span').first().waitFor();
 assert(await page.getByRole('button',{name:'Discuter',exact:true}).isDisabled());
 assert(await page.getByRole('button',{name:'Créer un visuel',exact:true}).isDisabled());
 assert(await page.getByRole('button',{name:'Capturer une zone',exact:true}).isEnabled());
 assert.equal(await page.getByRole('button',{name:'Expliquer',exact:true}).count(),0);
 const toolbarY=(await toolbar.boundingBox()).y;
 const scrollTo=async index=>{await page.locator(`[data-page="${index}"]`).evaluate(el=>el.scrollIntoView({block:'center'}));await page.getByTestId('page-context').filter({hasText:`page ${index+1}`}).waitFor();};
 await scrollTo(1);assert.equal((await toolbar.boundingBox()).y,toolbarY);
 await page.getByRole('button',{name:'Agrandir',exact:true}).click();await page.waitForTimeout(300);await scrollTo(1);
 const text=page.locator('[data-page="1"] .pdf-selectable-text span').filter({hasText:'La capacité augmente'}).first();
 const b=await text.boundingBox();assert(b);await page.mouse.move(b.x+1,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width-1,b.y+b.height/2,{steps:15});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('[title="Ajouter le texte sélectionné au chat"]')?.disabled===false);
 assert(await page.getByRole('button',{name:'Créer un visuel',exact:true}).isEnabled());
 await page.getByRole('button',{name:'Créer un visuel',exact:true}).click();await page.getByRole('menuitem',{name:'Graphique',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Discuter',exact:true}).click();await page.getByText('Passage 1 · page 2').waitFor();
 assert.equal(sent.length,0);await page.getByRole('button',{name:'Retirer le passage 1',exact:true}).click();
 const crop=async(index,rect,resize=false)=>{
  await scrollTo(index);await page.getByRole('button',{name:'Capturer une zone',exact:true}).click();
  await page.locator(`[data-page="${index}"]`).evaluate(el=>el.scrollIntoView({block:'center'}));
  const overlay=page.locator(`[data-page="${index}"] [data-capture-overlay]`);const box=await overlay.boundingBox();assert(box);
  const [x,y,w,h]=rect;
  await page.mouse.move(box.x+x*box.width,box.y+y*box.height);await page.mouse.down();await page.mouse.move(box.x+(x+w)*box.width,box.y+(y+h)*box.height,{steps:15});await page.mouse.up();
  await page.locator('[data-capture-rectangle]').waitFor();
  const before=await page.locator('[data-capture-rectangle]').boundingBox();
  if(resize){const handle=await page.locator('[data-capture-handle="se"]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+20,handle.y+16,{steps:5});await page.mouse.up();const after=await page.locator('[data-capture-rectangle]').boundingBox();assert(after.width>before.width);const center={x:after.x+after.width/2,y:after.y+after.height/2};await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+8,center.y+8,{steps:4});await page.mouse.up();assert((await page.locator('[data-capture-rectangle]').boundingBox()).x>after.x);}
  await page.screenshot({path:path.join(qa,`crop-${captures.length+1}.png`)});
  const count=captures.length;await page.getByRole('button',{name:'Ajouter au chat',exact:true}).click();
  await page.getByRole('button',{name:`Agrandir Capture d’écran ${count+1}`,exact:true}).waitFor();
  assert.equal(captures.length,count+1);
 };
 await crop(1,[.12,.25,.65,.33],true);
 await crop(2,[.08,.16,.75,.23]);
 assert.equal(sent.length,0,'drawing and adding captures sends no message');assert.equal(captures[0].pageIndex,1);assert.equal(captures[1].pageIndex,2);
 const draft=page.getByTestId('capture-draft');assert.equal(await draft.locator('img').count(),2);
 await page.getByRole('button',{name:'Agrandir Capture d’écran 1',exact:true}).click();await page.getByRole('dialog',{name:'Capture d’écran 1',exact:true}).waitFor();await page.screenshot({path:path.join(qa,'preview.png')});await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Discussion B',exact:true}).click();assert.equal(await page.getByTestId('capture-draft').count(),0);
 await page.getByRole('button',{name:'Discussion A',exact:true}).click();assert.equal(await page.getByTestId('capture-draft').locator('img').count(),2);
 await page.getByRole('button',{name:'Visuels',exact:true}).click();await page.getByRole('button',{name:'Chat',exact:true}).click();assert.equal(await draft.locator('img').count(),2);
 await page.getByPlaceholder('Que souhaitez-vous comprendre ?').fill('Compare les deux captures.');
 await page.reload();await page.getByRole('button',{name:'Agrandir Capture d’écran 2',exact:true}).waitFor();assert.equal(await page.getByPlaceholder('Que souhaitez-vous comprendre ?').inputValue(),'Compare les deux captures.');assert.equal(sent.length,0,'draft restoration does not send');
 // Cancellation must not add a third crop.
 await page.getByRole('button',{name:'Capturer une zone',exact:true}).click();await page.keyboard.press('Escape');assert.equal(captures.length,2);
 await page.getByRole('button',{name:'Réglages',exact:true}).click();await page.getByRole('combobox',{name:'Apparence'}).selectOption('dark');await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));await page.getByRole('combobox',{name:'Apparence'}).selectOption('light');await page.getByRole('combobox',{name:'Réponses du chat'}).selectOption('medium');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Réglages',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Réponses du chat"]')?.value==='medium');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Compte ChatGPT',exact:true}).click();await page.getByRole('region',{name:'Compte ChatGPT',exact:true}).waitFor();await page.getByText('Compte de test',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reconnecter ChatGPT',exact:true}).count(),0);await page.keyboard.press('Escape');
 await page.waitForTimeout(220);await page.mouse.move(5,955);await page.setViewportSize({width:1280,height:820});await page.screenshot({path:path.join(qa,'two-captures-1280.png')});assert(await toolbar.isVisible());await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(200);await page.screenshot({path:path.join(qa,'two-captures-draft.png')});
 failNext=true;await page.getByRole('button',{name:'Envoyer (Entrée)',exact:true}).click();await page.getByRole('button',{name:/Réessayer \(page/}).waitFor();
 assert.deepEqual(sent[0].captureIds,captures.map(c=>c.id));assert.equal(sent[0].message,'Compare les deux captures.');
 await page.reload();await page.getByRole('button',{name:/Réessayer \(page/}).waitFor();assert.equal(sent.length,1,'reload after failure does not resend');
 await scrollTo(0);await page.getByRole('button',{name:/Réessayer \(page/}).click();await page.getByText('Les captures et la question ont bien été reçues.',{exact:true}).waitFor();assert.deepEqual(sent[1],sent[0],'retry restores the entire immutable turn');
 await page.reload();await page.getByText('Les captures et la question ont bien été reçues.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Agrandir Capture d’écran 1',exact:true}).count(),1);assert.equal(await page.getByTestId('capture-draft').count(),0);
 // New captures get new names, and removing one does not alter the others.
 await crop(0,[.1,.25,.7,.2]);await page.getByRole('button',{name:'Retirer Capture d’écran 3',exact:true}).click();assert.equal(await page.getByTestId('capture-draft').count(),0);
 // An initial draft follows an explicitly created first conversation.
 emptyChats=true;await fetch(base+'/api/chat/'+docId+'/drafts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({drafts:{},outbox:{}})});await page.reload();await page.getByPlaceholder('Que souhaitez-vous comprendre ?').waitFor();await crop(0,[.1,.25,.7,.2]);await page.getByPlaceholder('Que souhaitez-vous comprendre ?').fill('Brouillon initial');emptyChats=false;await page.getByRole('button',{name:'Nouvelle discussion',exact:true}).first().click();await page.getByRole('button',{name:'Agrandir Capture d’écran 4',exact:true}).waitFor();assert.equal(await page.getByPlaceholder('Que souhaitez-vous comprendre ?').inputValue(),'Brouillon initial');
 assert.equal(sent.length,2);
 holdSend=true;await page.getByRole('button',{name:'Envoyer (Entrée)',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('textarea')?.disabled===true);
 await crop(1,[.12,.25,.65,.33]);assert.deepEqual(sent[2].captureIds,[captures[3].id],'a later crop is not silently added to the in-flight turn');
 holdSend=false;releaseSend();await page.getByText('Les captures et la question ont bien été reçues.',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('capture-draft').locator('img').count(),1,'later capture remains in next draft');
 await page.waitForTimeout(250);
 const durable=await(await fetch(base+'/api/chat/'+docId+'/drafts')).json();assert.equal(durable.drafts[chats[0].id].captures[0].attachment.id,captures[4].id);
 // Full server/browser restart on a different port. No browser storage can help.
 fs.writeFileSync(path.join(data,'docs',docId,'workctx.json'),JSON.stringify({v:1,docId,chats,flashcards:[],quizzes:[],feynman:[]}));
 await app.close();app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:data}});page=await app.firstWindow();const newBase=new URL(page.url()).origin;assert.notEqual(newBase,base);
 const restartPosts=[];page.on('request',r=>{if(r.method()==='POST'&&!r.url().endsWith('/touch'))restartPosts.push(r.url());});
 await page.goto(newBase+'/viewer/'+docId);await page.getByTestId('capture-draft').getByRole('button',{name:'Agrandir Capture d’écran 5',exact:true}).waitFor();
 assert.equal(restartPosts.length,0,'server restart restores drafts without invoking AI');
 assert.equal(errors.length,0,errors.join('\n'));assertNoDockApp(executablePath);
 await page.screenshot({path:path.join(qa,'final.png')});
 for(const c of captures){const image=await fetch(new URL(page.url()).origin+c.url);fs.writeFileSync(path.join(qa,`${c.name}.png`),Buffer.from(await image.arrayBuffer()));}
 fs.writeFileSync('work/capture-browser-result.json',JSON.stringify({pass:true,qa,requests,sent,captures,errors},null,2));console.log('CAPTURE BROWSER PASS',qa);
}catch(e){if(app){const page=await app.firstWindow();await page.screenshot({path:path.join(qa,'failure.png')});}console.error('QA folder',qa);throw e;}finally{await app?.close();}
