// Get It Jacob: local ad-hoc app signature; preserve OpenAI's runtime signature.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
module.exports = async function(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir,`${context.packager.appInfo.productFilename}.app`);
  const frameworks = path.join(appPath,'Contents/Frameworks');
  for (const name of fs.readdirSync(frameworks)) {
    if (name.endsWith('.app') || name.endsWith('.framework') || name.endsWith('.dylib')) execFileSync('codesign',['--force','--deep','--sign','-','--timestamp=none',path.join(frameworks,name)]);
  }
  execFileSync('codesign',['--force','--sign','-','--timestamp=none',appPath]);
  execFileSync('codesign',['--verify','--deep','--strict',appPath]);
  const binary = path.join(appPath,'Contents/Resources/app/electron/codex-bin/aarch64-apple-darwin/codex/codex');
  execFileSync('codesign',['--verify','--strict',binary]);
};
