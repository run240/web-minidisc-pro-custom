"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const networkwm_js_1 = require("networkwm-js");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const translations_1 = require("./wmd/translations");
const node_fetch_1 = __importDefault(require("node-fetch"));
const electron_store_1 = __importDefault(require("electron-store"));
const server_bootstrap_1 = require("./macos/server-bootstrap");
const child_process_1 = require("child_process");
const networkwm_service_1 = require("./wmd/networkwm-service");
const electron_context_menu_1 = __importDefault(require("electron-context-menu"));
const electron_prompt_1 = __importDefault(require("electron-prompt"));
const encryption_1 = require("networkwm-js/dist/encryption");
const async_mutex_1 = require("async-mutex");
const wusb_interop_1 = require("./wusb-interop");
const device_diagnostics_1 = require("./device-diagnostics");
function appendDiagnosticLog(category, value) {
    try {
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'wmd-diagnostic.log');
        const detail = value instanceof Error
            ? `${value.name}: ${value.message}\n${value.stack ?? ''}`
            : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        fs_1.default.appendFileSync(logPath, `[${new Date().toISOString()}] ${category}\n${detail}\n\n`, 'utf8');
    }
    catch (error) {
        console.error('Could not write diagnostic log:', error);
    }
}
process.on('uncaughtExceptionMonitor', error => appendDiagnosticLog('MAIN uncaughtException', error));
process.on('unhandledRejection', reason => appendDiagnosticLog('MAIN unhandledRejection', reason));
const getOfRenderer = (...p) => path_1.default.join(__dirname, '..', 'renderer', ...p);
async function ewmdOpenDialog(window, filters, directory) {
    const res = await electron_1.dialog.showOpenDialog(window, { filters, properties: [directory ? 'openDirectory' : 'openFile'] });
    if (res.canceled)
        return null;
    else
        return res.filePaths[0];
}
let relaunching = false;
let recentUsbTransferFailure = null;
let recentHiMDMediaMismatchAt = 0;
function reload(window) {
    if (relaunching)
        return;
    appendDiagnosticLog('APP relaunch requested', new Error('Relaunch call stack'));
    relaunching = true;
    try {
        require("./md-squirrel-main").preserveLabelDraftForRelaunch?.();
    }
    catch (error) {
        console.warn('Could not mark MiniDisc label draft for relaunch preservation:', error);
    }
    // AppImages do not restart correctly
    if (electron_1.app.isPackaged && process.env.APPIMAGE) {
        electron_1.dialog.showMessageBoxSync(window, { message: "This is an AppImage. Electron has a bug where AppImages cannot restart. Please restart the app manually" });
    }
    electron_1.app.relaunch();
    electron_1.app.exit();
}
function withTimeout(promise, timeoutMs, message, code = 'OPERATION_TIMEOUT') {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            const error = new Error(message);
            error.code = code;
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
        if (timeout)
            clearTimeout(timeout);
    });
}
function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
let rendererWarningSequence = 0;
function showRendererWarning(window, warning) {
    if (window.isDestroyed())
        return Promise.resolve(null);
    const closeChannel = `miniDiscWarningClosed:${process.pid}:${Date.now()}:${rendererWarningSequence++}`;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (_event, result = null) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            electron_1.ipcMain.removeAllListeners(closeChannel);
            resolve(result);
        };
        const timeout = setTimeout(finish, 120000);
        electron_1.ipcMain.once(closeChannel, finish);
        window.webContents.send('showMiniDiscWarning', {
            ...warning,
            closeChannel,
        });
    });
}
electron_1.app.commandLine.appendSwitch('ignore-certificate-errors');
function getUILanguage() {
    const configured = new electron_store_1.default().get('uiLanguage', 'auto');
    if (configured === 'ko' || configured === 'en')
        return configured;
    return /^ko(?:-|$)/i.test(electron_1.app.getLocale()) ? 'ko' : 'en';
}
function uiText(korean, english) {
    return getUILanguage() === 'ko' ? korean : english;
}
electron_1.ipcMain.handle('get_ui_language', () => getUILanguage());
function setupSettings(window) {
    const store = new electron_store_1.default();
    const _settings = [
        {
            family: 'Functionality',
            name: 'Language',
            async handleChange(newVal) {
                const language = ['auto', 'en', 'ko'].includes(newVal) ? newVal : 'auto';
                store.set('uiLanguage', language);
                reload(window);
            },
            state: store.get('uiLanguage', 'auto'),
            type: [
                { name: 'Automatic (System Language)', value: 'auto' },
                { name: 'English', value: 'en' },
                { name: '한국어', value: 'ko' },
            ],
        },
        {
            family: 'Functionality',
            name: 'Open Devtools',
            async handleChange() {
                window.webContents.openDevTools();
            },
            state: 0,
            type: 'action',
        },
        {
            family: 'Functionality',
            name: 'Use a Default Download Directory',
            async handleChange(newVal) {
                if (newVal) {
                    // Enabled
                    if (!store.get('downloadPath', null)) { // Match both '' and null
                        // Ask the user for the path
                        const userProvided = await ewmdOpenDialog(window, [], true);
                        if (!userProvided)
                            return; // If the user cancelled, do not write any changes
                        store.set('downloadPath', userProvided);
                    }
                }
                store.set('useDownloadPath', newVal);
            },
            state: store.get('useDownloadPath', false),
            type: 'boolean',
        },
        store.get('useDownloadPath', false) ? {
            family: 'Functionality',
            name: 'Default Download Directory',
            async handleChange(newVal) {
                if (!newVal && store.get('downloadPath', '')) {
                    // If the user cancelled, but there's a path set already, do not do anything
                    return;
                }
                if (!newVal) {
                    // The user cancelled, and there's nothing set (edge case)
                    // Disable the menu option
                    store.set('useDownloadPath', false);
                }
                store.set('downloadPath', newVal);
            },
            type: 'hostDirPath',
            state: store.get('downloadPath', ''),
        } : null,
        {
            family: 'Functionality',
            name: 'Import NetworkWM Keyring Data',
            type: 'action',
            state: 0,
            async handleChange() {
                const resp = await (0, electron_prompt_1.default)({
                    title: 'Keyring Import',
                    label: 'Please enter the keyring string below',
                    inputAttrs: {
                        type: 'text',
                    }
                }, window);
                if (resp === null)
                    return;
                let rawData;
                let backup = Object.assign({}, encryption_1.EKBROOTS);
                Object.keys(encryption_1.EKBROOTS).forEach((e) => delete encryption_1.EKBROOTS[e]);
                try {
                    rawData = Uint8Array.from(atob(resp), e => e.charCodeAt(0));
                    (0, networkwm_js_1.importKeys)(rawData);
                }
                catch (ex) {
                    electron_1.dialog.showMessageBoxSync(window, { message: 'Keyring import failed.' });
                    Object.keys(encryption_1.EKBROOTS).forEach((e) => encryption_1.EKBROOTS[e] = backup[e]);
                    return;
                }
                fs_1.default.writeFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'EKBROOTS.DES'), rawData);
                reload(window);
            }
        }
    ];
    const settings = _settings.filter(e => e);
    electron_1.ipcMain.removeHandler('setting_update');
    electron_1.ipcMain.removeHandler('fetch_settings_list');
    electron_1.ipcMain.handle("setting_update", async (_, name, newValue) => {
        const setting = settings.find(e => e.name === name);
        if (setting.handleChange) {
            await setting.handleChange(newValue);
            setupSettings(window);
        }
    });
    electron_1.ipcMain.handle("fetch_settings_list", () => {
        return settings.map(e => {
            let q = Object.assign({}, e);
            delete q['handleChange'];
            return q;
        });
    });
}
function setupEncoder() {
    function invoke(program, args) {
        return new Promise(res => {
            const name = path_1.default.basename(program);
            const process = (0, child_process_1.spawn)(program, args);
            process.on('close', (e) => res(e === 0));
            process.stdout.on('data', e => console.log(`[${name} - STDOUT]: ${e.toString().trim()}`));
            process.stderr.on('data', e => console.log(`[${name} - STDERR]: ${e.toString().trim()}`));
        });
    }
    electron_1.ipcMain.handle("invokeLocalEncoder", async (_, ffmpegPath, encoderPath, data, sourceFilename, parameters) => {
        // Pipeline:
        // inFile.ANY ==(ffmpeg)==> inFile.wav ==(encoder)==> outFile.wav
        let tempDir = '';
        if (os_1.default.platform() === 'darwin') {
            const homeDir = electron_1.app.getPath('home');
            tempDir = path_1.default.join(homeDir, 'Library', 'Caches', 'ElectronWMD');
        }
        else {
            tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'atracenc'));
        }
        if (!fs_1.default.existsSync(tempDir)) {
            fs_1.default.mkdirSync(tempDir);
        }
        const inFilePath = path_1.default.join(tempDir, sourceFilename);
        fs_1.default.writeFileSync(inFilePath, new Uint8Array(data));
        const intermediateFilePath = path_1.default.join(tempDir, "intermediate.wav");
        const ffmpegArgs = ['-i', inFilePath];
        if (parameters.enableReplayGain) {
            ffmpegArgs.push('-af', 'volume=replaygain=track');
        }
        ffmpegArgs.push('-ac', '2', '-ar', '44100', '-f', 'wav', intermediateFilePath);
        console.log(`Executing ffmpeg. ARGS: ${ffmpegArgs}`);
        await invoke(ffmpegPath, ffmpegArgs);
        const outFilePath = path_1.default.join(tempDir, "output.wav");
        const bitrateString = (parameters.format.bitrate + '');
        const allArgs = ['-e', '-br', bitrateString, intermediateFilePath, outFilePath];
        console.log(`Executing encoder EXE: ${encoderPath}. ARGS: ${allArgs}`);
        await invoke(encoderPath, allArgs);
        const rawData = new Uint8Array(fs_1.default.readFileSync(outFilePath)).buffer;
        fs_1.default.unlinkSync(outFilePath);
        fs_1.default.unlinkSync(inFilePath);
        fs_1.default.unlinkSync(intermediateFilePath);
        fs_1.default.rmdirSync(tempDir);
        return rawData;
    });
}
async function createWindow() {
    const store = new electron_store_1.default();
    const savedBounds = store.get('windowBounds', null);
    const boundsAreVisible = savedBounds && electron_1.screen.getAllDisplays().some(display => {
        const area = display.workArea;
        const overlapWidth = Math.max(0, Math.min(savedBounds.x + savedBounds.width, area.x + area.width) - Math.max(savedBounds.x, area.x));
        const overlapHeight = Math.max(0, Math.min(savedBounds.y + savedBounds.height, area.y + area.height) - Math.max(savedBounds.y, area.y));
        return overlapWidth >= 100 && overlapHeight >= 100;
    });
    const window = new electron_1.BrowserWindow({
        ...(boundsAreVisible ? savedBounds : { width: 1280, height: 900 }),
        icon: path_1.default.join(__dirname, '..', 'res', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
    });
    if (store.get('windowMaximized', false))
        window.maximize();
    let saveBoundsTimer;
    const saveWindowPlacement = () => {
        if (window.isDestroyed() || window.isMinimized())
            return;
        store.set('windowBounds', window.getNormalBounds());
        store.set('windowMaximized', window.isMaximized());
    };
    const scheduleWindowPlacementSave = () => {
        if (saveBoundsTimer)
            clearTimeout(saveBoundsTimer);
        saveBoundsTimer = setTimeout(saveWindowPlacement, 250);
    };
    window.on('move', scheduleWindowPlacementSave);
    window.on('resize', scheduleWindowPlacementSave);
    window.on('maximize', scheduleWindowPlacementSave);
    window.on('unmaximize', scheduleWindowPlacementSave);
    window.on('close', saveWindowPlacement);
    console.log(electron_1.app.getPath('exe'));
    await integrate(window);
    window.setMenuBarVisibility(false);
    await window.loadURL('file://' + getOfRenderer('index.html')); //Can't use the `sandbox://` protocol - index.html would (incorrectly) redirect to https
    window.setTitle('Web MiniDisc Pro Custom');
    window.setMenuBarVisibility(false);
    window.webContents.session.on('will-download', async (event, item, contents) => {
        let downloadPath = store.get('downloadPath', '');
        let useDownloadPath = store.get('useDownloadPath', false);
        if (downloadPath && useDownloadPath) {
            const baseFilename = item.getFilename();
            let filename = path_1.default.join(downloadPath, baseFilename);
            const { name, ext } = path_1.default.parse(baseFilename);
            let i = 1;
            while (fs_1.default.existsSync(filename)) {
                filename = path_1.default.join(downloadPath, `${name} (${i++})${ext}`);
            }
            item.setSavePath(filename);
        }
    });
}
function getDefinedFunctions(currentObj) {
    const defined = new Set();
    do {
        Object.getOwnPropertyNames(currentObj)
            .filter((n) => typeof currentObj[n] == 'function' && !(n in defined))
            .forEach(defined.add.bind(defined));
    } while ((currentObj = Object.getPrototypeOf(currentObj)));
    return defined;
}
const stagedHiMDUploads = new Map();
function traverseObject(window, objectFactory, namespace, recovery = {}) {
    let currentObj = objectFactory();
    const defined = getDefinedFunctions(currentObj);
    let hiMDRecoveryPending = false;
    let netMDRecoveryPending = false;
    defined.forEach((n) => {
        const translatedName = namespace + n;
        console.log(`[INTEGRATE]: Registering handler ${translatedName}`);
        electron_1.ipcMain.handle(translatedName, async function (_, ...allArgs) {
            var _a;
            for (let i = 0; i < allArgs.length; i++) {
                if (((_a = allArgs[i]) === null || _a === void 0 ? void 0 : _a.interprocessType) === 'stagedHiMDUpload') {
                    const staged = stagedHiMDUploads.get(allArgs[i].uploadId);
                    if (!staged)
                        throw new Error('준비된 Hi-MD 음원 데이터를 찾지 못했습니다.');
                    stagedHiMDUploads.delete(allArgs[i].uploadId);
                    const combined = fs_1.default.readFileSync(staged.path);
                    fs_1.default.unlinkSync(staged.path);
                    allArgs[i] = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength);
                    appendDiagnosticLog('Hi-MD staged upload assembled', { bytes: combined.byteLength });
                    continue;
                }
                if (((_a = allArgs[i]) === null || _a === void 0 ? void 0 : _a.interprocessType) === 'function') {
                    allArgs[i] = async (...args) => {
                        if (window.isDestroyed() || window.webContents.isDestroyed())
                            return;
                        window.webContents.send('_callback', `${translatedName}_callback${i}`, ...args);
                    };
                }
            }
            const targetObject = objectFactory();
            // The renderer polls device status once per second. A final poll
            // can arrive just after a successful mode switch has deliberately
            // closed the old NetMD handle. Treat that stale poll as an empty
            // result instead of presenting a false connection error.
            if (namespace === '_netmd_' && n === 'getDeviceStatus' && !targetObject.netmdInterface) {
                appendDiagnosticLog('Ignored stale NetMD status poll after mode switch', { at: Date.now() });
                return [null, null];
            }
            if (!targetObject.__activeIpcMethods) {
                Object.defineProperty(targetObject, '__activeIpcMethods', {
                    configurable: true,
                    value: new Set(),
                });
            }
            targetObject.__activeIpcMethods.add(n);
            if (['finalizeUpload', 'applyEditBatch', 'wipeDisc'].includes(n)) {
                appendDiagnosticLog(`IPC ${namespace}${n} started`, {
                    deviceName: targetObject.netmdInterface?.netMd?.getDeviceName?.(),
                    at: Date.now(),
                });
            }
            try {
                const isForcedTOCReload = n === 'listContent' && allArgs[0] === true;
                if (isForcedTOCReload &&
                    (targetObject.atdata !== null && targetObject.atdata !== undefined ||
                        targetObject.currentSession !== undefined ||
                        [...targetObject.__activeIpcMethods].some(method => ['prepareUpload', 'upload', 'finalizeUpload', 'download'].includes(method)))) {
                    const error = new Error('전송 중에는 디스크를 다시 검색할 수 없습니다. 전송이 끝난 뒤 다시 시도해 주세요.');
                    error.code = 'ACTIVE_TRANSFER';
                    throw error;
                }
                const operation = Promise.resolve().then(() => targetObject[n](...allArgs));
                const shouldTimeOutHiMD = namespace === '_himd_' &&
                    ['pair', 'getDeviceName', 'listContent', 'applyEditBatch', 'wipeDisc'].includes(n);
                const shouldTimeOutNetMD = namespace === '_netmd_' &&
                    (['pair', 'connect', 'applyEditBatch'].includes(n) || isForcedTOCReload);
                let result;
                if (shouldTimeOutHiMD) {
                    const hiMDWipe = n === 'wipeDisc';
                    const hiMDTimeout = n === 'applyEditBatch' || hiMDWipe ? 60000 : n === 'listContent' ? 15000 : 12000;
                    result = await withTimeout(operation, hiMDTimeout, hiMDWipe
                        ? 'Hi-MD 디스크 삭제는 기기에 반영됐지만 완료 응답을 받지 못했습니다.'
                        : n === 'applyEditBatch'
                            ? 'Hi-MD 편집 적용과 검증 시간이 초과되었습니다. 장치를 분리하지 말고 잠시 기다린 뒤, 앱이 복구되지 않으면 USB를 다시 연결해 주세요.'
                            : 'Hi-MD 파일시스템을 찾지 못했습니다. 일반 NetMD 포맷 미디어라면 USB 인터페이스가 Hi-MD 모드에 남아 있는 상태일 수 있습니다.', hiMDWipe ? 'HIMD_WIPE_TIMEOUT' : 'HIMD_TIMEOUT');
                }
                else if (shouldTimeOutNetMD) {
                    const netMDApplyEdit = n === 'applyEditBatch';
                    result = await withTimeout(operation, netMDApplyEdit ? 60000 : isForcedTOCReload ? 20000 : 15000, netMDApplyEdit
                        ? 'NetMD 편집 저장 시간이 초과되었습니다. USB 케이블을 다시 연결한 뒤 실제 제목을 확인해 주세요.'
                        : isForcedTOCReload
                            ? '디스크 다시 검색 시간이 초과되었습니다. USB 케이블을 다시 연결한 뒤 재시도해 주세요.'
                            : 'NetMD 기기 연결 응답 시간이 초과되었습니다. USB 케이블을 다시 연결한 뒤 재시도해 주세요.', netMDApplyEdit ? 'NETMD_EDIT_TIMEOUT' : isForcedTOCReload ? 'NETMD_RESCAN_TIMEOUT' : 'NETMD_TIMEOUT');
                }
                else {
                    result = await operation;
                }
                if (['finalizeUpload', 'applyEditBatch', 'wipeDisc'].includes(n)) {
                    appendDiagnosticLog(`IPC ${namespace}${n} completed`, { at: Date.now() });
                }
                if (namespace === '_himd_' && ['getDeviceName', 'listContent'].includes(n)) {
                    recentHiMDMediaMismatchAt = 0;
                }
                return [result, null];
            }
            catch (err) {
                console.log("Node Error: ");
                console.log(err);
                appendDiagnosticLog(`IPC failure ${namespace}${n}`, err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                const isUsbDeviceLostDuringTransfer = namespace === '_netmd_' &&
                    ['prepareUpload', 'upload', 'finalizeUpload'].includes(n) &&
                    /LIBUSB_TRANSFER_NO_DEVICE|TRANSFER_NO_DEVICE|NO_DEVICE/i.test(errorMessage);
                if (isUsbDeviceLostDuringTransfer) {
                    recentUsbTransferFailure = {
                        at: Date.now(),
                        namespace,
                        method: n,
                        message: errorMessage,
                    };
                    appendDiagnosticLog('NetMD transfer device loss remembered', recentUsbTransferFailure);
                }
                const isHiMDMassStorageDesync = namespace === '_himd_' &&
                    /Mass Storage Driver Error|Got a different tag/i.test(errorMessage);
                if (isHiMDMassStorageDesync && !hiMDRecoveryPending) {
                    hiMDRecoveryPending = true;
                    try {
                        await withTimeout(targetObject.finalize(), 4000, 'Hi-MD 연결 정리 시간 초과');
                    }
                    catch (cleanupError) {
                        console.log('Hi-MD mass-storage resync cleanup failed:', cleanupError);
                    }
                    recovery.rememberMode?.('himd');
                    await wait(250);
                    reload(window);
                    return [null, null];
                }
                if (err?.code === 'HIMD_WIPE_TIMEOUT' && !hiMDRecoveryPending) {
                    hiMDRecoveryPending = true;
                    try {
                        await withTimeout(targetObject.finalize(), 5000, 'Hi-MD 삭제 연결 정리 시간 초과');
                    }
                    catch (cleanupError) {
                        console.log('Timed-out Hi-MD wipe cleanup failed:', cleanupError);
                    }
                    await showRendererWarning(window, {
                        title: 'Hi-MD 디스크 삭제 완료 확인',
                        message: '삭제 명령은 기기에 전달됐지만 완료 응답을 받지 못했습니다.',
                        detail: '디스크 삭제는 이미 반영됐을 수 있습니다. 확인을 누른 뒤 기기를 다시 연결하여 디스크 내용을 확인해 주세요. 확인하기 전에는 삭제를 다시 실행하지 마세요.',
                    });
                    if (!window.isDestroyed())
                        window.webContents.reload();
                    hiMDRecoveryPending = false;
                    return [null, null];
                }
                if (err?.code === 'HIMD_TIMEOUT' && !hiMDRecoveryPending) {
                    hiMDRecoveryPending = true;
                    const shouldRetryMediaRefresh = ['getDeviceName', 'listContent'].includes(n) &&
                        recentHiMDMediaMismatchAt > 0 &&
                        Date.now() - recentHiMDMediaMismatchAt < 10 * 60 * 1000;
                    try {
                        await withTimeout(targetObject.finalize(), 4000, 'Hi-MD 연결 정리 시간 초과');
                    }
                    catch (cleanupError) {
                        console.log('Timed-out Hi-MD connection cleanup failed:', cleanupError);
                    }
                    if (shouldRetryMediaRefresh) {
                        appendDiagnosticLog('Hi-MD media refresh retry started', { method: n, at: Date.now() });
                        try {
                            await wait(1000);
                            await withTimeout(targetObject.pair(), 10000, 'Hi-MD 미디어 재인식 준비 시간이 초과되었습니다.');
                            const retryTimeout = n === 'listContent' ? 15000 : 12000;
                            const retryResult = await withTimeout(Promise.resolve().then(() => targetObject[n](...allArgs)), retryTimeout, '교체한 Hi-MD 미디어를 다시 인식하지 못했습니다.', 'HIMD_MEDIA_RETRY_TIMEOUT');
                            recentHiMDMediaMismatchAt = 0;
                            hiMDRecoveryPending = false;
                            appendDiagnosticLog('Hi-MD media refresh retry completed', { method: n, at: Date.now() });
                            return [retryResult, null];
                        }
                        catch (retryError) {
                            appendDiagnosticLog('Hi-MD media refresh retry failed', retryError);
                            try {
                                await withTimeout(targetObject.finalize(), 4000, 'Hi-MD 재시도 연결 정리 시간 초과');
                            }
                            catch (retryCleanupError) {
                                console.log('Retried Hi-MD connection cleanup failed:', retryCleanupError);
                            }
                        }
                    }
                    recentHiMDMediaMismatchAt = Date.now();
                    await showRendererWarning(window, {
                        title: 'Hi-MD 연결 시간이 초과되었습니다',
                        message: '현재 미디어에서 Hi-MD 파일시스템을 찾지 못했습니다.',
                        detail: '일반 MD가 들어 있다면 NetMD를 선택하세요. 이 디스크를 완전히 지우고 Hi-MD 형식으로 바꾸려는 경우에만 “Hi-MD로 포맷”을 누르세요.',
                        formatTarget: 'himd',
                        formatLabel: 'Hi-MD로 포맷',
                    });
                    if (!window.isDestroyed())
                        window.webContents.reload();
                    hiMDRecoveryPending = false;
                    return [null, null];
                }
                if (err?.code === 'NETMD_TIMEOUT' && !netMDRecoveryPending) {
                    netMDRecoveryPending = true;
                    try {
                        const stalledInterface = targetObject.netmdInterface;
                        targetObject.netmdInterface = undefined;
                        targetObject.dropCachedContentList?.();
                        await withTimeout(Promise.resolve(stalledInterface?.netMd?.finalize()), 3000, 'NetMD 연결 정리 시간 초과');
                    }
                    catch (cleanupError) {
                        console.log('Timed-out NetMD connection cleanup failed:', cleanupError);
                    }
                    await showRendererWarning(window, {
                        title: 'NetMD 연결 시간이 초과되었습니다',
                        message: '현재 미디어를 일반 MD(NetMD) 형식으로 읽지 못했습니다.',
                        detail: 'Hi-MD 포맷 디스크라면 Hi-MD를 선택하세요. 이 디스크를 완전히 지우고 일반 MD 형식으로 바꾸려는 경우에만 “일반 MD로 포맷”을 누르세요. 1GB Hi-MD 전용 미디어는 일반 MD로 변환할 수 없습니다.',
                        formatTarget: 'netmd',
                        formatLabel: '일반 MD로 포맷',
                    });
                    if (!window.isDestroyed())
                        window.webContents.reload();
                    netMDRecoveryPending = false;
                    return [null, null];
                }
                return [null, err];
            }
            finally {
                targetObject.__activeIpcMethods.delete(n);
            }
        });
    });
    return Array.from(defined).map(e => namespace + e);
}
async function integrate(window) {
    const webusb = wusb_interop_1.WebUSBInterop.create();
    Object.defineProperty(global, 'navigator', {
        writable: false,
        value: { usb: webusb },
    });
    Object.defineProperty(global, 'window', {
        writable: false,
        value: global,
    });
    Object.defineProperty(global, 'alert', {
        writable: false,
        value: (text) => electron_1.dialog.showMessageBoxSync(window, { message: text }),
    });
    const service = new translations_1.EWMDNetMD({ debug: true });
    let currentObj = service;
    console.log(currentObj);
    const defList = traverseObject(window, () => currentObj, "_netmd_");
    electron_1.ipcMain.handle('_netmd__definedParameters', () => defList);
    let alreadySwitched = false;
    let factoryIface = null;
    let factoryDefList = [];
    electron_1.ipcMain.handle('reload', reload.bind(null, window));
    electron_1.ipcMain.handle('getMiniDiscDiagnostics', () => (0, device_diagnostics_1.getMiniDiscDiagnostics)());
    electron_1.ipcMain.handle('buildCompactConnectionDiagnostics', (_event, errorMessage) => (0, device_diagnostics_1.buildCompactConnectionDiagnostics)({
        appVersion: electron_1.app.getVersion(),
        errorMessage: String(errorMessage ?? ''),
        userDataPath: electron_1.app.getPath('userData'),
    }));
    electron_1.ipcMain.handle('openWindowsDriverGuide', () => electron_1.dialog.showMessageBox(window, {
        type: 'info',
        title: uiText('MiniDisc WinUSB 드라이버 안내', 'MiniDisc WinUSB driver guide'),
        message: uiText('별도의 드라이버 프로그램을 설치할 필요가 없습니다.', 'You do not need to install a separate driver utility.'),
        detail: [
            uiText('1. MiniDisc 기기를 USB로 연결합니다.', '1. Connect the MiniDisc recorder over USB.'),
            uiText('2. 사용할 NetMD 또는 Hi-MD 연결 버튼을 누릅니다.', '2. Select the NetMD or Hi-MD connection button you want to use.'),
            uiText('3. WinUSB가 없으면 표시되는 안내에서 “WinUSB 설치”를 누릅니다.', '3. If WinUSB is missing, select “Install WinUSB” in the prompt.'),
            uiText('4. Windows 관리자 권한 확인 창을 허용합니다.', '4. Approve the Windows administrator permission prompt.'),
            '',
            uiText('범용 드라이버를 한 번 설치하면 지원되는 NetMD와 Hi-MD USB ID 모두에 적용됩니다.', 'The universal driver package covers all supported NetMD and Hi-MD USB IDs after one installation.'),
        ].join('\n'),
        buttons: [uiText('확인', 'OK')],
    }));
    const modeSwitchStore = new electron_store_1.default({ name: 'minidisc-mode-switch' });
    let miniDiscModeSwitchInProgress = false;
    const rememberPendingMiniDiscMode = (mode) => {
        modeSwitchStore.set('pending', {
            mode,
            createdAt: Date.now(),
            creatorPid: process.pid,
        });
    };
    const clearPendingMiniDiscMode = () => modeSwitchStore.delete('pending');
    electron_1.ipcMain.handle('consumePendingMiniDiscMode', () => {
        const pending = modeSwitchStore.get('pending', null);
        if (!pending ||
            (pending.mode !== 'netmd' && pending.mode !== 'himd') ||
            typeof pending.createdAt !== 'number' ||
            Date.now() - pending.createdAt > 60000) {
            clearPendingMiniDiscMode();
            return null;
        }
        // Do not feed the request back to the process that initiated it.
        // A relaunched app has a new PID and may consume it once.
        if (pending.creatorPid === process.pid)
            return null;
        const diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const ready = diagnostics.devices.some((device) => device.mode === pending.mode);
        if (!ready)
            return null;
        clearPendingMiniDiscMode();
        return pending.mode;
    });
    electron_1.ipcMain.handle('peekPendingMiniDiscMode', () => {
        const pending = modeSwitchStore.get('pending', null);
        if (!pending ||
            (pending.mode !== 'netmd' && pending.mode !== 'himd') ||
            typeof pending.createdAt !== 'number' ||
            Date.now() - pending.createdAt > 60000) {
            clearPendingMiniDiscMode();
            return null;
        }
        return pending.creatorPid === process.pid ? null : pending.mode;
    });
    electron_1.ipcMain.handle('restartAfterMiniDiscModeSwitch', (_event, mode) => {
        if (mode !== 'netmd' && mode !== 'himd')
            return { ok: false };
        // Store and relaunch atomically. The current renderer must not click a
        // mode card while it still contains the pre-format USB service state.
        rememberPendingMiniDiscMode(mode);
        setTimeout(() => reload(window), 25);
        return { ok: true };
    });
    const switchHiMDInterfaceToNetMD = async (device) => {
        if (!device?.supportsHiMD || device.driverStatus !== 'winusb') {
            return { ok: false, message: uiText('전환할 Hi-MD WinUSB 인터페이스를 찾지 못했습니다.', 'No Hi-MD WinUSB interface is available to switch.') };
        }
        webusb.setPreferredDevice(device);
        let driver;
        let commandError;
        try {
            if (himdService.fsDriver || himdService.himd) {
                try {
                    await withTimeout(himdService.finalize(), 4000, uiText('이전 Hi-MD 연결 정리 시간이 초과되었습니다.', 'Timed out while closing the previous Hi-MD connection.'));
                }
                catch (cleanupError) {
                    console.log('Previous Hi-MD interface cleanup failed:', cleanupError);
                }
            }
            const paired = await withTimeout(himdService.pair(), 10000, uiText(`${device.modelHint}의 Hi-MD USB 인터페이스를 여는 시간이 초과되었습니다.`, `Timed out while opening the Hi-MD USB interface on ${device.modelHint}.`));
            if (!paired || !himdService.fsDriver?.driver) {
                return { ok: false, message: uiText(`${device.modelHint}의 Hi-MD USB 인터페이스를 열지 못했습니다.`, `Could not open the Hi-MD USB interface on ${device.modelHint}.`) };
            }
            driver = himdService.fsDriver.driver;
            await withTimeout(driver.init(), 10000, uiText('Hi-MD USB 명령 인터페이스 준비 시간이 초과되었습니다.', 'Timed out while preparing the Hi-MD USB command interface.'));
            const switchCommand = new Uint8Array([
                0xc2, 0x00, 0x00, 0x10, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]);
            rememberPendingMiniDiscMode('netmd');
            try {
                await withTimeout(driver.sendCommandInGetResult(switchCommand, 0, true, switchCommand.length), 10000, uiText('NetMD 인터페이스 전환 명령 시간이 초과되었습니다.', 'The command to switch to the NetMD interface timed out.'));
            }
            catch (error) {
                // Switching interfaces disconnects the old Hi-MD USB handle before
                // the command status can be returned, so a USB error is expected.
                commandError = error;
                console.log('Hi-MD to NetMD interface switch disconnected the old handle:', error);
            }
            for (let attempt = 0; attempt < 24; attempt++) {
                await wait(500);
                const refreshed = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
                const switched = refreshed.devices.find((candidate) => candidate.mode === 'netmd');
                if (switched) {
                    webusb.setPreferredDevice(switched);
                    return {
                        ok: true,
                        message: uiText(`${switched.modelHint}이(가) NetMD USB 모드(${switched.vendorIdHex}:${switched.productIdHex})로 전환되었습니다.`, `${switched.modelHint} switched to NetMD USB mode (${switched.vendorIdHex}:${switched.productIdHex}).`),
                        device: switched,
                    };
                }
            }
            return {
                ok: false,
                message: commandError
                    ? uiText(`NetMD 인터페이스 전환 명령 후 장치가 다시 나타나지 않았습니다: ${commandError instanceof Error ? commandError.message : String(commandError)}`, `The recorder did not reappear after the command to switch to NetMD: ${commandError instanceof Error ? commandError.message : String(commandError)}`)
                    : uiText('NetMD 인터페이스 전환 명령은 완료됐지만 장치가 NetMD USB 모드로 다시 나타나지 않았습니다.', 'The switch command completed, but the recorder did not reappear in NetMD USB mode.'),
            };
        }
        catch (error) {
            clearPendingMiniDiscMode();
            return {
                ok: false,
                message: uiText(`NetMD 인터페이스 전환 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, `An error occurred while switching to the NetMD interface: ${error instanceof Error ? error.message : String(error)}`),
            };
        }
        finally {
            himdService.fsDriver = undefined;
            himdService.himd = undefined;
            himdService.cachedDisc = undefined;
            himdService.session = null;
            if (driver) {
                Promise.resolve(driver.close()).catch(() => { });
            }
        }
    };
    const hiMDProductsByNetMDProduct = new Map([
        [0x017e, [0x017f]],
        [0x0180, [0x0181]],
        [0x0182, [0x0183]],
        [0x0184, [0x0185]],
        [0x0186, [0x0187]],
        [0x0219, [0x021a]],
        [0x021b, [0x021c]],
        [0x021d, [0x022d]],
        [0x022c, [0x022d]],
        [0x0286, [0x0287]],
    ]);
    const switchNetMDInterfaceToHiMD = async (device) => {
        const expectedProducts = hiMDProductsByNetMDProduct.get(device?.productId);
        const usableDriver = process.platform === 'darwin'
            ? device?.driverStatus === 'not-applicable'
            : device?.driverStatus === 'winusb';
        if (!device?.supportsNetMD || !usableDriver || !expectedProducts) {
            return { ok: false, message: uiText('Hi-MD 전환을 지원하는 NetMD USB 인터페이스를 찾지 못했습니다.', 'No NetMD USB interface that supports switching to Hi-MD was found.') };
        }
        webusb.setPreferredDevice(device);
        let openedInterface;
        let commandError;
        try {
            if (service.netmdInterface) {
                try {
                    await withTimeout(service.finalize(), 4000, uiText('이전 NetMD 연결 정리 시간이 초과되었습니다.', 'Timed out while closing the previous NetMD connection.'));
                }
                catch (cleanupError) {
                    console.log('Previous NetMD interface cleanup failed:', cleanupError);
                }
            }
            const paired = await withTimeout(service.pair(), 12000, uiText(`${device.modelHint}의 NetMD USB 인터페이스를 여는 시간이 초과되었습니다.`, `Timed out while opening the NetMD USB interface on ${device.modelHint}.`));
            if (!paired || !service.netmdInterface) {
                return { ok: false, message: uiText(`${device.modelHint}의 NetMD USB 인터페이스를 열지 못했습니다.`, `Could not open the NetMD USB interface on ${device.modelHint}.`) };
            }
            openedInterface = service.netmdInterface;
            const openedDevice = openedInterface.netMd;
            if (openedDevice.getVendor() !== device.vendorId || openedDevice.getProduct() !== device.productId) {
                return { ok: false, message: uiText('선택한 기기와 실제 열린 기기가 달라 인터페이스 전환을 중단했습니다.', 'The interface switch was stopped because the opened recorder did not match the selected recorder.') };
            }
            try {
                // This is only the interface switch. Unlike formatToHiMD(),
                // it does not call eraseDisc() and does not modify media data.
                miniDiscModeSwitchInProgress = true;
                rememberPendingMiniDiscMode('himd');
                await withTimeout(openedInterface.enterHiMDMode(), 10000, uiText('Hi-MD 인터페이스 전환 명령 시간이 초과되었습니다.', 'The command to switch to the Hi-MD interface timed out.'));
            }
            catch (error) {
                // A successful mode change normally disconnects the NetMD handle
                // before the command response is returned.
                commandError = error;
                console.log('NetMD to Hi-MD interface switch disconnected the old handle:', error);
            }
            for (let attempt = 0; attempt < 24; attempt++) {
                await wait(500);
                const refreshed = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
                const switched = refreshed.devices.find((candidate) => candidate.vendorId === device.vendorId &&
                    expectedProducts.includes(candidate.productId));
                if (switched) {
                    webusb.setPreferredDevice(switched);
                    // macOS may enumerate the new Hi-MD USB identity before
                    // its mass-storage interface is ready for control traffic.
                    // Give the kernel a short settling window before pairing.
                    if (process.platform === 'darwin')
                        await wait(2000);
                    return {
                        ok: true,
                        message: uiText(`${switched.modelHint}이(가) Hi-MD USB 모드(${switched.vendorIdHex}:${switched.productIdHex})로 전환되었습니다.`, `${switched.modelHint} switched to Hi-MD USB mode (${switched.vendorIdHex}:${switched.productIdHex}).`),
                        device: switched,
                    };
                }
            }
            return {
                ok: false,
                message: commandError
                    ? uiText(`Hi-MD 인터페이스 전환 명령 후 장치가 다시 나타나지 않았습니다: ${commandError instanceof Error ? commandError.message : String(commandError)}`, `The recorder did not reappear after the command to switch to Hi-MD: ${commandError instanceof Error ? commandError.message : String(commandError)}`)
                    : uiText('Hi-MD 인터페이스 전환 명령은 완료됐지만 장치가 Hi-MD USB 모드로 다시 나타나지 않았습니다.', 'The switch command completed, but the recorder did not reappear in Hi-MD USB mode.'),
            };
        }
        catch (error) {
            clearPendingMiniDiscMode();
            return {
                ok: false,
                message: uiText(`Hi-MD 인터페이스 전환 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, `An error occurred while switching to the Hi-MD interface: ${error instanceof Error ? error.message : String(error)}`),
            };
        }
        finally {
            miniDiscModeSwitchInProgress = false;
            service.netmdInterface = undefined;
            service.dropCachedContentList();
            if (openedInterface) {
                Promise.resolve(openedInterface.netMd.finalize()).catch(() => { });
            }
        }
    };
    const restartMiniDiscUsbInterface = async (requestedMode, askConfirmation = true) => {
        if (process.platform !== 'win32') {
            return { ok: false, message: uiText('USB 모드 자동 전환은 Windows 전용입니다.', 'Automatic USB mode switching is available only on Windows.') };
        }
        if (requestedMode !== 'netmd' && requestedMode !== 'himd') {
            return { ok: false, message: uiText('알 수 없는 MiniDisc 연결 모드입니다.', 'Unknown MiniDisc connection mode.') };
        }
        const diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const device = diagnostics.devices.find((candidate) => candidate.mode !== requestedMode) ||
            diagnostics.devices[0];
        if (!device?.driverInstanceId) {
            return { ok: false, message: uiText('다시 시작할 MiniDisc USB 장치 인스턴스를 찾지 못했습니다.', 'Could not find the MiniDisc USB device instance to restart.') };
        }
        const modeName = requestedMode === 'netmd' ? 'NetMD' : 'Hi-MD';
        if (askConfirmation) {
            const confirmation = await electron_1.dialog.showMessageBox(window, {
                type: 'question',
                title: uiText('USB 모드 자동 전환', 'Automatic USB mode switch'),
                message: uiText(`${device.modelHint}의 USB 인터페이스를 다시 시작할까요?`, `Restart the USB interface on ${device.modelHint}?`),
                detail: [
                    uiText(`현재 USB ID: ${device.vendorIdHex}:${device.productIdHex}`, `Current USB ID: ${device.vendorIdHex}:${device.productIdHex}`),
                    uiText(`목표 모드: ${modeName}`, `Target mode: ${modeName}`),
                    '',
                    uiText('Windows 장치만 소프트웨어로 다시 시작하며 디스크 데이터는 변경하지 않습니다.', 'Only the Windows device interface will restart; disc data will not be changed.'),
                    uiText('관리자 권한 확인 창이 나타나면 허용해 주세요.', 'Approve the administrator permission prompt if it appears.'),
                ].join('\n'),
                buttons: [uiText('취소', 'Cancel'), uiText('다시 시작', 'Restart')],
                defaultId: 1,
                cancelId: 0,
                noLink: true,
            });
            if (confirmation.response === 0) {
                return { ok: false, cancelled: true };
            }
        }
        const quotePowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
        const powerShellScript = [
            '$ErrorActionPreference = "Stop"',
            `$process = Start-Process -FilePath 'pnputil.exe' -ArgumentList @('/restart-device', ${quotePowerShell(device.driverInstanceId)}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru`,
            'exit $process.ExitCode',
        ].join('\r\n');
        const encodedScript = Buffer.from(powerShellScript, 'utf16le').toString('base64');
        try {
            const exitCode = await new Promise((resolve, reject) => {
                const child = (0, child_process_1.spawn)('powershell.exe', [
                    '-NoProfile',
                    '-NonInteractive',
                    '-EncodedCommand',
                    encodedScript,
                ], { windowsHide: true, stdio: 'ignore' });
                const timeout = setTimeout(() => {
                    try {
                        child.kill();
                    }
                    catch (_) { }
                    reject(new Error(uiText('Windows 장치 다시 시작 시간이 초과되었습니다.', 'The Windows device restart timed out.')));
                }, 60000);
                child.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
                child.once('exit', (code) => {
                    clearTimeout(timeout);
                    resolve(code ?? -1);
                });
            });
            if (exitCode !== 0) {
                return { ok: false, message: uiText(`Windows가 장치 다시 시작을 완료하지 못했습니다. 종료 코드: ${exitCode}`, `Windows could not restart the device. Exit code: ${exitCode}`) };
            }
            for (let attempt = 0; attempt < 16; attempt++) {
                await wait(500);
                const refreshed = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
                const switched = refreshed.devices.find((candidate) => candidate.mode === requestedMode);
                if (switched) {
                    webusb.setPreferredDevice(switched);
                    return {
                        ok: true,
                        message: uiText(`${switched.modelHint}이(가) ${modeName} USB 모드(${switched.vendorIdHex}:${switched.productIdHex})로 다시 연결되었습니다.`, `${switched.modelHint} reconnected in ${modeName} USB mode (${switched.vendorIdHex}:${switched.productIdHex}).`),
                        device: switched,
                    };
                }
            }
            return {
                ok: false,
                message: uiText(`장치는 다시 시작했지만 ${modeName} USB 모드로 바뀌지 않았습니다. 이 기기에서는 한 번의 물리적 USB 재연결이 필요할 수 있습니다.`, `The device restarted but did not switch to ${modeName} USB mode. This recorder may require one physical USB reconnection.`),
            };
        }
        catch (error) {
            return {
                ok: false,
                message: uiText(`USB 장치 다시 시작 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, `An error occurred while restarting the USB device: ${error instanceof Error ? error.message : String(error)}`),
            };
        }
    };
    electron_1.ipcMain.handle('restartMiniDiscUsbInterface', (_, requestedMode) => restartMiniDiscUsbInterface(requestedMode, true));
    electron_1.ipcMain.handle('prepareMiniDiscConnection', async (_, requestedMode, selectedDeviceId) => {
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
            return { proceed: true };
        }
        if (requestedMode !== 'netmd' && requestedMode !== 'himd') {
            return { proceed: false, message: uiText('알 수 없는 MiniDisc 연결 모드입니다.', 'Unknown MiniDisc connection mode.') };
        }
        // On macOS, Hi-MD runs in the privileged helper while NetMD runs in
        // the main process.  Only perform the safe NetMD -> Hi-MD interface
        // switch here; leave NetMD requests to the original connection flow.
        if (process.platform === 'darwin' && requestedMode !== 'himd') {
            return { proceed: true };
        }
        // RH1-class devices need a short settling period after a physical
        // media change. Opening the mass-storage interface too early can
        // leave the first Hi-MD attempt waiting until its timeout.
        if (requestedMode === 'himd') {
            await wait(1500);
        }
        let diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        let candidates = diagnostics.devices.filter((device) => requestedMode === 'netmd' ? device.supportsNetMD : device.supportsHiMD);
        if (candidates.length === 0 && diagnostics.devices.length > 0) {
            const hiMDDevice = requestedMode === 'netmd'
                ? diagnostics.devices.find((device) => device.supportsHiMD && device.mode === 'himd')
                : undefined;
            const netMDDevice = requestedMode === 'himd'
                ? diagnostics.devices.find((device) => device.supportsNetMD &&
                    device.mode === 'netmd' &&
                    hiMDProductsByNetMDProduct.has(device.productId))
                : undefined;
            if (process.platform === 'win32' && netMDDevice && netMDDevice.driverStatus !== 'winusb') {
                return {
                    proceed: false,
                    modeSwitchFailed: true,
                    warning: {
                        title: uiText('먼저 NetMD 드라이버를 설치해 주세요', 'Install the NetMD driver first'),
                        message: uiText(`${netMDDevice.modelHint}이(가) 현재 NetMD 모드이지만 WinUSB 드라이버가 설치되지 않았습니다.`, `${netMDDevice.modelHint} is in NetMD mode, but its WinUSB driver is not installed.`),
                        detail: [
                            uiText('처음 연결할 때는 모드 선택 화면에서 NetMD를 먼저 눌러 WinUSB 드라이버를 설치하세요.', 'For the first connection, select NetMD on the mode screen and install the WinUSB driver.'),
                            uiText('설치가 완료되면 다시 Hi-MD를 선택하면 USB 모드를 자동으로 전환할 수 있습니다.', 'After installation, select Hi-MD again to switch the USB mode automatically.'),
                            '',
                            uiText('디스크 데이터는 변경되지 않습니다.', 'Disc data will not be changed.'),
                        ].join('\n'),
                    },
                };
            }
            if (process.platform === 'darwin' && netMDDevice) {
                webusb.clearPreferredDevice();
                return {
                    proceed: false,
                    modeSwitchFailed: true,
                    warning: {
                        title: uiText('일반 MD가 들어 있습니다', 'A standard MiniDisc is inserted'),
                        message: uiText(`${netMDDevice.modelHint}이(가) 현재 일반 MD(NetMD) 모드입니다.`, `${netMDDevice.modelHint} is currently in standard MiniDisc (NetMD) mode.`),
                        detail: [
                            uiText('디스크의 내용을 유지하려면 닫은 뒤 NetMD로 연결하세요.', 'To keep the contents of this disc, close this message and connect in NetMD mode.'),
                            '',
                            uiText('기존 Hi-MD 미디어로 교체하려면 아래 버튼에서 “RAM 패치만 적용”을 선택하세요.', 'To swap to an existing Hi-MD disc, choose “Apply RAM patch only” below.'),
                            uiText('일반 MD 자체를 Hi-MD로 바꾸려는 경우에만 포맷을 선택하세요.', 'Choose format only if you intend to convert this standard MiniDisc to Hi-MD.'),
                            uiText('포맷하면 현재 디스크의 모든 트랙과 제목이 영구적으로 삭제됩니다.', 'Formatting permanently deletes every track and title on the current disc.'),
                        ].join('\n'),
                        formatTarget: 'himd',
                        formatLabel: uiText('Hi-MD 준비 / 포맷', 'Prepare / format Hi-MD'),
                    },
                };
            }
            if (hiMDDevice) {
                const choice = await showRendererWarning(window, {
                    title: uiText('Hi-MD에서 NetMD로 전환', 'Switch from Hi-MD to NetMD'),
                    message: uiText('현재 기기는 Hi-MD USB 모드입니다. 어떻게 진행할까요?', 'The recorder is currently in Hi-MD USB mode. How would you like to continue?'),
                    detail: [
                        uiText('Hi-MD 포맷 미디어를 NetMD로 열면 빈 디스크처럼 보일 수 있습니다.', 'A Hi-MD-formatted disc can appear blank when opened in NetMD mode.'),
                        uiText('이 상태에서 녹음을 시작하면 기기가 미디어를 일반 MD 형식으로 다시 기록하여 기존 Hi-MD 데이터가 사라질 수 있습니다.', 'Starting a recording in this state may rewrite the media as standard MD and erase existing Hi-MD data.'),
                        '',
                        uiText('“NetMD로 전환만”은 디스크를 즉시 지우지는 않지만, 이후 녹음은 형식을 변경할 수 있습니다.', '“Switch to NetMD only” does not immediately erase the disc, but a later recording can change its format.'),
                        uiText('“일반 MD로 포맷”은 확인 절차를 한 번 더 거친 뒤 모든 데이터를 삭제합니다.', '“Format as standard MD” asks for confirmation again and then deletes all data.'),
                        uiText('1GB Hi-MD 전용 미디어는 일반 MD로 포맷할 수 없습니다.', 'Dedicated 1GB Hi-MD media cannot be formatted as standard MD.'),
                    ].join('\n'),
                    choices: [
                        { value: 'cancel', label: uiText('취소', 'Cancel'), kind: 'secondary' },
                        { value: 'switch', label: uiText('NetMD로 전환만', 'Switch to NetMD only'), kind: 'primary' },
                        { value: 'format', label: uiText('일반 MD로 포맷', 'Format as standard MD'), kind: 'danger' },
                    ],
                    cancelValue: 'cancel',
                });
                if (choice === null || choice === 'cancel') {
                    return { proceed: false, cancelled: true };
                }
                if (choice === 'format') {
                    const formatResult = await formatStandardMDToNetMD();
                    if (formatResult?.cancelled) {
                        return { proceed: false, cancelled: true };
                    }
                    if (formatResult?.ok && formatResult.switchRequested) {
                        rememberPendingMiniDiscMode('netmd');
                        reload(window);
                        return { proceed: false, formatting: true };
                    }
                    return {
                        proceed: false,
                        modeSwitchFailed: true,
                        warning: {
                            title: formatResult?.cancelled ? uiText('포맷을 취소했습니다', 'Formatting cancelled') : uiText('일반 MD 포맷 실패', 'Standard MD format failed'),
                            message: formatResult?.message || uiText('미디어를 일반 MD로 포맷하지 못했습니다.', 'The media could not be formatted as a standard MiniDisc.'),
                            detail: uiText('디스크 상태는 자동으로 변경하지 않았습니다.', 'The disc state was not changed automatically.'),
                        },
                    };
                }
            }
            if (netMDDevice && process.platform === 'win32') {
                const choice = await showRendererWarning(window, {
                    title: uiText('NetMD에서 Hi-MD로 전환', 'Switch from NetMD to Hi-MD'),
                    message: uiText('현재 기기는 NetMD USB 모드입니다. 어떻게 진행할까요?', 'The recorder is currently in NetMD USB mode. How would you like to continue?'),
                    detail: [
                        uiText('일반 MD 미디어를 Hi-MD로 열면 파일시스템을 찾지 못할 수 있습니다.', 'A standard MiniDisc may not contain a readable Hi-MD filesystem.'),
                        '',
                        uiText('“Hi-MD로 전환만”은 디스크 데이터를 변경하지 않습니다.', '“Switch to Hi-MD only” does not change disc data.'),
                        uiText('“Hi-MD로 포맷”은 확인 절차를 한 번 더 거친 뒤 모든 트랙과 제목을 삭제합니다.', '“Format as Hi-MD” asks for confirmation again and then deletes all tracks and titles.'),
                    ].join('\n'),
                    choices: [
                        { value: 'cancel', label: uiText('취소', 'Cancel'), kind: 'secondary' },
                        { value: 'switch', label: uiText('Hi-MD로 전환만', 'Switch to Hi-MD only'), kind: 'primary' },
                        { value: 'format', label: uiText('Hi-MD로 포맷', 'Format as Hi-MD'), kind: 'danger' },
                    ],
                    cancelValue: 'cancel',
                });
                if (choice === null || choice === 'cancel') {
                    return { proceed: false, cancelled: true };
                }
                if (choice === 'format') {
                    const formatResult = await formatStandardMDToHiMD();
                    if (formatResult?.cancelled) {
                        return { proceed: false, cancelled: true };
                    }
                    if (formatResult?.ok && formatResult.switchRequested) {
                        rememberPendingMiniDiscMode('himd');
                        reload(window);
                        return { proceed: false, formatting: true };
                    }
                    return {
                        proceed: false,
                        modeSwitchFailed: true,
                        warning: {
                            title: formatResult?.cancelled ? uiText('포맷을 취소했습니다', 'Formatting cancelled') : uiText('Hi-MD 포맷 실패', 'Hi-MD format failed'),
                            message: formatResult?.message || uiText('미디어를 Hi-MD로 포맷하지 못했습니다.', 'The media could not be formatted as Hi-MD.'),
                            detail: uiText('포맷이 완료됐다는 안내가 없었다면 디스크를 분리하지 말고 현재 상태를 다시 확인하세요.', 'If completion was not confirmed, do not remove the disc; check the current recorder state first.'),
                        },
                    };
                }
            }
            const restartResult = hiMDDevice
                ? await switchHiMDInterfaceToNetMD(hiMDDevice)
                : netMDDevice
                    ? await switchNetMDInterfaceToHiMD(netMDDevice)
                    : await restartMiniDiscUsbInterface(requestedMode, false);
            if (restartResult.ok) {
                diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
                candidates = diagnostics.devices.filter((device) => requestedMode === 'netmd' ? device.supportsNetMD : device.supportsHiMD);
            }
            else {
                return {
                    proceed: false,
                    modeSwitchFailed: true,
                    warning: {
                        title: uiText('USB 모드 자동 전환 실패', 'Automatic USB mode switch failed'),
                        message: restartResult.message || uiText('MiniDisc USB 모드를 자동으로 전환하지 못했습니다.', 'The MiniDisc USB mode could not be switched automatically.'),
                        detail: uiText('디스크 데이터는 변경되지 않았습니다. 잠시 기다린 뒤 같은 연결 버튼을 다시 눌러보세요.', 'Disc data was not changed. Wait briefly, then select the same connection button again.'),
                    },
                };
            }
        }
        if (candidates.length === 0) {
            webusb.clearPreferredDevice();
            // Let the original connection flow display its normal no-device dialog.
            return { proceed: true };
        }
        let device = candidates[0];
        if (candidates.length > 1) {
            const getSelectionId = (candidate) => [
                candidate.vendorIdHex,
                candidate.productIdHex,
                candidate.busNumber ?? '',
                candidate.deviceAddress ?? '',
            ].join(':');
            device = selectedDeviceId
                ? candidates.find((candidate) => getSelectionId(candidate) === selectedDeviceId)
                : undefined;
            if (!device) {
                webusb.clearPreferredDevice();
                return {
                    proceed: false,
                    selectionRequired: true,
                    requestedMode,
                    candidates: candidates.map((candidate) => ({
                        selectionId: getSelectionId(candidate),
                        modelHint: candidate.modelHint,
                        vendorIdHex: candidate.vendorIdHex,
                        productIdHex: candidate.productIdHex,
                        busNumber: candidate.busNumber,
                        deviceAddress: candidate.deviceAddress,
                        mode: candidate.mode,
                        driverStatus: candidate.driverStatus,
                    })),
                };
            }
        }
        webusb.setPreferredDevice(device);
        if (process.platform === 'darwin') {
            return { proceed: true, device };
        }
        if (device.driverStatus === 'winusb') {
            return { proceed: true, device };
        }
        const modeName = requestedMode === 'netmd' ? 'NetMD' : 'Hi-MD';
        const currentDriver = device.driverName || {
            usbstor: 'USBSTOR',
            unknown: uiText('확인되지 않음', 'Unknown'),
            other: uiText('다른 드라이버', 'Other driver'),
        }[device.driverStatus] || device.driverStatus;
        const confirmation = await electron_1.dialog.showMessageBox(window, {
            type: 'warning',
            title: uiText('WinUSB 드라이버가 필요합니다', 'WinUSB driver required'),
            message: uiText(`${device.modelHint}을(를) ${modeName}로 연결하려면 WinUSB가 필요합니다.`, `WinUSB is required to connect ${device.modelHint} in ${modeName} mode.`),
            detail: [
                `USB ID: ${device.vendorIdHex}:${device.productIdHex}`,
                uiText(`현재 드라이버: ${currentDriver}`, `Current driver: ${currentDriver}`),
                '',
                uiText('확인을 누르면 지원되는 MiniDisc 기기용 범용 WinUSB 드라이버를 설치합니다.', 'Continue to install the universal WinUSB driver for supported MiniDisc recorders.'),
                uiText('현재 연결된 기기에 즉시 적용되고 다른 지원 USB ID에도 자동으로 사용할 수 있습니다.', 'It is applied to the connected recorder immediately and can be used automatically for other supported USB IDs.'),
                uiText('드라이버 카탈로그 검증을 위해 자체 서명된 테스트 드라이버 인증서를', 'To validate the driver catalog, a self-signed test driver certificate will be added'),
                uiText('이 PC의 로컬 컴퓨터 루트 및 신뢰할 수 있는 게시자 저장소에 추가합니다.', 'to the Local Machine Root and Trusted Publishers certificate stores on this PC.'),
                uiText('관리자 권한 확인 창(UAC)이 나타나면 허용해 주세요.', 'Approve the administrator permission prompt (UAC) when it appears.'),
                '',
                uiText('설치 중에는 USB 케이블을 분리하지 마세요.', 'Do not disconnect the USB cable during installation.'),
            ].join('\n'),
            buttons: [uiText('취소', 'Cancel'), uiText('WinUSB 설치', 'Install WinUSB')],
            defaultId: 1,
            cancelId: 0,
            noLink: true,
        });
        if (confirmation.response === 0) {
            return { proceed: false, cancelled: true };
        }
        const extrasDirectory = path_1.default.join(electron_1.app.getAppPath(), 'extras');
        const bundledDriverDirectory = path_1.default.join(extrasDirectory, 'drivers', 'winusb');
        const bundledDriverInfPath = path_1.default.join(bundledDriverDirectory, 'web_minidisc_winusb.inf');
        const bundledDriverCatalogPath = path_1.default.join(bundledDriverDirectory, 'web_minidisc_winusb.cat');
        const bundledDriverCertificatePath = path_1.default.join(bundledDriverDirectory, 'web_minidisc_winusb.cer');
        if (![bundledDriverInfPath, bundledDriverCatalogPath, bundledDriverCertificatePath]
            .every(filePath => fs_1.default.existsSync(filePath))) {
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('WinUSB 드라이버 패키지를 찾을 수 없습니다', 'WinUSB driver package not found'),
                message: uiText('내장된 범용 MiniDisc WinUSB 드라이버가 누락되었습니다.', 'The bundled universal MiniDisc WinUSB driver is missing.'),
                detail: bundledDriverDirectory,
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerMissing: true };
        }
        const publishDriverInstallStatus = (status) => {
            if (!window.isDestroyed()) {
                window.webContents.send('miniDiscDriverInstallStatus', {
                    deviceName: device.modelHint,
                    modeName,
                    ...status,
                });
            }
        };
        const driverWorkDirectory = path_1.default.join(electron_1.app.getPath('temp'), 'WebMiniDisc-Pro-Driver', `${device.vendorIdHex}_${device.productIdHex}`);
        const installerResultPath = path_1.default.join(driverWorkDirectory, 'installer-result.txt');
        fs_1.default.mkdirSync(driverWorkDirectory, { recursive: true });
        fs_1.default.writeFileSync(installerResultPath, 'awaiting-elevation', 'utf8');
        const quotePowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
        const bundledDriverInstallScript = [
            `& certutil.exe -addstore -f Root ${quotePowerShell(bundledDriverCertificatePath)}`,
            'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
            `& certutil.exe -addstore -f TrustedPublisher ${quotePowerShell(bundledDriverCertificatePath)}`,
            'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
            `& pnputil.exe /add-driver ${quotePowerShell(bundledDriverInfPath)} /install`,
            'exit $LASTEXITCODE',
        ].join('\r\n');
        const encodedBundledDriverInstallScript = Buffer.from(bundledDriverInstallScript, 'utf16le').toString('base64');
        const startInstallerCommand = [
            `$process = Start-Process -FilePath 'powershell.exe'`,
            `-ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',${quotePowerShell(encodedBundledDriverInstallScript)})`,
            // Let Windows show UAC normally. The elevated PowerShell hides its own
            // console only after consent has been accepted.
            '-Verb RunAs -PassThru',
        ].join(' ');
        const powerShellScript = [
            'try {',
            `  ${startInstallerCommand}`,
            `  [System.IO.File]::WriteAllText(${quotePowerShell(installerResultPath)}, ('running:' + [string]$process.Id))`,
            '  $process.WaitForExit()',
            `  [System.IO.File]::WriteAllText(${quotePowerShell(installerResultPath)}, [string]$process.ExitCode)`,
            '  exit 0',
            '} catch {',
            `  [System.IO.File]::WriteAllText(${quotePowerShell(installerResultPath)}, ('launch-error:' + $_.Exception.Message))`,
            '  exit 1',
            '}',
        ].join('\r\n');
        const encodedPowerShellScript = Buffer.from(powerShellScript, 'utf16le').toString('base64');
        let powerShellExitCode = -1;
        let installerTimedOut = false;
        publishDriverInstallStatus({
            phase: 'installing',
            startedAt: Date.now(),
            timeoutMs: 180000,
        });
        // Do not enumerate PnP devices while Windows is updating the driver store.
        // Verify once after the elevated pnputil process exits.
        try {
            const installerProcessResult = await new Promise((resolve, reject) => {
                const child = (0, child_process_1.spawn)('powershell.exe', [
                    '-NoProfile',
                    '-NonInteractive',
                    '-EncodedCommand',
                    encodedPowerShellScript,
                ], {
                    // The non-elevated watcher has no UI. Windows still displays
                    // the secure-desktop UAC prompt for the elevated child.
                    windowsHide: true,
                    stdio: 'ignore',
                });
                let settled = false;
                const finish = (result) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve(result);
                };
                const timeout = setTimeout(() => {
                    try {
                        child.kill();
                    }
                    catch (_) {
                        // The elevated helper has its own timeout and may already be exiting.
                    }
                    finish({ code: -1, timedOut: true });
                }, 180000);
                child.once('error', (error) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeout);
                    reject(error);
                });
                child.once('exit', (code) => finish({ code: code ?? -1, timedOut: false }));
            });
            powerShellExitCode = installerProcessResult.code;
            installerTimedOut = installerProcessResult.timedOut;
        }
        catch (error) {
            publishDriverInstallStatus({ phase: 'close' });
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('설치 도우미 실행 실패', 'Could not start the installer'),
                message: uiText('내장 WinUSB 설치 엔진을 실행하지 못했습니다.', 'The bundled WinUSB installation engine could not be started.'),
                detail: error instanceof Error ? error.message : String(error),
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerFailed: true };
        }
        if (installerTimedOut) {
            publishDriverInstallStatus({ phase: 'close' });
            let timedOutStage = uiText('설치 도우미의 상태를 확인하지 못했습니다.', 'The installer status could not be determined.');
            try {
                const installerState = fs_1.default.readFileSync(installerResultPath, 'utf8').trim();
                if (installerState === 'awaiting-elevation') {
                    timedOutStage = uiText('관리자 권한 확인(UAC)이 완료되지 않았거나 설치 도우미가 시작되지 않았습니다.', 'The administrator permission prompt (UAC) was not completed, or the installer did not start.');
                }
                else if (installerState.startsWith('running:')) {
                    timedOutStage = uiText(`설치 도우미가 실행 중 응답하지 않았습니다. 프로세스 ID: ${installerState.slice('running:'.length) || '확인 불가'}`, `The installer stopped responding. Process ID: ${installerState.slice('running:'.length) || 'unknown'}`);
                }
            }
            catch (_) {
                // Keep the generic stage message when the state file cannot be read.
            }
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('WinUSB 설치 응답 없음', 'WinUSB installer not responding'),
                message: uiText('설치 도우미가 제한 시간 안에 응답하지 않았습니다.', 'The installer did not respond before the timeout.'),
                detail: [
                    timedOutStage,
                    uiText('관리자 권한 확인 창, 다른 드라이버 설치, SonicStage/OpenMG 등 기기를 사용 중인 프로그램을 확인해 주세요.', 'Check the UAC prompt, other driver installations, and programs using the recorder such as SonicStage or OpenMG.'),
                    uiText('앱을 종료한 뒤 USB를 다시 연결하거나 Windows를 재시작한 다음 같은 모드에서 다시 설치할 수 있습니다.', 'Quit the app, reconnect USB or restart Windows, and then install again in the same mode.'),
                ].join('\n'),
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerFailed: true, installerTimedOut: true };
        }
        publishDriverInstallStatus({ phase: 'verifying' });
        const installerResult = fs_1.default.readFileSync(installerResultPath, 'utf8').trim();
        if (installerResult.startsWith('launch-error:')) {
            publishDriverInstallStatus({ phase: 'close' });
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('설치 도우미 실행 실패', 'Could not start the installer'),
                message: uiText('관리자 권한으로 설치 엔진을 시작하지 못했습니다.', 'The installation engine could not be started with administrator privileges.'),
                detail: installerResult.slice('launch-error:'.length) || uiText('Windows가 실행 요청을 거부했습니다.', 'Windows rejected the launch request.'),
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerFailed: true };
        }
        const installerExitCode = Number.parseInt(installerResult, 10);
        if (!Number.isFinite(installerExitCode)) {
            publishDriverInstallStatus({ phase: 'close' });
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('설치 결과 확인 실패', 'Could not verify the installation result'),
                message: uiText('설치 엔진의 결과를 읽지 못했습니다.', 'The result from the installation engine could not be read.'),
                detail: uiText(`PowerShell 종료 코드: ${powerShellExitCode}`, `PowerShell exit code: ${powerShellExitCode}`),
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerFailed: true };
        }
        await new Promise(resolve => setTimeout(resolve, 1200));
        const refreshedDiagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const refreshedDevice = refreshedDiagnostics.devices.find((candidate) => candidate.vendorId === device.vendorId &&
            candidate.productId === device.productId);
        if (refreshedDevice?.driverStatus === 'winusb') {
            webusb.setPreferredDevice(refreshedDevice);
            publishDriverInstallStatus({ phase: 'close' });
            await electron_1.dialog.showMessageBox(window, {
                type: 'info',
                title: uiText('WinUSB 설치 완료', 'WinUSB installation complete'),
                message: uiText(`${device.modelHint}의 WinUSB 드라이버를 설치했습니다.`, `The WinUSB driver for ${device.modelHint} was installed.`),
                detail: installerExitCode === 0
                    ? uiText(`${modeName} 연결을 계속합니다.`, `Continuing the ${modeName} connection.`)
                    : uiText(`Windows에서 설치 성공을 확인했습니다. 설치 엔진의 마지막 응답(${installerExitCode})은 기기 재연결 과정에서 끊겼지만 정상입니다.`, `Windows confirmed successful installation. The installation engine's final response (${installerExitCode}) was interrupted while the recorder reconnected, which is expected.`),
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: true, installed: true, device: refreshedDevice };
        }
        if (installerExitCode !== 0) {
            const installerErrorDescriptions = {
                '-1': uiText('드라이버 파일 입출력 오류', 'Driver file I/O error'),
                '-2': uiText('잘못된 설치 인수', 'Invalid installation arguments'),
                '-3': uiText('드라이버 작업 폴더 접근 실패', 'Could not access the driver working directory'),
                '-4': uiText('연결된 대상 기기를 찾지 못함', 'The connected target recorder was not found'),
                '-6': uiText('기기가 다른 프로그램에서 사용 중', 'The recorder is in use by another program'),
                '-7': uiText('드라이버 설치 시간 초과', 'Driver installation timed out'),
                '-9': uiText('Windows에서 다른 드라이버 설치가 진행 중', 'Another driver installation is in progress'),
                '-11': uiText('드라이버 설치 리소스 처리 오류', 'Driver installation resource error'),
                '-14': uiText('사용자가 설치를 취소함', 'Installation was cancelled by the user'),
                '-15': uiText('관리자 권한이 필요함', 'Administrator privileges are required'),
                '-17': uiText('생성된 INF 파일 구문 오류', 'Generated INF syntax error'),
                '-18': uiText('드라이버 서명 카탈로그 누락', 'Driver signature catalog is missing'),
                '-19': uiText('Windows가 드라이버 서명을 거부함', 'Windows rejected the driver signature'),
            };
            publishDriverInstallStatus({ phase: 'close' });
            await electron_1.dialog.showMessageBox(window, {
                type: 'error',
                title: uiText('WinUSB 설치 실패', 'WinUSB installation failed'),
                message: uiText('드라이버 설치를 완료하지 못했습니다.', 'Driver installation could not be completed.'),
                detail: `${installerErrorDescriptions[String(installerExitCode)] || uiText('알 수 없는 설치 오류', 'Unknown installation error')}\n${uiText('설치 엔진 종료 코드', 'Installation engine exit code')}: ${installerExitCode}`,
                buttons: [uiText('확인', 'OK')],
            });
            return { proceed: false, installerFailed: true, installerExitCode };
        }
        publishDriverInstallStatus({ phase: 'close' });
        await electron_1.dialog.showMessageBox(window, {
            type: 'info',
            title: uiText('WinUSB 설치 완료', 'WinUSB installation complete'),
            message: uiText('드라이버 설치를 완료했습니다.', 'Driver installation is complete.'),
            detail: uiText('기기가 아직 다시 표시되지 않습니다. USB 케이블을 뺐다가 다시 연결한 뒤 같은 연결 버튼을 눌러주세요.', 'The recorder has not reappeared yet. Reconnect the USB cable, then select the same connection button.'),
            buttons: [uiText('확인', 'OK')],
        });
        return {
            proceed: false,
            installed: true,
            reconnectRequired: true,
            device,
        };
    });
    let formatStandardMDToNetMDOnMac;
    const formatStandardMDToNetMD = async () => {
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
            return { ok: false, message: uiText('이 운영체제에서는 일반 MD 포맷을 지원하지 않습니다.', 'Formatting as a standard MiniDisc is not supported on this operating system.') };
        }
        const diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const hiMDDevices = diagnostics.devices.filter(device => device.supportsHiMD);
        if (hiMDDevices.length === 0) {
            return { ok: false, message: uiText('Hi-MD 모드로 연결된 지원 기기를 찾지 못했습니다.', 'No supported recorder connected in Hi-MD mode was found.') };
        }
        if (hiMDDevices.length > 1) {
            return { ok: false, message: uiText('안전을 위해 포맷할 Hi-MD 기기 하나만 USB에 연결해 주세요.', 'For safety, connect only the one Hi-MD recorder you intend to format.') };
        }
        const hiMDDevice = hiMDDevices[0];
        if (process.platform === 'win32' && hiMDDevice.driverStatus !== 'winusb') {
            return {
                ok: false,
                message: `${hiMDDevice.modelHint}의 현재 Hi-MD 인터페이스에 WinUSB를 먼저 설치해 주세요.`,
            };
        }
        const confirmation = await showRendererWarning(window, {
            title: uiText('NetMD로 포맷', 'Format as NetMD'),
            message: uiText('현재 디스크를 일반 MD(NetMD)용으로 초기화하시겠습니까?', 'Initialize the current disc for standard MiniDisc (NetMD) use?'),
            detail: [
                uiText('디스크의 모든 트랙과 데이터가 영구적으로 삭제됩니다.', 'Every track and all data on the disc will be permanently deleted.'),
                uiText('60/74/80분 일반 MD만 변환할 수 있습니다.', 'Only standard 60/74/80-minute MiniDiscs can be converted.'),
                uiText('1GB Hi-MD 전용 미디어에는 사용할 수 없습니다.', 'This cannot be used with dedicated 1GB Hi-MD media.'),
                '',
                uiText(`대상 기기: ${hiMDDevice.modelHint} (${hiMDDevice.vendorIdHex}:${hiMDDevice.productIdHex})`, `Target device: ${hiMDDevice.modelHint} (${hiMDDevice.vendorIdHex}:${hiMDDevice.productIdHex})`),
                uiText('포맷 후 기기의 USB 인터페이스를 NetMD로 전환합니다.', 'After formatting, the recorder USB interface will switch to NetMD.'),
            ].join('\n'),
            choices: [
                { value: 'cancel', label: uiText('취소', 'Cancel'), kind: 'secondary' },
                { value: 'format', label: uiText('모든 데이터를 지우고 NetMD로 포맷', 'Erase all data and format as NetMD'), kind: 'danger' },
            ],
            cancelValue: 'cancel',
        });
        if (confirmation !== 'format') {
            return { ok: false, cancelled: true, message: uiText('포맷을 취소했습니다.', 'Formatting was cancelled.') };
        }
        if (process.platform === 'darwin') {
            if (!formatStandardMDToNetMDOnMac)
                return { ok: false, message: uiText('macOS Hi-MD 포맷 도우미가 아직 준비되지 않았습니다.', 'The macOS Hi-MD formatting helper is not ready.') };
            return await formatStandardMDToNetMDOnMac(hiMDDevice);
        }
        webusb.setPreferredDevice(hiMDDevice);
        try {
            if (himdService.atdata !== null) {
                return { ok: false, message: 'Hi-MD 전송 작업이 진행 중입니다. 작업을 마친 뒤 다시 시도해 주세요.' };
            }
            if (himdService.fsDriver || himdService.himd) {
                try {
                    await withTimeout(himdService.finalize(), 4000, '이전 Hi-MD 연결 정리 시간이 초과되었습니다.');
                }
                catch (cleanupError) {
                    console.log('Previous Hi-MD format connection cleanup failed:', cleanupError);
                }
            }
            const paired = await withTimeout(himdService.pair(), 10000, `${hiMDDevice.modelHint}의 Hi-MD USB 인터페이스를 여는 시간이 초과되었습니다.`);
            if (!paired) {
                return { ok: false, message: `${hiMDDevice.modelHint}의 Hi-MD 인터페이스를 열지 못했습니다.` };
            }
            await withTimeout(himdService.initHiMD(), 30000, 'Hi-MD 파일시스템을 읽는 시간이 초과되었습니다. 일반 MD가 들어 있다면 USB를 다시 연결해 주세요.', 'HIMD_TIMEOUT');
            const capacity = await withTimeout(himdService.fsDriver.getTotalSpace(), 10000, '디스크 용량 확인 시간이 초과되었습니다.');
            if (capacity > 500000000) {
                return {
                    ok: false,
                    message: '1GB Hi-MD 전용 미디어는 일반 MD 형식으로 변환할 수 없습니다.',
                };
            }
            const driver = himdService.fsDriver.driver;
            await driver.wipe();
            const switchCommand = new Uint8Array([
                0xc2, 0x00, 0x00, 0x10, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]);
            let switchError;
            try {
                await driver.sendCommandInGetResult(switchCommand, 0, true, switchCommand.length);
            }
            catch (error) {
                // A successful interface switch normally disconnects the Hi-MD USB ID before
                // the command result can be returned, which surfaces as a USB error.
                switchError = error;
                console.log('MiniDisc interface switch disconnected the Hi-MD handle:', error);
            }
            return {
                ok: true,
                erased: true,
                switchRequested: true,
                capacity,
                message: switchError
                    ? '디스크 초기화가 완료되었습니다. 장치가 자동 전환되지 않으면 USB를 한 번 다시 연결해 주세요.'
                    : '디스크 초기화와 NetMD 인터페이스 전환을 요청했습니다.',
            };
        }
        catch (error) {
            console.error('NetMD format failed:', error);
            return {
                ok: false,
                message: error?.code === 'HIMD_TIMEOUT'
                    ? 'Hi-MD 파일시스템을 읽지 못했습니다. 디스크가 이미 일반 MD 형식일 수 있습니다. USB 케이블을 분리했다 다시 연결한 뒤 NetMD를 선택해 주세요.'
                    : error instanceof Error ? error.message : String(error),
            };
        }
        finally {
            const driver = himdService.fsDriver?.driver;
            himdService.fsDriver = undefined;
            himdService.himd = undefined;
            himdService.cachedDisc = undefined;
            himdService.session = null;
            webusb.clearPreferredDevice();
            Promise.resolve(driver?.close()).catch(() => { });
        }
    };
    electron_1.ipcMain.handle('formatStandardMDToNetMD', formatStandardMDToNetMD);
    electron_1.ipcMain.handle('_switchToFactory', async () => {
        factoryIface = await service.factory();
        if (alreadySwitched)
            return factoryDefList;
        alreadySwitched = true;
        factoryDefList = traverseObject(window, () => factoryIface, "_factory__");
        // exploitDownloadTrack uses nested objects with callbacks, and callbacks with return values.
        // The nomral ipc-copying code can't be used for that.
        let shouldAbortAtracDownload = false;
        let handleBadSectorResolve = null;
        electron_1.ipcMain.removeHandler('_factory__exploitDownloadTrack');
        electron_1.ipcMain.handle('_factory__exploitDownloadTrack', async (_, ...allArgs) => {
            handleBadSectorResolve = null;
            shouldAbortAtracDownload = false;
            const enableHandleBadSector = allArgs[3].handleBadSector;
            const enableShouldCancelImmediately = allArgs[3].handleBadSector;
            allArgs[3] = Object.assign(Object.assign({}, allArgs[3]), { handleBadSector: async (...args) => {
                    window.webContents.send('_atracdl_callback_handleBadSector', ...args);
                    return await new Promise(res => handleBadSectorResolve = res);
                }, shouldCancelImmediately: () => shouldAbortAtracDownload });
            if (!enableHandleBadSector)
                delete allArgs[3].handleBadSector;
            if (!enableShouldCancelImmediately)
                delete allArgs[3].shouldCancelImmediately;
            allArgs[2] = async (...args) => window.webContents.send('_callback', `_factory__exploitDownloadTrack_callback2`, ...args);
            try {
                return [await factoryIface.exploitDownloadTrack(...allArgs), null];
            }
            catch (err) {
                console.log("Node Error: ");
                console.log(err);
                return [null, err];
            }
        });
        electron_1.ipcMain.handle('_atracdl_cancel', () => shouldAbortAtracDownload = true);
        electron_1.ipcMain.handle('_atracdl_callback_handleBadSector_return', (_, status) => handleBadSectorResolve === null || handleBadSectorResolve === void 0 ? void 0 : handleBadSectorResolve(status));
        return factoryDefList;
    });
    const himdService = new translations_1.EWMDHiMD({ debug: true });
    for (const channel of ['beginHiMDUploadStage', 'appendHiMDUploadStage'])
        electron_1.ipcMain.removeHandler(channel);
    electron_1.ipcMain.handle('beginHiMDUploadStage', (_event, uploadId, total) => {
        const safeId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
        const uploadPath = path_1.default.join(electron_1.app.getPath('userData'), `himd-upload-${safeId}.bin`);
        fs_1.default.writeFileSync(uploadPath, Buffer.alloc(0));
        stagedHiMDUploads.set(uploadId, { total, received: 0, path: uploadPath });
        appendDiagnosticLog('Hi-MD upload staging started', { uploadId, total });
        return true;
    });
    electron_1.ipcMain.handle('appendHiMDUploadStage', (_event, uploadId, chunk) => {
        const staged = stagedHiMDUploads.get(uploadId);
        if (!staged)
            throw new Error('Hi-MD 업로드 준비 세션이 만료되었습니다.');
        const buffer = Buffer.from(chunk);
        fs_1.default.appendFileSync(staged.path, buffer);
        staged.received += buffer.byteLength;
        if (staged.received > staged.total)
            throw new Error('Hi-MD 업로드 준비 데이터 크기가 올바르지 않습니다.');
        return staged.received;
    });
    const transferMethods = new Set(['prepareUpload', 'upload', 'finalizeUpload', 'download']);
    const hasActiveTransfer = serviceObject => [...(serviceObject.__activeIpcMethods ?? [])].some(method => transferMethods.has(method));
    let rendererReportedTransferStall = false;
    let rendererReportedTransferActive = false;
    let forceClosingStalledTransfer = false;
    let closeConfirmationPending = false;
    let suppressRepeatedTransferClosePrompt = false;
    let transferClosePromptResetTimer;
    let safeDisconnectClosePending = false;
    let safeDisconnectCloseAllowed = false;
    electron_1.ipcMain.removeHandler('mdLabelMakerReadDisc');
    electron_1.ipcMain.handle('mdLabelMakerReadDisc', async () => {
        if (rendererReportedTransferActive || hasActiveTransfer(service) || hasActiveTransfer(himdService)) {
            return { ok: false, code: 'busy', message: '녹음이나 전송이 진행 중입니다. 작업이 끝난 뒤 다시 시도해 주세요.' };
        }
        const discReadActive = service.__activeIpcMethods?.has('listContent') || himdService.__activeIpcMethods?.has('listContent');
        if (discReadActive) {
            return { ok: false, code: 'busy', message: '메인 화면에서 MiniDisc 정보를 불러오는 중입니다. 목록이 표시된 뒤 다시 눌러 주세요.' };
        }
        const mode = himdService.fsDriver && himdService.himd
            ? 'himd'
            : service.netmdInterface
                ? 'netmd'
                : null;
        if (!mode) {
            return { ok: false, code: 'not-connected', message: '메인 화면에서 먼저 NetMD 또는 Hi-MD로 연결하고, 곡 목록이 표시된 뒤 다시 눌러 주세요.' };
        }
        try {
            // Only copy the content of the connection already established by
            // the main screen. The label tool must never initiate a USB rescan
            // or mode switch of its own.
            const disc = await withTimeout(mode === 'himd' ? himdService.listContent() : service.listContent(false), 6000, '연결된 MiniDisc 목록을 가져오는 시간이 초과되었습니다.', 'LABEL_DISC_READ_TIMEOUT');
            const tracks = (disc?.groups ?? [])
                .flatMap(group => (group.tracks ?? []).map(track => ({
                index: Number(track.index) || 0,
                title: String(track.title || track.fullWidthTitle || '').trim(),
                artist: String(track.artist || '').trim(),
                album: String(track.album || '').trim(),
                groupTitle: group.title === null ? '' : String(group.title || group.fullWidthTitle || '').trim(),
                duration: Number(track.duration) || 0,
            })))
                .sort((a, b) => a.index - b.index);
            if (!tracks.length) {
                return { ok: false, code: 'empty-disc', message: '디스크는 인식했지만 가져올 곡이 없습니다.' };
            }
            return {
                ok: true,
                mode,
                discTitle: String(disc.title || disc.fullWidthTitle || '').trim(),
                tracks,
            };
        }
        catch (error) {
            const message = String(error?.message || error || '알 수 없는 오류');
            const noMedia = /no disc|no media|disc.*not|media.*not|rejected/i.test(message);
            return {
                ok: false,
                code: noMedia ? 'no-media' : 'read-failed',
                message: noMedia
                    ? '기기는 연결되어 있지만 MiniDisc 미디어를 찾지 못했습니다.'
                    : `MiniDisc 곡 목록을 읽지 못했습니다. (${message})`,
            };
        }
    });
    const confirmForceQuitStalledTransfer = async () => {
        if (closeConfirmationPending)
            return false;
        closeConfirmationPending = true;
        try {
            const result = await showRendererWarning(window, {
                title: '멈춘 전송 강제 종료',
                message: '전송이 끝나지 않았습니다. 앱을 강제로 종료할까요?',
                detail: '전송 중이던 곡은 손상되거나 사라질 수 있습니다. 앱이 닫힌 뒤에도 기기의 쓰기 표시가 계속되면 전원과 디스크는 그대로 두고 USB 케이블만 분리하세요.',
                choices: [
                    { value: 'wait', label: '계속 기다리기', kind: 'secondary' },
                    { value: 'force', label: '앱 강제 종료', kind: 'danger' },
                ],
                cancelValue: 'wait',
            });
            if (result !== 'force') {
                suppressRepeatedTransferClosePrompt = true;
                return false;
            }
            forceClosingStalledTransfer = true;
            appendDiagnosticLog('Stalled transfer force quit confirmed', { at: Date.now() });
            setImmediate(() => electron_1.app.exit(1));
            return true;
        }
        finally {
            closeConfirmationPending = false;
        }
    };
    window.on('close', event => {
        if (forceClosingStalledTransfer || relaunching || safeDisconnectCloseAllowed)
            return;
        appendDiagnosticLog('Window close requested', {
            rendererReportedTransferActive,
            netmdActiveMethods: [...(service.__activeIpcMethods ?? [])],
            himdActiveMethods: [...(himdService.__activeIpcMethods ?? [])],
            suppressRepeatedTransferClosePrompt,
            at: Date.now(),
        });
        if (rendererReportedTransferActive || hasActiveTransfer(service) || hasActiveTransfer(himdService)) {
            event.preventDefault();
            if (suppressRepeatedTransferClosePrompt)
                return;
            void confirmForceQuitStalledTransfer();
            return;
        }
        if (!service.netmdInterface && !himdService.fsDriver && !himdService.himd)
            return;
        event.preventDefault();
        if (safeDisconnectClosePending)
            return;
        safeDisconnectClosePending = true;
        appendDiagnosticLog('Safe MiniDisc app close started', { at: Date.now() });
        void clearMiniDiscConnections().catch(error => {
            appendDiagnosticLog('Safe MiniDisc app close cleanup failed', error);
        }).finally(() => {
            safeDisconnectClosePending = false;
            safeDisconnectCloseAllowed = true;
            appendDiagnosticLog('Safe MiniDisc app close completed', { at: Date.now() });
            window.close();
        });
    });
    electron_1.ipcMain.removeHandler('setTransferStalled');
    electron_1.ipcMain.handle('setTransferStalled', (_event, value) => {
        rendererReportedTransferStall = Boolean(value);
        return true;
    });
    electron_1.ipcMain.removeHandler('setTransferActive');
    electron_1.ipcMain.handle('setTransferActive', (_event, value) => {
        rendererReportedTransferActive = Boolean(value);
        if (transferClosePromptResetTimer) {
            clearTimeout(transferClosePromptResetTimer);
            transferClosePromptResetTimer = undefined;
        }
        if (!rendererReportedTransferActive) {
            transferClosePromptResetTimer = setTimeout(() => {
                transferClosePromptResetTimer = undefined;
                if (!rendererReportedTransferActive &&
                    !hasActiveTransfer(service) &&
                    !hasActiveTransfer(himdService))
                    suppressRepeatedTransferClosePrompt = false;
            }, 3000);
        }
        appendDiagnosticLog('Renderer transfer state changed', {
            active: rendererReportedTransferActive,
            at: Date.now(),
        });
        return true;
    });
    electron_1.ipcMain.handle('setRH1KoreanTitleExperiment', async (_, requestedState) => {
        const enabled = Boolean(requestedState);
        if (himdService.atdata !== null || hasActiveTransfer(himdService)) {
            return {
                ok: false,
                enabled: Boolean(himdService.spec.experimentalKoreanTitles),
                message: '전송 중에는 한글 제목 실험 설정을 바꿀 수 없습니다.',
            };
        }
        if (enabled) {
            const activeDevice = himdService.fsDriver?.usbDevice;
            const isRH1HiMD = activeDevice?.vendorId === 0x054c && activeDevice?.productId === 0x0287;
            if (!isRH1HiMD) {
                himdService.spec.experimentalKoreanTitles = false;
                return {
                    ok: false,
                    enabled: false,
                    message: '이 실험 기능은 Hi-MD 모드의 Sony MZ-RH1(0x054c:0x0287)에서만 켤 수 있습니다.',
                };
            }
        }
        himdService.spec.experimentalKoreanTitles = enabled;
        return {
            ok: true,
            enabled,
        };
    });
    let macHiMDConnection = null;
    const clearMiniDiscConnections = async () => {
        if (rendererReportedTransferActive || himdService.atdata !== null || hasActiveTransfer(service) || hasActiveTransfer(himdService)) {
            return {
                ok: false,
                busy: true,
                message: '현재 전송 작업이 진행 중입니다. 작업이 끝난 뒤 모드 선택 화면으로 돌아가 주세요.',
            };
        }
        const warnings = [];
        try {
            appendDiagnosticLog('NetMD safe disconnect started', {
                deviceName: service.netmdInterface?.netMd?.getDeviceName?.(),
                at: Date.now(),
            });
            await withTimeout(service.finalizeForDisconnect(), 10000, 'NetMD 연결 정리 시간이 초과되었습니다.');
            appendDiagnosticLog('NetMD safe disconnect completed', { at: Date.now() });
        }
        catch (error) {
            if (service.netmdInterface)
                warnings.push(`NetMD: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            service.netmdInterface = undefined;
            service.dropCachedContentList();
        }
        try {
            if (process.platform === 'darwin' && macHiMDConnection?.socket) {
                await withTimeout(macHiMDConnection.callMethod('himd', 'finalize'), 5000, 'Hi-MD 연결 정리 시간이 초과되었습니다.');
            }
            else {
                await withTimeout(himdService.finalize(), 5000, 'Hi-MD 연결 정리 시간이 초과되었습니다.');
            }
        }
        catch (error) {
            warnings.push(`Hi-MD: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            if (process.platform === 'darwin' && macHiMDConnection?.socket) {
                macHiMDConnection.disconnect();
            }
            himdService.fsDriver = undefined;
            himdService.himd = undefined;
            himdService.cachedDisc = undefined;
            himdService.session = null;
            himdService.streamingWorker = null;
            himdService.spec.experimentalKoreanTitles = false;
        }
        webusb.clearPreferredDevice();
        return {
            ok: true,
            warning: warnings.length > 0 ? warnings.join('\n') : undefined,
        };
    };
    electron_1.ipcMain.handle('returnToModeSelection', async () => clearMiniDiscConnections());
    const formatStandardMDToHiMD = async () => {
        const reportFormatProgress = (stage, message) => {
            if (!window.isDestroyed()) {
                window.webContents.send('himd-format-progress', { stage, message });
            }
            appendDiagnosticLog(`Hi-MD format progress: ${stage}`, message);
        };
        reportFormatProgress('checking', uiText('연결된 기기와 일반 MD 상태를 확인하고 있습니다.', 'Checking the connected recorder and standard MiniDisc.'));
        if (process.platform !== 'win32' && process.platform !== 'darwin') {
            return { ok: false, message: uiText('이 운영체제에서는 Hi-MD 포맷을 지원하지 않습니다.', 'Hi-MD formatting is not supported on this operating system.') };
        }
        const diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const candidates = diagnostics.devices.filter(device => device.supportsNetMD && device.mode === 'netmd');
        if (candidates.length === 0) {
            return {
                ok: false,
                    message: uiText('NetMD USB 인터페이스로 연결된 Hi-MD 지원 기기를 찾지 못했습니다.', 'No Hi-MD-compatible recorder connected through its NetMD USB interface was found.'),
            };
        }
        let targetDevice = candidates[0];
        if (candidates.length > 1) {
            const selection = await electron_1.dialog.showMessageBox(window, {
                type: 'question',
                    title: uiText('Hi-MD로 포맷할 기기 선택', 'Choose a recorder to format as Hi-MD'),
                    message: uiText('디스크를 지울 기기를 정확히 선택하세요.', 'Carefully select the recorder containing the disc to erase.'),
                    buttons: [uiText('취소', 'Cancel'), ...candidates.map(device => `${device.modelHint} (${device.vendorIdHex}:${device.productIdHex})`)],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
            });
            if (selection.response === 0)
                    return { ok: false, cancelled: true, message: uiText('포맷을 취소했습니다.', 'Formatting was cancelled.') };
            targetDevice = candidates[selection.response - 1];
        }
        if (!targetDevice)
            return { ok: false, cancelled: true, message: uiText('포맷할 기기를 선택하지 않았습니다.', 'No recorder was selected for formatting.') };
        if (process.platform === 'win32' && targetDevice.driverStatus !== 'winusb') {
            return {
                ok: false,
                message: `${targetDevice.modelHint}의 NetMD 인터페이스에 WinUSB를 먼저 설치해 주세요.`,
            };
        }
        if (hasActiveTransfer(service) || hasActiveTransfer(himdService) || himdService.atdata !== null) {
            return { ok: false, message: uiText('현재 전송 작업이 진행 중입니다. 작업을 마친 뒤 다시 시도해 주세요.', 'A transfer is in progress. Wait for it to finish, then try again.') };
        }
        webusb.setPreferredDevice(targetDevice);
        let switchRequested = false;
        try {
            if (service.netmdInterface) {
                try {
                    await withTimeout(service.finalize(), 4000, uiText('이전 NetMD 연결 정리 시간이 초과되었습니다.', 'Timed out while closing the previous NetMD connection.'));
                }
                catch (cleanupError) {
                    console.log('Previous NetMD connection cleanup failed:', cleanupError);
                }
            }
            const paired = await withTimeout(service.pair(), 12000, uiText(`${targetDevice.modelHint}의 NetMD 인터페이스를 여는 시간이 초과되었습니다.`, `Timed out while opening the NetMD interface on ${targetDevice.modelHint}.`));
            if (!paired)
                return { ok: false, message: uiText(`${targetDevice.modelHint}의 NetMD 인터페이스를 열지 못했습니다.`, `Could not open the NetMD interface on ${targetDevice.modelHint}.`) };
            const openedDevice = service.netmdInterface?.netMd;
            if (!openedDevice ||
                openedDevice.getVendor() !== targetDevice.vendorId ||
                openedDevice.getProduct() !== targetDevice.productId) {
                return { ok: false, message: uiText('선택한 기기와 실제 열린 기기가 달라 포맷을 중단했습니다.', 'Formatting was stopped because the opened recorder did not match the selected recorder.') };
            }
            const capabilities = await withTimeout(service.getServiceCapabilities(), 12000, uiText('기기의 Hi-MD 포맷 지원 여부를 확인하지 못했습니다.', 'Could not determine whether this recorder supports Hi-MD formatting.'));
            const confirmation = await showRendererWarning(window, {
                title: uiText('Hi-MD 준비 방법 선택', 'Choose how to prepare Hi-MD'),
                message: uiText('기존 Hi-MD 미디어를 쓸까요, 현재 일반 MD를 Hi-MD로 바꿀까요?', 'Do you want to use an existing Hi-MD disc or convert the current standard MiniDisc to Hi-MD?'),
                detail: [
                    uiText('“RAM 패치만 적용”은 현재 일반 MD를 지우지 않습니다. 완료 후 기기 전원을 유지한 채 기존 Hi-MD 미디어로 교체하고 USB만 다시 연결하세요.', '“Apply RAM patch only” does not erase the current standard MiniDisc. When it finishes, keep the recorder powered on, swap in the existing Hi-MD disc, and reconnect only the USB cable.'),
                    '',
                    uiText('“일반 MD를 Hi-MD로 포맷”은 현재 디스크의 모든 트랙과 제목을 영구적으로 삭제합니다.', '“Erase standard MD and format as Hi-MD” permanently deletes every track and title on the current disc.'),
                    '',
                    uiText(`대상 기기: ${targetDevice.modelHint} (${targetDevice.vendorIdHex}:${targetDevice.productIdHex})`, `Target device: ${targetDevice.modelHint} (${targetDevice.vendorIdHex}:${targetDevice.productIdHex})`),
                ].join('\n'),
                choices: [
                    { value: 'cancel', label: uiText('취소', 'Cancel'), kind: 'secondary' },
                    ...(process.platform === 'darwin'
                        ? [{ value: 'patch-only', label: uiText('RAM 패치만 적용 (미디어 유지)', 'Apply RAM patch only (keep media)'), kind: 'primary' }]
                        : []),
                    { value: 'format', label: uiText('일반 MD를 지우고 Hi-MD로 포맷', 'Erase standard MD and format as Hi-MD'), kind: 'danger' },
                ],
                cancelValue: 'cancel',
            });
            if (confirmation !== 'format' && confirmation !== 'patch-only')
                return { ok: false, cancelled: true, message: uiText('Hi-MD 준비를 취소했습니다.', 'Hi-MD preparation was cancelled.') };
            const patchOnly = confirmation === 'patch-only';
            if (!patchOnly && !capabilities.includes(10)) {
                return {
                    ok: false,
                    message: uiText(`${targetDevice.modelHint}은(는) 펌웨어의 NetMD→Hi-MD 포맷 명령을 지원하지 않습니다.`, `${targetDevice.modelHint} firmware does not support the NetMD-to-Hi-MD format command.`),
                };
            }
            if (!patchOnly && !capabilities.includes(2)) {
                return {
                    ok: false,
                    message: uiText('디스크가 쓰기 금지 상태이거나 포맷 가능한 미디어가 아닙니다.', 'The disc is write-protected or cannot be formatted as Hi-MD.'),
                };
            }
            reportFormatProgress('preparing', patchOnly
                ? uiText('현재 미디어를 유지하고 macOS용 Hi-MD RAM 패치만 준비하고 있습니다.', 'Preparing only the macOS Hi-MD RAM patch while keeping the current media unchanged.')
                : uiText('포맷을 준비하고 있습니다. 기기 전원과 USB 연결을 유지해 주세요.', 'Preparing to format. Keep the recorder powered on and the USB cable connected.'));
            let commandError;
            let formatCommandCompleted = false;
            let macHiMDOverrideLoaded = false;
            try {
                miniDiscModeSwitchInProgress = true;
                // Normal Sony Hi-MD identities are captured by Apple's
                // mass-storage stack on recent macOS releases. When the
                // connected firmware advertises the Hi-MD USB-class override,
                // load it while NetMD is still reachable. Supported NH/RH
                // models then re-enumerate as vendor-class 5341:5256 and use
                // the reliable WebUSB transport without a model-ID special case.
                if (process.platform === 'darwin') {
                    reportFormatProgress('ram-patch', uiText(`${targetDevice.modelHint}의 macOS Hi-MD 우회 지원 여부를 확인하고 있습니다.`, `Checking whether ${targetDevice.modelHint} supports the macOS Hi-MD workaround.`));
                    const factoryService = await withTimeout(service.factory(), 15000, uiText('Hi-MD RAM 패치 준비 시간이 초과되었습니다.', 'Timed out while preparing the Hi-MD RAM patch.'));
                    if (factoryService) {
                        const exploitCapabilities = await withTimeout(factoryService.getExploitCapabilities(), 10000, uiText('Hi-MD RAM 패치 지원 여부를 확인하지 못했습니다.', 'Could not determine whether this firmware supports the Hi-MD RAM patch.'));
                        if (exploitCapabilities.includes(6)) {
                            await withTimeout(factoryService.enableHiMDFullMode(), 20000, uiText('Hi-MD RAM 패치 적용 시간이 초과되었습니다.', 'Timed out while applying the Hi-MD RAM patch.'));
                            macHiMDOverrideLoaded = true;
                            appendDiagnosticLog('Unrestricted Hi-MD patch loaded during Hi-MD preparation', {
                                modelHint: targetDevice.modelHint,
                                vendorId: targetDevice.vendorIdHex,
                                productId: targetDevice.productIdHex,
                            });
                        }
                        else {
                            appendDiagnosticLog('Hi-MD USB-class override is not supported by this firmware', {
                                modelHint: targetDevice.modelHint,
                                vendorId: targetDevice.vendorIdHex,
                                productId: targetDevice.productIdHex,
                            });
                            if (patchOnly) {
                                throw new Error(uiText(`${targetDevice.modelHint} 펌웨어에서는 macOS용 Hi-MD RAM 패치만 적용할 수 없습니다.`, `${targetDevice.modelHint} firmware does not support applying only the macOS Hi-MD RAM patch.`));
                            }
                        }
                    }
                    else if (patchOnly) {
                        throw new Error(uiText(`${targetDevice.modelHint}에서 RAM 패치 기능을 준비하지 못했습니다.`, `Could not prepare the RAM patch feature on ${targetDevice.modelHint}.`));
                    }
                }
                if (patchOnly) {
                    if (!macHiMDOverrideLoaded) {
                        throw new Error(uiText('호환되는 Hi-MD RAM 패치를 적용하지 못했습니다.', 'Could not apply a compatible Hi-MD RAM patch.'));
                    }
                    reportFormatProgress('complete', uiText('RAM 패치를 적용했습니다. 현재 미디어는 변경하지 않았습니다.', 'The RAM patch was applied. The current media was not changed.'));
                    appendDiagnosticLog('Unrestricted Hi-MD patch-only preparation completed', {
                        modelHint: targetDevice.modelHint,
                        vendorId: targetDevice.vendorIdHex,
                        productId: targetDevice.productIdHex,
                    });
                    return {
                        ok: true,
                        erased: false,
                        patchOnly: true,
                        switchRequested: false,
                        message: uiText('RAM 패치를 적용했고 현재 미디어는 지우지 않았습니다. 기기 전원을 유지한 채 기존 Hi-MD 미디어로 교체한 뒤 USB 케이블만 다시 연결하고 Hi-MD를 선택하세요.', 'The RAM patch was applied without erasing the current media. Keep the recorder powered on, swap in the existing Hi-MD disc, reconnect only the USB cable, and then select Hi-MD.'),
                    };
                }
                reportFormatProgress('formatting', uiText('일반 MD를 지우고 Hi-MD 파일시스템을 만들고 있습니다.', 'Erasing the standard MiniDisc and creating the Hi-MD filesystem.'));
                try {
                    await withTimeout(service.formatToHiMD(), 90000, uiText('Hi-MD 포맷 명령의 응답 시간이 초과되었습니다.', 'The Hi-MD format command timed out.'));
                }
                catch (formatError) {
                    const formatErrorMessage = formatError instanceof Error ? formatError.message : String(formatError);
                    if (!formatErrorMessage.includes('Rejected - 0a1840ff0000'))
                        throw formatError;
                    // netmd-js implements formatToHiMD as eraseDisc() followed
                    // by enterHiMDMode(). NH1 rejects eraseDisc() with this
                    // exact response when the previous attempt already erased
                    // the medium (the unit displays BLANKDISC), which otherwise
                    // prevents the second command from ever running.
                    reportFormatProgress('blank-disc', uiText('디스크가 이미 비어 있습니다. 삭제를 반복하지 않고 Hi-MD 모드로 전환합니다.', 'The disc is already blank. Switching to Hi-MD mode without erasing it again.'));
                    const openedInterface = service.netmdInterface;
                    if (!openedInterface)
                        throw new Error(uiText('빈 디스크를 Hi-MD로 전환할 NetMD 인터페이스가 닫혔습니다.', 'The NetMD interface closed before the blank disc could switch to Hi-MD mode.'));
                    await withTimeout(openedInterface.enterHiMDMode(), 20000, uiText('빈 디스크의 Hi-MD 모드 전환 시간이 초과되었습니다.', 'Timed out while switching the blank disc to Hi-MD mode.'));
                }
                formatCommandCompleted = true;
            }
            catch (error) {
                commandError = error;
                console.log('NetMD to Hi-MD switch interrupted:', error);
            }
            const expectedHiMDProducts = new Map([
                [0x017e, [0x017f, 0x5256]],
                [0x0180, [0x0181]],
                [0x0182, [0x0183]],
                [0x0184, [0x0185]],
                [0x0186, [0x0187]],
                [0x0219, [0x021a]],
                [0x021b, [0x021c]],
                [0x021d, [0x022d]],
                [0x022c, [0x022d]],
                [0x0286, [0x0287]],
            ]);
            const expectedProducts = expectedHiMDProducts.get(targetDevice.productId) ?? [];
            let refreshedDevices = [];
            const formatReenumerationAttempts = process.platform === 'darwin' ? 60 : 4;
            reportFormatProgress('reconnecting', uiText('Hi-MD USB 모드로 다시 연결되기를 기다리고 있습니다.', 'Waiting for the recorder to reconnect in Hi-MD USB mode.'));
            for (let attempt = 0; attempt < formatReenumerationAttempts; attempt++) {
                await wait(800);
                refreshedDevices = (0, device_diagnostics_1.getMiniDiscDiagnostics)().devices;
                if (refreshedDevices.some(device => (device.vendorId === targetDevice.vendorId &&
                    expectedProducts.includes(device.productId)) ||
                    (macHiMDOverrideLoaded && device.vendorId === 0x5341 && device.productId === 0x5256))) {
                    switchRequested = true;
                    break;
                }
            }
            if (switchRequested) {
                reportFormatProgress('complete', uiText('Hi-MD 포맷 명령을 완료했습니다.', 'The Hi-MD format command completed.'));
                return {
                    ok: true,
                    erased: true,
                    switchRequested: true,
                    message: uiText('Hi-MD 포맷 명령을 완료했습니다. Hi-MD 인터페이스가 나타나지 않으면 USB 케이블을 한 번 다시 연결해 주세요.', 'The Hi-MD format command completed. If the Hi-MD interface does not appear, reconnect the USB cable once.'),
                };
            }
            reportFormatProgress('error', commandError instanceof Error
                ? commandError.message
                : formatCommandCompleted
                    ? uiText('포맷 명령은 끝났지만 Hi-MD USB 모드로 전환되지 않았습니다.', 'The format command completed, but the recorder did not switch to Hi-MD USB mode.')
                    : String(commandError || uiText('Hi-MD 포맷을 완료하지 못했습니다.', 'Hi-MD formatting could not be completed.')));
            return {
                ok: false,
                erased: formatCommandCompleted,
                message: `${uiText('Hi-MD 포맷과 USB 모드 전환 완료를 확인하지 못했습니다. 기기 상태를 확인한 뒤 다시 시도해 주세요.', 'Could not verify completion of Hi-MD formatting and the USB mode switch. Check the recorder and try again.')}\n${commandError instanceof Error ? commandError.message : formatCommandCompleted ? uiText('포맷 명령은 끝났지만 Hi-MD USB 인터페이스가 나타나지 않았습니다.', 'The format command completed, but the Hi-MD USB interface did not appear.') : String(commandError || '')}`,
            };
        }
        catch (error) {
            console.error('Hi-MD format failed:', error);
            reportFormatProgress('error', error instanceof Error ? error.message : String(error));
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
        finally {
            miniDiscModeSwitchInProgress = false;
            const netmdInterface = service.netmdInterface;
            service.netmdInterface = undefined;
            service.dropCachedContentList();
            webusb.clearPreferredDevice();
            if (!switchRequested)
                Promise.resolve(netmdInterface?.netMd.finalize()).catch(() => { });
        }
    };
    electron_1.ipcMain.handle('formatStandardMDToHiMD', formatStandardMDToHiMD);
    electron_1.ipcMain.handle('formatTimedOutMiniDiscMedia', async (_, targetFormat) => {
        if (targetFormat !== 'himd' && targetFormat !== 'netmd') {
            return { ok: false, message: '알 수 없는 MiniDisc 포맷 형식입니다.' };
        }
        if (process.platform === 'darwin' && targetFormat === 'himd') {
            const result = await formatStandardMDToHiMD();
            if (result?.ok && result.switchRequested) {
                rememberPendingMiniDiscMode('himd');
                return { ...result, restartRequired: true };
            }
            return result;
        }
        const diagnostics = (0, device_diagnostics_1.getMiniDiscDiagnostics)();
        const sourceMode = targetFormat === 'himd' ? 'himd' : 'netmd';
        const candidates = diagnostics.devices.filter(device => device.mode === sourceMode);
        if (candidates.length !== 1) {
            return {
                ok: false,
                message: candidates.length === 0
                    ? '포맷할 MiniDisc 기기를 찾지 못했습니다. USB를 다시 연결한 뒤 시도해 주세요.'
                    : '안전을 위해 포맷할 MiniDisc 기기 하나만 USB에 연결해 주세요.',
            };
        }
        const switchResult = targetFormat === 'himd'
            ? await switchHiMDInterfaceToNetMD(candidates[0])
            : await switchNetMDInterfaceToHiMD(candidates[0]);
        clearPendingMiniDiscMode();
        if (!switchResult.ok) {
            return {
                ok: false,
                message: `포맷 준비를 위해 USB 모드를 전환하지 못했습니다.\n${switchResult.message}`,
            };
        }
        const result = targetFormat === 'himd'
            ? await formatStandardMDToHiMD()
            : await formatStandardMDToNetMD();
        if (result?.ok && result.switchRequested) {
            rememberPendingMiniDiscMode(targetFormat);
            return {
                ...result,
                restartRequired: true,
                message: `${result.message}\n\n새 USB 모드로 자동 연결하기 위해 프로그램을 다시 시작합니다.`,
            };
        }
        return result;
    });
    window.webContents.on('render-process-gone', (_event, details) => appendDiagnosticLog('RENDERER process gone', details));
    window.webContents.on('unresponsive', () => appendDiagnosticLog('RENDERER unresponsive', { url: window.webContents.getURL() }));
    let keyData = undefined;
    try {
        keyData = new Uint8Array(fs_1.default.readFileSync(path_1.default.join(electron_1.app.getPath('userData'), 'EKBROOTS.DES')));
    }
    catch (_) {
        console.log("Can't read roots");
    }
    const nwService = new networkwm_service_1.NetworkWMService(keyData);
    if (process.platform !== 'darwin') {
        const himdDeflist = traverseObject(window, () => himdService, "_himd_", {
            rememberMode: rememberPendingMiniDiscMode,
        });
        electron_1.ipcMain.handle('_himd__definedParameters', () => himdDeflist);
        const nwDeflist = traverseObject(window, () => nwService, "_nwjs_");
        electron_1.ipcMain.handle('_nwjs__definedParameters', () => nwDeflist);
    }
    else {
        const connection = new server_bootstrap_1.Connection();
        macHiMDConnection = connection;
        connection.deviceDisconnectedCallback = () => {
            if (!miniDiscModeSwitchInProgress)
                reload(window);
        };
        const connectionMutex = new async_mutex_1.Mutex();
        const callHiMDMethod = async (methodName, allArgs) => {
            const call = connection.callMethod('himd', methodName, ...allArgs);
            if (methodName !== 'getDeviceName')
                return call;
            let timeout;
            try {
                return await Promise.race([
                    call,
                    new Promise((_, reject) => {
                        timeout = setTimeout(() => reject(new Error('Hi-MD 기기 응답 시간이 초과되었습니다. USB를 분리한 뒤 기기 전원을 다시 켜고 연결해 주세요.')), 75000);
                    }),
                ]);
            }
            finally {
                if (timeout)
                    clearTimeout(timeout);
            }
        };
        formatStandardMDToNetMDOnMac = async (hiMDDevice) => {
            let helperError;
            let helperCallStarted = false;
            miniDiscModeSwitchInProgress = true;
            try {
                if (!connection.socket) {
                    try {
                        (0, server_bootstrap_1.startServer)();
                    }
                    catch (error) {
                        helperError = error;
                    }
                    if (!helperError) {
                        const connectionError = await connection.awaitConnection();
                        if (connectionError)
                            helperError = connectionError;
                    }
                }
                if (!helperError && connection.socket) {
                    const release = await connectionMutex.acquire();
                    try {
                        helperCallStarted = true;
                        await withTimeout(connection.callMethod('himd', 'formatStandardMDToNetMD'), 45000, uiText('일반 MD 초기화 시간이 초과되었습니다.', 'Timed out while initializing the standard MiniDisc.'));
                    }
                    catch (error) {
                        // The helper socket generally closes as the recorder
                        // changes USB identity, so this can mean success.
                        helperError = error;
                    }
                    finally {
                        release();
                    }
                }
                for (let attempt = 0; attempt < 30; attempt++) {
                    await wait(500);
                    const switched = (0, device_diagnostics_1.getMiniDiscDiagnostics)().devices.find(device => device.vendorId === hiMDDevice.vendorId && device.mode === 'netmd');
                    if (switched) {
                        // The helper can complete the USB switch while the
                        // renderer is still awaiting the old Hi-MD RPC. Do the
                        // handoff here, where 054c:017e has been observed,
                        // instead of relying on the stale dialog to receive the
                        // success result and request a relaunch.
                        rememberPendingMiniDiscMode('netmd');
                        setTimeout(() => reload(window), 100);
                        return {
                            ok: true,
                            erased: true,
                            switchRequested: true,
                            message: uiText('일반 MD 초기화가 완료되었고 기기가 NetMD 모드로 전환되었습니다.', 'Standard MiniDisc initialization is complete and the recorder switched to NetMD mode.'),
                        };
                    }
                }
                const remainingHiMD = (0, device_diagnostics_1.getMiniDiscDiagnostics)().devices.some(device => device.vendorId === hiMDDevice.vendorId && device.mode === 'himd');
                const expectedDisconnect = helperCallStarted && Boolean(helperError) && !remainingHiMD;
                return {
                    ok: expectedDisconnect,
                    erased: expectedDisconnect,
                    switchRequested: true,
                    message: expectedDisconnect
                        ? uiText('초기화 명령 뒤 Hi-MD 연결이 종료되었습니다. USB 케이블을 한 번 다시 연결한 뒤 NetMD를 선택해 주세요.', 'The Hi-MD connection ended after initialization. Reconnect the USB cable once, then select NetMD.')
                        : helperError instanceof Error
                            ? helperError.message
                            : helperError
                                ? String(helperError)
                                : uiText('초기화 명령을 완료했지만 NetMD USB 모드를 확인하지 못했습니다. USB 케이블을 한 번 다시 연결해 주세요.', 'Initialization completed, but NetMD USB mode could not be confirmed. Reconnect the USB cable once.'),
                };
            }
            catch (error) {
                clearPendingMiniDiscMode();
                return { ok: false, message: error instanceof Error ? error.message : String(error) };
            }
            finally {
                miniDiscModeSwitchInProgress = false;
            }
        };
        connection.callbackHandler = (service, name, ...args) => window.webContents.send("_callback", (service === 'himd' ? '_himd_' : '_nwjs_') + name, ...args);
        const himdDefinedMethods = getDefinedFunctions(himdService);
        electron_1.ipcMain.handle('_himd__definedParameters', () => [...himdDefinedMethods].map(e => '_himd_' + e));
        for (let methodName of himdDefinedMethods) {
            electron_1.ipcMain.handle(`_himd_${methodName}`, async (_, ...allArgs) => {
                console.log(`Execute: ${methodName}`);
                for (let i = 0; i < allArgs.length; i++) {
                    if (allArgs[i]?.interprocessType !== 'stagedHiMDUpload')
                        continue;
                    const staged = stagedHiMDUploads.get(allArgs[i].uploadId);
                    if (!staged)
                        return [null, new Error('준비된 Hi-MD 음원 데이터를 찾지 못했습니다.')];
                    stagedHiMDUploads.delete(allArgs[i].uploadId);
                    allArgs[i] = {
                        interprocessType: 'stagedHiMDUploadFile',
                        path: staged.path,
                        bytes: staged.received,
                    };
                    appendDiagnosticLog('Hi-MD staged upload handed to macOS helper', {
                        bytes: staged.received,
                    });
                }
                if (methodName === 'connect') {
                    if (!connection.socket) {
                        try {
                            (0, server_bootstrap_1.startServer)();
                        }
                        catch (ex) {
                            return [null, ex];
                        }
                        const error = await connection.awaitConnection();
                        if (error) {
                            return [null, error];
                        }
                    }
                }
                if (!connection.socket) {
                    return [null, new Error("Server not ready!")];
                }
                const release = await connectionMutex.acquire();
                try {
                    return [await callHiMDMethod(methodName, allArgs), null];
                }
                catch (err) {
                    console.log("External HIMD Error: ");
                    console.log(err);
                    if (methodName === 'getDeviceName' && connection.socket)
                        connection.disconnect();
                    return [null, err];
                }
                finally {
                    release();
                }
            });
        }
        const nwjsDefinedMethods = getDefinedFunctions(himdService);
        electron_1.ipcMain.handle('_nwjs__definedParameters', () => [...nwjsDefinedMethods].map(e => '_nwjs_' + e));
        for (let methodName of nwjsDefinedMethods) {
            electron_1.ipcMain.handle(`_nwjs_${methodName}`, async (_, ...allArgs) => {
                console.log(`Execute: ${methodName}`);
                if (methodName === 'connect') {
                    if (!connection.socket) {
                        try {
                            (0, server_bootstrap_1.startServer)();
                        }
                        catch (ex) {
                            return [null, ex];
                        }
                        const error = await connection.awaitConnection();
                        if (error) {
                            return [null, error];
                        }
                    }
                }
                if (!connection.socket) {
                    return [null, new Error("Server not ready!")];
                }
                const release = await connectionMutex.acquire();
                try {
                    return [await connection.callMethod('nwjs', methodName, ...allArgs), null];
                }
                catch (err) {
                    console.log("External NWJS Error: ");
                    console.log(err);
                    return [null, err];
                }
                finally {
                    release();
                }
            });
        }
    }
    electron_1.ipcMain.handle('_unrestrictedFetch', async (_, url, parameters) => {
        return await (await (0, node_fetch_1.default)(url, parameters)).text();
    });
    electron_1.ipcMain.handle('_signHiMDDisc', () => global.signHiMDDisc());
    electron_1.ipcMain.handle('_signNWJS', () => global.signNWJS());
    electron_1.ipcMain.handle('_debug_himdPullFile', async (e, a, b) => {
        console.log(`Pulling HiMD file ${a} to local ${b}`);
        const handle = await himdService.fsDriver.fatfs.open(a, false);
        if (!handle) {
            console.log("No file!");
        }
        fs_1.default.writeFileSync(b, await handle.readAll());
        await handle.close();
    });
    electron_1.ipcMain.handle('_debug_himdList', async (e, a) => {
        console.log(`Listing HiMD dir ${a}`);
        const list = await himdService.fsDriver.fatfs.listDir(a);
        if (!list) {
            console.log("No such dir!");
        }
        console.log(list.join(', '));
    });
    electron_1.ipcMain.handle("openFileHostDialog", async (_, filters, directory) => {
        return ewmdOpenDialog(window, filters, directory);
    });
    require("./md-squirrel-main").setupMDSquirrelIPC(window);
    setupSettings(window);
    setupEncoder();
    // On a USB disconnect event, enumerate services, check if any was connected
    const addKnownDeviceCB = webusb.addKnownDevice.bind(webusb);
    nwService.deviceConnectedCallback = addKnownDeviceCB;
    himdService.deviceConnectedCallback = addKnownDeviceCB;
    let pendingUsbDisconnectReloadTimer;
    webusb.ondisconnect = event => {
        const matchedService = [service, himdService, nwService].some(currentService => {
            try {
                return currentService.isDeviceConnected(event.device);
            }
            catch (error) {
                appendDiagnosticLog('USB disconnect service match failed', error);
                return false;
            }
        });
        const recentTransferLoss = recentUsbTransferFailure !== null &&
            Date.now() - recentUsbTransferFailure.at < 10000;
        const transferState = {
            matchedService,
            netmdTransfer: hasActiveTransfer(service),
            himdTransfer: hasActiveTransfer(himdService),
            recentTransferLoss,
            recentUsbTransferFailure,
            vendorId: event.device?.vendorId,
            productId: event.device?.productId,
            productName: event.device?.productName,
        };
        appendDiagnosticLog('USB disconnect', transferState);
        if (!matchedService)
            return;
        if (miniDiscModeSwitchInProgress) {
            appendDiagnosticLog('USB disconnect relaunch suppressed during mode switch', transferState);
            return;
        }
        if (transferState.netmdTransfer || transferState.himdTransfer || recentTransferLoss) {
            webusb.clearPreferredDevice();
            recentUsbTransferFailure = null;
            void showRendererWarning(window, {
                title: 'N1 전송 중 USB 연결이 끊어졌습니다',
                message: '전송을 중단하고 앱의 자동 재시작을 막았습니다.',
                detail: '진행 중이던 곡은 이어서 전송할 수 없습니다. USB 케이블과 기기 전원을 확인한 뒤 다시 연결하고 전송해 주세요. 같은 현상이 반복되면 진단 로그를 확인해 원인을 더 좁힐 수 있습니다.',
            });
            return;
        }
        if (pendingUsbDisconnectReloadTimer)
            clearTimeout(pendingUsbDisconnectReloadTimer);
        pendingUsbDisconnectReloadTimer = setTimeout(() => {
            pendingUsbDisconnectReloadTimer = undefined;
            if (hasActiveTransfer(service) || hasActiveTransfer(himdService)) {
                appendDiagnosticLog('USB disconnect relaunch suppressed by active transfer', {
                    vendorId: event.device?.vendorId,
                    productId: event.device?.productId,
                });
                return;
            }
            reload(window);
        }, 2500);
    };
    electron_1.ipcMain.removeHandler('appendDiagnosticLog');
    electron_1.ipcMain.handle('appendDiagnosticLog', (_event, category, value) => appendDiagnosticLog(`RENDERER ${category}`, value));
    electron_1.ipcMain.removeHandler('writeClipboardText');
    electron_1.ipcMain.handle('writeClipboardText', (_event, value) => {
        electron_1.clipboard.writeText(String(value ?? ''));
        return true;
    });
    electron_1.ipcMain.removeHandler('forceQuitStalledTransfer');
    electron_1.ipcMain.handle('forceQuitStalledTransfer', confirmForceQuitStalledTransfer);
    // Windows can keep node-usb/libusb's native device context stale after a
    // suspend/resume cycle even though PnP has brought the Hi-MD interface back.
    // A renderer reload is not sufficient because it leaves that native context
    // in this process alive. Relaunch once Windows has had time to re-enumerate
    // USB, which avoids requiring a full Windows reboot.
    let powerSuspendObserved = false;
    let powerResumeRecoveryTimer;
    const handlePowerSuspend = () => {
        powerSuspendObserved = true;
        webusb.clearPreferredDevice();
        console.log('[USB POWER] Suspend detected; USB recovery armed.');
    };
    const scheduleUsbResumeRecovery = (source) => {
        if (!powerSuspendObserved || relaunching || powerResumeRecoveryTimer)
            return;
        powerSuspendObserved = false;
        console.log(`[USB POWER] ${source} detected; relaunching after USB re-enumeration.`);
        powerResumeRecoveryTimer = setTimeout(() => {
            powerResumeRecoveryTimer = undefined;
            if (!window.isDestroyed())
                reload(window);
        }, 1800);
    };
    const handlePowerResume = () => scheduleUsbResumeRecovery('Resume');
    const handleScreenUnlock = () => scheduleUsbResumeRecovery('Unlock');
    electron_1.powerMonitor.on('suspend', handlePowerSuspend);
    electron_1.powerMonitor.on('resume', handlePowerResume);
    electron_1.powerMonitor.on('unlock-screen', handleScreenUnlock);
    window.once('closed', () => {
        if (pendingUsbDisconnectReloadTimer)
            clearTimeout(pendingUsbDisconnectReloadTimer);
        if (powerResumeRecoveryTimer)
            clearTimeout(powerResumeRecoveryTimer);
        electron_1.powerMonitor.removeListener('suspend', handlePowerSuspend);
        electron_1.powerMonitor.removeListener('resume', handlePowerResume);
        electron_1.powerMonitor.removeListener('unlock-screen', handleScreenUnlock);
    });
}
(0, electron_context_menu_1.default)({
    showInspectElement: false,
});
electron_1.app.whenReady().then(() => {
    electron_1.protocol.registerFileProtocol('sandbox', (rq, callback) => {
        let decodedPath;
        try {
            decodedPath = decodeURI(rq.url.substring('sandbox://'.length));
        }
        catch {
            callback({ error: -10 });
            return;
        }
        const filePath = path_1.default.normalize(decodedPath.replace(/^[/\\]+/, ''));
        if (path_1.default.isAbsolute(filePath) || /^[a-zA-Z]:/.test(filePath) || filePath.split(path_1.default.sep).includes('..')) {
            appendDiagnosticLog('SANDBOX unsafe path rejected', {
                url: rq.url,
                normalizedPath: filePath,
                at: Date.now(),
            });
            callback({ error: -10 });
            return;
        }
        const tgt = getOfRenderer(filePath);
        console.log(`[SANDBOX]: Requested ${tgt}`);
        callback(tgt);
    });
    createWindow();
});
//# sourceMappingURL=main.js.map
