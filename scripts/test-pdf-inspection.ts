/** Local PDF classification and rendering checks. No model, network or UI. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { inspectPdfPages, createPdfPageRenderer } from "../lib/pdf-extract";

async function main() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const textPage = (text: string) => {
    const page = pdf.addPage([400,500]);
    page.drawText(text, { x:30,y:450,size:14,font });
    return page;
  };
  textPage("Frontispiece: just a title");
  const rules = textPage("Prose with underlines and layout rules");
  for (let y=100;y<300;y+=40) rules.drawLine({start:{x:30,y},end:{x:370,y},thickness:0.5});
  rules.drawRectangle({x:30,y:320,width:200,height:0.5,color:rgb(0,0,0)});
  const chart = textPage("Vector-only bar chart");
  for (let i=0;i<3;i++) chart.drawRectangle({x:50+i*70,y:50,width:35,height:70+i*60,color:rgb(0.2,0.5,0.8)});
  const canvas = createCanvas(400,500);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0,0,400,500); ctx.fillStyle = "black";ctx.font="24px sans-serif";ctx.fillText("Scanned page 47 MW",30,100);
  const image=await pdf.embedPng(canvas.toBuffer("image/png"));
  pdf.addPage([400,500]).drawImage(image,{x:0,y:0,width:400,height:500});
  const table = textPage("Text with table axes");
  table.drawLine({start:{x:30,y:300},end:{x:350,y:300},thickness:0.5});
  table.drawLine({start:{x:30,y:100},end:{x:30,y:300},thickness:0.5});
  pdf.addPage([400,500]);
  const diagonal = textPage("Thin rotated vector shape");
  diagonal.drawRectangle({x:40,y:100,width:150,height:0.5,rotate:degrees(45),color:rgb(0,0,0)});
  const bytes=await pdf.save();
  const pages=await inspectPdfPages(bytes);
  assert.deepEqual(pages.map(p=>p.hasVisualContent),[false,false,true,true,true,false,true]);
  assert.deepEqual(pages.map(p=>p.reason),["text-only","text-only","vector-content","raster-image","structured-lines","blank","vector-content"]);
  assert.equal(pages[3].imageCount,1);
  const controller = new AbortController();controller.abort();
  await assert.rejects(inspectPdfPages(bytes,controller.signal), {name:"AbortError"});
  await fs.mkdir("work",{recursive:true});
  const directory=await fs.mkdtemp(path.resolve("work/pdf-inspection-"));
  const renderer=await createPdfPageRenderer(bytes);
  try {
    assert.deepEqual(await renderer.inspect(),pages,"shared renderer produces identical complete coverage");
    await renderer.render(3,path.join(directory,"scan.png"));
    assert.ok((await fs.stat(path.join(directory,"scan.png"))).size>1000,"inspection cleanup still permits original page rendering");
    const originalPng=await loadImage(await fs.readFile(path.join(directory,"scan.png")));
    for (const extension of ["jpg", "jpeg"]) {
      const jpegPath=path.join(directory,`scan.${extension}`);
      await renderer.render(3,jpegPath);
      const bytes=await fs.readFile(jpegPath);
      assert.deepEqual([...bytes.subarray(0,3)],[0xff,0xd8,0xff],"JPEG destination contains actual JPEG bytes");
      const decoded=await loadImage(bytes);
      assert.equal(decoded.width,originalPng.width,"JPEG preserves PNG viewport width");
      assert.equal(decoded.height,2200,"JPEG preserves full 2200-pixel rendering resolution");
    }
  } finally {await renderer.close();await fs.rm(directory,{recursive:true,force:true});}
  console.log("PASS: frontispiece and 6 layout rules stay text-only; vector chart, scan, table, rotated thin graphic retained; blank page classified; cancellation; render after inspection. No AI called.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
