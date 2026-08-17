import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = resolve(root, 'node_modules', 'himd-js', 'dist', 'secure-session.js');
let text = readFileSync(target, 'utf8');

const replacements = [
  ['            await this.driver.writeHostLeafID(this.hostLeafId, this.hostNonce);',
   '            console.log("Hi-MD auth stage 1: write host leaf ID");\n            await this.driver.writeHostLeafID(this.hostLeafId, this.hostNonce);\n            console.log("Hi-MD auth stage 1: completed");'],
  ['            const { deviceLeafId, deviceNonce, discId, mac } = await this.driver.getAuthenticationStage2Info();',
   '            console.log("Hi-MD auth stage 2: read device authentication data");\n            const { deviceLeafId, deviceNonce, discId, mac } = await this.driver.getAuthenticationStage2Info();\n            console.log("Hi-MD auth stage 2: completed");'],
  ['            await this.driver.writeAuthenticationStage3Info(hostMac);',
   '            console.log("Hi-MD auth stage 3: write host MAC");\n            await this.driver.writeAuthenticationStage3Info(hostMac);\n            console.log("Hi-MD auth stage 3: completed");'],
  ['            const { header, icv, mac: icvMac } = await this.driver.readICV();',
   '            console.log("Hi-MD auth stage 4: read ICV");\n            const { header, icv, mac: icvMac } = await this.driver.readICV();\n            console.log("Hi-MD auth stage 4: completed");'],
  ['        const mclistHandle = await this.himd.openMaclistForReading();',
   '        console.log("Hi-MD auth stage 5: read MAC list");\n        const mclistHandle = await this.himd.openMaclistForReading();'],
  ['        await mclistHandle.close();',
   '        await mclistHandle.close();\n        console.log("Hi-MD auth stage 5: completed");'],
];

let changed = false;
for (const [before, after] of replacements) {
  if (text.includes(after)) continue;
  if (!text.includes(before)) throw new Error(`Hi-MD authentication source changed: ${before}`);
  text = text.replace(before, after);
  changed = true;
}
if (changed) writeFileSync(target, text, 'utf8');
console.log(changed ? 'Added Hi-MD authentication diagnostics.' : 'Hi-MD authentication diagnostics already present.');
