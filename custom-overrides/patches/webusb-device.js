"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebUSBDevice = void 0;
const usb = require("../usb");
const util_1 = require("util");
const os_1 = require("os");
const LIBUSB_TRANSFER_TYPE_MASK = 0x03;
const ENDPOINT_NUMBER_MASK = 0x7f;
const CLEAR_FEATURE = 0x01;
const ENDPOINT_HALT = 0x00;
/**
 * Wrapper to make a node-usb device look like a webusb device
 */
class WebUSBDevice {
    static async createInstance(device, autoDetachKernelDriver = true) {
        const instance = new WebUSBDevice(device, autoDetachKernelDriver);
        await instance.initialize();
        return instance;
    }
    constructor(device, autoDetachKernelDriver) {
        this.device = device;
        this.autoDetachKernelDriver = autoDetachKernelDriver;
        // node-usb defaults control transfers to only one second. Some older
        // NetMD units need longer while waking up or reading a newly inserted
        // disc, even though the USB connection itself is healthy.
        this.device.timeout = Math.max(this.device.timeout, 3000);
        this.manufacturerName = null;
        this.productName = null;
        this.serialNumber = null;
        this.configurations = [];
        const usbVersion = this.decodeVersion(device.deviceDescriptor.bcdUSB);
        this.usbVersionMajor = usbVersion.major;
        this.usbVersionMinor = usbVersion.minor;
        this.usbVersionSubminor = usbVersion.sub;
        this.deviceClass = device.deviceDescriptor.bDeviceClass;
        this.deviceSubclass = device.deviceDescriptor.bDeviceSubClass;
        this.deviceProtocol = device.deviceDescriptor.bDeviceProtocol;
        this.vendorId = device.deviceDescriptor.idVendor;
        this.productId = device.deviceDescriptor.idProduct;
        const deviceVersion = this.decodeVersion(device.deviceDescriptor.bcdDevice);
        this.deviceVersionMajor = deviceVersion.major;
        this.deviceVersionMinor = deviceVersion.minor;
        this.deviceVersionSubminor = deviceVersion.sub;
        this.controlTransferAsync = (0, util_1.promisify)(this.device.controlTransfer).bind(this.device);
        this.setConfigurationAsync = (0, util_1.promisify)(this.device.setConfiguration).bind(this.device);
        this.resetAsync = (0, util_1.promisify)(this.device.reset).bind(this.device);
        this.getStringDescriptorAsync = (0, util_1.promisify)(this.device.getStringDescriptor).bind(this.device);
    }
    get configuration() {
        if (!this.device.configDescriptor) {
            return null;
        }
        const currentConfiguration = this.device.configDescriptor.bConfigurationValue;
        return this.configurations.find(configuration => configuration.configurationValue === currentConfiguration) || null;
    }
    get opened() {
        return (!!this.device.interfaces);
    }
    async open() {
        try {
            if (this.opened) {
                return;
            }
            this.device.open();
            if ((0, os_1.platform)() !== 'win32' &&
                typeof this.device.setAutoDetachKernelDriver === 'function') {
                this.device.setAutoDetachKernelDriver(this.autoDetachKernelDriver);
            }
        }
        catch (error) {
            throw new Error(`open error: ${error}`);
        }
    }
    async close() {
        try {
            if (!this.opened) {
                return;
            }
            try {
                if (this.configuration) {
                    for (const iface of this.configuration.interfaces) {
                        await this._releaseInterface(iface.interfaceNumber);
                        // Re-create the USBInterface to set the claimed attribute
                        this.configuration.interfaces[this.configuration.interfaces.indexOf(iface)] = {
                            interfaceNumber: iface.interfaceNumber,
                            alternate: iface.alternate,
                            alternates: iface.alternates,
                            claimed: false
                        };
                    }
                }
            }
            catch (_error) {
                // Ignore
            }
            this.device.close();
        }
        catch (error) {
            throw new Error(`close error: ${error}`);
        }
    }
    async selectConfiguration(configurationValue) {
        if (!this.opened || !this.device.configDescriptor) {
            throw new Error('selectConfiguration error: invalid state');
        }
        if (this.device.configDescriptor.bConfigurationValue === configurationValue) {
            return;
        }
        const config = this.configurations.find(configuration => configuration.configurationValue === configurationValue);
        if (!config) {
            throw new Error('selectConfiguration error: configuration not found');
        }
        try {
            await this.setConfigurationAsync(configurationValue);
        }
        catch (error) {
            throw new Error(`selectConfiguration error: ${error}`);
        }
    }
    async claimInterface(interfaceNumber) {
        if (!this.opened) {
            throw new Error('claimInterface error: invalid state');
        }
        if (!this.configuration) {
            throw new Error('claimInterface error: interface not found');
        }
        const iface = this.configuration.interfaces.find(usbInterface => usbInterface.interfaceNumber === interfaceNumber);
        if (!iface) {
            throw new Error('claimInterface error: interface not found');
        }
        if (iface.claimed) {
            return;
        }
        try {
            this.device.interface(interfaceNumber).claim();
            // Re-create the USBInterface to set the claimed attribute
            this.configuration.interfaces[this.configuration.interfaces.indexOf(iface)] = {
                interfaceNumber,
                alternate: iface.alternate,
                alternates: iface.alternates,
                claimed: true
            };
        }
        catch (error) {
            const retryNH600OnMac = (0, os_1.platform)() === 'darwin' &&
                this.vendorId === 0x054c && this.productId === 0x0187 &&
                String(error).includes('LIBUSB_ERROR_OTHER');
            if (retryNH600OnMac) {
                const nativeInterface = this.device.interface(interfaceNumber);
                let lastError = error;
                console.log('MZ-NH600: initial automatic interface capture failed; starting bounded recovery.', {
                    interfaceNumber,
                    configuration: this.device.configDescriptor?.bConfigurationValue ?? null,
                    initialError: String(error),
                });
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        if (typeof this.device.setAutoDetachKernelDriver === 'function') {
                            this.device.setAutoDetachKernelDriver(true);
                        }
                        const kernelDriverActive = nativeInterface.isKernelDriverActive();
                        console.log(`MZ-NH600: recovery attempt ${attempt} state.`, {
                            kernelDriverActive,
                            opened: this.opened,
                        });
                        if (kernelDriverActive) {
                            console.log(`MZ-NH600: recovery attempt ${attempt} explicitly capturing the device.`);
                            nativeInterface.detachKernelDriver();
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000 + attempt * 750));
                        nativeInterface.claim();
                        this.configuration.interfaces[this.configuration.interfaces.indexOf(iface)] = {
                            interfaceNumber,
                            alternate: iface.alternate,
                            alternates: iface.alternates,
                            claimed: true
                        };
                        console.log(`MZ-NH600: interface claim recovery succeeded on attempt ${attempt}.`);
                        return;
                    }
                    catch (retryError) {
                        lastError = retryError;
                        console.log(`MZ-NH600: interface claim recovery attempt ${attempt} failed: ${retryError}`);
                    }
                }
                throw new Error(`claimInterface NH600 recovery failed after 3 attempts: ${lastError}`);
            }
            throw new Error(`claimInterface error: ${error}`);
        }
    }
    async releaseInterface(interfaceNumber) {
        await this._releaseInterface(interfaceNumber);
        if (this.configuration) {
            const iface = this.configuration.interfaces.find(usbInterface => usbInterface.interfaceNumber === interfaceNumber);
            if (iface) {
                // Re-create the USBInterface to set the claimed attribute
                this.configuration.interfaces[this.configuration.interfaces.indexOf(iface)] = {
                    interfaceNumber,
                    alternate: iface.alternate,
                    alternates: iface.alternates,
                    claimed: false
                };
            }
        }
    }
    async selectAlternateInterface(interfaceNumber, alternateSetting) {
        if (!this.opened) {
            throw new Error('selectAlternateInterface error: invalid state');
        }
        if (!this.configuration) {
            throw new Error('selectAlternateInterface error: interface not found');
        }
        const iface = this.configuration.interfaces.find(usbInterface => usbInterface.interfaceNumber === interfaceNumber);
        if (!iface) {
            throw new Error('selectAlternateInterface error: interface not found');
        }
        if (!iface.claimed) {
            throw new Error('selectAlternateInterface error: invalid state');
        }
        try {
            const iface = this.device.interface(interfaceNumber);
            await iface.setAltSettingAsync(alternateSetting);
        }
        catch (error) {
            throw new Error(`selectAlternateInterface error: ${error}`);
        }
    }
    async controlTransferIn(setup, length) {
        this.checkDeviceOpen();
        const type = this.controlTransferParamsToType(setup, usb.LIBUSB_ENDPOINT_IN);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result = await this.controlTransferAsync(type, setup.request, setup.value, setup.index, length);
                return {
                    data: result ? new DataView(new Uint8Array(result).buffer) : undefined,
                    status: 'ok'
                };
            }
            catch (error) {
                if (error.errno === usb.LIBUSB_TRANSFER_TIMED_OUT && attempt === 0) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                    continue;
                }
                if (error.errno === usb.LIBUSB_TRANSFER_STALL) {
                    return {
                        status: 'stall'
                    };
                }
                if (error.errno === usb.LIBUSB_TRANSFER_OVERFLOW) {
                    return {
                        status: 'babble'
                    };
                }
                throw new Error(`controlTransferIn error: ${error}`);
            }
        }
    }
    async controlTransferOut(setup, data) {
        try {
            this.checkDeviceOpen();
            const type = this.controlTransferParamsToType(setup, usb.LIBUSB_ENDPOINT_OUT);
            const buffer = data ? Buffer.from(data) : Buffer.alloc(0);
            const bytesWritten = await this.controlTransferAsync(type, setup.request, setup.value, setup.index, buffer);
            return {
                bytesWritten,
                status: 'ok'
            };
        }
        catch (error) {
            if (error.errno === usb.LIBUSB_TRANSFER_STALL) {
                return {
                    bytesWritten: 0,
                    status: 'stall'
                };
            }
            throw new Error(`controlTransferOut error: ${error}`);
        }
    }
    async clearHalt(direction, endpointNumber) {
        try {
            const wIndex = endpointNumber | (direction === 'in' ? usb.LIBUSB_ENDPOINT_IN : usb.LIBUSB_ENDPOINT_OUT);
            await this.controlTransferAsync(usb.LIBUSB_RECIPIENT_ENDPOINT, CLEAR_FEATURE, ENDPOINT_HALT, wIndex, Buffer.from(new Uint8Array()));
        }
        catch (error) {
            throw new Error(`clearHalt error: ${error}`);
        }
    }
    async transferIn(endpointNumber, length) {
        try {
            this.checkDeviceOpen();
            const endpoint = this.getEndpoint(endpointNumber | usb.LIBUSB_ENDPOINT_IN);
            // Some early Hi-MD units need substantially longer than ten
            // seconds for media authentication or for committing ICV data
            // after an upload. RH10 on Windows can exhibit the same delayed
            // final status response, so keep waiting without replaying the
            // potentially accepted command.
            const isUnrestrictedHiMD = this.vendorId === 0x5341 && this.productId === 0x5256;
            const isWindowsRH10 = (0, os_1.platform)() === 'win32' &&
                this.vendorId === 0x054c && this.productId === 0x021a;
            const needsSlowHiMDTimeout = isWindowsRH10 ||
                ((0, os_1.platform)() === 'darwin' &&
                ((this.vendorId === 0x054c &&
                    (this.productId === 0x017f || this.productId === 0x0183)) ||
                    isUnrestrictedHiMD));
            endpoint.timeout = Math.max(endpoint.timeout || 0, needsSlowHiMDTimeout ? 60000 : 10000);
            const result = await endpoint.transferAsync(length);
            return {
                data: result ? new DataView(new Uint8Array(result).buffer) : undefined,
                status: 'ok'
            };
        }
        catch (error) {
            if (error.errno === usb.LIBUSB_TRANSFER_STALL) {
                return {
                    status: 'stall'
                };
            }
            if (error.errno === usb.LIBUSB_TRANSFER_OVERFLOW) {
                return {
                    status: 'babble'
                };
            }
            throw new Error(`transferIn error: ${error}`);
        }
    }
    async transferOut(endpointNumber, data) {
        this.checkDeviceOpen();
        const endpoint = this.getEndpoint(endpointNumber | usb.LIBUSB_ENDPOINT_OUT);
        const isNH1OnMac = (0, os_1.platform)() === 'darwin' &&
            this.vendorId === 0x054c && this.productId === 0x017f;
        const isUnrestrictedHiMDOnMac = (0, os_1.platform)() === 'darwin' &&
            this.vendorId === 0x5341 && this.productId === 0x5256;
        endpoint.timeout = Math.max(endpoint.timeout || 0,
            isNH1OnMac || isUnrestrictedHiMDOnMac ? 60000 : 10000);
        const buffer = Buffer.from(data);
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const bytesWritten = await endpoint.transferAsync(buffer);
                return {
                    bytesWritten,
                    status: 'ok'
                };
            }
            catch (error) {
                const isPipe = error.errno === usb.LIBUSB_ERROR_PIPE ||
                    String(error).includes('LIBUSB_ERROR_PIPE');
                const isTimeout = error.errno === usb.LIBUSB_TRANSFER_TIMED_OUT ||
                    String(error).includes('LIBUSB_TRANSFER_TIMED_OUT');
                const isMassStorageCBW = buffer.length === 31 &&
                    buffer[0] === 0x55 && buffer[1] === 0x53 &&
                    buffer[2] === 0x42 && buffer[3] === 0x43;
                // The patched vendor-class Hi-MD descriptor avoids Apple's
                // mass-storage driver, but early Hn firmware halts Bulk-Out
                // before many CBWs. Clear the halt and retry the rejected
                // transfer once; LIBUSB_ERROR_PIPE reports no accepted data.
                // A timed-out 31-byte BOT command wrapper is also safe to
                // retry after libusb has cancelled it. Never retry a timed-out
                // audio/data payload because its accepted length is unknown.
                const canRecover = isUnrestrictedHiMDOnMac && attempt < 2 &&
                    (isPipe || (isTimeout && isMassStorageCBW));
                if (canRecover) {
                    console.log('MZ-NH1 unrestricted Bulk-Out recovery.', {
                        attempt: attempt + 1,
                        reason: isPipe ? 'pipe' : 'timeout',
                        bytes: buffer.length,
                        cdbOpcode: isMassStorageCBW ? buffer[15] : null,
                    });
                    await this.clearHalt('out', endpointNumber);
                    // Hn1.100 needs a short settling period after CLEAR_HALT;
                    // an immediate resubmit can simply stall again.
                    await new Promise(resolve => setTimeout(resolve, isTimeout ? 300 : 40));
                    continue;
                }
                if (error.errno === usb.LIBUSB_TRANSFER_STALL || isPipe) {
                    return {
                        bytesWritten: 0,
                        status: 'stall'
                    };
                }
                throw new Error(`transferOut error: ${error}`);
            }
        }
    }
    async reset() {
        try {
            await this.resetAsync();
        }
        catch (error) {
            throw new Error(`reset error: ${error}`);
        }
    }
    async isochronousTransferIn(_endpointNumber, _packetLengths) {
        throw new Error('isochronousTransferIn error: method not implemented');
    }
    async isochronousTransferOut(_endpointNumber, _data, _packetLengths) {
        throw new Error('isochronousTransferOut error: method not implemented');
    }
    async forget() {
        throw new Error('forget error: method not implemented');
    }
    async initialize() {
        try {
            if (!this.opened) {
                this.device.open();
                // Explicitly set configuration for vendor-specific devices on macos
                // https://github.com/node-usb/node-usb/issues/61
                if (this.deviceClass === 0xff && (0, os_1.platform)() === 'darwin') {
                    await this.setConfigurationAsync(1);
                }
            }
            this.manufacturerName = await this.getStringDescriptor(this.device.deviceDescriptor.iManufacturer);
            this.productName = await this.getStringDescriptor(this.device.deviceDescriptor.iProduct);
            this.serialNumber = await this.getStringDescriptor(this.device.deviceDescriptor.iSerialNumber);
            this.configurations = await this.getConfigurations();
        }
        catch (error) {
            throw new Error(`initialize error: ${error}`);
        }
        finally {
            if (this.opened) {
                this.device.close();
            }
        }
    }
    decodeVersion(version) {
        const hex = `0000${version.toString(16)}`.slice(-4);
        return {
            major: parseInt(hex.substr(0, 2), undefined),
            minor: parseInt(hex.substr(2, 1), undefined),
            sub: parseInt(hex.substr(3, 1), undefined),
        };
    }
    async getStringDescriptor(index) {
        try {
            const buffer = await this.getStringDescriptorAsync(index);
            return buffer ? buffer.toString() : '';
        }
        catch (error) {
            return '';
        }
    }
    async getConfigurations() {
        const configs = [];
        for (const config of this.device.allConfigDescriptors) {
            const interfaces = [];
            for (const iface of config.interfaces) {
                const alternates = [];
                for (const alternate of iface) {
                    const endpoints = [];
                    for (const endpoint of alternate.endpoints) {
                        endpoints.push({
                            endpointNumber: endpoint.bEndpointAddress & ENDPOINT_NUMBER_MASK,
                            direction: endpoint.bEndpointAddress & usb.LIBUSB_ENDPOINT_IN ? 'in' : 'out',
                            type: (endpoint.bmAttributes & LIBUSB_TRANSFER_TYPE_MASK) === usb.LIBUSB_TRANSFER_TYPE_BULK ? 'bulk'
                                : (endpoint.bmAttributes & LIBUSB_TRANSFER_TYPE_MASK) === usb.LIBUSB_TRANSFER_TYPE_INTERRUPT ? 'interrupt'
                                    : 'isochronous',
                            packetSize: endpoint.wMaxPacketSize
                        });
                    }
                    alternates.push({
                        alternateSetting: alternate.bAlternateSetting,
                        interfaceClass: alternate.bInterfaceClass,
                        interfaceSubclass: alternate.bInterfaceSubClass,
                        interfaceProtocol: alternate.bInterfaceProtocol,
                        interfaceName: await this.getStringDescriptor(alternate.iInterface),
                        endpoints
                    });
                }
                const interfaceNumber = iface[0].bInterfaceNumber;
                const alternate = alternates.find(alt => alt.alternateSetting === this.device.interface(interfaceNumber).altSetting);
                if (alternate) {
                    interfaces.push({
                        interfaceNumber,
                        alternate,
                        alternates,
                        claimed: false
                    });
                }
            }
            configs.push({
                configurationValue: config.bConfigurationValue,
                configurationName: await this.getStringDescriptor(config.iConfiguration),
                interfaces
            });
        }
        return configs;
    }
    getEndpoint(address) {
        if (!this.device.interfaces) {
            return undefined;
        }
        for (const iface of this.device.interfaces) {
            const endpoint = iface.endpoint(address);
            if (endpoint) {
                return endpoint;
            }
        }
        return undefined;
    }
    controlTransferParamsToType(setup, direction) {
        const recipient = setup.recipient === 'device' ? usb.LIBUSB_RECIPIENT_DEVICE
            : setup.recipient === 'interface' ? usb.LIBUSB_RECIPIENT_INTERFACE
                : setup.recipient === 'endpoint' ? usb.LIBUSB_RECIPIENT_ENDPOINT
                    : usb.LIBUSB_RECIPIENT_OTHER;
        const requestType = setup.requestType === 'standard' ? usb.LIBUSB_REQUEST_TYPE_STANDARD
            : setup.requestType === 'class' ? usb.LIBUSB_REQUEST_TYPE_CLASS
                : usb.LIBUSB_REQUEST_TYPE_VENDOR;
        return recipient | requestType | direction;
    }
    async _releaseInterface(interfaceNumber) {
        if (!this.opened) {
            throw new Error('releaseInterface error: invalid state');
        }
        if (!this.configuration) {
            throw new Error('releaseInterface error: interface not found');
        }
        const iface = this.configuration.interfaces.find(usbInterface => usbInterface.interfaceNumber === interfaceNumber);
        if (!iface) {
            throw new Error('releaseInterface error: interface not found');
        }
        if (!iface.claimed) {
            return;
        }
        try {
            const iface = this.device.interface(interfaceNumber);
            await iface.releaseAsync();
        }
        catch (error) {
            throw new Error(`releaseInterface error: ${error}`);
        }
    }
    checkDeviceOpen() {
        if (!this.opened) {
            throw new Error('The device must be opened first');
        }
    }
}
exports.WebUSBDevice = WebUSBDevice;
//# sourceMappingURL=webusb-device.js.map
