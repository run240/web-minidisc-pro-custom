import { HiMDFullService } from "./original/services/interfaces/himd";
import { NetMDUSBService } from "./original/services/interfaces/netmd";

import { makeGetAsyncPacketIteratorOnWorkerThread } from 'netmd-js/dist/node-encrypt-worker';
import path from 'path';
import { Worker } from 'worker_threads';
import { makeAsyncWorker, makeAsyncCryptoBlockProvider } from "himd-js/dist/node-crypto-worker";
import { DevicesIds, UMSCHiMDFilesystem } from "himd-js";
import { WebUSBDevice, findByIds, usb } from 'usb';
import { unmountAll } from "../unmount-drives";

export class EWMDNetMD extends NetMDUSBService {
    override getWorkerForUpload() {
        return [new Worker(
            path.join(__dirname, '..', '..', 'node_modules', 'netmd-js', 'dist', 'node-encrypt-worker.js')
        ), makeGetAsyncPacketIteratorOnWorkerThread] as any;
    }
}

export class EWMDHiMD extends HiMDFullService {
    public fsDriver?: UMSCHiMDFilesystem;
    public deviceConnectedCallback?: (legacy: usb.Device, webusb: WebUSBDevice) => {}

    override getWorker(): any[] {
        return [new Worker(
            path.join(__dirname, '..', '..', 'node_modules', 'himd-js', 'dist', 'node-crypto-worker.js')
        ), makeAsyncWorker, makeAsyncCryptoBlockProvider];
    }

    async pair() {
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

        legacyDevice.open();
        const iface = legacyDevice.interface(0);
        try{
            if(process.platform === 'darwin' &&
                typeof legacyDevice.setAutoDetachKernelDriver === 'function') {
                // Let libusb detach the macOS mass-storage driver when the
                // interface is claimed and reattach it when the device closes.
                // A manual detach survives the first session and can leave a
                // subsequent Hi-MD connection without a usable kernel owner.
                legacyDevice.setAutoDetachKernelDriver(true);
            } else if(iface.isKernelDriverActive()) {
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

    override async listContent(dropCache?: boolean) {
        // HiMDFullService reinitializes FAT without forwarding the configured
        // coherency policy when the renderer requests a post-format refresh.
        // Keep the same policy used by initHiMD so a mode round-trip does not
        // fail only on the second read.
        if (dropCache) {
            await this.fsDriver!.init(this.bypassFSCoherencyChecks);
        }
        return super.listContent(false);
    }

    async formatStandardMDToNetMD() {
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
