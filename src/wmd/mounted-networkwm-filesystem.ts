import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NativeHiMDFilesystem } from 'himd-js';

const REQUIRED_OMGAUDIO_FILES = [
    '01TREE01.DAT',
    '01TREE02.DAT',
    '01TREE03.DAT',
    '01TREE04.DAT',
    '02TREINF.DAT',
    '03GINF01.DAT',
    '03GINF02.DAT',
    '03GINF03.DAT',
    '03GINF04.DAT',
    '04CNTINF.DAT',
];

// networkwm-js recreates these files immediately after eraseAll(). Keeping
// their FAT directory entries and truncating the contents avoids Windows FAT32
// refusing a delete-then-create cycle with EPERM on removable Walkmans.
const NW_A3000_INITIALIZATION_FILES = new Set([
    '00010021.DAT',
    '00GTRLST.DAT',
    '01TREE01.DAT',
    '01TREE02.DAT',
    '01TREE03.DAT',
    '01TREE04.DAT',
    '02TREINF.DAT',
    '03GINF01.DAT',
    '03GINF02.DAT',
    '03GINF03.DAT',
    '03GINF04.DAT',
    '04CNTINF.DAT',
    '05CHINDC.DAT',
    '05CIDLST.DAT',
]);

export function isOMGAudioVolume(rootPath: string): boolean {
    const databaseRoot = path.join(rootPath, 'OMGAUDIO');
    return REQUIRED_OMGAUDIO_FILES.every(fileName =>
        fs.existsSync(path.join(databaseRoot, fileName))
    );
}

export function findMountedOMGAudioVolumes(): string[] {
    if(process.platform !== 'win32') return [];

    const volumes: string[] = [];
    for(let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
        const rootPath = `${String.fromCharCode(code)}:\\`;
        if(isOMGAudioVolume(rootPath)) volumes.push(rootPath);
    }
    return volumes;
}

export function findMountedPartialOMGAudioVolumes(): string[] {
    if(process.platform !== 'win32') return [];

    const volumes: string[] = [];
    for(let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
        const rootPath = `${String.fromCharCode(code)}:\\`;
        const databaseRoot = path.join(rootPath, 'OMGAUDIO');
        try {
            const entries = fs.readdirSync(databaseRoot);
            if(entries.length === 0 || entries.some(name => /^(?:\d{2}[A-Z].*\.DAT|MACLIST.*\.(?:DAT|BAK)|10F\d{2}|20P\d{2})$/i.test(name))) {
                volumes.push(rootPath);
            }
        } catch(_) {}
    }
    return volumes;
}

function backupDevicePrefix(deviceName: string): string {
    return deviceName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Network-Walkman';
}

export function backupOMGAudioMetadata(volumeRoot: string, backupRoot: string, deviceName = 'Network Walkman'): string {
    const databaseRoot = path.join(volumeRoot, 'OMGAUDIO');
    if(!isOMGAudioVolume(volumeRoot)) {
        throw new Error(`The mounted volume does not contain a valid OMGAUDIO database: ${volumeRoot}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(backupRoot, `${backupDevicePrefix(deviceName)}-${timestamp}`);
    fs.mkdirSync(destination, { recursive: true });

    const files: Array<{ name: string; size: number; sha256: string }> = [];
    for(const entry of fs.readdirSync(databaseRoot, { withFileTypes: true })) {
        if(!entry.isFile()) continue;
        const sourcePath = path.join(databaseRoot, entry.name);
        const destinationPath = path.join(destination, entry.name);
        fs.copyFileSync(sourcePath, destinationPath);
        const data = fs.readFileSync(destinationPath);
        files.push({
            name: entry.name,
            size: data.byteLength,
            sha256: crypto.createHash('sha256').update(data).digest('hex'),
        });
    }

    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({
        sourceVolume: volumeRoot,
        deviceName,
        createdAt: new Date().toISOString(),
        files,
    }, null, 2));
    return destination;
}

export function restoreLatestOMGAudioMetadata(volumeRoot: string, backupRoot: string, deviceName = 'Network Walkman'): string | null {
    if(!fs.existsSync(backupRoot)) return null;
    const required = new Set(REQUIRED_OMGAUDIO_FILES);
    const prefix = `${backupDevicePrefix(deviceName)}-`;
    const candidates = fs.readdirSync(backupRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
        .map(entry => path.join(backupRoot, entry.name))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

    for(const candidate of candidates) {
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'manifest.json'), 'utf8')) as {
                deviceName?: string;
                files?: Array<{ name: string; size: number; sha256: string }>;
            };
            if(manifest.deviceName !== deviceName) continue;
            const files = Array.isArray(manifest.files) ? manifest.files : [];
            if(![...required].every(name => files.some(file => file.name === name))) continue;
            for(const file of files) {
                const source = path.join(candidate, file.name);
                const data = fs.readFileSync(source);
                if(data.byteLength !== file.size || crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) {
                    throw new Error(`Backup verification failed for ${file.name}`);
                }
            }
            const databaseRoot = path.join(volumeRoot, 'OMGAUDIO');
            fs.mkdirSync(databaseRoot, { recursive: true });
            for(const file of files) {
                fs.copyFileSync(path.join(candidate, file.name), path.join(databaseRoot, file.name));
            }
            return candidate;
        } catch(_) {}
    }
    return null;
}

export class MountedNetworkWMFilesystem extends NativeHiMDFilesystem {
    public constructor(public readonly volumeRoot: string) {
        super(volumeRoot);
    }

    async open(filePath: string, mode: 'ro' | 'rw' = 'ro') {
        let lastError: unknown;
        for(let attempt = 1; attempt <= 10; attempt++) {
            try {
                return await super.open(filePath, mode);
            } catch(error) {
                lastError = error;
                const code = (error as NodeJS.ErrnoException)?.code;
                if(mode !== 'rw' || (code !== 'EPERM' && code !== 'EBUSY') || attempt === 10) {
                    throw error;
                }
                // Immediately recreating a filename removed from a FAT32
                // volume can fail until Windows drops the stale directory
                // entry. Initialization is safe to retry at file-open level.
                await new Promise(resolve => setTimeout(resolve, attempt * 50));
            }
        }
        throw lastError;
    }

    async _list(filePath: string): Promise<Array<{ name: string; type: 'file' | 'directory' }>> {
        const directory = path.join(this.volumeRoot, filePath);
        const entries: Array<{ name: string; type: 'file' | 'directory' }> = [];
        for(const name of fs.readdirSync(directory)) {
            const fullPath = path.join(directory, name);
            let stats: fs.Stats;
            try {
                stats = fs.statSync(fullPath);
            } catch(error) {
                // FAT removable media can return a just-deleted directory
                // entry for a short time. NativeHiMDFilesystem lets this
                // exception escape from its readdir callback and crash the
                // Electron main process. Ignore only entries which have
                // already disappeared; preserve genuine access failures.
                if(!fs.existsSync(fullPath)) continue;
                throw error;
            }
            if(stats.isFile() || stats.isDirectory()) {
                entries.push({
                    name: path.join(filePath, name),
                    type: stats.isFile() ? 'file' : 'directory',
                });
            }
        }
        return entries;
    }

    async getSize(filePath: string): Promise<number | null> {
        try {
            return fs.statSync(path.join(this.volumeRoot, filePath)).size;
        } catch(_) {
            return null;
        }
    }

    async getTotalSpace(): Promise<number> {
        const stats = fs.statfsSync(this.volumeRoot);
        return stats.bsize * stats.blocks;
    }

    async mkdir(filePath: string): Promise<void> {
        // NativeHiMDFilesystem returns Windows paths with backslashes while
        // networkwm-js compares them with forward-slash OMGAUDIO paths. That
        // can make an existing 10Fxx audio directory look absent. Treat
        // directory creation as idempotent so an existing store is reused.
        fs.mkdirSync(path.join(this.volumeRoot, filePath), { recursive: true });
    }

    async delete(filePath: string): Promise<void> {
        const resolvedVolumeRoot = path.resolve(this.volumeRoot);
        const target = path.resolve(resolvedVolumeRoot, filePath.replace(/^[\\/]+/, ''));
        const databaseRoot = path.resolve(resolvedVolumeRoot, 'OMGAUDIO');
        const volumePrefix = resolvedVolumeRoot.endsWith(path.sep)
            ? resolvedVolumeRoot
            : `${resolvedVolumeRoot}${path.sep}`;
        if(target !== resolvedVolumeRoot && !target.startsWith(volumePrefix)) {
            throw new Error(`Refusing to delete a path outside the mounted Walkman volume: ${filePath}`);
        }
        if(path.dirname(target) === databaseRoot && NW_A3000_INITIALIZATION_FILES.has(path.basename(target).toUpperCase())) {
            try { fs.chmodSync(target, 0o666); } catch(_) {}
            fs.truncateSync(target, 0);
            return;
        }
        const stats = fs.statSync(target);
        if(stats.isDirectory()) {
            if(target === databaseRoot) {
                // networkwm-js removes the OMGAUDIO tree and immediately
                // initializes it again. Keep the mount-point directory itself
                // so late device-created or hidden entries cannot make the
                // final rmdir fail with ENOTEMPTY.
                for(const entry of fs.readdirSync(target)) {
                    const child = path.join(target, entry);
                    if(NW_A3000_INITIALIZATION_FILES.has(entry.toUpperCase())) {
                        try { fs.chmodSync(child, 0o666); } catch(_) {}
                        fs.truncateSync(child, 0);
                        continue;
                    }
                    try {
                        fs.rmSync(child, { recursive: true, force: true });
                    } catch(error) {
                        // FAT removable volumes can briefly return a directory
                        // entry after the file was already removed. Electron's
                        // rimraf reports EPERM from lstat in that case.
                        if(!fs.existsSync(child)) continue;
                        try { fs.chmodSync(child, 0o666); } catch(_) {}
                        fs.rmSync(child, { recursive: true, force: true });
                    }
                }
                return;
            }
            fs.rmSync(target, { recursive: true, force: true });
        } else {
            fs.unlinkSync(target);
        }
    }

    getName(): string {
        return `Mounted Network Walkman (${this.volumeRoot})`;
    }
}
