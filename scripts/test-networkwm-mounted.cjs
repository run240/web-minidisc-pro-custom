"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  isOMGAudioVolume,
  backupOMGAudioMetadata,
  restoreLatestOMGAudioMetadata,
  MountedNetworkWMFilesystem,
} = require("../dist/wmd/mounted-networkwm-filesystem");
const {
  getMountedNetworkWMProfile,
} = require("../dist/wmd/networkwm-mounted-profiles");

const requiredFiles = [
  "01TREE01.DAT",
  "01TREE02.DAT",
  "01TREE03.DAT",
  "01TREE04.DAT",
  "02TREINF.DAT",
  "03GINF01.DAT",
  "03GINF02.DAT",
  "03GINF03.DAT",
  "03GINF04.DAT",
  "04CNTINF.DAT",
];

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wmdp-networkwm-"));
const databaseRoot = path.join(temporaryRoot, "OMGAUDIO");

async function main() {
  assert.strictEqual(getMountedNetworkWMProfile(0x0210), null);
  assert.deepStrictEqual(getMountedNetworkWMProfile(0x0269), { productId: 0x0269, readOnly: false });
  assert.deepStrictEqual(getMountedNetworkWMProfile(0x026a), { productId: 0x026a, readOnly: false });
  assert.strictEqual(getMountedNetworkWMProfile(0xffff), null);

  fs.mkdirSync(databaseRoot);
  assert.strictEqual(isOMGAudioVolume(temporaryRoot), false);

  for (const fileName of requiredFiles) {
    fs.writeFileSync(path.join(databaseRoot, fileName), fileName);
  }
  assert.strictEqual(isOMGAudioVolume(temporaryRoot), true);

  const filesystem = new MountedNetworkWMFilesystem(temporaryRoot);
  assert.strictEqual(
    await filesystem.getSize("OMGAUDIO/04CNTINF.DAT"),
    Buffer.byteLength("04CNTINF.DAT"),
  );
  assert.strictEqual(await filesystem.getSize("OMGAUDIO/MISSING.DAT"), null);
  assert.ok((await filesystem.getTotalSpace()) > 0);
  await filesystem.mkdir("OMGAUDIO/10F00");
  await filesystem.mkdir("OMGAUDIO/10F00");
  assert.strictEqual(fs.statSync(path.join(databaseRoot, "10F00")).isDirectory(), true);

  const backupRoot = path.join(temporaryRoot, "backups");
  const backupPath = backupOMGAudioMetadata(temporaryRoot, backupRoot, "Sony NW-HD3");
  for (const fileName of requiredFiles) {
    assert.deepStrictEqual(
      fs.readFileSync(path.join(backupPath, fileName)),
      fs.readFileSync(path.join(databaseRoot, fileName)),
    );
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(backupPath, "manifest.json"), "utf8"));
  assert.strictEqual(manifest.deviceName, "Sony NW-HD3");
  assert.strictEqual(manifest.files.length, requiredFiles.length);

  fs.unlinkSync(path.join(databaseRoot, requiredFiles[0]));
  assert.strictEqual(isOMGAudioVolume(temporaryRoot), false);
  assert.strictEqual(restoreLatestOMGAudioMetadata(temporaryRoot, backupRoot, "Sony NW-A1000"), null);
  assert.strictEqual(restoreLatestOMGAudioMetadata(temporaryRoot, backupRoot, "Sony NW-HD3"), backupPath);
  assert.strictEqual(isOMGAudioVolume(temporaryRoot), true);

  const nestedDirectory = path.join(databaseRoot, "20P02");
  fs.mkdirSync(nestedDirectory);
  fs.writeFileSync(path.join(nestedDirectory, "cover.bin"), "cover");
  await filesystem.delete("OMGAUDIO/20P02/cover.bin");
  await filesystem.delete("OMGAUDIO/20P02");
  assert.strictEqual(fs.existsSync(nestedDirectory), false);

  fs.writeFileSync(path.join(databaseRoot, "leading-slash.dat"), "safe");
  await filesystem.delete("\\OMGAUDIO\\leading-slash.dat");
  assert.strictEqual(fs.existsSync(path.join(databaseRoot, "leading-slash.dat")), false);

  fs.writeFileSync(path.join(databaseRoot, "late-device-entry.tmp"), "late");
  await filesystem.delete("/OMGAUDIO");
  assert.strictEqual(fs.existsSync(databaseRoot), true);
  assert.deepStrictEqual(fs.readdirSync(databaseRoot).sort(), [...requiredFiles].sort());
  for (const fileName of requiredFiles) {
    assert.strictEqual(fs.statSync(path.join(databaseRoot, fileName)).size, 0);
  }

  console.log("Mounted Network Walkman filesystem tests: PASS");
}

main()
  .finally(() => {
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    const resolvedSystemTemp = path.resolve(os.tmpdir());
    if (!resolvedTemporaryRoot.startsWith(resolvedSystemTemp + path.sep)) {
      throw new Error(`Refusing to remove unexpected test path: ${resolvedTemporaryRoot}`);
    }
    fs.rmSync(resolvedTemporaryRoot, { recursive: true, force: true });
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
