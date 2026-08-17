import fs from 'fs';
import { EWMDHiMD } from '../wmd/translations';
import { createServer } from 'net';
import { PackrStream, UnpackrStream } from 'msgpackr';
import path from 'path';
import { NetworkWMService } from '../wmd/networkwm-service';
import { WebUSBInterop } from '../wusb-interop';
import { getPidPath, getSocketDir, getSocketPath } from './socket-path';

const socketName = getSocketPath();
const pidFile = getPidPath();
const workDir = getSocketDir();
const diagnosticPath = path.join(process.argv[2], 'wmd-himd-helper.log');
const appendDiagnostic = (...values: any[]) => {
    try {
        const line = values.map(value => value instanceof Error
            ? `${value.stack ?? value.message}`
            : typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
        fs.appendFileSync(diagnosticPath, `[${new Date().toISOString()}] ${line}\n`);
    } catch (_) {}
};
const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
console.log = (...values: any[]) => {
    appendDiagnostic(...values);
    originalConsoleLog(...values);
};
console.error = (...values: any[]) => {
    appendDiagnostic(...values);
    originalConsoleError(...values);
};
const canFail = (func: () => void) => {
    try{ func() } catch(_){}
}

function closeAll(){
    canFail(() => fs.unlinkSync(socketName));
    canFail(() => fs.unlinkSync(pidFile));
    process.exit();
}
function main() {
    appendDiagnostic('helper starting', { pid: process.pid });
    console.log("ElectronWMD's MacOS SCSI intermediate server by asivery");
    console.log("Starting up...");
    console.log(`Base dir: ${workDir}`);
    console.log(`Socket path: ${socketName}`);
    console.log(`PID file: ${pidFile}`);
    if(fs.existsSync(pidFile)) {
        const oldPid = parseInt(fs.readFileSync(pidFile).toString());
        canFail(() => process.kill(oldPid, 'SIGTERM'));
        canFail(() => fs.unlinkSync(pidFile));
    }
    
    fs.writeFileSync(pidFile, `${process.pid}`);
    const webusb = WebUSBInterop.create();

    Object.defineProperty(global, 'navigator', {
        writable: false,
        value: { usb: webusb },
    });
    Object.defineProperty(global, 'window', {
        writable: false,
        value: global,
    });

    canFail(() => fs.unlinkSync(socketName));

    const server = createServer();
    server.on('error', (err) => {
        console.error('Server error:', err);
        closeAll();
    });
    server.listen(socketName, () => {
        console.log(`Server listening on socket: ${socketName}`);
        try {
            const originalUid = isFinite(process.env.ORIGINAL_UID as any) ? parseInt(process.env.ORIGINAL_UID) : null;
            const originalGid = isFinite(process.env.ORIGINAL_GID as any) ? parseInt(process.env.ORIGINAL_GID) : null;
            if (originalUid !== null && originalGid !== null) {
                try { fs.chownSync(socketName, originalUid, originalGid); } catch (_) {}
                try { fs.chmodSync(socketName, 0o600); } catch (_) {}
                console.log(`Socket ownership set to ${originalUid}:${originalGid ?? 0} and mode 0600`);
            } else {
                fs.chmodSync(socketName, 0o777);
                console.log('Socket permissions set to 0777 (fallback)');
            }
        } catch (err) {
            console.error('Failed setting socket ownership/permissions:', err);
        }
    });
    server.on("close", closeAll);
    server.on('connection', (socket) => {
        console.log("Connection established.");
        socket.on('close', closeAll);
        const packerStream = new PackrStream({
            copyBuffers: true,
            structuredClone: true,
        });
        const unpackerStream = new UnpackrStream({
            copyBuffers: true,
            structuredClone: true,
        });

        const himdDevice = new EWMDHiMD({ debug: true });

        let keyData: Uint8Array | undefined = undefined;
        try{
            keyData = new Uint8Array(fs.readFileSync(path.join(process.argv[2], 'EKBROOTS.DES')));
        }catch(_){ console.log("Can't read roots") }
        const nwDevice = new NetworkWMService(keyData);

        socket.pipe(unpackerStream);
        packerStream.pipe(socket);

        function sendCallback(service: string, callbackFunctionName: string, ...args: any[]){
            packerStream.write({
                type: 'callback',
                name: callbackFunctionName,
                service,
                value: args,
            })
        }

        unpackerStream.on('data', async ({ service, name, allArgs }: { service: string, name: string, allArgs: any[] }) => {
            console.log(`Call to ${name}`);
            appendDiagnostic('call started', { service, name, argumentBytes: allArgs.map(value => value?.byteLength ?? null) });
            for (let i = 0; i < allArgs.length; i++) {
                if (allArgs[i]?.interprocessType === 'function') {
                    allArgs[i] = async (...args: any[]) =>
                        {
                            sendCallback(service, `${name}_callback${i}`, ...args);
                        }
                }
            }
            let res;
            try {
                if (service === 'himd' && name === 'upload') {
                    let audio = allArgs[2];
                    if (audio?.interprocessType === 'stagedHiMDUploadFile') {
                        const userDataRoot = path.resolve(process.argv[2]);
                        const candidate = path.resolve(String(audio.path));
                        if (path.dirname(candidate) !== userDataRoot || !path.basename(candidate).startsWith('himd-upload-'))
                            throw new Error('허용되지 않은 Hi-MD 임시 파일 경로입니다.');
                        const fileBuffer = fs.readFileSync(candidate);
                        canFail(() => fs.unlinkSync(candidate));
                        if (fileBuffer.byteLength !== audio.bytes)
                            throw new Error('Hi-MD 임시 음원 파일 크기가 올바르지 않습니다.');
                        audio = fileBuffer;
                        allArgs[2] = audio;
                        appendDiagnostic('Hi-MD staged upload file loaded', { bytes: fileBuffer.byteLength });
                    }
                    appendDiagnostic('Hi-MD upload payload received', {
                        type: Object.prototype.toString.call(audio),
                        constructor: audio?.constructor?.name,
                        bytes: audio?.byteLength ?? null,
                        isView: ArrayBuffer.isView(audio),
                    });
                    let source: Uint8Array;
                    if (ArrayBuffer.isView(audio)) {
                        source = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
                    } else if (audio instanceof ArrayBuffer) {
                        source = new Uint8Array(audio);
                    } else {
                        throw new TypeError(`Invalid Hi-MD audio payload: ${Object.prototype.toString.call(audio)}`);
                    }
                    // msgpackr may reconstruct an ArrayBuffer on top of memory
                    // marked non-transferable by Node's Buffer pool. Always
                    // allocate a fresh backing store for Worker.postMessage.
                    const copy = new Uint8Array(source.byteLength);
                    copy.set(source);
                    allArgs[2] = copy.buffer;
                    appendDiagnostic('Hi-MD upload payload normalized', { bytes: copy.byteLength });
                }
                const serviceObject = service === 'nwjs' ? nwDevice : himdDevice;
                res = [await (serviceObject as any)[name](...allArgs), null];
                appendDiagnostic('call completed', { service, name });
            } catch (err) {
                console.log("Node Error: ");
                console.log(err);
                appendDiagnostic('call failed', { service, name }, err);
                res = [null, err];
            }

            packerStream.write({
                type: 'return',
                name,
                value: res,
            });
        })

        const addKnownDeviceCB = webusb.addKnownDevice.bind(webusb);
        nwDevice.deviceConnectedCallback = addKnownDeviceCB;
        himdDevice.deviceConnectedCallback = addKnownDeviceCB;
        webusb.ondisconnect = event => {
            if([nwDevice, himdDevice].some(e => e.isDeviceConnected(event.device))) {
                closeAll();
            }
        }
    });
}

main()
