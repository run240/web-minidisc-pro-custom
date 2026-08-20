# Intel macOS Hi-MD native transport work log

Last updated: 2026-08-17

This document records the investigation that replaced the original libusb-only
Hi-MD path on Intel macOS.  It is intended to let another developer resume the
work without repeating the device and kernel-driver experiments.

## Scope

- Target: Intel macOS (`x86_64`, deployment target macOS 10.15 or later)
- Application: Web MiniDisc Pro desktop build
- Goal: support the Hi-MD device family, not one recorder model
- NetMD remains on the normal WebUSB/libusb path
- Hi-MD on Darwin uses the native helper described below

## Reported failures

The libusb implementation showed several superficially similar failures:

- `claimInterface error: LIBUSB_ERROR_ACCESS`
- `claimInterface error: LIBUSB_ERROR_OTHER`
- `transferOut error: LIBUSB_TRANSFER_TIMED_OUT`
- `transferIn error: LIBUSB_TRANSFER_TIMED_OUT`
- Hi-MD initialization or recording progress stopping indefinitely

The errors did not all have the same cause.  macOS mounted Hi-MD media through
`IOUSBMassStorageInterfaceNub`, which retained exclusive ownership of USB
interface 0 even after a normal filesystem unmount.  libusb could sometimes
open a device, but behavior differed between recorder generations and between
freshly formatted and repeatedly converted media.

## Important unmount bug

`res/unix-unmount.sh` parsed a `system_profiler` line such as:

```text
BSD Name: disk2
```

with a leading space in the resulting BSD name.  Consequently, its mount test
did not match `/dev/disk2`, and the script could return without unmounting the
actual Hi-MD volume.  The parser now trims the value with `xargs`.

The script flushes and unmounts the filesystem only.  It deliberately does not
use `diskutil eject`: ejecting removes the BSD media but does not reliably
release the kernel USB mass-storage interface owner.

## Approaches tested and rejected

### libusb auto-detach/device capture

This was sufficient on some units, including successful MZ-RH1 and MZ-NH900
tests, but was not stable across the family.  On MZ-NH1, claiming could succeed
while the first Bulk-Only Transport CBW timed out.

### SCSITask user-space commands

`SCSITaskDeviceInterface` was tested against the published SCSI services.
Generic macOS storage services returned `kIOReturnUnsupported`, so this could
not replace raw Hi-MD USB traffic.

### IOUSBHost interface seize only

Opening the existing `IOUSBHostInterface` with seize semantics failed while
the kernel mass-storage nub remained the exclusive owner.  The observed errors
included `kIOReturnInternalError` and `kIOReturnExclusiveAccess`.

### Legacy IOUSBLib `USBInterfaceOpenSeize`

The correct interface and bulk pipes were discovered, but
`USBInterfaceOpenSeize` returned `0xe00002c5` (`kIOReturnExclusiveAccess`).
Unmounting or ejecting the BSD disk did not terminate the kernel owner.

The prototype sources remain useful as investigation history but are not used
by the production build:

- `native/macos/wmd-scsi-helper.c`
- `native/macos/wmd-iousb-helper.c`

## Final transport design

The production helper is `native/macos/wmd-usbhost-helper.m`.

Connection sequence:

1. Flush and unmount the Hi-MD filesystem.
2. Start the privileged helper through the existing macOS authorization flow.
3. Locate a supported Sony `IOUSBHostDevice`.
4. Open it with `IOUSBHostObjectInitOptionsDeviceCapture`.
5. Allow IOKit to finish closing the previous mass-storage clients.
6. Find a fresh interface 0 with class `0x08` and protocol `0x50`.
7. Open new bulk pipes and execute USB Mass Storage Bulk-Only Transport.
8. When the session closes, destroy the captured device object so macOS can
   reset it and register normal storage drivers again.

The Electron side is implemented by `src/macos/native-scsi-webusb.ts`.  It
adapts the helper's line protocol to the small WebUSB surface expected by the
existing Hi-MD mass-storage layer.  Helper stderr is preserved so failures now
show the actual stage and IOKit code instead of only `helper exited (1)`.

Interface teardown after whole-device capture is asynchronous.  A fixed 250 ms
delay worked on the original test Mac, but repeated tests on two Intel systems
found the same MZ-NH1 interface registry ID with `busyState=0` for eight seconds
while every open returned `0xe00002c9` (`kIOReturnInternalError`).  This ruled
out a simple timing race: the visible child was the terminated, permanently
unusable interface object.  The helper now reapplies the captured device's
current USB configuration with interface matching enabled, ignores the stale
registry ID, and waits for the newly published child interface.  Each attempt
records elapsed time, registry entry ID, busy state, and the IOKit error for
compact remote diagnostics.

The helper runs with administrator authorization because whole-device capture
requires root privileges when the app has no Apple VM device-access
entitlement.  No Terminal window is required.

On an Intel MacBookPro16,1 running macOS 26.5.2 (build 25F84), the MZ-NH1 did
not publish a replacement `IOUSBHostInterface` while whole-device capture was
active, even after 30 seconds.  `IOUSBHostObjectDestroyOptionsDeviceSurrender`
also left only the terminated registry object visible, and attempting to reopen
that terminated object caused IOUSBHost.framework to abort the helper.  This is
a macOS 26/Tahoe result and must not be treated as a Sonoma 14 regression until
the same build is tested on an actual Sonoma system.

## Device matching

The helper matches the Sony Hi-MD product-ID family already recognized by this
build and then verifies:

- vendor ID `0x054c`
- interface number `0`
- interface class `0x08`
- interface protocol `0x50`

It intentionally does not require a single interface subclass, because Hi-MD
models expose different subclasses.  This avoids making the build specific to
MZ-NH1, MZ-NH900, or MZ-RH1.

## Validation performed

### MZ-RH10 / MZ-M100 (`054c:0219` → `5341:5256`)

Validated on an Intel MacBookPro16,1 running macOS 26.5.2 using the
firmware-gated `HiMDUSBClassOverride` path:

- NetMD connection at `054c:0219`
- automatic firmware compatibility check and volatile RAM patch
- standard MD conversion to Hi-MD and re-enumeration at `5341:5256`
- Hi-MD filesystem connection and a 34.2 MB PCM upload
- conversion back to NetMD at `054c:0219`
- replacement with an existing Hi-MD medium and successful `5341:5256` connection

The normal RH10 Hi-MD identity `054c:021a` remained owned by Apple's storage
stack and returned `0xe00002c9` when the native helper attempted to open its
interface. The unrestricted vendor-class identity avoids that owner conflict.
The RAM patch is now selected by the exploit library's firmware compatibility
result instead of an NH1-only USB product-ID check.

### MZ-NH1 (`054c:017f`)

Validated on Intel macOS with the native capture helper:

- Hi-MD connection and device-name query
- disc content listing
- short WAV recording/upload
- safe application disconnect and USB removal
- direct playback on the recorder

The successful helper log contains:

```text
Native macOS SCSI transport ready {"vendorId":"54c","productId":"17f"}
MZ-NH1: preserving the existing mass-storage session; BOT reset skipped.
```

### MZ-RH1 and MZ-NH900

Earlier Intel macOS builds completed Hi-MD connection and recording tests on
these units.  The native capture replacement still needs a clean regression
pass on both models before a final non-experimental release.

### MZ-NH600D

A remote test of the earlier libusb/seize builds repeatedly failed with
`LIBUSB_ERROR_OTHER`.  The native capture build was created specifically to
remove that kernel-owner failure mode, but a final physical MZ-NH600D test is
still pending.  Do not mark this model verified until connection, upload,
disconnect, and playback all succeed on the same build.

## Media-state observations

Repeatedly converting the same standard MD between NetMD and Hi-MD formats can
leave the recorder or FAT backup state temporarily inconsistent.  Symptoms
included `Fat backup invalid`, `CANNOT RECORD OR PLAY`, timeouts during disc
initialization, and a device that worked again after a recorder-side format.

These media-state failures must not be confused with USB claim failures.  For
reproducible testing, use a freshly recorder-formatted disc, begin with a short
WAV file, wait for completion, disconnect through the app, and verify playback
before testing another mode conversion.

## Build and verification

The custom build script compiles the native helper as Intel x64 and targets
macOS 10.15:

```sh
node scripts/build-custom.mjs
node node_modules/electron-builder/out/cli/cli.js \
  --mac dmg --x64 --publish never
```

With no Developer ID certificate, the app is ad-hoc signed before DMG creation.
Users may still need to Control-click the app and select **Open** the first time;
the release is not Apple-notarized.

Useful verification commands:

```sh
file "Web MiniDisc Pro.app/Contents/MacOS/Web MiniDisc Pro"
file "Web MiniDisc Pro.app/Contents/Resources/app/extras/wmd-scsi-helper"
codesign --verify --deep --strict "Web MiniDisc Pro.app"
```

Both Mach-O files must report `x86_64`.

## Current test artifact

Local artifact name:

```text
Web-MiniDisc-Pro-HiMD-macOS-Intel-x64-Native-Capture-v9.dmg
```

SHA-256:

```text
698f0ae58f653d0bc2eba405099d98fdd2b5791f36c906134ae9c76826c9ff3b
```

Before publishing a later build, regenerate and replace the checksum rather
than assuming it remains valid.

## Next work

1. Run the v9 native capture build on MZ-NH600D.
2. Regress MZ-RH1 and MZ-NH900 connection, upload, disconnect, and playback.
3. Confirm NetMD still reconnects after closing a captured Hi-MD session.
4. Improve the UI text for native capture failures using the helper's stage and
   IOKit code.
5. Add an automated helper protocol test and keep hardware validation as a
   documented release gate.
