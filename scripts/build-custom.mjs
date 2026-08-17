import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRunner = process.env.PNPM_EXECUTABLE
  ? process.env.PNPM_EXECUTABLE
  : process.platform === 'win32' ? 'npx.cmd' : 'npx';
const packageRunnerPrefix = process.env.PNPM_EXECUTABLE ? ['exec'] : [];

function run(command, args, options = {}) {
  const useWindowsCommandShell =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
    shell: useWindowsCommandShell,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function copy(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

function inlineMDSquirrelPreload() {
  const preloadPath = join(root, 'dist', 'preload.js');
  const modulePath = join(root, 'custom-overrides', 'dist', 'md-squirrel-preload.js');
  const marker = 'require("./md-squirrel-preload").install();';
  let preload = readFileSync(preloadPath, 'utf8');
  if (!preload.includes(marker)) {
    throw new Error('The MD Squirrel preload marker is missing.');
  }
  let moduleSource = readFileSync(modulePath, 'utf8')
    .replace(/^"use strict";\s*/u, '')
    .replace(/^const \{ ipcRenderer \} = require\("electron"\);\s*/u, '')
    .replace(/\s*module\.exports = \{ install \};\s*$/u, '');
  moduleSource = `{\nconst ipcRenderer = electron_1.ipcRenderer;\n${moduleSource}\ninstall();\n}`;
  preload = preload.replace(marker, moduleSource);
  writeFileSync(preloadPath, preload, 'utf8');
}

function patchInterface(sourceName) {
  const source = join(root, 'webminidisc', 'src', 'services', 'interfaces', sourceName);
  const destination = join(root, 'src', 'wmd', 'original', 'services', 'interfaces', sourceName);
  let text = readFileSync(source, 'utf8');
  text = `// This file has been auto-generated! DO NOT EDIT!\n${text}`;
  text = text.replace(
    /^import Worker(.*)? from '[^']+';/gm,
    'const Worker$1 = null as any;',
  );
  text = text.replaceAll('import.meta.url', '""');
  writeFileSync(destination, text, 'utf8');
}

function patchGeneratedHiMDService() {
  const destination = join(
    root,
    'src',
    'wmd',
    'original',
    'services',
    'interfaces',
    'himd.ts',
  );
  // GitHub's Windows runners may check out the generated source with CRLF
  // line endings. Normalize before matching the reviewed LF patch blocks so
  // the build is reproducible regardless of Git's autocrlf setting.
  let text = readFileSync(destination, 'utf8').replace(/\r\n?/g, '\n');
  const pairBefore = `    async pair() {
        const device = await navigator.usb.requestDevice({ filters: DevicesIds });`;
  const pairAfter = `    async pair() {
        // A service instance is reused when the renderer returns to the mode
        // selection screen. Never carry a previous disc across a new pairing.
        this.himd = undefined;
        this.cachedDisc = undefined;
        this.atdata = null;
        const device = await navigator.usb.requestDevice({ filters: DevicesIds });`;
  const finalizeBefore = `    async finalize(): Promise<void> {
        await this.fsDriver?.driver?.close();
    }`;
  const finalizeAfter = `    async finalize(): Promise<void> {
        const driver = this.fsDriver?.driver;
        try {
            await driver?.close();
        } finally {
            this.streamingWorker?.close();
            this.streamingWorker = null;
            this.session = null;
            this.atdata = null;
            this.himd = undefined;
            this.fsDriver = undefined;
            this.dropCachedContentList();
        }
    }`;
  const batchMarker = `    async deleteTracks(indexes: number[]): Promise<void> {`;
  const batchMethod = readFileSync(
    join(root, 'custom-overrides', 'patches', 'himd-apply-edit-batch.ts.txt'),
    'utf8',
  ).trimEnd();
  if (!text.includes(pairBefore) || !text.includes(finalizeBefore) || !text.includes(batchMarker)) {
    throw new Error('The pinned Hi-MD service no longer matches the reviewed patch.');
  }
  text = text
    .replace(pairBefore, pairAfter)
    .replace(finalizeBefore, finalizeAfter)
    .replace(batchMarker, `${batchMethod}\n${batchMarker}`);
  writeFileSync(destination, text, 'utf8');
}

const renderer = join(root, 'renderer');
rmSync(renderer, { recursive: true, force: true });

patchInterface('himd.ts');
patchInterface('netmd.ts');
patchGeneratedHiMDService();
copy(
  join(root, 'custom-overrides', 'patches', 'webusb-device.js'),
  join(root, 'node_modules', 'usb', 'dist', 'webusb', 'webusb-device.js'),
);
run(process.execPath, [
  join(root, 'custom-overrides', 'patches', 'patch-node-mass-storage.mjs'),
]);
run(process.execPath, [
  join(root, 'custom-overrides', 'patches', 'patch-himd-auth-logging.mjs'),
]);
run(packageRunner, [...packageRunnerPrefix, 'tsc']);

copy(join(root, 'custom-overrides', 'dist'), join(root, 'dist'));
// Electron's sandboxed preload can only require a small allow-list of modules.
// Inline the reviewed MD Squirrel UI module so it can share the existing
// ipcRenderer reference without enabling Node integration in the renderer.
inlineMDSquirrelPreload();
// The customized renderer is a complete, reviewed build artifact. Building
// the upstream submodule first would only be overwritten here and also makes
// the Windows build depend on the upstream submodule's stale package lock.
copy(join(root, 'custom-overrides', 'renderer'), renderer);
copy(
  join(root, 'custom-overrides', 'md-label-maker'),
  join(renderer, 'md-label-maker'),
);

const extras = join(root, 'extras');
mkdirSync(extras, { recursive: true });
copy(
  join(root, 'custom-overrides', 'extras', 'WMDP-WINUSB-DRIVER-NOTICE.txt'),
  join(extras, 'WMDP-WINUSB-DRIVER-NOTICE.txt'),
);
copy(
  join(root, 'custom-overrides', 'extras', 'LIBWDI-COPYING-LGPLv3.txt'),
  join(extras, 'LIBWDI-COPYING-LGPLv3.txt'),
);
rmSync(join(extras, 'drivers'), { recursive: true, force: true });
copy(
  join(root, 'custom-overrides', 'extras', 'drivers'),
  join(extras, 'drivers'),
);

// Older custom builds bundled libwdi's generated installer executable. Current
// Defender intelligence flags that legacy binary, so the release contains only
// the pre-generated universal INF/CAT/CER package and Windows' own pnputil path.
rmSync(join(extras, 'wmdp-driver-helper.exe'), { force: true });
rmSync(join(extras, 'WMDP-DRIVER-HELPER-NOTICE.txt'), { force: true });
const libwdiArchive = join(extras, 'LIBWDI-SOURCE-v1.5.1-wmdp.zip');
rmSync(libwdiArchive, { force: true });

copy(
  join(root, 'custom-overrides', 'MODIFIED-BUILD-NOTICE.txt'),
  join(root, 'MODIFIED-BUILD-NOTICE.txt'),
);
rmSync(join(root, 'SOURCE-MODIFICATIONS'), { recursive: true, force: true });
copy(join(root, 'custom-overrides'), join(root, 'SOURCE-MODIFICATIONS'));

console.log('Custom source tree is ready for electron-builder.');
