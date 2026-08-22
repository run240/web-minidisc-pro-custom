const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const rendererRoot = path.join(__dirname, '..', 'custom-overrides', 'renderer');
const swPath = path.join(rendererRoot, 'sw.js');
const assets = ['registerSW.js', 'assets/safe-expression-evaluator.mjs'];
let source = fs.readFileSync(swPath, 'utf8');

for (const asset of assets) {
  const revision = crypto.createHash('md5').update(fs.readFileSync(path.join(rendererRoot, asset))).digest('hex');
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = `{url:"${asset}",revision:"${revision}"}`;
  const pattern = new RegExp(`\\{url:"${escaped}",revision:(?:"[^"]*"|null)\\}`);
  if (pattern.test(source)) {
    source = source.replace(pattern, entry);
  } else {
    const anchor = '{url:"assets/index-DdAyCQFX.js",revision:null}';
    if (!source.includes(anchor)) throw new Error(`Service worker anchor missing for ${asset}`);
    source = source.replace(anchor, `${anchor},${entry}`);
  }
}

fs.writeFileSync(swPath, source);
console.log('Service worker security asset revisions updated.');
