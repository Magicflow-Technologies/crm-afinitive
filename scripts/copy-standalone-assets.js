const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach((element) => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

const root = path.resolve(__dirname, '..');
const standaloneDir = path.join(root, '.next', 'standalone');

if (fs.existsSync(standaloneDir)) {
  const staticSrc = path.join(root, '.next', 'static');
  const staticDest = path.join(standaloneDir, '.next', 'static');
  const publicSrc = path.join(root, 'public');
  const publicDest = path.join(standaloneDir, 'public');

  console.log('[standalone] Copying static assets to .next/standalone...');
  copyFolderSync(staticSrc, staticDest);
  copyFolderSync(publicSrc, publicDest);
  console.log('[standalone] Static assets copied successfully.');
}
