// Get It Jacob: preserve the complete Next standalone tree and relative aliases.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const resources = path.join(appPath,'Contents/Resources/app');
  const source = path.join(context.packager.projectDir,'.next/standalone');
  if (fs.existsSync(path.join(source,'work'))) throw new Error('Test data must never enter the application.');
  // electron-builder prunes nested node_modules. Copy the traced production
  // tree after its dependency collector, retaining Turbopack relative aliases.
  fs.cpSync(source,path.join(resources,'.next/standalone'),{recursive:true,force:true,verbatimSymlinks:true});
  // The Electron shell imports only built-ins. Its server owns the traced
  // dependencies above, so the builder's second full dependency tree is unused.
  fs.rmSync(path.join(resources,'node_modules'),{recursive:true,force:true});
  const binary = path.join(resources, 'electron/codex-bin/aarch64-apple-darwin/codex/codex');
  if (!fs.existsSync(binary)) throw new Error('Verified Codex runtime missing from desktop package.');
};
