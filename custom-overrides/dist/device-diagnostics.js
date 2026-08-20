"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMiniDiscDiagnostics = getMiniDiscDiagnostics;
exports.buildCompactConnectionDiagnostics = buildCompactConnectionDiagnostics;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const usb_1 = require("usb");
const himd_js_1 = require("himd-js");
const netmd_js_1 = require("netmd-js");
const child_process_1 = require("child_process");
function matches(ids, vendorId, productId) {
    return ids.some((id) => id.vendorId === vendorId && id.deviceId === productId);
}
function toHex(value) {
    return `0x${value.toString(16).padStart(4, '0')}`;
}
function inspectWindowsUsbDrivers() {
    if (process.platform !== 'win32')
        return [];
    const command = [
        "$ErrorActionPreference = 'Stop'",
        "$devices = Get-CimInstance Win32_PnPEntity -Filter \"PNPDeviceID LIKE 'USB\\\\VID_%'\"",
        '$result = @($devices | ForEach-Object { [PSCustomObject]@{ instanceId = $_.PNPDeviceID; service = $_.Service; name = $_.Name } })',
        '$result | ConvertTo-Json -Compress',
    ].join('; ');
    try {
        const output = (0, child_process_1.execFileSync)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
        if (!output)
            return [];
        const parsed = JSON.parse(output);
        return Array.isArray(parsed) ? parsed : [parsed];
    }
    catch (error) {
        console.warn('Windows USB 드라이버 상태를 읽지 못했습니다.', error);
        return [];
    }
}
function getWindowsUsbIdentity(instanceId) {
    const match = /^USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})/i.exec(instanceId);
    if (!match)
        return null;
    return {
        vendorId: Number.parseInt(match[1], 16),
        productId: Number.parseInt(match[2], 16),
    };
}
function getWindowsDriverStatus(drivers, vendorId, productId) {
    var _a;
    if (process.platform !== 'win32')
        return { driverStatus: 'not-applicable' };
    const vid = vendorId.toString(16).padStart(4, '0').toUpperCase();
    const pid = productId.toString(16).padStart(4, '0').toUpperCase();
    const driver = drivers.find((entry) => {
        const instanceId = entry.instanceId.toUpperCase();
        return instanceId.includes(`VID_${vid}&PID_${pid}`);
    });
    const driverName = (_a = driver === null || driver === void 0 ? void 0 : driver.service) === null || _a === void 0 ? void 0 : _a.trim();
    const driverInstanceId = driver === null || driver === void 0 ? void 0 : driver.instanceId;
    if (!driverName)
        return { driverStatus: 'unknown', driverInstanceId };
    const normalized = driverName.toLowerCase();
    if (normalized === 'winusb')
        return { driverStatus: 'winusb', driverName, driverInstanceId };
    if (normalized === 'usbstor')
        return { driverStatus: 'usbstor', driverName, driverInstanceId };
    return { driverStatus: 'other', driverName, driverInstanceId };
}
function describeMiniDiscDevice(vendorId, productId, windowsDrivers, transport) {
    const netMDDefinition = netmd_js_1.DevicesIds.find((entry) => entry.vendorId === vendorId && entry.deviceId === productId);
    const hiMDDefinition = himd_js_1.DevicesIds.find((entry) => entry.vendorId === vendorId && entry.deviceId === productId);
    const isHiMD = Boolean(hiMDDefinition);
    const isNetMD = Boolean(netMDDefinition);
    const isSony = vendorId === 0x054c;
    const isVirtualExploitDevice = vendorId === 0x5341 && productId === 0x5256;
    if (!isHiMD && !isNetMD && !isVirtualExploitDevice)
        return null;
    const modelNames = [...new Set([netMDDefinition === null || netMDDefinition === void 0 ? void 0 : netMDDefinition.name, hiMDDefinition === null || hiMDDefinition === void 0 ? void 0 : hiMDDefinition.name].filter(Boolean))];
    return Object.assign({ vendorId,
        productId, vendorIdHex: toHex(vendorId), productIdHex: toHex(productId), busNumber: transport === null || transport === void 0 ? void 0 : transport.busNumber, deviceAddress: transport === null || transport === void 0 ? void 0 : transport.deviceAddress, portNumbers: transport === null || transport === void 0 ? void 0 : transport.portNumbers, mode: isHiMD || isVirtualExploitDevice ? 'himd' : isNetMD ? 'netmd' : isSony ? 'sony-usb' : 'unknown', isSony: isSony || isVirtualExploitDevice, modelHint: vendorId === 0x054c && (productId === 0x0219 || productId === 0x021a)
            ? 'Sony MZ-RH10 / MZ-M100'
            : modelNames.join(' / ') || (transport === null || transport === void 0 ? void 0 : transport.name) || 'MiniDisc USB Device', supportsNetMD: isNetMD, supportsHiMD: isHiMD || isVirtualExploitDevice, requiredDriver: 'WinUSB' }, getWindowsDriverStatus(windowsDrivers, vendorId, productId));
}
function getMiniDiscDiagnostics() {
    const windowsDrivers = inspectWindowsUsbDrivers();
    let usbDevices = [];
    try {
        usbDevices = usb_1.usb.getDeviceList();
    }
    catch (error) {
        console.warn('USB 장치 목록을 읽지 못했습니다.', error);
    }
    const libusbDevices = usbDevices
        .map((device) => {
        const { idVendor: vendorId, idProduct: productId } = device.deviceDescriptor;
        return describeMiniDiscDevice(vendorId, productId, windowsDrivers, device);
    })
        .filter((device) => device !== null);
    const knownIds = new Set(libusbDevices.map((device) => `${device.vendorId}:${device.productId}`));
    const pnpOnlyDevices = windowsDrivers
        .map((driver) => {
        const identity = getWindowsUsbIdentity(driver.instanceId);
        if (!identity || knownIds.has(`${identity.vendorId}:${identity.productId}`))
            return null;
        return describeMiniDiscDevice(identity.vendorId, identity.productId, windowsDrivers, {
            name: driver.name,
        });
    })
        .filter((device) => device !== null);
    const devices = [...libusbDevices, ...pnpOnlyDevices];
    const guidance = process.platform === 'win32'
        ? [
            '지원되는 NetMD 및 Hi-MD 장치는 Windows에서 WinUSB 드라이버가 필요합니다.',
            'NetMD와 Hi-MD 모드가 서로 다른 장치 ID를 사용하는 기기는 각 모드에서 한 번씩 설치합니다.',
            '연결 버튼을 누르면 현재 장치와 모드에 맞는 드라이버 설치를 안내합니다.',
            'Windows 탐색기에서 디스크를 열 때만 기본 USBSTOR 드라이버로 복원하세요.',
        ]
        : [
            'No vendor driver installation is required on macOS.',
            'HiMD full mode temporarily unmounts the disc and takes exclusive USB control.',
        ];
    return {
        platform: process.platform,
        driverManagementAvailable: process.platform === 'win32',
        devices,
        guidance,
    };
}
function readLogTail(filePath, maximumBytes) {
    try {
        const size = fs_1.default.statSync(filePath).size;
        const length = Math.min(size, maximumBytes);
        const buffer = Buffer.alloc(length);
        const file = fs_1.default.openSync(filePath, 'r');
        try {
            fs_1.default.readSync(file, buffer, 0, length, Math.max(0, size - length));
        }
        finally {
            fs_1.default.closeSync(file);
        }
        return buffer.toString('utf8').replace(/^.*\uFFFD/u, '');
    }
    catch (_) {
        return '';
    }
}
function readCommand(command, args) {
    try {
        return (0, child_process_1.execFileSync)(command, args, {
            encoding: 'utf8',
            timeout: 2500,
            windowsHide: true,
        }).trim();
    }
    catch (_) {
        return '';
    }
}
function redactDiagnosticText(value) {
    const home = os_1.default.homedir();
    let output = String(value !== null && value !== void 0 ? value : '');
    if (home)
        output = output.split(home).join('<HOME>');
    return output
        .replace(/\/Users\/[^/\s"']+/g, '/Users/<USER>')
        .replace(/\\Users\\[^\\\s"']+/gi, '\\Users\\<USER>')
        .replace(/("?(?:serial(?: number)?|USB Serial Number)"?\s*[:=]\s*)[^\s,}\]]+/gi, '$1<REDACTED>');
}
function describeIOReturns(errorMessage) {
    const symbols = {
        0xe00002c1: 'kIOReturnNotPrivileged',
        0xe00002c5: 'kIOReturnExclusiveAccess',
        0xe00002c9: 'kIOReturnInternalError',
        0xe00002d5: 'kIOReturnBusy',
        0xe00002d6: 'kIOReturnTimeout',
        0xe00002d8: 'kIOReturnNotReady',
        0xe00002d9: 'kIOReturnNotAttached',
        0xe00002e2: 'kIOReturnNotPermitted',
    };
    const codes = new Set();
    for (const match of errorMessage.matchAll(/(?:"code"\s*:|\bcode\s*=)\s*(-?\d+)/gi)) {
        codes.add(Number(match[1]));
    }
    return [...codes].map(code => {
        var _a;
        const unsigned = code >>> 0;
        const hex = `0x${unsigned.toString(16).padStart(8, '0')}`;
        return `${code} · ${hex} · ${(_a = symbols[unsigned]) !== null && _a !== void 0 ? _a : 'unknown IOReturn'}`;
    });
}
function buildCompactConnectionDiagnostics(options) {
    var _a, _b;
    const diagnostics = getMiniDiscDiagnostics();
    const macProductVersion = process.platform === 'darwin'
        ? readCommand('/usr/bin/sw_vers', ['-productVersion'])
        : '';
    const macBuildVersion = process.platform === 'darwin'
        ? readCommand('/usr/bin/sw_vers', ['-buildVersion'])
        : '';
    const hardwareModel = process.platform === 'darwin'
        ? readCommand('/usr/sbin/sysctl', ['-n', 'hw.model'])
        : '';
    const cpuModel = ((_b = (_a = os_1.default.cpus()[0]) === null || _a === void 0 ? void 0 : _a.model) === null || _b === void 0 ? void 0 : _b.trim()) || 'unknown';
    const deviceLines = diagnostics.devices.length
        ? diagnostics.devices.map(device => {
            var _a, _b, _c, _d;
            const usbPath = ((_a = device.portNumbers) === null || _a === void 0 ? void 0 : _a.length)
                ? device.portNumbers.join('.')
                : `${(_b = device.busNumber) !== null && _b !== void 0 ? _b : '?'}-${(_c = device.deviceAddress) !== null && _c !== void 0 ? _c : '?'}`;
            const route = ((_d = device.portNumbers) === null || _d === void 0 ? void 0 : _d.length)
                ? `${usbPath}${device.portNumbers.length > 1 ? ' (hub path)' : ' (root port)'}`
                : usbPath;
            return [
                device.modelHint,
                `${device.vendorIdHex}:${device.productIdHex}`,
                device.mode,
                `USB ${route}`,
                device.driverName || device.driverStatus,
            ].filter(Boolean).join(' · ');
        })
        : ['MiniDisc USB device not visible to libusb'];
    const ioReturns = describeIOReturns(options.errorMessage);
    const helperTail = readLogTail(path_1.default.join(options.userDataPath, 'wmd-himd-helper.log'), 2600);
    const appTail = readLogTail(path_1.default.join(options.userDataPath, 'wmd-diagnostic.log'), 1200);
    const lines = [
        'Web MiniDisc Pro · connection diagnostics',
        `time=${new Date().toISOString()}`,
        `app=${options.appVersion}`,
        `platform=${process.platform} arch=${process.arch}`,
        `os=${macProductVersion || os_1.default.release()} build=${macBuildVersion || os_1.default.version()}`,
        `hardware=${hardwareModel || 'unknown'}`,
        `cpu=${cpuModel}`,
        '',
        '[error]',
        options.errorMessage || 'No error text was available.',
        ...(ioReturns.length ? ['', '[decoded IOReturn]', ...ioReturns] : []),
        '',
        '[MiniDisc USB]',
        ...deviceLines,
        ...(helperTail ? ['', '[Hi-MD helper log tail]', helperTail] : []),
        ...(appTail ? ['', '[app diagnostic log tail]', appTail] : []),
    ];
    const report = redactDiagnosticText(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
    const maximumCharacters = 7000;
    const marker = '\n[truncated to 7000 characters]';
    return report.length <= maximumCharacters
        ? report
        : `${report.slice(0, maximumCharacters - marker.length)}${marker}`;
}
//# sourceMappingURL=device-diagnostics.js.map
