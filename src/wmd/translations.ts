import { HiMDFullService } from "./original/services/interfaces/himd";
import { Codec, NetMDUSBService, TitleParameter } from "./original/services/interfaces/netmd";

import { makeGetAsyncPacketIteratorOnWorkerThread } from 'netmd-js/dist/node-encrypt-worker';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { makeAsyncWorker, makeAsyncCryptoBlockProvider } from "himd-js/dist/node-crypto-worker";
import { DevicesIds, HiMD, NativeHiMDFilesystem, UMSCHiMDFilesystem } from "himd-js";
import { WebUSBDevice, findByIds, usb } from 'usb';
import { unmountAll } from "../unmount-drives";
import { MacOSNativeSCSIWebUSB } from "../macos/native-scsi-webusb";

export class EWMDNetMD extends NetMDUSBService {
    override getWorkerForUpload() {
        return [new Worker(
            path.join(__dirname, '..', '..', 'node_modules', 'netmd-js', 'dist', 'node-encrypt-worker.js')
        ), makeGetAsyncPacketIteratorOnWorkerThread] as any;
    }
}

class MountedHiMDFilesystem extends NativeHiMDFilesystem {
    override async _list(relativePath: string) {
        // macOS stores extended attributes on FAT as AppleDouble files. They
        // are not Hi-MD data and names such as ._ATDATA01.HMA confuse the
        // generation-file scan in himd-js.
        return (await super._list(relativePath)).filter(entry => !path.basename(entry.name).startsWith('._'));
    }

    override async rename(oldPath: string, newPath: string): Promise<void> {
        // NativeHiMDFilesystem 0.2.x forgets to resolve rename paths against
        // rootPath. Keep all operations confined to the mounted Hi-MD volume.
        fs.renameSync(path.join(this.rootPath, oldPath), path.join(this.rootPath, newPath));
    }

    override async getTotalSpace(): Promise<number> {
        const stat = fs.statfsSync(this.rootPath);
        return stat.blocks * stat.bsize;
    }

    override async statFilesystem() {
        const stat = fs.statfsSync(this.rootPath);
        return {
            total: stat.blocks * stat.bsize,
            used: (stat.blocks - stat.bfree) * stat.bsize,
            left: stat.bavail * stat.bsize,
        };
    }

    override getName(): string {
        return `외장 디스크 MP3 모드 (${path.basename(this.rootPath)})`;
    }

    syncAndRemoveAppleDouble(): void {
        const dataDirectory = path.join(this.rootPath, 'HMDHIFI');
        for (const name of fs.readdirSync(dataDirectory)) {
            const absolutePath = path.join(dataDirectory, name);
            if (name.startsWith('._')) {
                try { fs.unlinkSync(absolutePath); } catch (_) {}
                continue;
            }
            if (!/\.(HMA|HJS)$/i.test(name)) continue;
            let fd: number | undefined;
            try {
                fd = fs.openSync(absolutePath, 'r');
                fs.fsyncSync(fd);
            } catch (_) {
                // A following metadata reload will report any real I/O error.
            } finally {
                if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
            }
        }
    }
}

function findMountedHiMDVolume(): string | null {
    if (process.platform !== 'darwin') return null;
    let names: string[];
    try {
        names = fs.readdirSync('/Volumes');
    } catch (_) {
        return null;
    }
    for (const name of names) {
        const root = path.join('/Volumes', name);
        const dataDirectory = path.join(root, 'HMDHIFI');
        try {
            if (!fs.statSync(path.join(root, 'HI-MD.IND')).isFile() || !fs.statSync(dataDirectory).isDirectory()) continue;
            const files = fs.readdirSync(dataDirectory);
            if (!files.some(file => /^TRKIDX[0-9A-F]{2}\.HMA$/i.test(file))) continue;
            if (!files.some(file => /^ATDATA[0-9A-F]{2}\.HMA$/i.test(file))) continue;
            if (!files.some(file => /^MCLIST[0-9A-F]{2}\.HMA$/i.test(file))) continue;
            fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK);
            return root;
        } catch (_) {}
    }
    return null;
}

export class EWMDHiMD extends HiMDFullService {
    public fsDriver?: UMSCHiMDFilesystem;
    public deviceConnectedCallback?: (legacy: usb.Device, webusb: WebUSBDevice) => {}
    private mountedFilesystem?: MountedHiMDFilesystem;

    override getWorker(): any[] {
        return [new Worker(
            path.join(__dirname, '..', '..', 'node_modules', 'himd-js', 'dist', 'node-crypto-worker.js')
        ), makeAsyncWorker, makeAsyncCryptoBlockProvider];
    }

    async pair() {
        this.himd = undefined;
        this.cachedDisc = undefined;
        this.atdata = null;
        this.mountedFilesystem = undefined;
        this.fsDriver = undefined;

        const mountedVolume = findMountedHiMDVolume();
        if (mountedVolume) {
            this.mountedFilesystem = new MountedHiMDFilesystem(mountedVolume);
            console.log(`Hi-MD mounted-filesystem mode selected: ${mountedVolume}`);
            return true;
        }

        this.bypassFSCoherencyChecks = true; // process.env.EWMD_HIMD_BYPASS_COHERENCY_CHECK === 'true';
        if(this.bypassFSCoherencyChecks) {
            console.log("Warning: All FAT filesystem coherency checks are bypassed!\nThis might cause data corruption!")
        }
        let legacyDevice: any, vendorId, deviceId;
        for({ vendorId, deviceId } of DevicesIds){
            legacyDevice = findByIds(vendorId, deviceId);
            if(legacyDevice) break;
        }
        if(!legacyDevice) return false;

        if(['darwin', 'linux'].includes(process.platform)){
            await unmountAll(vendorId, deviceId);
        }

        const isUnrestrictedHiMD = vendorId === 0x5341 && deviceId === 0x5256;
        if (process.platform === 'darwin' && !isUnrestrictedHiMD) {
            // macOS' libusb detach operation captures and re-enumerates the
            // entire USB mass-storage device. Some Hi-MD models then expose a
            // claimed but non-responsive Bulk-Out pipe. Keep Apple's storage
            // transport in control and issue the same SCSI CDBs through
            // SCSITaskLib instead.
            const nativeDevice = await MacOSNativeSCSIWebUSB.create();
            this.fsDriver = new UMSCHiMDFilesystem(nativeDevice as any);
            return true;
        }

        // HiMDUSBClassOverride exposes 5341:5256 as a vendor-class device.
        // Apple's mass-storage driver never claims this interface, so the
        // normal WebUSB path is both safe and required on macOS.
        legacyDevice.open();
        const iface = legacyDevice.interface(0);
        try{
            if(iface.isKernelDriverActive()) {
                iface.detachKernelDriver();
            }
        }catch(ex){
            console.log("Couldn't detach the kernel driver. Expected on Windows.");
        }
        const webUsbDevice = await WebUSBDevice.createInstance(legacyDevice);
        await webUsbDevice.open();
        if(process.platform === 'linux') {
            // TODO: Check windows.
            // Resetting on MacOS reattaches the system driver.
            await webUsbDevice.reset();
        }
        this.deviceConnectedCallback?.(legacyDevice, webUsbDevice);
        this.fsDriver = new UMSCHiMDFilesystem(webUsbDevice);
        return true;
    }

    override async initHiMD(): Promise<void> {
        if (this.mountedFilesystem) {
            this.himd = await HiMD.init(this.mountedFilesystem);
            return;
        }
        await super.initHiMD();
    }

    override async listContent(dropCache?: boolean) {
        if (this.mountedFilesystem) {
            if (!this.himd || dropCache) {
                await this.initHiMD();
                this.cachedDisc = undefined;
            }
            const disc = await super.listContent(false);
            disc.writable = true;
            disc.writeProtected = false;
            return disc;
        }
        // HiMDFullService reinitializes FAT without forwarding the configured
        // coherency policy when the renderer requests a post-format refresh.
        // Keep the same policy used by initHiMD so a mode round-trip does not
        // fail only on the second read.
        if (dropCache) {
            await this.fsDriver!.init(this.bypassFSCoherencyChecks);
        }
        return super.listContent(false);
    }

    override async getDeviceName(): Promise<string> {
        if (this.mountedFilesystem) {
            if (!this.himd) await this.initHiMD();
            return `HiMD (${this.himd!.getDeviceName()})`;
        }
        return super.getDeviceName();
    }

    override async prepareUpload(): Promise<void> {
        if (!this.mountedFilesystem) return super.prepareUpload();
        if (!this.himd) await this.initHiMD();
        if (this.atdata !== null) throw new Error('이미 Hi-MD 전송 준비가 완료되어 있습니다.');
        this.atdata = await this.himd!.openAtdataForWriting();
    }

    override async upload(
        title: TitleParameter,
        fullWidthTitle: string,
        data: ArrayBuffer,
        format: Codec,
        progressCallback: (progress: { written: number; encrypted: number; total: number }) => void
    ): Promise<void> {
        if (this.mountedFilesystem && format.codec !== 'MP3') {
            throw new Error('macOS 외장 디스크 모드에서는 현재 MP3 전송만 지원합니다. 전송 형식을 MP3로 선택해 주세요.');
        }
        return super.upload(title, fullWidthTitle, data, format, progressCallback);
    }

    override async finalizeUpload(): Promise<void> {
        if (!this.mountedFilesystem) {
            // A timed-out ICV payload may already have been accepted by the
            // recorder. Replaying finalization or resetting BOT at that point
            // can duplicate an uncertain write and leave Hn1.100 busy. Keep
            // the upstream single-attempt finalization semantics.
            return super.finalizeUpload();
        }
        if (!this.atdata) throw new Error('Hi-MD 전송이 준비되지 않았습니다.');
        await this.atdata.close();
        this.atdata = null;
        await this.himd!.flush();
        this.mountedFilesystem.syncAndRemoveAppleDouble();
        this.dropCachedContentList();
        // Re-read the just-written database before reporting success.
        this.himd = await HiMD.init(this.mountedFilesystem);
    }

    override async flush(): Promise<void> {
        await super.flush();
        this.mountedFilesystem?.syncAndRemoveAppleDouble();
    }

    override async deleteTracks(indexes: number[]): Promise<void> {
        if (this.mountedFilesystem) {
            throw new Error('macOS 외장 디스크 모드의 트랙 삭제는 아직 지원하지 않습니다.');
        }
        return super.deleteTracks(indexes);
    }

    override async wipeDisc(): Promise<void> {
        if (this.mountedFilesystem) {
            throw new Error('macOS 외장 디스크 모드의 디스크 초기화는 아직 지원하지 않습니다.');
        }
        return super.wipeDisc();
    }

    override async finalize(): Promise<void> {
        if (!this.mountedFilesystem) return super.finalize();
        try {
            if (this.atdata) await this.atdata.close();
            if (this.himd?.isDirty()) await this.himd.flush();
            this.mountedFilesystem.syncAndRemoveAppleDouble();
        } finally {
            this.atdata = null;
            this.himd = undefined;
            this.mountedFilesystem = undefined;
            this.dropCachedContentList();
        }
    }

    override isDeviceConnected(device: USBDevice): boolean {
        if (this.mountedFilesystem) return false;
        return super.isDeviceConnected(device);
    }

    /**
     * Finish the second half of a standard-MD -> Hi-MD conversion.
     *
     * The NetMD command erases the UTOC and asks the recorder to switch USB
     * modes. Some recorders initialise the Hi-MD filesystem in firmware while
     * others can re-enumerate before that work has completed. On macOS the new
     * mass-storage interface is a separate USB session, so finish and verify
     * the format after the user reconnects in Hi-MD mode.
     */
    async completePendingHiMDFormat() {
        if (this.mountedFilesystem) {
            throw new Error('외장 디스크 MP3 모드에서는 미디어 형식 변환을 지원하지 않습니다.');
        }
        if (!this.fsDriver) {
            const paired = await this.pair();
            if (!paired || !this.fsDriver) {
                throw new Error('Hi-MD USB 인터페이스를 열지 못했습니다.');
            }
        }

        this.himd = undefined;
        this.cachedDisc = undefined;
        this.atdata = null;
        console.log('Hi-MD format completion: waiting for the re-enumerated device to settle');
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('Hi-MD format completion: creating and flushing the filesystem');
        await this.fsDriver.wipeDisc(true);
        console.log('Hi-MD format completion: filesystem created; loading Hi-MD metadata');
        await this.initHiMD();

        const total = await this.fsDriver.getTotalSpace();
        const deviceName = this.himd!.getDeviceName();
        console.log(`Hi-MD format completion: verified ${deviceName}, ${total} bytes`);
        return { total, deviceName };
    }

    async formatStandardMDToNetMD() {
        if (this.mountedFilesystem) {
            throw new Error('외장 디스크 MP3 모드에서는 미디어 형식 변환을 지원하지 않습니다.');
        }
        if (this.atdata !== null) {
            throw new Error('Hi-MD 전송 작업이 진행 중입니다. 작업을 마친 뒤 다시 시도해 주세요.');
        }
        if (!this.fsDriver) {
            const paired = await this.pair();
            if (!paired || !this.fsDriver) throw new Error('Hi-MD USB 인터페이스를 열지 못했습니다.');
        }
        if (!this.himd) await this.initHiMD();
        const capacity = await this.fsDriver!.getTotalSpace();
        if (capacity > 500000000) {
            throw new Error('1GB Hi-MD 전용 미디어는 일반 MD 형식으로 변환할 수 없습니다.');
        }
        const driver = this.fsDriver!.driver;
        await driver.wipe();
        const switchCommand = new Uint8Array([
            0xc2, 0x00, 0x00, 0x10, 0x00, 0x02,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        let switchInterrupted = false;
        try {
            await (driver as any).sendCommandInGetResult(switchCommand, 0, true, switchCommand.length);
        } catch (error) {
            // The old USB handle normally disappears before the recorder can
            // return the command status when the mode change succeeds.
            switchInterrupted = true;
            console.log('Hi-MD to NetMD switch disconnected the old interface:', error);
        }
        return { capacity, switchInterrupted };
    }
}
