const { execFileSync } = require('child_process');
const path = require('path');

// Ad-hoc sign the .app bundle after packaging.
// Without this, electron-builder leaves the bundle unsigned (only the binary
// has the stock linker-signed adhoc signature), so _CodeSignature/ is missing,
// the bundle identifier stays as "Electron", and Gatekeeper rejects the app
// with "damaged and can't be opened" once it has the quarantine bit.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  console.log(`afterPack: ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
