import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = resolve(
  root,
  'node_modules',
  'node-mass-storage',
  'dist',
  'usb-mass-storage.js',
);

const original = `    // Bulk-Only Mass Storage Reset
    runBOMSR() {
        return __awaiter(this, void 0, void 0, function* () {
            const release = yield this.driverMutex.acquire();
            yield this.usbDevice.controlTransferIn({
                requestType: 'class',
                recipient: 'interface',
                index: 0,
                value: 0,
                request: 0xFF,
            }, 1);
            release();
        });
    }`;

const patchedV1 = `    // Bulk-Only Mass Storage Reset
    runBOMSR() {
        return __awaiter(this, void 0, void 0, function* () {
            const release = yield this.driverMutex.acquire();
            try {
                // USB Mass Storage Bulk-Only Transport 1.0 section 3.1:
                // this is a host-to-device request with wLength = 0.
                const result = yield this.usbDevice.controlTransferOut({
                    requestType: 'class',
                    recipient: 'interface',
                    index: 0,
                    value: 0,
                    request: 0xFF,
                });
                if (result.status !== "ok") {
                    throw new MassStorageError(\`Bulk-Only reset failed (\${result.status})\`);
                }
                // Reset Recovery requires clearing Bulk-In and then Bulk-Out.
                yield this.usbDevice.clearHalt("in", this.endpointIn);
                yield this.usbDevice.clearHalt("out", this.endpointOut);
            }
            finally {
                release();
            }
        });
    }`;

const patched = `    // Bulk-Only Mass Storage Reset
    runBOMSR() {
        return __awaiter(this, void 0, void 0, function* () {
            // MZ-NH1 is already in a usable mass-storage state after macOS
            // releases the mounted volume. Sending a BOT reset here leaves
            // its Bulk-Out endpoint unresponsive until a power cycle.
            const skipNH1Reset = process.platform === "darwin" &&
                this.usbDevice.vendorId === 0x054c &&
                this.usbDevice.productId === 0x017f;
            if (skipNH1Reset) {
                console.log("MZ-NH1: preserving the existing mass-storage session; BOT reset skipped.");
                return;
            }
            const release = yield this.driverMutex.acquire();
            try {
                // USB Mass Storage Bulk-Only Transport 1.0 section 3.1:
                // this is a host-to-device request with wLength = 0.
                try {
                    const result = yield this.usbDevice.controlTransferOut({
                        requestType: 'class',
                        recipient: 'interface',
                        index: 0,
                        value: 0,
                        request: 0xFF,
                    });
                    if (result.status !== "ok") {
                        throw new MassStorageError(\`Bulk-Only reset failed (\${result.status})\`);
                    }
                }
                catch (error) {
                    // Several Sony Hi-MD units perform the reset on macOS but
                    // do not complete its zero-length status stage. libusb then
                    // reports a timeout although the bulk endpoints are usable.
                    const timedOutOnMac = process.platform === "darwin" &&
                        String(error).includes("LIBUSB_TRANSFER_TIMED_OUT");
                    if (!timedOutOnMac)
                        throw error;
                }
                // Reset Recovery requires clearing Bulk-In and then Bulk-Out.
                yield this.usbDevice.clearHalt("in", this.endpointIn);
                yield this.usbDevice.clearHalt("out", this.endpointOut);
            }
            finally {
                release();
            }
        });
    }`;

const text = readFileSync(target, 'utf8');
if (text.includes(patched)) {
  console.log('node-mass-storage Bulk-Only reset fix is already applied.');
} else if (text.includes(patchedV1)) {
  writeFileSync(target, text.replace(patchedV1, patched), 'utf8');
  console.log('Updated node-mass-storage Bulk-Only reset fix for macOS Hi-MD timeouts.');
} else if (text.includes(original)) {
  writeFileSync(target, text.replace(original, patched), 'utf8');
  console.log('Applied node-mass-storage Bulk-Only reset fix.');
} else {
  throw new Error(
    'node-mass-storage layout changed; refusing to apply an unverified patch.',
  );
}
