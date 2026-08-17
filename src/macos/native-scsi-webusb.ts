import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import path from 'path';
import readline from 'readline';

type PendingCommand = {
    tag: number;
    dataLength: number;
    directionIn: boolean;
    cdb: Uint8Array;
    result?: NativeResult;
};

type NativeResult = {
    ioReturn: number;
    status: number;
    transferred: number;
    sense: Uint8Array;
    data: Uint8Array;
};

const fromHex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'));
const toHex = (value: Uint8Array) => Buffer.from(value).toString('hex');

export class MacOSNativeSCSIWebUSB {
    public vendorId = 0;
    public productId = 0;
    public configuration = {
        interfaces: [{
            alternate: {
                endpoints: [
                    { type: 'bulk', direction: 'in', endpointNumber: 1 },
                    { type: 'bulk', direction: 'out', endpointNumber: 2 },
                ],
            },
        }],
    };

    private process: ChildProcessWithoutNullStreams;
    private lines: readline.Interface;
    private lineWaiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
    private bufferedLines: string[] = [];
    private pending?: PendingCommand;
    private stderrTail = '';

    private constructor(process: ChildProcessWithoutNullStreams) {
        this.process = process;
        this.lines = readline.createInterface({ input: process.stdout });
        this.lines.on('line', line => {
            const waiter = this.lineWaiters.shift();
            if (waiter) waiter.resolve(line);
            else this.bufferedLines.push(line);
        });
        process.stderr.on('data', data => {
            const message = data.toString().trimEnd();
            this.stderrTail = `${this.stderrTail}\n${message}`.slice(-2048).trim();
            console.error(`Native SCSI: ${message}`);
        });
        process.once('exit', (code, signal) => {
            const detail = this.stderrTail ? `: ${this.stderrTail}` : '';
            const error = new Error(
                `Native Hi-MD helper exited (${code ?? signal ?? 'unknown'})${detail}`,
            );
            for (const waiter of this.lineWaiters.splice(0)) waiter.reject(error);
        });
    }

    static async create(): Promise<MacOSNativeSCSIWebUSB> {
        const executable = path.join(__dirname, '..', '..', 'extras', 'wmd-scsi-helper');
        const child = spawn(executable, ['serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
        const device = new MacOSNativeSCSIWebUSB(child);
        const ready = await device.nextLine();
        const match = /^READY ([0-9a-f]{4}) ([0-9a-f]{4})$/i.exec(ready);
        if (!match) {
            child.kill();
            throw new Error(`Native SCSI helper did not become ready: ${ready}`);
        }
        device.vendorId = parseInt(match[1], 16);
        device.productId = parseInt(match[2], 16);
        console.log('Native macOS SCSI transport ready', {
            vendorId: device.vendorId.toString(16),
            productId: device.productId.toString(16),
        });
        return device;
    }

    private nextLine(): Promise<string> {
        const buffered = this.bufferedLines.shift();
        if (buffered !== undefined) return Promise.resolve(buffered);
        return new Promise((resolve, reject) => this.lineWaiters.push({ resolve, reject }));
    }

    private async execute(direction: 'i' | 'o' | 'n', command: PendingCommand, data?: Uint8Array) {
        const payload = data ? ` ${toHex(data)}` : '';
        this.process.stdin.write(
            `${direction} 60000 ${command.dataLength} ${toHex(command.cdb)}${payload}\n`,
        );
        const line = await this.nextLine();
        const match = /^RESULT ([0-9a-f]{8}) (\d+) (\d+) ([0-9a-f]*) ?([0-9a-f]*)$/i.exec(line);
        if (!match) throw new Error(`Native SCSI protocol error: ${line}`);
        const ioReturn = parseInt(match[1], 16) >>> 0;
        const result: NativeResult = {
            ioReturn,
            status: parseInt(match[2], 10),
            transferred: parseInt(match[3], 10),
            sense: fromHex(match[4]),
            data: fromHex(match[5]),
        };
        if (ioReturn !== 0) {
            throw new Error(`Native SCSI I/O error 0x${ioReturn.toString(16).padStart(8, '0')}`);
        }
        command.result = result;
        return result;
    }

    async claimInterface(_interfaceNumber: number) {}
    async releaseInterface(_interfaceNumber: number) {}
    async clearHalt(_direction: 'in' | 'out', _endpoint: number) {}
    async reset() {}

    async controlTransferOut(_setup: unknown) {
        return { status: 'ok', bytesWritten: 0 };
    }

    async controlTransferIn(_setup: unknown, length: number) {
        const data = new Uint8Array(length);
        return { status: 'ok', data: new DataView(data.buffer) };
    }

    async transferOut(_endpoint: number, data: BufferSource) {
        const bytes = data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes.length >= 31 && bytes[0] === 0x55 && bytes[1] === 0x53 &&
            bytes[2] === 0x42 && bytes[3] === 0x43) {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const cdbLength = bytes[14];
            this.pending = {
                tag: view.getUint32(4, true),
                dataLength: view.getUint32(8, true),
                directionIn: (bytes[12] & 0x80) !== 0,
                cdb: bytes.slice(15, 15 + cdbLength),
            };
            if (this.pending.dataLength === 0) await this.execute('n', this.pending);
            return { status: 'ok', bytesWritten: bytes.length };
        }
        if (!this.pending || this.pending.directionIn) {
            throw new Error('Native SCSI received unexpected Bulk-Out data');
        }
        await this.execute('o', this.pending, bytes);
        return { status: 'ok', bytesWritten: bytes.length };
    }

    async transferIn(_endpoint: number, length: number) {
        if (!this.pending) throw new Error('Native SCSI received Bulk-In without a command');
        if (length === 13) {
            if (!this.pending.result) await this.execute(this.pending.directionIn ? 'i' : 'n', this.pending);
            const result = this.pending.result!;
            const csw = new Uint8Array(13);
            const view = new DataView(csw.buffer);
            csw.set([0x55, 0x53, 0x42, 0x53]);
            view.setUint32(4, this.pending.tag, true);
            view.setUint32(8, Math.max(0, this.pending.dataLength - result.transferred), true);
            csw[12] = result.status === 0 ? 0 : 1;
            this.pending = undefined;
            return { status: 'ok', data: new DataView(csw.buffer) };
        }
        if (!this.pending.directionIn) throw new Error('Native SCSI received unexpected input data request');
        const result = this.pending.result ?? await this.execute('i', this.pending);
        const output = result.data.slice(0, length);
        return { status: 'ok', data: new DataView(output.buffer, output.byteOffset, output.byteLength) };
    }

    async close() {
        this.lines.close();
        this.process.stdin.end();
        this.process.kill();
    }
}
