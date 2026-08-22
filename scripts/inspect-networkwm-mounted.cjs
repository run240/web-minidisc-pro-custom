"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  DatabaseAbstraction,
} = require("networkwm-js/dist/database-abstraction");
const {
  DeviceIds,
  resolvePathFromGlobalIndex,
} = require("networkwm-js");
const { getDeviceList } = require("usb");
const {
  findMountedOMGAudioVolumes,
  MountedNetworkWMFilesystem,
} = require("../dist/wmd/mounted-networkwm-filesystem");

function listFiles(directory, rootDirectory = directory, unreadable = []) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    const relativePath = path.relative(rootDirectory, directory).replaceAll("\\", "/") || ".";
    const code = error && typeof error === "object" && "code" in error ? error.code : "UNKNOWN";
    unreadable.push({ relativePath, code });
    return files;
  }
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath, rootDirectory, unreadable));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function snapshotDirectory(directory) {
  const snapshot = new Map();
  const unreadable = [];
  const metadataOnly = process.env.WMDP_INSPECT_METADATA_ONLY === "1";
  const files = metadataOnly
    ? fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => path.join(directory, entry.name))
    : listFiles(directory, directory, unreadable);
  for (const absolutePath of files) {
    const relativePath = path.relative(directory, absolutePath).replaceAll("\\", "/");
    const data = fs.readFileSync(absolutePath);
    snapshot.set(relativePath, {
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    });
  }
  for (const item of unreadable) {
    snapshot.set(`!unreadable/${item.relativePath}`, { error: item.code });
    console.warn(`Unreadable directory recorded for integrity comparison: ${item.relativePath} (${item.code})`);
  }
  if (metadataOnly) {
    console.log(`Metadata-only integrity snapshot: ${snapshot.size} top-level files`);
  }
  return snapshot;
}

async function main() {
  const volumes = findMountedOMGAudioVolumes();
  assert.strictEqual(
    volumes.length,
    1,
    `Expected one mounted OMGAUDIO volume, found ${volumes.length}: ${volumes.join(", ")}`,
  );

  const volumeRoot = volumes[0];
  const databaseRoot = path.join(volumeRoot, "OMGAUDIO");
  const connectedDeviceIds = new Set(
    getDeviceList()
      .filter(item => item.deviceDescriptor.idVendor === 0x054c)
      .map(item => item.deviceDescriptor.idProduct),
  );
  const connectedProfiles = DeviceIds.filter(item => connectedDeviceIds.has(item.productId));
  assert.strictEqual(
    connectedProfiles.length,
    1,
    `Expected one connected supported Network Walkman, found ${connectedProfiles.length}: ${connectedProfiles.map(item => item.name).join(", ")}`,
  );
  const device = connectedProfiles[0];

  console.log(`Volume: ${volumeRoot}`);
  console.log(`Device profile: ${device.name}`);
  console.log("Hashing OMGAUDIO before parsing...");
  const before = snapshotDirectory(databaseRoot);

  const mountedFilesystem = new MountedNetworkWMFilesystem(volumeRoot);
  const database = await DatabaseAbstraction.create(mountedFilesystem, {
    ...device,
    disableDRM: true,
  });
  const library = database.getTracksSortedArtistAlbum();

  let databaseTracks = 0;
  let presentTracks = 0;
  let missingTracks = 0;
  let totalDurationMs = 0;
  const codecs = new Map();
  for (const artist of library) {
    for (const album of artist.contents) {
      for (const track of album.contents) {
        databaseTracks++;
        const payloadPath = resolvePathFromGlobalIndex(track.systemIndex);
        if (await mountedFilesystem.getSize(payloadPath) === null) {
          missingTracks++;
          continue;
        }
        presentTracks++;
        totalDurationMs += track.trackDuration || 0;
        const codec = `${track.codecName || "Unknown"} ${track.codecKBPS || "?"} kbps`;
        codecs.set(codec, (codecs.get(codec) || 0) + 1);
      }
    }
  }

  const { left, total, used } = await mountedFilesystem.statFilesystem();
  console.log(`Database entries: ${databaseTracks}`);
  console.log(`Tracks with payloads: ${presentTracks}`);
  console.log(`Stale entries without payloads: ${missingTracks}`);
  console.log(`Total duration: ${Math.round(totalDurationMs / 1000)} seconds`);
  console.log(`Capacity: ${total} bytes; used: ${used}; free: ${left}`);
  console.log("Codecs:");
  for (const [codec, count] of [...codecs].sort()) {
    console.log(`  ${codec}: ${count}`);
  }

  console.log("Hashing OMGAUDIO after parsing...");
  const after = snapshotDirectory(databaseRoot);
  assert.deepStrictEqual(after, before, "OMGAUDIO changed during read-only parsing");
  console.log(`Read-only integrity: PASS (${before.size} files unchanged)`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
