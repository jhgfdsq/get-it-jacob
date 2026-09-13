#!/usr/bin/env node
// Get It Jacob: build the verified local Apple Silicon edition only.
import {spawnSync} from 'node:child_process';
const unsupported = process.argv.slice(2).some(a => a !== '--target=mac-arm64');
if (process.platform !== 'darwin' || process.arch !== 'arm64' || unsupported) {
  throw new Error('Cette édition personnelle prend en charge macOS Apple Silicon.');
}
for (const [command,args] of [
  [process.execPath,['scripts/electron-prepare.mjs']],
  ['node_modules/.bin/electron-builder',['--mac','dir','--arm64','--config.mac.identity=null']],
]) {
  const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
