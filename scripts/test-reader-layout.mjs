// Exercise the installed layout in a headless browser. Never invoke AI or open a window.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {launchBackgroundReader} from './background-reader.mjs';import {assertNoDockApp} from './mac-app-policy.mjs';
const docId=JSON.parse(fs.readFileSync('work/qa-native/result.json')).docId;
const data=fs.mkdtempSync(path.resolve('work/layout-ui-'));
fs.cpSync(path.join('work/native-data/docs',docId),path.join(data,'docs',docId),{recursive:true});
const before=fs.readFileSync(path.join(data,'docs',docId,'workctx.json'),'utf8');
const executablePath=process.env.TEST_APP_EXECUTABLE ?? path.resolve('dist-electron/mac-arm64/Get It Jacob.app/Contents/MacOS/Get It Jacob');
let app;const forbidden=[],errors=[];
try{
 app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:data}});let page=await app.firstWindow();
 const base=new URL(page.url()).origin;
 const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&!r.url().endsWith('/touch')&&!r.url().endsWith('/api/settings'))forbidden.push(r.url());});};observe(page);
 await page.goto(base+'/viewer/'+docId);await page.locator('.pdf-selectable-text span').first().waitFor();
 const grip=page.getByRole('separator',{name:'Largeur du PDF et du chat'});
 const pdf=page.locator('[data-reader-pdf]'),chat=page.locator('[data-reader-chat]');
 const draft=page.getByPlaceholder('Que souhaitez-vous comprendre ?');await draft.fill('Brouillon conservé pendant le redimensionnement.');
 const baseline=await pdf.boundingBox();
 await page.locator('[data-page="1"]').evaluate(el=>el.scrollIntoView({block:'center'}));await page.getByTestId('page-context').filter({hasText:'page 2'}).waitFor();
 const drag=async dx=>{const box=await grip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2,{steps:15});await page.mouse.up();await page.waitForTimeout(200);};
 await drag(180);assert((await pdf.boundingBox()).width>baseline.width+140);await page.getByTestId('page-context').filter({hasText:'page 2'}).waitFor();
 const wide=await pdf.boundingBox();await drag(-320);assert((await pdf.boundingBox()).width<wide.width-250);await page.getByTestId('page-context').filter({hasText:'page 2'}).waitFor();
 assert.equal(await draft.inputValue(),'Brouillon conservé pendant le redimensionnement.');
 const inputWidth=(await draft.boundingBox()).width;
 await page.getByRole('button',{name:'Masquer les discussions',exact:true}).click();
 assert.equal(await page.getByRole('complementary',{name:'Discussions du document'}).count(),0);
 assert((await draft.boundingBox()).width>=inputWidth+120);assert(await page.getByRole('button',{name:'Afficher les discussions',exact:true}).isVisible());
 await page.getByRole('button',{name:'Afficher les discussions',exact:true}).click();assert(await page.getByRole('complementary',{name:'Discussions du document'}).isVisible());
 assert.equal(await draft.inputValue(),'Brouillon conservé pendant le redimensionnement.');
 await grip.focus();await page.keyboard.press('End');assert((await chat.boundingBox()).width>=299);await page.keyboard.press('Home');assert((await pdf.boundingBox()).width>=279);
 await page.setViewportSize({width:960,height:720});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert((await chat.boundingBox()).width>=299);
 await grip.dblclick();assert.equal(await grip.getAttribute('aria-valuenow'),'54');
 await grip.focus();await page.keyboard.press('ArrowRight');assert.equal(await grip.getAttribute('aria-valuenow'),'56');
 await page.getByRole('button',{name:'Masquer les discussions',exact:true}).click();
 await page.waitForTimeout(300);
 const settings=await(await fetch(base+'/api/settings')).json();assert.equal(settings.readerPdfPercent,56);assert.equal(settings.readerChatListVisible,false);
 // Another preference must not reset either layout choice.
 await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:'light'})});
 await page.screenshot({path:path.join(data,'layout-narrow.png')});
 await app.close();app=await launchBackgroundReader({executablePath,env:{...process.env,GETIT_DATA_DIR:data}});page=await app.firstWindow();observe(page);const newBase=new URL(page.url()).origin;assert.notEqual(base,newBase);
 await page.goto(newBase+'/viewer/'+docId);await page.getByRole('button',{name:'Afficher les discussions',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('[role="separator"]')?.getAttribute('aria-valuenow')==='56');
 assert.equal(await page.getByPlaceholder('Que souhaitez-vous comprendre ?').inputValue(),'Brouillon conservé pendant le redimensionnement.');
 await page.locator('[data-page="0"] .pdf-selectable-text span').first().waitFor();
 await page.screenshot({path:path.join(data,'layout-restored.png')});
 assert.equal(fs.readFileSync(path.join(data,'docs',docId,'workctx.json'),'utf8'),before,'conversation history was never touched');
 assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);assertNoDockApp(executablePath);
 const result={pass:true,data,ratioRestored:56,chatListHiddenRestored:true,readerPagePreserved:true,draftPreserved:true,conversationUnchanged:true,implicitAIRequests:forbidden,errors};fs.writeFileSync('work/layout-result.json',JSON.stringify(result,null,2));console.log('LAYOUT PASS',data);
}catch(e){if(app){const p=await app.firstWindow();await p.screenshot({path:path.join(data,'failure.png')});}console.error('Test data:',data);throw e;}finally{await app?.close();}
