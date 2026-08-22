# SonicStage-era Network Walkman support plan

## Goal

Add a keyring-free path for Sony Network Walkman players that expose an
`OMGAUDIO` library over USB mass storage. The NW-A3000 is the first reference
device. The implementation must not require SonicStage, CONNECT Player, or a
WinUSB driver replacement for normal MP3 library management.

OpenMG-encrypted ATRAC compatibility is a separate optional feature. It must
not block DRM-free MP3 support.

## Confirmed NW-A3000 baseline

The reference device connected during development reports:

- USB ID `054c:0269`
- `SONY HDD WALKMAN USB Device`
- approximately 20 GB removable FAT32 storage
- a mounted `OMGAUDIO` generation-4 database
- Sony database files including `00GTRLST.DAT`, `01TREE*.DAT`,
  `02TREINF.DAT`, `03GINF*.DAT`, `04CNTINF.DAT`, `05CIDLST.DAT`, and
  `MACLIST0.DAT`

The existing ElectronWMD Network Walkman path always requests
`EKBROOTS.DES` before it identifies the device. That requirement belongs to
its OpenMG/ATRAC authorization path; it is not a valid prerequisite for all
NW-A3000 transfers.

JSymphonic treats generation 4 as unprotected (`gotKey = false`) and writes
compatible MP3 audio in an unencrypted OMA wrapper. `networkwm-js` already
contains the NW-A3000 USB ID and most of the required OMGAUDIO parser and
serializer.

## Architecture

Keep four concerns separate:

1. **Device discovery**
   - Match a known Sony USB VID/PID.
   - Locate the corresponding mounted mass-storage volume.
   - Confirm the expected database signature before offering a connection.
2. **Storage transport**
   - Prefer the operating system's mounted filesystem on Windows.
   - Do not replace the working USB mass-storage driver with WinUSB.
   - Keep the existing raw USB transport for devices and operations that
     genuinely require Sony vendor commands.
3. **Database profile**
   - Select an explicit OMGAUDIO generation/profile per model.
   - Parse only the tables used by that profile and preserve unknown tables.
   - Ignore stale database entries whose referenced audio file is absent.
4. **Media policy**
   - Start with DRM-free MP3 wrapped as OMA.
   - Preserve metadata and supported native formats by generation.
   - Treat OpenMG-encrypted OMA/ATRAC as read-only until a legal,
     user-supplied key path is separately enabled.

## Device families

| Family | Example models | First implementation policy |
| --- | --- | --- |
| OMGAUDIO generation 3 | NW-HD3, NW-HD5, NW-E10x/E2xx/E3xx/E4xx/E5xx | Read-only research; legacy device-key behavior remains separate |
| OMGAUDIO generation 4 | NW-A1000, NW-A1200, NW-A3000, NW-A60x | Primary target; DRM-free MP3, intelligent-feature tables |
| OMGAUDIO generation 5 | NW-E00x | Add after generation-4 fixtures and transaction tests |
| OMGAUDIO generation 6 | NW-S20x | Add with sport-table preservation |
| OMGAUDIO generation 7 | NW-E01x, NW-S60x/S70x, NW-A80x/A91x | Add with cover-table preservation |
| ESYS generations 0-2 | Early Network Walkman and NW-HD1/HD2 families | Separate database adapter; reuse `mp3-manager` research |

Model support is declared only after a real device or a complete filesystem
fixture passes the same validation suite as the NW-A3000.

## Safe transaction rules

- Connection starts read-only.
- Never modify a device while SonicStage or another manager is using it.
- Before the first write, keep a small metadata snapshot even when the audio
  itself does not need to be backed up.
- Stage every rewritten database table locally and parse it again before it is
  copied to the device.
- Write the audio payload first, then database tables, and publish the global
  track list last.
- On failure, remove the new payload and restore the previous table set.
- Flush and close all files before asking the user to disconnect the device.
- A wipe means "create a validated empty database for this profile", not
  "blindly delete OMGAUDIO".

## Delivery phases

### Phase 0: read-only NW-A3000

- Detect `054c:0269` and its mounted FAT32 volume.
- Parse the generation-4 database without `EKBROOTS.DES`.
- Filter orphaned metadata entries by checking their resolved OMA paths.
- Display model, capacity, real track count, codec, and metadata.
- Make every mutating command unavailable in read-only mode.

### Phase 1: empty library and one MP3

- Generate an empty generation-4 database from validated fixtures.
- Remove the unwanted existing library only after the empty database passes a
  round-trip parse.
- Wrap one known-good MP3 in a DRM-free OMA container.
- Commit one track and verify it after safe eject and device library rebuild.

### Phase 2: normal library management

- Multiple uploads with progress and cancellation.
- Rename, delete, reorder, album/artist grouping, and download.
- Batch updates use one transaction and one final database commit.
- Detect interrupted transactions on the next connection.

### Phase 3: broaden generation 4

- Add NW-A1000/A1200/A60x model profiles.
- Compare device-specific tables and supported codecs.
- Add fixture tests for every confirmed model.

### Phase 4: other SonicStage-era players

- Add generation 5, 6, and 7 profile adapters.
- Add ESYS support separately.
- Keep generation-3 encryption requirements isolated from the keyring-free
  path.

## Phase-0 acceptance criteria

- The current NW-A3000 is found without changing its Windows driver.
- No SonicStage keyring prompt appears for read-only or DRM-free mode.
- The parser reports only tracks whose OMA payload exists.
- Connecting and disconnecting does not change any hash in `OMGAUDIO`.
- Existing NetMD and Hi-MD modes continue to pass their current tests.

## NW-A3000 live read-only validation (2026-08-21)

The connected `054c:0269` reference device was parsed directly from its
mounted `F:\\OMGAUDIO` volume without loading `EKBROOTS.DES`:

- database entries reported by the generation-4 tables: 116
- entries with an existing OMA payload: 3
- stale entries whose payload is absent: 113
- detected codecs: ATRAC3plus 352 kbps (2), ATRAC3plus 64 kbps (1)
- filesystem capacity: 19,542,441,984 bytes
- all 47 files below `OMGAUDIO` had identical SHA-256 hashes before and after
  parsing

Run `npm run inspect:networkwm-mounted` while exactly one compatible volume is
mounted to repeat the same non-mutating validation.
