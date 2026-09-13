// Read-only macOS Dock eligibility check. No accessibility permission required.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
export function readOwnMacApps(executablePath) {
  const source=`ObjC.import('AppKit');const apps=$.NSWorkspace.sharedWorkspace.runningApplications;const out=[];for(let i=0;i<apps.count;i++){const a=apps.objectAtIndex(i);out.push({pid:Number(a.processIdentifier),name:ObjC.unwrap(a.localizedName),policy:Number(a.activationPolicy),exe:ObjC.unwrap(a.executableURL?.path)});}JSON.stringify(out);`;
  const root=path.resolve(executablePath,'../../..')+'/';
  return JSON.parse(execFileSync('osascript',['-l','JavaScript','-e',source],{encoding:'utf8'})).filter(a=>String(a.exe).startsWith(root));
}
export function assertSingleDockApp(executablePath) {
  const apps=readOwnMacApps(executablePath),regular=apps.filter(a=>a.policy===0);
  if(regular.length!==1||regular[0].exe!==executablePath)throw new Error('Unexpected Dock applications: '+JSON.stringify(apps));
  return apps;
}
