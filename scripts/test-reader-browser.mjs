import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
const base = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:38177';
const pdf = fs.readFileSync('work/lecture-test.pdf');
const parsed = await PDFDocument.load(pdf);
const pages = parsed.getPages().map((p, pageIndex) => ({ pageIndex, ...p.getSize(), text: 'Texte de test local.' }));
const folder = 'work/qa-ui'; fs.mkdirSync(folder, { recursive: true });
const requests = [], errors = [];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', async route => {
  const req = route.request(), url = new URL(req.url()), body = req.postData();
  requests.push({ path: url.pathname, method: req.method(), body });
  const respond = json => route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
  if (url.pathname === '/api/doc/fixture-document') return respond({ docId: 'fixture-document', filename: 'Lecture test.pdf', numPages: pages.length, pages, pdfUrl: '/api/pdf/fixture-document' });
  if (url.pathname === '/api/pdf/fixture-document') return route.fulfill({ contentType: 'application/pdf', body: pdf });
  if (url.pathname === '/api/preparation/fixture-document' && req.method() === 'GET') return respond({ status: 'ready', completedPages: pages.length, totalPages: pages.length });
  if (url.pathname === '/api/doc/fixture-document/touch') return respond({ ok: true });
  if (url.pathname === '/api/manual-viz/fixture-document' && req.method() === 'GET') return respond({ visuals: [{ id: 'visual-fixture', createdAt: 1, pageIndex: 1, selection: 'Passage exemple', spec: { kind: 'diagram', title: 'Relations entre les éléments', explanation: 'Relations de contrôle pour vérifier le rendu.', sourcePages: [2], nodes: [{id:'a',label:'Source'},{id:'b',label:'Réseau'},{id:'c',label:'Alimentation'},{id:'d',label:'Calcul'}], edges: [{from:'a',to:'b',label:'transmet'},{from:'a',to:'c',label:'alimente'},{from:'b',to:'d',label:'dessert'},{from:'c',to:'d',label:'alimente'}] } }] });
  if (url.pathname === '/api/chat/fixture-document' && req.method() === 'GET') return respond({ chats: [{ id: 'chat-fixture', title: 'Discussion existante', createdAt: 1, updatedAt: 1, messages: [] }] });
  if (url.pathname.includes('health') || url.pathname.includes('auth') || url.pathname.includes('account')) return respond({ ok: true, status: 'ready', authenticated: true, provider: 'codex' });
  if (url.pathname === '/api/settings') return respond({ theme: 'light', provider: 'codex', codexEffortFast: 'low' });
  throw new Error(`FORBIDDEN unexpected API ${req.method()} ${url.pathname} ${body ?? ''}`);
});
await page.addInitScript(() => {
  const native = window.fetch;
  window.__sent = []; window.__fail = false;
  window.fetch = async (input, init) => {
    if (String(input).includes('/api/chat/fixture-document') && init?.method === 'POST') {
      const body = JSON.parse(init.body); window.__sent.push(body);
      if (body.action !== 'send') throw new Error('Unexpected chat creation');
      const failed = window.__fail; window.__fail = false;
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        const emit = item => controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
        emit({ type: 'status', text: 'Page reçue…' });
        setTimeout(() => { if (failed) { emit({ type: 'error', error: 'Erreur de test transitoire.' }); controller.close(); } else emit({ type: 'text', text: 'Premiers mots visibles' }); }, 150);
        if (!failed) setTimeout(() => {
          emit({ type: 'text', text: 'Premiers mots visibles puis réponse complète.' });
          emit({ type: 'done', reply: 'Premiers mots visibles puis réponse complète.', chat: { id: body.chatId, title: 'Discussion existante', createdAt: 1, updatedAt: Date.now(), messages: [{ role: 'user', content: body.message, ts: 1, pageIndex: body.pageIndex }, { role: 'assistant', content: 'Premiers mots visibles puis réponse complète.', ts: 2, pageIndex: body.pageIndex }] } }); controller.close();
        }, 1700);
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return native(input, init);
  };
});
try {
  await page.goto(`${base}/viewer/fixture-document`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('[data-page="0"] .pdf-selectable-text span').first().waitFor({ timeout: 30000 });
  await page.getByTestId('page-context').filter({ hasText: 'page 1' }).waitFor();
  await page.screenshot({ path: path.join(folder, '01-initial.png') });
  const scrollTo = async index => { await page.locator(`[data-page="${index}"]`).evaluate(el => el.scrollIntoView({ block: 'center' })); await page.getByTestId('page-context').filter({ hasText: `page ${index + 1}` }).waitFor(); };
  await scrollTo(1);
  assert.equal(await page.evaluate(() => window.__sent.length), 0, 'scroll sends no AI');
  const beforeZoom = await page.locator('[data-page="1"]').boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(300);
  const afterZoom = await page.locator('[data-page="1"]').boundingBox();
  assert(afterZoom.width > beforeZoom.width, 'zoom changes page geometry');
  await scrollTo(1);
  // Use actual pointer drag over a PDF.js text span, not a synthetic selection.
  const span = page.locator('[data-page="1"] .pdf-selectable-text span').filter({ hasText: 'La capacité augmente' }).first();
  const box = await span.boundingBox(); assert(box && box.width > 5 && box.height > 5);
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 15 }); await page.mouse.up();
  await page.getByRole('toolbar', { name: 'Actions sur la sélection' }).waitFor();
  const selected = await page.evaluate(() => window.getSelection().toString()); assert(selected.trim().length > 4, 'text genuinely selectable at zoom');
  await page.screenshot({ path: path.join(folder, '02-selection-zoom.png') });
  assert.equal(await page.evaluate(() => window.__sent.length), 0, 'selection sends no AI');
  await page.getByRole('button', { name: 'Expliquer', exact: true }).click();
  await page.getByText('Passage sélectionné · page 2').waitFor();
  assert.equal(await page.evaluate(() => window.__sent.length), 0, 'explain only drafts until send');
  await page.getByRole('textbox', { name: '' }).last().fill('Développe ce passage.');
  await page.getByRole('button', { name: 'Envoyer (Entrée)' }).click();
  await page.getByText('Premiers mots visibles', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Arrêter', exact: true }).isVisible(), 'partial text shown while still streaming');
  const first = await page.evaluate(() => window.__sent[0]); assert.equal(first.pageIndex, 1); assert(first.selection.length > 4);
  await scrollTo(2);
  await page.getByText('Premiers mots visibles puis réponse complète.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Premiers mots visibles puis réponse complète.', { exact: true }).count(), 1, 'cumulative stream has no duplicated prefixes');
  await page.screenshot({ path: path.join(folder, '03-reply-page-changed.png') });
  // Retry must use the failed page even after a new scroll.
  await page.evaluate(() => { window.__fail = true; });
  await page.getByRole('textbox').last().fill('Question page trois');
  await page.getByRole('button', { name: 'Envoyer (Entrée)' }).click();
  await page.getByRole('button', { name: 'Réessayer (page 3)' }).waitFor();
  await scrollTo(0);
  await page.getByRole('button', { name: 'Réessayer (page 3)' }).click();
  await page.getByText('Premiers mots visibles puis réponse complète.', { exact: true }).waitFor();
  await page.waitForTimeout(1800);
  const sent = await page.evaluate(() => window.__sent); assert.equal(sent[1].pageIndex, 2); assert.equal(sent[2].pageIndex, 2);
  await page.getByRole('button', { name: 'Visuels', exact: true }).click();
  await page.getByRole('img', { name: 'Relations entre les éléments' }).waitFor();
  await page.screenshot({ path: path.join(folder, '04-diagram-boundaries.png') });
  assert(!requests.some(r => r.method === 'POST' && !r.path.endsWith('/touch')), 'no implicit POST anywhere');
  assert.equal(errors.length, 0, `browser exceptions: ${errors.join('; ')}`);
  fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ pass: true, tests: ['readable PDF text layer at zoom', 'scroll page badge', 'no automatic AI', 'selection draft', 'SSE text before done', 'cumulative text once', 'existing chat page context', 'retry original page'], requests, sent, errors }, null, 2));
  console.log('PASS reader browser: selectable PDF at zoom, current page, SSE early text, no spontaneous AI, retry page snapshot.');
} catch (error) { await page.screenshot({ path: path.join(folder, 'failure.png') }); fs.writeFileSync(path.join(folder, 'failure.json'), JSON.stringify({ error: error.stack, requests, errors }, null, 2)); throw error; }
finally { await browser.close(); }
