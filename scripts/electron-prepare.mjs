// Get It Jacob: stage only an explicitly supplied, verified local runtime.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next/standalone');
const source = process.env.GETIT_VERIFIED_CODEX_PATH;
if (!source || !fs.existsSync(source)) throw new Error('Set GETIT_VERIFIED_CODEX_PATH to an independently verified official Codex runtime. No download fallback.');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This personal build targets macOS Apple Silicon.');
execFileSync('/usr/bin/codesign', ['--verify','--strict',source]);
// codesign metadata is written to stderr; verify provenance separately.
const { spawnSync } = await import('node:child_process');
const meta = spawnSync('/usr/bin/codesign',['-dv','--verbose=2',source],{encoding:'utf8'}).stderr;
if (!meta.includes('TeamIdentifier=2DC432GLL2')) throw new Error('The runtime is not signed by OpenAI.');
const version = execFileSync(source,['--version'],{encoding:'utf8'}).trim();
if (/\b0\.130\.0\b/.test(version)) throw new Error('Rejected obsolete runtime version.');
if (!fs.existsSync(path.join(standalone,'server.js'))) throw new Error('Run npm run build first.');
for (const [from,to] of [['.next/static','.next/static'],['public','public']]) fs.cpSync(path.join(root,from),path.join(standalone,to),{recursive:true});
fs.copyFileSync(path.join(root,'scripts/server-watchdog.cjs'),path.join(standalone,'server-watchdog.cjs'));
const bin = path.join(root,'electron/codex-bin/aarch64-apple-darwin/codex/codex');
fs.mkdirSync(path.dirname(bin),{recursive:true});
fs.copyFileSync(source,bin);
fs.chmodSync(bin,0o755);
execFileSync('/usr/bin/codesign',['--verify','--strict',bin]);
const sha256 = createHash('sha256').update(fs.readFileSync(bin)).digest('hex');
fs.writeFileSync(path.join(root,'electron/runtime-manifest.json'),JSON.stringify({version,sha256,signer:'OpenAI OpCo, LLC (2DC432GLL2)'},null,2));
console.log('Verified runtime staged:',version,sha256);
