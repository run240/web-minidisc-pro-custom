"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANGELOG = void 0;
const electron_1 = require("electron");
const serializeDiagnosticValue = value => {
    if (value instanceof Error)
        return { name: value.name, message: value.message, stack: value.stack };
    try {
        return typeof value === 'string' ? value : JSON.parse(JSON.stringify(value));
    }
    catch (_) {
        return String(value);
    }
};
window.addEventListener('error', event => {
    void electron_1.ipcRenderer.invoke('appendDiagnosticLog', 'window error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: serializeDiagnosticValue(event.error),
    });
}, true);
window.addEventListener('unhandledrejection', event => {
    void electron_1.ipcRenderer.invoke('appendDiagnosticLog', 'unhandled rejection', serializeDiagnosticValue(event.reason));
}, true);
exports.CHANGELOG = [
    {
        before: 'Version 1.5.0',
        entry: {
            name: 'ElectronWMD 0.5.0-1.5.0',
            contents: [
                "Add support for Sony Network Walkman devices",
                "Add support for running a local instance of the Sony ATRAC encoder",
                "Fix stability issues on HiMD devices",
                "Overhauled settings - moved ElectronWMD settings to the main settings dialog",
            ],
        }
    }
];
(async () => {
    console.group('PRELOAD');
    console.log('====PRELOAD START====');
    const uiLanguage = await electron_1.ipcRenderer.invoke('get_ui_language').catch(() => /^ko(?:-|$)/i.test(navigator.language) ? 'ko' : 'en');
    const isKoreanUI = uiLanguage === 'ko';
    const uiText = (korean, english) => isKoreanUI ? korean : english;
    localStorage.setItem('wmdUiLanguage', uiLanguage);
    const applyDocumentLanguage = () => {
        if (document.documentElement)
            document.documentElement.lang = uiLanguage;
    };
    applyDocumentLanguage();
    if (!document.documentElement)
        document.addEventListener('DOMContentLoaded', applyDocumentLanguage, { once: true });
    // The removed experimental LP2 encoder occupied a temporary service index.
    // Reset that stale preference before the renderer constructs SettingsDialog.
    try {
        const storedAudioExportService = JSON.parse(localStorage.getItem('audioExportService') ?? '0');
        if (!Number.isInteger(storedAudioExportService) || storedAudioExportService < 0 || storedAudioExportService > 2) {
            localStorage.setItem('audioExportService', '0');
            localStorage.setItem('audioExportServiceConfig', '{}');
        }
    }
    catch (_) {
        localStorage.setItem('audioExportService', '0');
        localStorage.setItem('audioExportServiceConfig', '{}');
    }
    const iface = {};
    let i = 0;
    let callbacks = {};
    electron_1.ipcRenderer.on('_callback', (evt, cbname, ...args) => callbacks[cbname](...args));
    async function loadNamespaced(target, namespace) {
        console.group(`Loading namespace ${namespace}`);
        const defined = await electron_1.ipcRenderer.invoke(namespace + '_definedParameters');
        for (const name of defined) {
            target[name.substring(namespace.length)] = async (...args) => {
                for (let i = 0; i < args.length; i++) {
                    if (typeof args[i] === 'function') {
                        callbacks[`${name}_callback${i}`] = args[i];
                        console.log(`Registered callback ${name}_callback${i}`);
                        args[i] = { interprocessType: 'function' };
                    }
                }
                // Electron's invoke serialization can stall when a converted
                // lossless track is sent as one large ArrayBuffer. Stage Hi-MD
                // uploads in bounded chunks, then pass a lightweight token.
                if (name === '_himd_upload' && args[2] instanceof ArrayBuffer) {
                    const uploadId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                    const bytes = new Uint8Array(args[2]);
                    await electron_1.ipcRenderer.invoke('beginHiMDUploadStage', uploadId, bytes.byteLength);
                    const chunkSize = 1024 * 1024;
                    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
                        await electron_1.ipcRenderer.invoke('appendHiMDUploadStage', uploadId, bytes.slice(offset, offset + chunkSize));
                    }
                    args[2] = { interprocessType: 'stagedHiMDUpload', uploadId };
                }
                const [response, error] = await electron_1.ipcRenderer.invoke(name, ...args);
                if (error)
                    throw error;
                return await response;
            };
            console.log(`Registering invoker for #${i++}(${name}) as ${name.substring(namespace.length)}`);
        }
        console.groupEnd();
    }
    await loadNamespaced(iface, "_netmd_");
    iface['factory'] = async () => {
        const factoryDefined = await electron_1.ipcRenderer.invoke('_switchToFactory');
        const factoryIface = {};
        for (const name of factoryDefined) {
            factoryIface[name.substring('_factory__'.length)] = async (...args) => {
                for (let i = 0; i < args.length; i++) {
                    if (typeof args[i] === 'function') {
                        callbacks[`${name}_callback${i}`] = args[i];
                        args[i] = { interprocessType: 'function' };
                    }
                }
                const [response, error] = await electron_1.ipcRenderer.invoke(name, ...args);
                if (error)
                    console.log("(On Node side)");
                if (error)
                    throw error;
                return await response;
            };
        }
        // See note in main.ts
        factoryIface['exploitDownloadTrack'] = async (...args) => {
            let interval = null;
            const shouldCancelImmediately = args[3].shouldCancelImmediately;
            const handleBadSector = args[3].handleBadSector;
            callbacks[`_factory__exploitDownloadTrack_callback2`] = args[2];
            args[3].shouldCancelImmediately = { interprocessType: 'nestedFunction' };
            args[3].handleBadSector = { interprocessType: 'nestedFunction' };
            if (!shouldCancelImmediately)
                delete args[3].shouldCancelImmediately;
            if (!handleBadSector)
                delete args[3].handleBadSector;
            args[2] = { interprocessType: 'function' };
            if (shouldCancelImmediately) {
                interval = setInterval(() => {
                    if (shouldCancelImmediately()) {
                        electron_1.ipcRenderer.invoke('_atracdl_cancel');
                    }
                }, 1000);
            }
            electron_1.ipcRenderer.removeAllListeners('_atracdl_callback_handleBadSector');
            electron_1.ipcRenderer.on('_atracdl_callback_handleBadSector', async (evt, ...args) => {
                const response = await handleBadSector(...args);
                await electron_1.ipcRenderer.invoke('_atracdl_callback_handleBadSector_return', response);
            });
            const [response, error] = await electron_1.ipcRenderer.invoke('_factory__exploitDownloadTrack', ...args);
            if (interval !== null)
                clearInterval(interval);
            if (error)
                console.log("(On Node side)");
            if (error)
                throw error;
            return response;
        };
        return factoryIface;
    };
    const himdIface = {};
    await loadNamespaced(himdIface, "_himd_");
    const nwjsIface = {};
    await loadNamespaced(nwjsIface, "_nwjs_");
    async function unrestrictedFetchJSON(url, parameters) {
        return JSON.parse(await electron_1.ipcRenderer.invoke('_unrestrictedFetch', url, parameters));
    }
    async function signNWJS() {
        await electron_1.ipcRenderer.invoke("_signNWJS");
    }
    async function signHiMDDisc() {
        await electron_1.ipcRenderer.invoke("_signHiMDDisc");
    }
    async function invokeLocalEncoder(ffmpegPath, encoderPath, data, sourceFilename, parameters) {
        return await electron_1.ipcRenderer.invoke("invokeLocalEncoder", ffmpegPath, encoderPath, data, sourceFilename, parameters);
    }
    function openFileHostDialog(filters, directory) {
        return electron_1.ipcRenderer.invoke('openFileHostDialog', filters, directory);
    }
    function reload() {
        return electron_1.ipcRenderer.invoke('reload');
    }
    function getMiniDiscDiagnostics() {
        return electron_1.ipcRenderer.invoke('getMiniDiscDiagnostics');
    }
    function openWindowsDriverGuide() {
        return electron_1.ipcRenderer.invoke('openWindowsDriverGuide');
    }
    function prepareMiniDiscConnection(mode, selectedDeviceId) {
        return electron_1.ipcRenderer.invoke('prepareMiniDiscConnection', mode, selectedDeviceId);
    }
    let activeMiniDiscWarning = null;
    function showMiniDiscWarning(warning = {}) {
        if (activeMiniDiscWarning)
            return activeMiniDiscWarning;
        activeMiniDiscWarning = new Promise((resolve) => {
            if (!document.getElementById('wmd-warning-style')) {
                const style = document.createElement('style');
                style.id = 'wmd-warning-style';
                style.textContent = `
                    .wmd-warning-overlay {
                        position: fixed; inset: 0; z-index: 2147483647;
                        display: flex; align-items: center; justify-content: center;
                        padding: 22px; box-sizing: border-box;
                        background: rgba(3, 4, 8, .74);
                        backdrop-filter: blur(6px);
                    }
                    .wmd-warning-panel {
                        width: min(600px, calc(100vw - 36px));
                        overflow: hidden; box-sizing: border-box;
                        color: #f7f2f6; background: #202027;
                        border: 1px solid rgba(255, 255, 255, .12);
                        border-radius: 17px;
                        box-shadow: 0 26px 80px rgba(0, 0, 0, .68);
                        font-family: inherit;
                    }
                    .wmd-warning-header {
                        display: flex; align-items: center; gap: 13px;
                        padding: 20px 22px 17px;
                        border-bottom: 1px solid rgba(255, 255, 255, .09);
                    }
                    .wmd-warning-icon {
                        display: grid; place-items: center; flex: 0 0 auto;
                        width: 40px; height: 40px; border-radius: 12px;
                        color: #ff8295; background: rgba(226, 71, 96, .13);
                        border: 1px solid rgba(255, 130, 149, .25);
                        font-size: 22px; font-weight: 800;
                    }
                    .wmd-warning-title {
                        margin: 0; font-size: 20px; line-height: 1.3;
                        font-weight: 760; letter-spacing: -.02em;
                    }
                    .wmd-warning-body { padding: 20px 22px 18px; }
                    .wmd-warning-message {
                        margin: 0; color: #f5eff3; font-size: 16px;
                        line-height: 1.55; white-space: pre-wrap;
                    }
                    .wmd-warning-detail {
                        margin: 12px 0 0; color: #bdb7bf; font-size: 13px;
                        line-height: 1.55; white-space: pre-wrap;
                    }
                    .wmd-warning-footer {
                        display: flex; justify-content: flex-end; gap: 10px;
                        padding: 0 22px 20px;
                    }
                    .wmd-warning-close {
                        min-width: 82px; padding: 10px 17px;
                        color: #fff; cursor: pointer; font: inherit; font-weight: 700;
                        background: #c64f88; border: 0; border-radius: 10px;
                    }
                    .wmd-warning-close:hover { background: #d45e98; }
                    .wmd-warning-format {
                        padding: 10px 17px; cursor: pointer; font: inherit; font-weight: 700;
                        color: #fff; background: #a92d3e; border: 1px solid #d85a6b;
                        border-radius: 10px;
                    }
                    .wmd-warning-format:hover { background: #bd3549; }
                    .wmd-warning-format:disabled { cursor: wait; opacity: .65; }
                    .wmd-warning-choice {
                        min-width: 94px; padding: 10px 17px; cursor: pointer;
                        color: #eee9ed; background: rgba(255, 255, 255, .055);
                        border: 1px solid rgba(255, 255, 255, .16); border-radius: 10px;
                        font: inherit; font-weight: 700;
                    }
                    .wmd-warning-choice:hover { background: rgba(255, 255, 255, .10); }
                    .wmd-warning-choice.primary {
                        color: #fff; background: #a74373; border-color: #c65a8d;
                    }
                    .wmd-warning-choice.primary:hover { background: #b94d80; }
                    .wmd-warning-choice.danger {
                        color: #ffdce2; background: rgba(169, 45, 62, .72); border-color: #d85a6b;
                    }
                    .wmd-warning-choice.danger:hover { background: #a92d3e; }
                    .wmd-warning-close:focus-visible,
                    .wmd-warning-choice:focus-visible {
                        outline: 2px solid #f4a3ca; outline-offset: 2px;
                    }
                `;
                document.head.appendChild(style);
            }
            const overlay = document.createElement('div');
            overlay.className = 'wmd-warning-overlay';
            const panel = document.createElement('section');
            panel.className = 'wmd-warning-panel';
            panel.setAttribute('role', 'alertdialog');
            panel.setAttribute('aria-modal', 'true');
            const header = document.createElement('header');
            header.className = 'wmd-warning-header';
            const icon = document.createElement('span');
            icon.className = 'wmd-warning-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '!';
            const title = document.createElement('h2');
            title.className = 'wmd-warning-title';
            title.textContent = warning.title || uiText('알림', 'Notice');
            const body = document.createElement('div');
            body.className = 'wmd-warning-body';
            const message = document.createElement('p');
            message.className = 'wmd-warning-message';
            message.textContent = warning.message || uiText('작업을 완료하지 못했습니다.', 'The operation could not be completed.');
            const detail = document.createElement('p');
            detail.className = 'wmd-warning-detail';
            detail.textContent = warning.detail || '';
            detail.hidden = !warning.detail;
            const footer = document.createElement('footer');
            footer.className = 'wmd-warning-footer';
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'wmd-warning-close';
            closeButton.textContent = uiText('확인', 'OK');
            const choices = Array.isArray(warning.choices) ? warning.choices : [];
            const close = (result = null) => {
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                resolve(result);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close(warning.cancelValue ?? null);
                }
                else if (event.key === 'Enter' && choices.length === 0) {
                    event.preventDefault();
                    close(null);
                }
            };
            if (choices.length > 0) {
                for (const choice of choices) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = `wmd-warning-choice ${choice.kind || 'secondary'}`;
                    button.textContent = String(choice.label || choice.value || uiText('선택', 'Select'));
                    button.addEventListener('click', () => close(choice.value ?? null), { once: true });
                    footer.append(button);
                }
            }
            else {
                closeButton.addEventListener('click', () => close(null), { once: true });
            }
            if ((process.platform === 'win32' ||
                (process.platform === 'darwin' && warning.formatTarget === 'himd')) && choices.length === 0 &&
                (warning.formatTarget === 'himd' || warning.formatTarget === 'netmd')) {
                const formatButton = document.createElement('button');
                formatButton.type = 'button';
                formatButton.className = 'wmd-warning-format';
                formatButton.textContent = warning.formatLabel || (warning.formatTarget === 'himd' ? uiText('Hi-MD로 포맷', 'Format as Hi-MD') : uiText('일반 MD로 포맷', 'Format as standard MD'));
                formatButton.addEventListener('click', async () => {
                    formatButton.disabled = true;
                    closeButton.disabled = true;
                    formatButton.textContent = uiText('기기 확인 중…', 'Checking device…');
                    // The backend opens a second, destructive confirmation via
                    // showMiniDiscWarning. Close this informational warning first;
                    // otherwise the single-warning guard returns this same pending
                    // promise and both sides wait forever.
                    close(null);
                    await new Promise(resolve => setTimeout(resolve, 0));
                    let progress = null;
                    const onFormatProgress = (_event, value) => {
                        // The backend emits "checking" before it asks for the
                        // destructive confirmation. Start blocking the mode
                        // cards as soon as that confirmation is accepted.
                        if (value?.stage === 'checking')
                            return;
                        if (!progress)
                            progress = showMiniDiscFormatProgress(uiText('Hi-MD 준비 진행 중', 'Preparing Hi-MD'));
                        progress.update(value);
                    };
                    electron_1.ipcRenderer.on('himd-format-progress', onFormatProgress);
                    try {
                        const result = await electron_1.ipcRenderer.invoke('formatTimedOutMiniDiscMedia', warning.formatTarget);
                        if (result?.cancelled) {
                            return;
                        }
                        const resultMessage = result?.message || (result?.ok ? uiText('Hi-MD 준비를 완료했습니다.', 'Hi-MD preparation is complete.') : uiText('Hi-MD 준비에 실패했습니다.', 'Hi-MD preparation failed.'));
                        electron_1.ipcRenderer.removeListener('himd-format-progress', onFormatProgress);
                        progress?.close();
                        progress = null;
                        // Allow the informational warning's promise/finalizer to
                        // clear before opening the result dialog. Otherwise the
                        // already-resolved warning can swallow this message and
                        // leave only the home screen visible.
                        await new Promise(resolve => setTimeout(resolve, 50));
                        await showMiniDiscWarning({
                            title: result?.ok
                                ? result?.patchOnly ? uiText('RAM 패치 완료', 'RAM patch complete') : uiText('포맷 완료', 'Format complete')
                                : result?.patchOnly ? uiText('RAM 패치 실패', 'RAM patch failed') : uiText('Hi-MD 준비 실패', 'Hi-MD preparation failed'),
                            message: resultMessage,
                            detail: result?.ok
                                ? result?.patchOnly
                                    ? uiText('기기 전원을 유지한 채 기존 Hi-MD 미디어로 교체하고 USB 케이블만 다시 연결하세요.', 'Keep the recorder powered on, swap in the existing Hi-MD disc, and reconnect only the USB cable.')
                                    : uiText('기기가 새 USB 모드로 다시 연결될 때까지 잠시 기다려 주세요.', 'Wait for the recorder to reconnect in its new USB mode.')
                                : uiText('디스크와 USB 연결 상태를 확인한 뒤 다시 시도해 주세요.', 'Check the disc and USB connection, then try again.'),
                        });
                        if (result?.ok && result.restartRequired) {
                            reload().catch(error => {
                                void showMiniDiscWarning({
                                    title: uiText('프로그램 재시작 실패', 'Could not restart the app'),
                                    message: uiText('프로그램을 자동으로 다시 시작하지 못했습니다.', 'The app could not restart automatically.'),
                                    detail: `${uiText('직접 종료한 뒤 다시 실행해 주세요.', 'Quit the app and start it again manually.')}\n\n${error instanceof Error ? error.message : String(error)}`,
                                });
                            });
                        }
                        return;
                    }
                    catch (error) {
                        close();
                        setTimeout(() => {
                            void showMiniDiscWarning({
                                title: uiText('포맷 오류', 'Format error'),
                                message: uiText('포맷 중 오류가 발생했습니다.', 'An error occurred while formatting.'),
                                detail: error instanceof Error ? error.message : String(error),
                            });
                        }, 0);
                        return;
                    }
                    finally {
                        electron_1.ipcRenderer.removeListener('himd-format-progress', onFormatProgress);
                        progress?.close();
                    }
                });
                footer.append(formatButton);
            }
            document.addEventListener('keydown', onKeyDown, true);
            header.append(icon, title);
            body.append(message, detail);
            if (choices.length === 0)
                footer.append(closeButton);
            panel.append(header, body, footer);
            overlay.append(panel);
            document.body.append(overlay);
            (footer.querySelector('button') || closeButton).focus();
        }).finally(() => {
            activeMiniDiscWarning = null;
        });
        return activeMiniDiscWarning;
    }
    electron_1.ipcRenderer.on('showMiniDiscWarning', async (_event, warning) => {
        const result = await showMiniDiscWarning(warning);
        if (warning?.closeChannel)
            electron_1.ipcRenderer.send(warning.closeChannel, result);
    });
    let activeMiniDiscConfirmation = null;
    function confirmMiniDiscAction(options = {}) {
        if (activeMiniDiscConfirmation)
            return activeMiniDiscConfirmation;
        activeMiniDiscConfirmation = new Promise((resolve) => {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '0',
                zIndex: '2147483647',
                display: 'grid',
                placeItems: 'center',
                padding: '22px',
                boxSizing: 'border-box',
                background: 'rgba(3, 4, 8, .74)',
                backdropFilter: 'blur(6px)',
            });
            const panel = document.createElement('section');
            panel.setAttribute('role', 'alertdialog');
            panel.setAttribute('aria-modal', 'true');
            Object.assign(panel.style, {
                width: 'min(600px, calc(100vw - 36px))',
                overflow: 'hidden',
                color: '#f7f2f6',
                background: '#202027',
                border: '1px solid rgba(255, 255, 255, .12)',
                borderRadius: '17px',
                boxShadow: '0 26px 80px rgba(0, 0, 0, .68)',
                fontFamily: 'inherit',
            });
            const header = document.createElement('header');
            Object.assign(header.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '13px',
                padding: '20px 22px 17px',
                borderBottom: '1px solid rgba(255, 255, 255, .09)',
            });
            const icon = document.createElement('span');
            icon.textContent = '?';
            icon.setAttribute('aria-hidden', 'true');
            Object.assign(icon.style, {
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
                width: '40px',
                height: '40px',
                color: '#f5a2c9',
                background: 'rgba(198, 80, 139, .14)',
                border: '1px solid rgba(245, 162, 201, .25)',
                borderRadius: '12px',
                fontSize: '22px',
                fontWeight: '800',
            });
            const title = document.createElement('h2');
            title.textContent = options.title || uiText('확인', 'Confirm');
            Object.assign(title.style, {
                margin: '0',
                fontSize: '20px',
                lineHeight: '1.3',
                fontWeight: '760',
            });
            const body = document.createElement('div');
            Object.assign(body.style, { padding: '20px 22px 18px' });
            const message = document.createElement('p');
            message.textContent = options.message || uiText('계속하시겠습니까?', 'Do you want to continue?');
            Object.assign(message.style, {
                margin: '0',
                color: '#f5eff3',
                fontSize: '16px',
                lineHeight: '1.55',
                whiteSpace: 'pre-wrap',
            });
            const detail = document.createElement('p');
            detail.textContent = options.detail || '';
            detail.hidden = !options.detail;
            Object.assign(detail.style, {
                margin: '12px 0 0',
                color: '#bdb7bf',
                fontSize: '13px',
                lineHeight: '1.55',
                whiteSpace: 'pre-wrap',
            });
            const footer = document.createElement('footer');
            Object.assign(footer.style, {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '0 22px 20px',
            });
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = options.cancelLabel || uiText('취소', 'Cancel');
            Object.assign(cancelButton.style, {
                minWidth: '82px',
                padding: '10px 17px',
                color: '#ddd7dc',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, .16)',
                borderRadius: '10px',
                font: 'inherit',
                fontWeight: '700',
            });
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.textContent = options.confirmLabel || uiText('확인', 'Confirm');
            Object.assign(confirmButton.style, {
                minWidth: '82px',
                padding: '10px 17px',
                color: '#fff',
                cursor: 'pointer',
                background: '#c64f88',
                border: '0',
                borderRadius: '10px',
                font: 'inherit',
                fontWeight: '700',
            });
            const finish = (confirmed) => {
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                resolve(confirmed);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
            };
            cancelButton.addEventListener('click', () => finish(false), { once: true });
            confirmButton.addEventListener('click', () => finish(true), { once: true });
            document.addEventListener('keydown', onKeyDown, true);
            header.append(icon, title);
            body.append(message, detail);
            footer.append(cancelButton, confirmButton);
            panel.append(header, body, footer);
            overlay.append(panel);
            document.body.append(overlay);
            cancelButton.focus();
        }).finally(() => {
            activeMiniDiscConfirmation = null;
        });
        return activeMiniDiscConfirmation;
    }
    let activeMiniDiscDevicePicker = null;
    function chooseMiniDiscDevice(mode, candidates = []) {
        if (activeMiniDiscDevicePicker) {
            return activeMiniDiscDevicePicker;
        }
        activeMiniDiscDevicePicker = new Promise((resolve) => {
            if (!document.getElementById('wmd-device-picker-style')) {
                const style = document.createElement('style');
                style.id = 'wmd-device-picker-style';
                style.textContent = `
                    .wmd-device-picker-overlay {
                        position: fixed; inset: 0; z-index: 2147483647;
                        display: flex; align-items: center; justify-content: center;
                        padding: 22px; box-sizing: border-box;
                        background: rgba(3, 4, 8, .76);
                        backdrop-filter: blur(7px);
                    }
                    .wmd-device-picker-panel {
                        width: min(570px, calc(100vw - 36px));
                        overflow: hidden; box-sizing: border-box;
                        color: #f7f2f6; background: #1d1d23;
                        border: 1px solid rgba(255, 255, 255, .12);
                        border-radius: 18px;
                        box-shadow: 0 28px 90px rgba(0, 0, 0, .68);
                        font-family: inherit;
                    }
                    .wmd-device-picker-header {
                        display: flex; align-items: center; gap: 13px;
                        padding: 21px 23px 17px;
                        border-bottom: 1px solid rgba(255, 255, 255, .09);
                    }
                    .wmd-device-picker-icon {
                        display: grid; place-items: center; flex: 0 0 auto;
                        width: 42px; height: 42px; border-radius: 13px;
                        color: #f18bbb; background: rgba(198, 80, 139, .14);
                        border: 1px solid rgba(241, 139, 187, .24);
                    }
                    .wmd-device-picker-icon svg { width: 23px; height: 23px; }
                    .wmd-device-picker-heading { min-width: 0; }
                    .wmd-device-picker-title {
                        margin: 0 0 4px; font-size: 20px; line-height: 1.25;
                        font-weight: 750; letter-spacing: -.02em;
                    }
                    .wmd-device-picker-subtitle {
                        margin: 0; color: #aaa7b0; font-size: 13px; line-height: 1.45;
                    }
                    .wmd-device-picker-list {
                        display: grid; gap: 10px; padding: 17px 19px 19px;
                    }
                    .wmd-device-picker-choice {
                        display: grid; grid-template-columns: 44px minmax(0, 1fr) auto;
                        align-items: center; gap: 13px; width: 100%;
                        padding: 14px 15px; box-sizing: border-box;
                        color: #f8f5f7; text-align: left; cursor: pointer;
                        background: #25252c;
                        border: 1px solid rgba(255, 255, 255, .09);
                        border-radius: 14px;
                        transition: border-color .16s ease, background .16s ease, transform .16s ease;
                        font: inherit;
                    }
                    .wmd-device-picker-choice:hover,
                    .wmd-device-picker-choice:focus-visible {
                        outline: none; transform: translateY(-1px);
                        background: #2b272f; border-color: rgba(231, 104, 166, .58);
                    }
                    .wmd-device-picker-number {
                        display: grid; place-items: center; width: 40px; height: 40px;
                        border-radius: 12px; color: #f5a2c9; font-weight: 800;
                        background: rgba(198, 80, 139, .13);
                    }
                    .wmd-device-picker-name {
                        display: block; overflow: hidden; text-overflow: ellipsis;
                        white-space: nowrap; font-size: 16px; font-weight: 720;
                    }
                    .wmd-device-picker-meta {
                        display: block; margin-top: 4px; color: #aaa7b0;
                        font-size: 12px; line-height: 1.35;
                    }
                    .wmd-device-picker-arrow {
                        color: #e778ad; width: 22px; height: 22px;
                    }
                    .wmd-device-picker-footer {
                        display: flex; justify-content: flex-end;
                        padding: 0 19px 18px;
                    }
                    .wmd-device-picker-cancel {
                        padding: 9px 16px; color: #d9d4d8; cursor: pointer;
                        background: transparent;
                        border: 1px solid rgba(255, 255, 255, .14);
                        border-radius: 10px; font: inherit;
                    }
                    .wmd-device-picker-cancel:hover { background: rgba(255, 255, 255, .06); }
                `;
                document.head.appendChild(style);
            }
            const overlay = document.createElement('div');
            overlay.className = 'wmd-device-picker-overlay';
            overlay.setAttribute('role', 'presentation');
            const panel = document.createElement('section');
            panel.className = 'wmd-device-picker-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'wmd-device-picker-title');
            const modeName = mode === 'himd' ? 'Hi-MD' : 'NetMD';
            panel.innerHTML = `
                <header class="wmd-device-picker-header">
                    <span class="wmd-device-picker-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="9"></circle>
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"></path>
                        </svg>
                    </span>
                    <span class="wmd-device-picker-heading">
                        <h2 class="wmd-device-picker-title" id="wmd-device-picker-title">${uiText('MiniDisc 기기 선택', 'Choose a MiniDisc recorder')}</h2>
                        <p class="wmd-device-picker-subtitle">${uiText(`${modeName}로 연결할 기기를 선택하세요.`, `Choose the recorder to connect in ${modeName} mode.`)}</p>
                    </span>
                </header>
                <div class="wmd-device-picker-list"></div>
                <footer class="wmd-device-picker-footer">
                    <button type="button" class="wmd-device-picker-cancel">${uiText('취소', 'Cancel')}</button>
                </footer>
            `;
            const list = panel.querySelector('.wmd-device-picker-list');
            const modelCounts = new Map();
            for (const candidate of candidates) {
                modelCounts.set(candidate.modelHint, (modelCounts.get(candidate.modelHint) || 0) + 1);
            }
            const modelIndexes = new Map();
            candidates.forEach((candidate, index) => {
                const duplicateIndex = (modelIndexes.get(candidate.modelHint) || 0) + 1;
                modelIndexes.set(candidate.modelHint, duplicateIndex);
                const displayName = modelCounts.get(candidate.modelHint) > 1
                    ? `${candidate.modelHint} #${duplicateIndex}`
                    : candidate.modelHint;
                const usbLocation = candidate.busNumber === undefined || candidate.deviceAddress === undefined
                    ? ''
                    : ` · USB ${candidate.busNumber}-${candidate.deviceAddress}`;
                const driverLabel = candidate.driverStatus === 'winusb' ? uiText('WinUSB 준비됨', 'WinUSB ready') : uiText('드라이버 확인 필요', 'Driver check required');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'wmd-device-picker-choice';
                button.innerHTML = `
                    <span class="wmd-device-picker-number">${index + 1}</span>
                    <span>
                        <span class="wmd-device-picker-name"></span>
                        <span class="wmd-device-picker-meta">${candidate.vendorIdHex}:${candidate.productIdHex}${usbLocation} · ${driverLabel}</span>
                    </span>
                    <svg class="wmd-device-picker-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m9 18 6-6-6-6"></path>
                    </svg>
                `;
                button.querySelector('.wmd-device-picker-name').textContent = displayName;
                button.addEventListener('click', () => finish(candidate.selectionId));
                list.appendChild(button);
            });
            overlay.appendChild(panel);
            let settled = false;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                activeMiniDiscDevicePicker = null;
                resolve(value);
            };
            const onKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(null);
                }
            };
            panel.querySelector('.wmd-device-picker-cancel').addEventListener('click', () => finish(null));
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay)
                    finish(null);
            });
            document.addEventListener('keydown', onKeyDown, true);
            document.body.appendChild(overlay);
            queueMicrotask(() => list.querySelector('button')?.focus());
        });
        return activeMiniDiscDevicePicker;
    }
    let activeDriverInstallProgress = null;
    function updateDriverInstallProgress(status = {}) {
        if (status.phase === 'close') {
            activeDriverInstallProgress?.close();
            return;
        }
        if (status.phase !== 'installing' && status.phase !== 'verifying')
            return;
        if (!document.getElementById('wmd-driver-progress-style')) {
            const style = document.createElement('style');
            style.id = 'wmd-driver-progress-style';
            style.textContent = `
                .wmd-driver-progress-overlay {
                    position: fixed; inset: 0; z-index: 2147483647;
                    display: flex; align-items: center; justify-content: center;
                    padding: 22px; box-sizing: border-box;
                    background: rgba(3, 4, 8, .79);
                    backdrop-filter: blur(7px);
                }
                .wmd-driver-progress-panel {
                    width: min(530px, calc(100vw - 36px));
                    overflow: hidden; box-sizing: border-box;
                    color: #f7f2f6; background: #1d1d23;
                    border: 1px solid rgba(255, 255, 255, .12);
                    border-radius: 18px;
                    box-shadow: 0 28px 90px rgba(0, 0, 0, .7);
                    font-family: inherit;
                }
                .wmd-driver-progress-head {
                    display: flex; align-items: center; gap: 14px;
                    padding: 22px 23px 18px;
                    border-bottom: 1px solid rgba(255, 255, 255, .09);
                }
                .wmd-driver-progress-spinner {
                    width: 37px; height: 37px; flex: 0 0 auto;
                    box-sizing: border-box; border-radius: 50%;
                    border: 3px solid rgba(231, 104, 166, .18);
                    border-top-color: #e768a6;
                    animation: wmd-driver-progress-spin .9s linear infinite;
                }
                @keyframes wmd-driver-progress-spin { to { transform: rotate(360deg); } }
                .wmd-driver-progress-title {
                    margin: 0 0 4px; font-size: 20px; line-height: 1.3;
                    font-weight: 760; letter-spacing: -.02em;
                }
                .wmd-driver-progress-subtitle {
                    margin: 0; color: #aaa7b0; font-size: 13px;
                }
                .wmd-driver-progress-body { padding: 19px 23px 22px; }
                .wmd-driver-progress-device {
                    display: flex; align-items: center; justify-content: space-between;
                    gap: 14px; padding: 13px 15px; margin-bottom: 14px;
                    background: rgba(255, 255, 255, .045);
                    border: 1px solid rgba(255, 255, 255, .075);
                    border-radius: 12px;
                }
                .wmd-driver-progress-name {
                    min-width: 0; overflow: hidden; text-overflow: ellipsis;
                    white-space: nowrap; font-size: 14px; font-weight: 700;
                }
                .wmd-driver-progress-mode {
                    flex: 0 0 auto; padding: 4px 9px; border-radius: 999px;
                    color: #f1a3c9; background: rgba(198, 80, 139, .13);
                    border: 1px solid rgba(231, 104, 166, .24);
                    font-size: 11px; font-weight: 700;
                }
                .wmd-driver-progress-message {
                    margin: 0; color: #ded7dc; font-size: 14px; line-height: 1.6;
                }
                .wmd-driver-progress-help {
                    margin-top: 13px; padding: 12px 14px; color: #c5bec3;
                    background: rgba(231, 104, 166, .065);
                    border-left: 3px solid #c6508b; border-radius: 8px;
                    font-size: 12px; line-height: 1.55;
                }
                .wmd-driver-progress-time {
                    display: block; margin-top: 14px; color: #8f8b92;
                    font-size: 12px; text-align: right;
                }
            `;
            document.head.appendChild(style);
        }
        if (!activeDriverInstallProgress) {
            const overlay = document.createElement('div');
            overlay.className = 'wmd-driver-progress-overlay';
            overlay.setAttribute('role', 'presentation');
            const panel = document.createElement('section');
            panel.className = 'wmd-driver-progress-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'wmd-driver-progress-title');
            panel.innerHTML = `
                <header class="wmd-driver-progress-head">
                    <span class="wmd-driver-progress-spinner" aria-hidden="true"></span>
                    <span>
                        <h2 class="wmd-driver-progress-title" id="wmd-driver-progress-title">${uiText('WinUSB 드라이버 설치 중', 'Installing the WinUSB driver')}</h2>
                        <p class="wmd-driver-progress-subtitle" aria-live="polite">${uiText('Windows 설치 도우미의 응답을 기다리고 있습니다.', 'Waiting for the Windows installer.')}</p>
                    </span>
                </header>
                <div class="wmd-driver-progress-body">
                    <div class="wmd-driver-progress-device">
                        <span class="wmd-driver-progress-name"></span>
                        <span class="wmd-driver-progress-mode"></span>
                    </div>
                    <p class="wmd-driver-progress-message"></p>
                    <div class="wmd-driver-progress-help">
                        ${uiText('Windows 관리자 권한 확인 창(UAC)이 다른 창 뒤에 표시될 수 있습니다.', 'The Windows administrator permission prompt (UAC) may appear behind another window.')}
                        ${uiText('확인 창이 보이면 <strong>예</strong>를 누르고, 설치가 끝날 때까지 USB 케이블을 분리하지 마세요.', 'When it appears, select <strong>Yes</strong> and do not disconnect USB until installation finishes.')}
                    </div>
                    <span class="wmd-driver-progress-time" aria-live="polite"></span>
                </div>
            `;
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            const startedAt = Number(status.startedAt) || Date.now();
            const renderElapsed = () => {
                const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
                const minutes = Math.floor(seconds / 60);
                const remainder = String(seconds % 60).padStart(2, '0');
                panel.querySelector('.wmd-driver-progress-time').textContent =
                    uiText(`경과 시간 ${minutes}:${remainder} · 최대 약 3분`, `Elapsed ${minutes}:${remainder} · up to about 3 minutes`);
            };
            renderElapsed();
            const timer = setInterval(renderElapsed, 1000);
            activeDriverInstallProgress = {
                panel,
                close() {
                    clearInterval(timer);
                    overlay.remove();
                    activeDriverInstallProgress = null;
                },
            };
        }
        const panel = activeDriverInstallProgress.panel;
        panel.querySelector('.wmd-driver-progress-name').textContent = status.deviceName || uiText('MiniDisc 기기', 'MiniDisc recorder');
        panel.querySelector('.wmd-driver-progress-mode').textContent = status.modeName || 'WinUSB';
        if (status.phase === 'verifying') {
            panel.querySelector('.wmd-driver-progress-title').textContent = uiText('설치 결과 확인 중', 'Verifying installation');
            panel.querySelector('.wmd-driver-progress-subtitle').textContent = uiText('Windows에 적용된 드라이버를 다시 확인하고 있습니다.', 'Checking the driver applied by Windows.');
            panel.querySelector('.wmd-driver-progress-message').textContent =
                uiText('기기가 잠시 사라졌다 다시 표시될 수 있습니다. 이 과정이 끝나면 결과를 자동으로 안내합니다.', 'The recorder may disappear briefly and then reappear. The result will be shown automatically.');
        }
        else {
            panel.querySelector('.wmd-driver-progress-title').textContent = uiText('WinUSB 드라이버 설치 중', 'Installing the WinUSB driver');
            panel.querySelector('.wmd-driver-progress-subtitle').textContent = uiText('관리자 권한 승인과 Windows 설치를 기다리고 있습니다.', 'Waiting for administrator approval and Windows installation.');
            panel.querySelector('.wmd-driver-progress-message').textContent =
                uiText('설치 도우미는 화면 없이 실행되며 일반적으로 수십 초, 환경에 따라 최대 2분 정도 걸릴 수 있습니다.', 'The installer runs without its own window and usually takes tens of seconds, or up to about two minutes on some systems.');
        }
    }
    electron_1.ipcRenderer.on('miniDiscDriverInstallStatus', (_, status) => {
        updateDriverInstallProgress(status);
    });
    function formatStandardMDToNetMD() {
        return electron_1.ipcRenderer.invoke('formatStandardMDToNetMD');
    }
    function formatStandardMDToHiMD() {
        return electron_1.ipcRenderer.invoke('formatStandardMDToHiMD');
    }
    async function returnToModeSelection() {
        const result = await electron_1.ipcRenderer.invoke('returnToModeSelection');
        if (result?.ok) {
            rh1KoreanTitleExperimentEnabled = false;
            rh1KoreanTitleUseFilename = true;
            netmdOriginalTitleModeEnabled = false;
            notifyRH1KoreanTitleModeChanged();
            notifyNetMDOriginalTitleModeChanged();
        }
        return result;
    }
    function setRH1KoreanTitleExperiment(enabled) {
        return electron_1.ipcRenderer.invoke('setRH1KoreanTitleExperiment', Boolean(enabled));
    }
    let activeHiMDReorderConfirmation = null;
    function confirmHiMDReorder(options = {}) {
        if (activeHiMDReorderConfirmation) {
            return activeHiMDReorderConfirmation;
        }
        activeHiMDReorderConfirmation = new Promise((resolve) => {
            if (!document.getElementById('wmd-himd-reorder-confirm-style')) {
                const style = document.createElement('style');
                style.id = 'wmd-himd-reorder-confirm-style';
                style.textContent = `
                    .wmd-himd-confirm-overlay {
                        position: fixed; inset: 0; z-index: 2147483647;
                        display: flex; align-items: center; justify-content: center;
                        padding: 20px; box-sizing: border-box;
                        background: rgba(5, 8, 12, .66);
                        backdrop-filter: blur(3px);
                    }
                    .wmd-himd-confirm-panel {
                        width: min(460px, calc(100vw - 40px));
                        box-sizing: border-box; overflow: hidden;
                        color: #e8f2f3;
                        background: linear-gradient(180deg, #242b32 0%, #1d2329 100%);
                        border: 1px solid rgba(103, 174, 187, .34);
                        border-radius: 15px;
                        box-shadow: 0 26px 80px rgba(0, 0, 0, .62);
                        font-family: Roboto, "Noto Sans KR", sans-serif;
                    }
                    .wmd-himd-confirm-head {
                        display: flex; gap: 13px; align-items: center;
                        padding: 20px 22px 15px;
                        border-bottom: 1px solid rgba(103, 174, 187, .16);
                    }
                    .wmd-himd-confirm-icon {
                        display: grid; place-items: center; flex: 0 0 34px;
                        width: 34px; height: 34px; border-radius: 50%;
                        color: #ffc36a; background: rgba(255, 174, 66, .13);
                        border: 1px solid rgba(255, 190, 98, .36);
                        font-size: 21px; font-weight: 700;
                    }
                    .wmd-himd-confirm-title {
                        margin: 0; font-size: 19px; line-height: 1.35; font-weight: 600;
                    }
                    .wmd-himd-confirm-body {
                        padding: 18px 22px 8px; color: #cbd6d8;
                        font-size: 14px; line-height: 1.7;
                    }
                    .wmd-himd-confirm-warning {
                        margin-top: 12px; padding: 10px 12px;
                        color: #ffd28a; background: rgba(255, 174, 66, .09);
                        border-left: 3px solid #d99a45; border-radius: 6px;
                    }
                    .wmd-himd-confirm-actions {
                        display: flex; justify-content: flex-end; gap: 9px;
                        padding: 15px 18px 18px;
                    }
                    .wmd-himd-confirm-button {
                        min-width: 82px; padding: 9px 16px;
                        border: 0; border-radius: 8px; cursor: pointer;
                        color: #d7e1e3; background: rgba(255, 255, 255, .07);
                        font: inherit; font-weight: 600;
                    }
                    .wmd-himd-confirm-button:hover { background: rgba(255, 255, 255, .12); }
                    .wmd-himd-confirm-button.primary {
                        color: #eefcfd; background: #397c88;
                    }
                    .wmd-himd-confirm-button.primary:hover { background: #468e9a; }
                    .wmd-himd-confirm-button:focus-visible {
                        outline: 2px solid #79bdc8; outline-offset: 2px;
                    }
                `;
                document.head.appendChild(style);
            }
            const overlay = document.createElement('div');
            overlay.className = 'wmd-himd-confirm-overlay';
            overlay.setAttribute('role', 'presentation');
            const panel = document.createElement('section');
            panel.className = 'wmd-himd-confirm-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'wmd-himd-confirm-title');
            panel.innerHTML = `
                <div class="wmd-himd-confirm-head">
                    <div class="wmd-himd-confirm-icon" aria-hidden="true">!</div>
                    <h2 class="wmd-himd-confirm-title" id="wmd-himd-confirm-title">${uiText('Hi-MD 트랙 순서 변경', 'Change Hi-MD track order')}</h2>
                </div>
                <div class="wmd-himd-confirm-body">
                    <div class="wmd-himd-confirm-message">${uiText('선택한 트랙의 위치를 변경합니다.', 'Move the selected track to a new position.')}</div>
                    <div class="wmd-himd-confirm-warning">${uiText('작업이 끝날 때까지 장치와 USB 케이블을 분리하지 마세요.', 'Do not disconnect the recorder or USB cable until the operation finishes.')}</div>
                </div>
                <div class="wmd-himd-confirm-actions">
                    <button type="button" class="wmd-himd-confirm-button cancel">${uiText('취소', 'Cancel')}</button>
                    <button type="button" class="wmd-himd-confirm-button primary">${uiText('순서 변경', 'Change order')}</button>
                </div>
            `;
            overlay.appendChild(panel);
            const cancelButton = panel.querySelector('.cancel');
            const confirmButton = panel.querySelector('.primary');
            if (options && options.mode === 'edit') {
                const count = Math.max(1, Number(options.changeCount) || 1);
                const deviceMode = options.deviceMode === 'NetMD' ? 'NetMD' : 'Hi-MD';
                panel.querySelector('.wmd-himd-confirm-title').textContent = uiText(`${deviceMode} 편집 적용`, `Apply ${deviceMode} edits`);
                panel.querySelector('.wmd-himd-confirm-message').textContent =
                    uiText(`${count}개의 편집 내용을 디스크에 한 번에 적용합니다.`, `Apply ${count} edits to the disc in one batch.`);
                panel.querySelector('.wmd-himd-confirm-warning').textContent =
                    uiText('기록과 검증이 끝날 때까지 장치와 USB 케이블을 분리하지 마세요.', 'Do not disconnect the recorder or USB cable until writing and verification finish.');
                confirmButton.textContent = uiText('편집 적용', 'Apply edits');
            }
            const finish = (result) => {
                document.removeEventListener('keydown', handleKeyDown, true);
                overlay.remove();
                resolve(result);
            };
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
                else if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(true);
                }
            };
            cancelButton.addEventListener('click', () => finish(false), { once: true });
            confirmButton.addEventListener('click', () => finish(true), { once: true });
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay)
                    finish(false);
            });
            document.addEventListener('keydown', handleKeyDown, true);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => cancelButton.focus());
        }).finally(() => {
            activeHiMDReorderConfirmation = null;
        });
        return activeHiMDReorderConfirmation;
    }
    let activeHiMDMoveChooser = null;
    function chooseHiMDTrackDestination(currentIndex, trackCount, trackTitle) {
        if (activeHiMDMoveChooser) {
            return activeHiMDMoveChooser;
        }
        const currentPosition = Number(currentIndex) + 1;
        const totalTracks = Math.max(1, Number(trackCount) || 1);
        activeHiMDMoveChooser = new Promise((resolve) => {
            if (!document.getElementById('wmd-himd-move-style')) {
                const style = document.createElement('style');
                style.id = 'wmd-himd-move-style';
                style.textContent = `
                    .wmd-himd-move-overlay {
                        position: fixed; inset: 0; z-index: 2147483647;
                        display: flex; align-items: center; justify-content: center;
                        padding: 20px; box-sizing: border-box;
                        background: rgba(5, 8, 12, .68);
                        backdrop-filter: blur(3px);
                    }
                    .wmd-himd-move-panel {
                        width: min(500px, calc(100vw - 40px));
                        box-sizing: border-box; overflow: hidden;
                        color: #e8f2f3;
                        background: linear-gradient(180deg, #242b32 0%, #1d2329 100%);
                        border: 1px solid rgba(103, 174, 187, .34);
                        border-radius: 15px;
                        box-shadow: 0 26px 80px rgba(0, 0, 0, .62);
                        font-family: Roboto, "Noto Sans KR", sans-serif;
                    }
                    .wmd-himd-move-head {
                        padding: 20px 22px 15px;
                        border-bottom: 1px solid rgba(103, 174, 187, .16);
                    }
                    .wmd-himd-move-title {
                        margin: 0 0 5px; font-size: 19px; line-height: 1.35; font-weight: 600;
                    }
                    .wmd-himd-move-track {
                        overflow: hidden; color: #9fc5cb; font-size: 13px;
                        text-overflow: ellipsis; white-space: nowrap;
                    }
                    .wmd-himd-move-body { padding: 18px 22px 8px; }
                    .wmd-himd-move-label {
                        display: block; margin-bottom: 7px;
                        color: #cbd6d8; font-size: 13px;
                    }
                    .wmd-himd-move-input-row {
                        display: flex; align-items: center; gap: 9px;
                    }
                    .wmd-himd-move-input {
                        width: 100%; box-sizing: border-box;
                        padding: 10px 12px; color: #f0fafb;
                        background: #171c21;
                        border: 1px solid rgba(103, 174, 187, .38);
                        border-radius: 8px; outline: none;
                        font: inherit; font-size: 16px;
                    }
                    .wmd-himd-move-input:focus {
                        border-color: #79bdc8;
                        box-shadow: 0 0 0 2px rgba(103, 174, 187, .16);
                    }
                    .wmd-himd-move-total { flex: 0 0 auto; color: #93a6aa; }
                    .wmd-himd-move-quick {
                        display: grid; grid-template-columns: repeat(4, 1fr);
                        gap: 7px; margin-top: 11px;
                    }
                    .wmd-himd-move-quick button,
                    .wmd-himd-move-button {
                        border: 0; border-radius: 8px; cursor: pointer;
                        color: #d7e1e3; background: rgba(255, 255, 255, .07);
                        font: inherit;
                    }
                    .wmd-himd-move-quick button {
                        padding: 8px 5px; font-size: 12px;
                    }
                    .wmd-himd-move-quick button:hover,
                    .wmd-himd-move-button:hover { background: rgba(255, 255, 255, .12); }
                    .wmd-himd-move-warning {
                        margin-top: 14px; padding: 10px 12px;
                        color: #ffd28a; background: rgba(255, 174, 66, .09);
                        border-left: 3px solid #d99a45; border-radius: 6px;
                        font-size: 13px; line-height: 1.55;
                    }
                    .wmd-himd-move-error {
                        min-height: 20px; margin-top: 6px;
                        color: #ff9e9e; font-size: 12px;
                    }
                    .wmd-himd-move-actions {
                        display: flex; justify-content: flex-end; gap: 9px;
                        padding: 13px 18px 18px;
                    }
                    .wmd-himd-move-button {
                        min-width: 82px; padding: 9px 16px; font-weight: 600;
                    }
                    .wmd-himd-move-button.primary {
                        color: #eefcfd; background: #397c88;
                    }
                    .wmd-himd-move-button.primary:hover { background: #468e9a; }
                    .wmd-himd-move-button.primary:disabled {
                        cursor: default; opacity: .38; background: #397c88;
                    }
                    .wmd-himd-move-button:focus-visible,
                    .wmd-himd-move-quick button:focus-visible {
                        outline: 2px solid #79bdc8; outline-offset: 2px;
                    }
                `;
                document.head.appendChild(style);
            }
            const overlay = document.createElement('div');
            overlay.className = 'wmd-himd-move-overlay';
            const panel = document.createElement('section');
            panel.className = 'wmd-himd-move-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'wmd-himd-move-title');
            panel.innerHTML = `
                <div class="wmd-himd-move-head">
                    <h2 class="wmd-himd-move-title" id="wmd-himd-move-title">${uiText('Hi-MD 트랙 이동', 'Move Hi-MD track')}</h2>
                    <div class="wmd-himd-move-track"></div>
                </div>
                <div class="wmd-himd-move-body">
                    <label class="wmd-himd-move-label" for="wmd-himd-move-input">${uiText('이동할 트랙 번호', 'Destination track number')}</label>
                    <div class="wmd-himd-move-input-row">
                        <input id="wmd-himd-move-input" class="wmd-himd-move-input" type="number" inputmode="numeric">
                        <span class="wmd-himd-move-total"></span>
                    </div>
                    <div class="wmd-himd-move-quick">
                        <button type="button" data-move="first">${uiText('맨 위', 'First')}</button>
                        <button type="button" data-move="previous">${uiText('한 칸 위', 'Up one')}</button>
                        <button type="button" data-move="next">${uiText('한 칸 아래', 'Down one')}</button>
                        <button type="button" data-move="last">${uiText('맨 아래', 'Last')}</button>
                    </div>
                    <div class="wmd-himd-move-warning">${uiText('작업이 끝날 때까지 장치와 USB 케이블을 분리하지 마세요.', 'Do not disconnect the recorder or USB cable until the operation finishes.')}</div>
                    <div class="wmd-himd-move-error" aria-live="polite"></div>
                </div>
                <div class="wmd-himd-move-actions">
                    <button type="button" class="wmd-himd-move-button cancel">${uiText('취소', 'Cancel')}</button>
                    <button type="button" class="wmd-himd-move-button primary">${uiText('이동', 'Move')}</button>
                </div>
            `;
            overlay.appendChild(panel);
            const input = panel.querySelector('.wmd-himd-move-input');
            const trackLabel = panel.querySelector('.wmd-himd-move-track');
            const totalLabel = panel.querySelector('.wmd-himd-move-total');
            const errorLabel = panel.querySelector('.wmd-himd-move-error');
            const cancelButton = panel.querySelector('.cancel');
            const moveButton = panel.querySelector('.primary');
            input.min = '1';
            input.max = String(totalTracks);
            input.value = String(currentPosition);
            trackLabel.textContent = `${currentPosition}. ${String(trackTitle || uiText('제목 없음', 'Untitled'))}`;
            totalLabel.textContent = `/ ${totalTracks}`;
            const readDestination = () => {
                const value = Number.parseInt(input.value, 10);
                if (!Number.isInteger(value) || value < 1 || value > totalTracks) {
                    errorLabel.textContent = uiText(`1부터 ${totalTracks} 사이의 번호를 입력해 주세요.`, `Enter a number from 1 to ${totalTracks}.`);
                    moveButton.disabled = true;
                    return null;
                }
                errorLabel.textContent = value === currentPosition ? uiText('현재 위치와 같은 번호입니다.', 'This is the current position.') : '';
                moveButton.disabled = value === currentPosition;
                return value - 1;
            };
            const finish = (result) => {
                document.removeEventListener('keydown', handleKeyDown, true);
                overlay.remove();
                resolve(result);
            };
            const submit = () => {
                const destination = readDestination();
                if (destination !== null && destination !== currentIndex)
                    finish(destination);
            };
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(null);
                }
                else if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                }
            };
            input.addEventListener('input', readDestination);
            panel.querySelectorAll('[data-move]').forEach((button) => {
                button.addEventListener('click', () => {
                    const mode = button.dataset.move;
                    const destinations = {
                        first: 1,
                        previous: Math.max(1, currentPosition - 1),
                        next: Math.min(totalTracks, currentPosition + 1),
                        last: totalTracks,
                    };
                    input.value = String(destinations[mode]);
                    readDestination();
                    input.focus();
                    input.select();
                });
            });
            cancelButton.addEventListener('click', () => finish(null), { once: true });
            moveButton.addEventListener('click', submit);
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay)
                    finish(null);
            });
            document.addEventListener('keydown', handleKeyDown, true);
            document.body.appendChild(overlay);
            readDestination();
            requestAnimationFrame(() => {
                input.focus();
                input.select();
            });
        }).finally(() => {
            activeHiMDMoveChooser = null;
        });
        return activeHiMDMoveChooser;
    }
    electron_1.contextBridge.exposeInMainWorld('native', {
        unrestrictedFetchJSON,
        getSettings: loadSettings,
        interface: iface,
        himdFullInterface: himdIface,
        nwInterface: nwjsIface,
        signHiMDDisc,
        signNWJS,
        openFileHostDialog,
        reload,
        getMiniDiscDiagnostics,
        openWindowsDriverGuide,
        prepareMiniDiscConnection,
        confirmMiniDiscAction,
        formatStandardMDToNetMD,
        formatStandardMDToHiMD,
        returnToModeSelection,
        setRH1KoreanTitleExperiment,
        confirmHiMDReorder,
        chooseHiMDTrackDestination,
        invokeLocalEncoder,
        wrapperChangelog: exports.CHANGELOG,
        _debug_himdPullFile: (a, b) => electron_1.ipcRenderer.invoke('_debug_himdPullFile', a, b),
        _debug_himdList: (a) => electron_1.ipcRenderer.invoke('_debug_himdList', a),
    });
    const koreanText = new Map(Object.entries({
        'Reload TOC': 'TOC 다시 불러오기',
        'Edit Other TOC values': '기타 TOC 값 편집',
        'Edit Other ToC Values': '기타 TOC 값 편집',
        'Toolbox': '도구 상자',
        'Read RAM': 'RAM 읽기',
        'Read Firmware': '펌웨어 읽기',
        'Download TOC': 'TOC 다운로드',
        'Upload TOC': 'TOC 업로드',
        'Enable SP Upload Speedup': 'SP 업로드 가속 사용',
        'Play TETRIS!': '테트리스 실행!',
        'Settings': '설정',
        'Language': '언어',
        'Automatic (System Language)': '자동(시스템 언어)',
        'Exit homebrew mode': '홈브루 모드 종료',
        'Support and FAQ': '지원 및 자주 묻는 질문',
        'Fork me on GitHub': 'GitHub에서 소스 보기',
        'Strip SCMS Information': 'SCMS 정보 제거',
        'Un-Protect all tracks': '모든 트랙 보호 해제',
        'Archive Disc': '디스크 전체 백업',
        'Disable disc swap detection': '디스크 교체 감지 끄기',
        'Enter Service Mode': '서비스 모드 진입',
        'Position Sector': '위치 섹터',
        'Half-Width Sector': '반각 문자 섹터',
        'Timestamp Sector': '타임스탬프 섹터',
        'Full-Width Sector': '전각 문자 섹터',
        'Track Junction Map': '트랙 연결 맵',
        'Start': '시작',
        'End': '끝',
        'Year': '년',
        'Month': '월',
        'Day': '일',
        'Hour': '시',
        'Minute': '분',
        'Signature': '서명',
        'Switch to HiMD full mode': 'Hi-MD 전체 기능 모드로 전환',
        'Switch to HiMD unrestricted mode': 'Hi-MD 무제한 모드로 전환',
        'Homebrew Mode Shortcuts': '홈브루 모드 바로가기',
        'Enter Homebrew Mode': '홈브루 모드 진입',
        'Rename Disc': '디스크 이름 변경',
        'Wipe Disc': '디스크 전체 삭제',
        'Format to HiMD': 'Hi-MD로 포맷',
        'Song Recognition': '곡 정보 인식',
        'Import titles from CSV': 'CSV에서 제목 가져오기',
        'Export titles to CSV': '제목을 CSV로 내보내기',
        'Exit': '종료',
        'Retro Mode (beta)': '레트로 모드(베타)',
        'Self Test': '자체 테스트',
        'About': '정보',
        'Changelog': '변경 내역',
        'About Web MiniDisc Pro': 'Web MiniDisc Pro 정보',
        'Important information': '중요 안내',
        'Upload Settings': '업로드 설정',
        'Song Recognition Settings': '곡 정보 인식 설정',
        'Library': '라이브러리',
        'Add Custom Device': '사용자 지정 장치 추가',
        'Write Protected Disc': '쓰기 방지된 디스크',
        'Bad Sector Encountered!': '불량 섹터가 발견되었습니다!',
        'Edit Fragment Mode': '프래그먼트 모드 편집',
        'Error': '오류',
        'Oops… Something unexpected happened.': '예기치 않은 문제가 발생했습니다.',
        'Recording...': '녹음 중…',
        'Recognizing...': '인식 중…',
        'Computing checksums': '체크섬 계산 중',
        'Identifying song': '곡 정보 확인 중',
        'Reading': '읽는 중',
        'Close': '닫기',
        'Cancel': '취소',
        'OK': '확인',
        'Go': '실행',
        'Edit': '편집',
        'Download': '다운로드',
        'Download and convert': '다운로드 후 변환',
        'Stop reading': '읽기 중지',
        'Reload current block': '현재 블록 다시 읽기',
        'Skip this sector': '이 섹터 건너뛰기',
        'Ignore': '무시',
        'No, get back to safety': '아니요, 안전하게 돌아가기',
        'Title': '제목',
        'Album': '앨범',
        'Artist': '아티스트',
        'Duration': '재생 시간',
        'Track #': '트랙 번호',
        'Original Title': '기존 제목',
        'New Title': '새 제목',
        'Filename': '파일 이름',
        'Album - Title': '앨범 - 제목',
        'Artist - Title': '아티스트 - 제목',
        'Title - Artist': '제목 - 아티스트',
        'Artist - Album - Title': '아티스트 - 앨범 - 제목',
        'Input Source': '입력 소스',
        'Upload from library': '라이브러리에서 업로드',
        'Light': '밝게',
        'Dark': '어둡게',
        'Device Theme': '시스템 설정',
        'Color theme': '색상 테마',
        'Stretch Web Minidisc Pro to fill the screen vertically': '세로 방향으로 화면 채우기',
        'Stretch Web Minidisc Pro to fill the screen horizontally': '가로 방향으로 화면 채우기',
        'Enable full width title editing': '전각 제목 편집 사용',
        'Enable disc-protected warning dialog': '디스크 보호 경고창 사용',
        "Create a ZIP file when using 'Archive Disc'": '디스크 전체 백업 시 ZIP 파일 생성',
        'Use the slower exploit for ATRAC ripping': 'ATRAC 추출에 느린 호환 방식 사용',
        'Enable homebrew mode shortcuts': '홈브루 모드 바로가기 사용',
        'Download raw streams from netmd-exploits (expert feature)': 'netmd-exploits 원시 스트림 다운로드(전문가 기능)',
        'LP / HiMD encoder to use': '사용할 LP / Hi-MD 인코더',
        'Library to use': '사용할 라이브러리',
        'No Copies Allowed': '복사 금지',
        'Allow One Generation': '1세대 복사 허용',
        'Unlimited Copies Allowed': '무제한 복사 허용',
        'Commit changes': '변경 사항 저장',
        'Delete': '삭제',
        'Rename': '이름 변경',
        'Ungroup': '그룹 해제',
        'Rename Group': '그룹 이름 변경',
        'Service': '서비스',
        'Firmware version': '펌웨어 버전',
        'Mode': '모드',
        'Windows에서는 NetMD(0x0219)와 Hi-MD(0x021a)에 WinUSB를 각각 설치해야 합니다. 탐색기용 USBSTOR와 자동 전환되지는 않습니다.': 'Windows에서는 연결할 MiniDisc 기기와 모드에 맞는 WinUSB 드라이버가 필요합니다. 탐색기용 USBSTOR와 자동 전환되지는 않습니다.',
        'Open Devtools': '개발자 도구 열기',
        'Use a Default Download Directory': '기본 다운로드 폴더 사용',
        'Import NetworkWM Keyring Data': 'NetworkWM 키링 데이터 가져오기',
        'The standard open-source ATRAC encoder. Its ATRAC3 support is incomplete': '표준 오픈소스 ATRAC 인코더입니다. ATRAC3 지원은 완전하지 않습니다.',
        'Remote ATRAC Encoder': '원격 ATRAC 인코더',
        'Server Address': '서버 주소',
        'A separate high-quality ATRAC encoder hosted on another server (as defined by https://github.com/thinkbrown/atrac-api)': '별도 서버에서 실행되는 고음질 ATRAC 인코더입니다(thinkbrown/atrac-api 규격).',
        'Built in High-Quality Encoder': '내장 고음질 인코더',
        'The Sony encoder in a purpose-built Web VM': '전용 Web VM에서 실행되는 Sony 인코더입니다.',
        'Allow gapless recording': '갭리스 녹음 허용',
        'Local ATRAC Encoder': '로컬 ATRAC 인코더',
        'A local copy of the high-quality Sony encoder.': '고음질 Sony 인코더를 로컬에서 실행합니다.',
        'FFMPEG Path': 'FFmpeg 경로',
        'psp_at3tool Path': 'psp_at3tool 경로',
        'You are about to enter the homebrew mode. The features accessible through this mode aren\'t part of the NetMD specification and have not been developed by Sony. The developers of netmd‑exploits / netmd‑js are not responsible for any damage done to the discs, data and / or players. From this point on, the software assumes you know what you are doing and will not ask for confirmations or try to prevent damage.': '홈브루 모드로 들어가려고 합니다. 이 모드의 기능은 NetMD 규격에 포함되지 않으며 Sony가 개발한 기능도 아닙니다. netmd‑exploits / netmd‑js 개발자는 디스크, 데이터 또는 기기에 발생하는 손상에 책임지지 않습니다. 이후부터는 사용자가 작업 내용을 이해하고 있다고 간주하며, 소프트웨어가 확인을 요청하거나 손상을 방지하지 않습니다.',
        'Some things to keep in mind:': '주의할 점:',
        '- After exiting homebrew mode, the player needs to be reset by taking out the batteries. TOC changes won\'t be applied otherwise.': '- 홈브루 모드를 종료한 뒤 배터리를 빼서 기기를 초기화해야 합니다. 그렇지 않으면 TOC 변경 사항이 적용되지 않습니다.',
        'This is important for Type-R devices in particular.': '특히 Type-R 기기에서는 반드시 필요합니다.',
        '- Don\'t enter the homebrew mode if there are any TOC Edits queued up.': '- 처리 대기 중인 TOC 편집 사항이 있으면 홈브루 모드에 들어가지 마세요.',
        '- If any tracks / fragments / cells / timestamps are removed / added you will need to update the "Other TOC Values", otherwise the changes won\'t be applied or the disc will become corrupted.': '- 트랙, 프래그먼트, 셀 또는 타임스탬프를 추가하거나 삭제했다면 반드시 “기타 TOC 값”도 갱신해야 합니다. 그렇지 않으면 변경 사항이 적용되지 않거나 디스크가 손상될 수 있습니다.',
        '- Digital transferring of tracks via USB only works if the track can be played by the player. If you create an invalid track and trigger a download, it will crash.': '- USB 디지털 추출은 기기에서 정상 재생되는 트랙에만 작동합니다. 잘못된 트랙을 만든 뒤 다운로드하면 프로그램이 중단될 수 있습니다.',
        '- After creating a track, please reset the player before downloading it. The players keep a second copy of the TOC, which this software cannot alter.': '- 트랙을 만든 뒤 다운로드하기 전에 기기를 초기화하세요. 기기는 이 프로그램에서 수정할 수 없는 TOC 사본을 별도로 보관합니다.',
        '- If the track download is stuck on \'Seeking...\' it means the track is corrupted. If you are sure the track is valid and can be played on the unit, please report it as a bug.': '- 트랙 다운로드가 “탐색 중…”에서 멈춘다면 트랙이 손상된 것입니다. 트랙이 정상이고 기기에서 재생되는 것이 확실하다면 버그로 제보해 주세요.',
        '- This mode is still very unstable. If you find any bugs, please report them by creating an issue on': '- 이 모드는 아직 매우 불안정합니다. 버그를 발견하면',
        'this project\'s github page': '이 프로젝트의 GitHub 페이지',
        'or by messaging the developers on the': '에 이슈를 등록하거나',
        'Minidisc.wiki Discord server': 'Minidisc.wiki Discord 서버의 개발자에게 알려주세요',
        'To download a track via USB:': 'USB로 트랙을 다운로드하려면:',
        '- Select the \'Position Sector\' tab.': '- “위치 섹터” 탭을 선택합니다.',
        '- With \'Shift\' pressed down, the ToC tiles show their numbers instead of descriptions': '- Shift 키를 누르면 TOC 타일에 설명 대신 번호가 표시됩니다.',
        '- Select the ToC tile with the number of the track you want to download on the Track Junction Map': '- 트랙 연결 맵에서 다운로드할 트랙 번호의 TOC 타일을 선택합니다.',
        '- If your device supports it, there should be a download button below the tables': '- 기기가 지원한다면 표 아래에 다운로드 버튼이 나타납니다.',
        'Enter the homebrew mode?': '홈브루 모드로 들어가시겠습니까?',
        'YES, I KNOW WHAT I AM DOING': '예, 위험을 이해하고 진행합니다',
    }));
    const koreanAttributes = new Map(Object.entries({
        'actions': '작업',
        'delete': '삭제',
        'group': '그룹',
        'rename': '이름 변경',
        'ungroup': '그룹 해제',
        'rename group': '그룹 이름 변경',
        'add': '추가',
        'add track': '트랙 추가',
        'remove track': '트랙 제거',
        'rename track': '트랙 이름 변경',
        'move up': '위로 이동',
        'move down': '아래로 이동',
        'add custom device': '사용자 지정 장치 추가',
        'prev': '이전 트랙',
        'play': '재생',
        'pause': '일시 정지',
        'stop': '정지',
        'next': '다음 트랙',
    }));
    const translateKoreanUI = (root = document.body) => {
        if (!root || !isKoreanUI)
            return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent ||
                parent.closest('input, textarea, [contenteditable="true"], tbody td') ||
                parent.closest('[data-no-korean-translation]')) {
                continue;
            }
            const original = node.nodeValue || '';
            const trimmed = original.trim();
            if (!trimmed)
                continue;
            if (trimmed === 'RH10에 일반 MD가 들어 있다면 NetMD를 선택하세요.') {
                parent.style.display = 'none';
                parent.dataset.hiddenRh10Hint = 'true';
                continue;
            }
            let translated = koreanText.get(trimmed);
            if (!translated && /:$/.test(trimmed)) {
                const base = trimmed.replace(/:$/, '').trim();
                const baseTranslation = koreanText.get(base);
                if (baseTranslation)
                    translated = `${baseTranslation}:`;
            }
            if (!translated) {
                const firmware = trimmed.match(/^Firmware version\s+(.+)$/i);
                const track = trimmed.match(/^Track\s+(\d+)$/i);
                const rename = trimmed.match(/^Rename\s+(.+)$/i);
                const remaining = trimmed.match(/^(.+?)\s+left of\s+(.+)$/i);
                const acceptsHomebrewRisk = /^YES,\s*I KNOW WHAT I AM DOING$/i.test(trimmed);
                if (firmware)
                    translated = `펌웨어 버전 ${firmware[1]}`;
                else if (track)
                    translated = `트랙 ${track[1]}`;
                else if (rename)
                    translated = `${rename[1]} 이름 변경`;
                else if (remaining)
                    translated = `${remaining[1]} 남음 / 총 ${remaining[2]}`;
                else if (acceptsHomebrewRisk)
                    translated = '예, 위험을 이해하고 진행합니다';
                else if (/^현재 기기는 Hi-MD\(.+\) 상태입니다\./.test(trimmed))
                    translated = trimmed.replace(/^현재 기기는 Hi-MD/, '현재 기기의 USB 인터페이스는 Hi-MD').replace(' 상태입니다.', '입니다.');
                else if (/^현재 (?:RH10|기기)는 일반 MD.*상태입니다\./.test(trimmed))
                    translated = trimmed
                        .replace(/^현재 (?:RH10|기기)는 일반 MD\(NetMD\s*[·•:]?\s*/i, '현재 기기의 USB 인터페이스는 NetMD(')
                        .replace(/^현재 (?:RH10|기기)는 일반 MD/i, '현재 기기의 USB 인터페이스는 NetMD')
                        .replace(' 상태입니다.', '입니다.');
            }
            if (translated) {
                const leading = original.match(/^\s*/)?.[0] || '';
                const trailing = original.match(/\s*$/)?.[0] || '';
                node.nodeValue = `${leading}${translated}${trailing}`;
            }
        }
        const elements = root.querySelectorAll?.('[aria-label], [title], [placeholder]') || [];
        for (const element of elements) {
            for (const attribute of ['aria-label', 'title', 'placeholder']) {
                const value = element.getAttribute(attribute);
                if (!value)
                    continue;
                const translated = koreanText.get(value) || koreanAttributes.get(value.toLowerCase());
                if (translated)
                    element.setAttribute(attribute, translated);
            }
        }
    };
    const removeObsoleteWelcomeActions = () => {
        for (const guideLink of document.querySelectorAll('a[href="https://www.minidisc.wiki/guides/webminidisc"]')) {
            const wrapper = guideLink.closest('div');
            if (wrapper) {
                wrapper.remove();
            }
            else {
                guideLink.remove();
            }
        }
        for (const element of document.querySelectorAll('button, a, [role="button"]')) {
            const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
            if (/^(?:zadig|수동)\s+드라이버\s+안내$/i.test(label)) {
                element.remove();
            }
        }
    };
    const installModernThemeMarkers = () => {
        document.documentElement.dataset.wmdModernTheme = 'graphite-rose';
        const bodyText = (document.body?.textContent || '').replace(/\s+/g, ' ');
        const isWelcomeScreen = bodyText.includes('사용할 디스크 모드를 선택하세요') ||
            /(?:select|choose).{0,30}(?:disc|disk).{0,20}mode/i.test(bodyText);
        const heading = Array.from(document.querySelectorAll('h1')).find(element => /Web MiniDisc Pro|HiMD \(|Sony (?:MZ|NW|MDS)-|MiniDisc/i.test((element.textContent || '').trim()));
        const shell = heading?.closest('.MuiPaper-root');
        for (const previousShell of document.querySelectorAll('[data-wmd-shell]')) {
            if (previousShell !== shell)
                previousShell.removeAttribute('data-wmd-shell');
        }
        if (shell) {
            shell.dataset.wmdShell = isWelcomeScreen ? 'welcome' : 'main';
            if (!isWelcomeScreen) {
                heading.dataset.wmdDeviceTitle = 'true';
                const header = heading.parentElement;
                if (header) {
                    header.dataset.wmdDeviceHeader = 'true';
                    const headerActions = Array.from(header.children).find(element => element !== heading);
                    if (headerActions)
                        headerActions.dataset.wmdHeaderActions = 'true';
                }
                const capacity = Array.from(shell.querySelectorAll('h2')).find(element => !element.closest('[role="dialog"]'));
                if (capacity)
                    capacity.dataset.wmdCapacityPanel = 'true';
                const toolbar = Array.from(shell.querySelectorAll('.MuiToolbar-root')).find(element => !element.closest('[role="dialog"]'));
                if (toolbar) {
                    toolbar.dataset.wmdDiscToolbar = 'true';
                    const discTitle = toolbar.querySelector('h3');
                    if (discTitle)
                        discTitle.dataset.wmdDiscTitle = 'true';
                }
                const trackList = shell.querySelector('#main');
                if (trackList)
                    trackList.dataset.wmdTrackList = 'true';
                const addButton = shell.querySelector('button[aria-label="add"], button[aria-label="트랙 추가"], button[aria-label="Add track"]');
                if (addButton)
                    addButton.dataset.wmdAddTracks = 'true';
                for (const footerText of document.querySelectorAll('body p, body footer, body span, body a')) {
                    const footerLabel = (footerText.textContent || '').replace(/\s+/g, ' ').trim();
                    if (/^(?:©\s*)?Stefano Brilli(?:,?\s*Asivery)?(?:\s*2026\.?)?$/i.test(footerLabel) && !footerText.closest('[data-wmd-shell]'))
                        footerText.dataset.wmdLegacyFooter = 'true';
                }
            }
        }
        for (const subtitle of document.querySelectorAll('h2')) {
            const text = (subtitle.textContent || '').replace(/\s+/g, ' ').trim();
            if (/^(?:(?:Sony )?MiniDisc 데스크톱 매니저|MiniDisc desktop manager)$/i.test(text)) {
                subtitle.textContent = uiText('MiniDisc 데스크톱 매니저', 'MiniDisc desktop manager');
                subtitle.dataset.wmdAppSubtitle = 'true';
            }
            if (text === '사용할 디스크 모드를 선택하세요' || /^(?:choose|select) (?:the |a )?disc mode/i.test(text)) {
                subtitle.dataset.wmdWelcomePrompt = 'true';
            }
        }
        const connectionTargets = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const target of connectionTargets) {
            if (target.dataset.wmdModeCard === 'networkwm')
                continue;
            const title = Array.from(target.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(element => /^(?:NetMD|Hi-MD)$/i.test((element.textContent || '').trim()));
            const titleText = (title?.textContent || '').trim();
            const directMode = target.dataset.wmdModeCard;
            const mode = directMode === 'netmd' || directMode === 'himd'
                ? directMode
                : /^Hi-MD$/i.test(titleText)
                    ? 'himd'
                    : /^NetMD$/i.test(titleText)
                        ? 'netmd'
                        : null;
            if (!mode)
                continue;
            target.dataset.wmdModeCard = mode;
            target.parentElement?.setAttribute('data-wmd-mode-grid', 'true');
            const action = Array.from(target.querySelectorAll('p, span')).find(element => /(?:(?:NetMD|Hi-MD)로 연결|Connect with (?:NetMD|Hi-MD))/i.test((element.textContent || '').trim()));
            if (action)
                action.dataset.wmdModeAction = 'true';
            const discIcon = target.querySelector('[data-wmd-disc-icon]') || Array.from(target.querySelectorAll('div')).find(element => {
                const style = getComputedStyle(element);
                const width = Number.parseFloat(style.width);
                return style.borderRadius === '50%' && width >= 48 && width <= 70;
            });
            if (discIcon)
                discIcon.dataset.wmdDiscIcon = mode;
            if (discIcon && !discIcon.querySelector('[data-wmd-media-image]')) {
                const image = document.createElement('img');
                image.dataset.wmdMediaImage = mode;
                image.alt = mode === 'himd'
                    ? uiText('1GB Hi-MD 미디어', '1GB Hi-MD media')
                    : uiText('일반 MiniDisc 미디어', 'Standard MiniDisc media');
                image.src = mode === 'himd'
                    ? 'sandbox://assets/himd-media-wikimedia.jpg'
                    : 'sandbox://assets/netmd-media-final.png';
                image.draggable = false;
                discIcon.appendChild(image);
            }
        }
        for (const alert of document.querySelectorAll('.MuiAlert-root')) {
            if ((alert.textContent || '').includes('WinUSB')) {
                alert.dataset.wmdDriverNotice = 'true';
            }
        }
        for (const element of document.querySelectorAll('div')) {
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            if (/^(?:MiniDisc 연결 진단|MiniDisc connection diagnostics)/i.test(text) && element.querySelector('button')) {
                element.dataset.wmdDiagnostics = 'true';
            }
        }
    };
    const lucideIcon = (name, size = 22) => {
        const icons = {
            more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
            refresh: '<path d="M20 6v6h-6"/><path d="M20 12a8 8 0 1 0-2.34 5.66L20 15"/>',
            settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
            logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
            help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><path d="M12 18h.01"/>',
            download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
            upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
            archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
            unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
            shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
            music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
            trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
            edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
            plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
            previous: '<path d="m19 20-9-8 9-8v16z"/><path d="M5 19V5"/>',
            play: '<path d="m5 3 14 9-14 9V3z"/>',
            pause: '<path d="M8 5v14"/><path d="M16 5v14"/>',
            stop: '<rect width="14" height="14" x="5" y="5" rx="1"/>',
            next: '<path d="m5 4 9 8-9 8V4z"/><path d="M19 5v14"/>',
            warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
            info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        };
        const paths = icons[name];
        if (!paths)
            return '';
        return `<span data-wmd-lucide="${name}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
    };
    const installLucideIcons = () => {
        const menuLabelToIcon = [
            [/디스크 다시 검색|Reload TOC/i, 'refresh'],
            [/설정|Settings/i, 'settings'],
            [/종료|Exit/i, 'logout'],
            [/도움말|Support|FAQ/i, 'help'],
            [/디스크 전체 보관|Archive Disc/i, 'archive'],
            [/보호 해제|Un-Protect/i, 'shield'],
            [/SCMS/i, 'unlock'],
            [/다운로드|Download/i, 'download'],
            [/업로드|Upload/i, 'upload'],
            [/곡 인식|Music/i, 'music'],
            [/삭제|Delete/i, 'trash'],
            [/이름 변경|Rename|Edit/i, 'edit'],
        ];
        for (const item of document.querySelectorAll('[role="menuitem"]')) {
            const label = (item.textContent || '').replace(/\s+/g, ' ').trim();
            const match = menuLabelToIcon.find(([pattern]) => pattern.test(label));
            const holder = item.querySelector('.MuiListItemIcon-root');
            if (!match || !holder || holder.dataset.wmdLucideReady === match[1])
                continue;
            holder.innerHTML = lucideIcon(match[1]);
            holder.dataset.wmdLucideReady = match[1];
        }
        const heading = Array.from(document.querySelectorAll('h1')).find(element => /Web MiniDisc Pro|HiMD \(|Sony (?:MZ|NW|MDS)-|MiniDisc/i.test((element.textContent || '').trim()));
        const shell = heading?.closest('.MuiPaper-root');
        const topMenuButton = shell?.querySelector('h1')?.parentElement?.querySelector('button');
        if (topMenuButton && !topMenuButton.dataset.wmdLucideTopMenu) {
            topMenuButton.innerHTML = lucideIcon('more', 25);
            topMenuButton.dataset.wmdLucideTopMenu = 'true';
            topMenuButton.setAttribute('aria-label', uiText('메뉴 열기', 'Open menu'));
        }
        for (const button of document.querySelectorAll('.MuiFab-root')) {
            if (button.dataset.wmdLucideFab)
                continue;
            button.innerHTML = lucideIcon('plus', 28);
            button.dataset.wmdLucideFab = 'true';
            button.setAttribute('aria-label', uiText('트랙 추가', 'Add track'));
        }
        // Playback controls change their React-owned child icon whenever play/pause
        // state changes. Replacing those children with innerHTML makes React later
        // remove a node it no longer owns and crashes with removeChild/NotFoundError.
        // Keep the upstream playback icons intact.
    };
    const installModernAlertDialogs = () => {
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            if (dialog.classList.contains('wmd-device-picker-panel') ||
                dialog.classList.contains('wmd-driver-progress-panel'))
                continue;
            const alert = dialog.querySelector('.MuiAlert-root');
            const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
            const title = dialog.querySelector('.MuiDialogTitle-root, h1, h2, h3');
            const titleText = (title?.textContent || '').replace(/\s+/g, ' ').trim();
            let kind = 'info';
            let iconName = 'info';
            const isAboutDialog = /Web MiniDisc Pro\s*(?:정보|About)|About Web MiniDisc Pro|프로그램 정보/i.test(titleText);
            if (isAboutDialog) {
                kind = 'info';
                iconName = 'info';
            }
            else if (/설정|Settings/i.test(titleText)) {
                kind = 'settings';
                iconName = 'settings';
            }
            else if (/녹음|전송|Upload|Record/i.test(titleText)) {
                kind = 'transfer';
                iconName = 'music';
            }
            else if (/이름|제목|편집|Rename|Edit/i.test(titleText)) {
                kind = 'edit';
                iconName = 'edit';
            }
            else if (/다운로드|내보내기|Download|Export/i.test(titleText)) {
                kind = 'download';
                iconName = 'download';
            }
            else if (/가져오기|Import/i.test(titleText)) {
                kind = 'upload';
                iconName = 'upload';
            }
            else if (/오류|실패|차단|찾을 수 없|삭제|포맷|쓰기 방지|불량 섹터|중요|Error|Failed|Blocked|Not Found|Delete|Format|Write Protected|Bad Sector|Important/i.test(`${titleText} ${text}`) ||
                Boolean(alert?.matches('.MuiAlert-filledError, .MuiAlert-standardError'))) {
                kind = 'warning';
                iconName = 'warning';
            }
            dialog.dataset.wmdDialog = 'true';
            dialog.dataset.wmdDialogKind = kind;
            if (alert)
                dialog.dataset.wmdAlertDialog = kind === 'warning' ? 'error' : 'warning';
            if (kind === 'transfer') {
                dialog.dataset.wmdTransferDialog = 'true';
                const content = dialog.querySelector('.MuiDialogContent-root');
                if (content) {
                    content.dataset.wmdTransferContent = 'true';
                    Array.from(content.querySelectorAll(':scope > .MuiDialogContentText-root')).forEach((element, index) => {
                        element.dataset.wmdTransferLabel = String(index + 1);
                    });
                    Array.from(content.querySelectorAll(':scope > .MuiLinearProgress-root')).forEach((element, index) => {
                        element.dataset.wmdTransferProgress = String(index + 1);
                        const percentage = element.nextElementSibling;
                        if (percentage)
                            percentage.dataset.wmdTransferPercentage = String(index + 1);
                    });
                }
                const actions = dialog.querySelector('.MuiDialogActions-root');
                if (actions)
                    actions.dataset.wmdTransferActions = 'true';
            }
            if (!title)
                continue;
            title.dataset.wmdDialogTitle = 'true';
            let icon = title.querySelector('[data-wmd-dialog-title-icon]');
            if (!icon) {
                icon = document.createElement('span');
                icon.dataset.wmdDialogTitleIcon = 'true';
                title.insertBefore(icon, title.firstChild);
            }
            if (icon.dataset.wmdDialogTitleIconKind !== kind) {
                icon.dataset.wmdDialogTitleIconKind = kind;
                icon.innerHTML = lucideIcon(iconName, 22);
            }
            if (isAboutDialog) {
                const content = dialog.querySelector('.MuiDialogContent-root');
                if (content && !content.querySelector('[data-wmd-custom-build-label]')) {
                    const label = document.createElement('div');
                    label.dataset.wmdCustomBuildLabel = 'true';
                    label.textContent = uiText('Custom 빌드 · Web MiniDisc Pro 1.5.4 기반', 'Custom build · Based on Web MiniDisc Pro 1.5.4');
                    content.appendChild(label);
                }
            }
        }
    };
    let rh1KoreanTitleExperimentEnabled = false;
    let rh1KoreanTitleUseFilename = true;
    let rh1HiMDPageWasDetected = false;
    let netmdOriginalTitleModeEnabled = false;
    if (document.documentElement) {
        document.documentElement.dataset.rh1KoreanTitleExperiment = 'false';
        document.documentElement.dataset.rh1KoreanTitleUseFilename = 'false';
        document.documentElement.dataset.netmdOriginalTitleMode = 'false';
    }
    const notifyRH1KoreanTitleModeChanged = () => {
        if (document.documentElement) {
            document.documentElement.dataset.rh1KoreanTitleExperiment = rh1KoreanTitleExperimentEnabled ? 'true' : 'false';
            document.documentElement.dataset.rh1KoreanTitleUseFilename = rh1KoreanTitleExperimentEnabled && rh1KoreanTitleUseFilename
                ? 'true'
                : 'false';
        }
        document.dispatchEvent(new Event('rh1-korean-title-mode-changed'));
    };
    const notifyNetMDOriginalTitleModeChanged = () => {
        if (document.documentElement)
            document.documentElement.dataset.netmdOriginalTitleMode = netmdOriginalTitleModeEnabled ? 'true' : 'false';
        document.dispatchEvent(new Event('rh1-korean-title-mode-changed'));
    };
    const installRH1KoreanTitleOption = () => {
        const pageHasRH1HiMD = Array.from(document.querySelectorAll('h1')).some(heading => (heading.textContent || '').replace(/\s+/g, ' ').trim() === 'HiMD (Sony MZ-RH1)');
        if (!pageHasRH1HiMD) {
            document.querySelector('[data-rh1-korean-title-option]')?.remove();
            // Dialog transitions can briefly remove the page heading. Preserve the
            // active title policy until the user actually returns to mode selection.
            return;
        }
        rh1HiMDPageWasDetected = true;
        const dialogTitle = document.getElementById('convert-dialog-slide-title');
        const dialog = dialogTitle?.closest('[role="dialog"]');
        if (!dialog || dialog.querySelector('[data-rh1-korean-title-option]')) {
            return;
        }
        const content = dialog.querySelector('.MuiDialogContent-root');
        if (!content) {
            return;
        }
        const panel = document.createElement('section');
        panel.dataset.rh1KoreanTitleOption = 'true';
        panel.dataset.noKoreanTranslation = 'true';
        Object.assign(panel.style, {
            margin: '14px 0 8px',
            padding: '12px 14px',
            border: '1px solid rgba(188, 90, 136, 0.45)',
            borderRadius: '5px',
            background: 'rgba(188, 90, 136, 0.10)',
            color: 'rgba(255, 255, 255, 0.92)',
        });
        const experimentRow = document.createElement('label');
        Object.assign(experimentRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '600',
        });
        const experimentInput = document.createElement('input');
        experimentInput.type = 'checkbox';
        experimentInput.checked = rh1KoreanTitleExperimentEnabled;
        experimentInput.setAttribute('aria-label', uiText('한글 제목 유지', 'Preserve Korean titles'));
        Object.assign(experimentInput.style, {
            width: '18px',
            height: '18px',
            margin: '0',
            accentColor: '#bc5a88',
            cursor: 'pointer',
        });
        const experimentLabel = document.createElement('span');
        experimentLabel.textContent = uiText('한글 제목 유지', 'Preserve Korean titles');
        const badge = document.createElement('span');
        badge.textContent = uiText('비공식', 'Unofficial');
        Object.assign(badge.style, {
            marginLeft: 'auto',
            padding: '2px 7px',
            borderRadius: '10px',
            background: '#bc5a88',
            color: '#fff',
            fontSize: '11px',
            fontWeight: '700',
        });
        experimentRow.append(experimentInput, experimentLabel, badge);
        const description = document.createElement('div');
        description.textContent = uiText('Sony MZ-RH1 Hi-MD 전용입니다. 켜면 여러 곡 전송과 전송 후 수정에서 제목·앨범·아티스트의 한글을 그대로 보존합니다.', 'For Sony MZ-RH1 in Hi-MD mode only. When enabled, Korean title, album, and artist text is preserved during multi-track transfers and later edits.');
        Object.assign(description.style, {
            margin: '7px 0 8px 28px',
            color: 'rgba(255, 255, 255, 0.70)',
            fontSize: '12px',
            lineHeight: '1.45',
        });
        const filenameRow = document.createElement('label');
        Object.assign(filenameRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            marginLeft: '28px',
            cursor: 'pointer',
            fontSize: '13px',
        });
        const filenameInput = document.createElement('input');
        filenameInput.type = 'checkbox';
        filenameInput.checked = rh1KoreanTitleUseFilename;
        filenameInput.setAttribute('aria-label', uiText('한글 파일명을 제목으로 사용', 'Use the Korean filename as the title'));
        Object.assign(filenameInput.style, {
            width: '16px',
            height: '16px',
            margin: '0',
            accentColor: '#bc5a88',
            cursor: 'pointer',
        });
        const filenameLabel = document.createElement('span');
        filenameLabel.textContent = uiText('한글 파일명을 제목으로 사용 (영문 내부 태그 대신)', 'Use the Korean filename as the title (instead of English embedded tags)');
        filenameRow.append(filenameInput, filenameLabel);
        const metadataHint = document.createElement('div');
        metadataHint.textContent = uiText('참고: 현재 표의 영어 제목은 파일명이 아니라 음원 내부의 영문 태그입니다.', 'Note: English titles shown in the table come from embedded audio tags, not filenames.');
        Object.assign(metadataHint.style, {
            margin: '6px 0 0 53px',
            color: 'rgba(255, 255, 255, 0.58)',
            fontSize: '11px',
            lineHeight: '1.4',
        });
        const status = document.createElement('div');
        Object.assign(status.style, {
            margin: '7px 0 0 28px',
            color: '#df90b5',
            fontSize: '11px',
            lineHeight: '1.35',
        });
        const refreshPanelState = () => {
            experimentInput.checked = rh1KoreanTitleExperimentEnabled;
            filenameInput.checked = rh1KoreanTitleUseFilename;
            filenameInput.disabled = !rh1KoreanTitleExperimentEnabled || experimentInput.disabled;
            filenameRow.style.opacity = filenameInput.disabled ? '0.48' : '1';
            filenameRow.style.cursor = filenameInput.disabled ? 'default' : 'pointer';
            status.textContent = rh1KoreanTitleExperimentEnabled
                ? uiText('한글 유지 사용 중 · 여러 곡 전체와 전송 후 제목 수정에 같은 설정이 적용됩니다.', 'Korean preservation is active for all queued tracks and later title edits.')
                : uiText('기본값: 한글 제목을 로마자로 변환합니다.', 'Default: Korean titles are romanized.');
        };
        experimentInput.addEventListener('change', async () => {
            const requestedState = experimentInput.checked;
            experimentInput.disabled = true;
            filenameInput.disabled = true;
            status.textContent = requestedState ? uiText('RH1 연결을 확인하는 중…', 'Checking the RH1 connection…') : uiText('기본 제목 모드로 되돌리는 중…', 'Returning to the default title mode…');
            try {
                const result = await setRH1KoreanTitleExperiment(requestedState);
                if (!result?.ok) {
                    throw new Error(result?.message || uiText('한글 제목 실험 설정을 변경하지 못했습니다.', 'Could not change the Korean title experiment setting.'));
                }
                rh1KoreanTitleExperimentEnabled = Boolean(result.enabled);
                notifyRH1KoreanTitleModeChanged();
            }
            catch (error) {
                window.alert(error instanceof Error ? error.message : String(error));
            }
            finally {
                experimentInput.disabled = false;
                refreshPanelState();
            }
        });
        filenameInput.addEventListener('change', () => {
            rh1KoreanTitleUseFilename = filenameInput.checked;
            notifyRH1KoreanTitleModeChanged();
            refreshPanelState();
        });
        panel.append(experimentRow, description, filenameRow, metadataHint, status);
        const advancedSummary = Array.from(content.querySelectorAll('.MuiAccordionSummary-root, [role="button"]')).find(element => /^(고급 설정|Advanced Options)$/.test((element.textContent || '').replace(/\s+/g, ' ').trim()));
        const advancedAccordion = advancedSummary?.closest('.MuiAccordion-root');
        if (advancedAccordion?.parentElement) {
            advancedAccordion.parentElement.insertBefore(panel, advancedAccordion);
        }
        else {
            content.appendChild(panel);
        }
        refreshPanelState();
    };
    const installNetMDOriginalTitleOption = () => {
        const dialog = document.getElementById('convert-dialog-slide-title')?.closest('[role="dialog"]');
        if (!dialog || dialog.querySelector('[data-netmd-original-title-option]'))
            return;
        const content = dialog.querySelector('.MuiDialogContent-root');
        if (!content)
            return;
        const panel = document.createElement('section');
        panel.dataset.netmdOriginalTitleOption = 'true';
        panel.dataset.noKoreanTranslation = 'true';
        Object.assign(panel.style, {
            margin: '14px 0 8px', padding: '12px 14px', border: '1px solid rgba(222,153,87,.42)',
            borderRadius: '5px', background: 'rgba(222,153,87,.09)', color: 'rgba(255,255,255,.92)',
        });
        const row = document.createElement('label');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' });
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = netmdOriginalTitleModeEnabled;
        input.setAttribute('aria-label', uiText('원본 프로그램 방식으로 제목 보내기', 'Use original title handling'));
        Object.assign(input.style, { width: '18px', height: '18px', margin: '0', accentColor: '#de9957' });
        const label = document.createElement('span');
        label.textContent = uiText('원본 프로그램 방식으로 제목 보내기', 'Use original title handling');
        const badge = document.createElement('span');
        badge.textContent = uiText('실험', 'Experimental');
        Object.assign(badge.style, { marginLeft: 'auto', padding: '2px 7px', borderRadius: '10px', background: '#a76832', color: '#fff', fontSize: '11px' });
        row.append(input, label, badge);
        const description = document.createElement('div');
        description.textContent = uiText('켜면 우리가 추가한 로마자 변환만 건너뛰고 Web MiniDisc 원본의 제목 처리 함수를 그대로 사용합니다. NetMD와 Hi-MD 모두에 적용되며 기기에 따라 글자가 깨질 수 있습니다.', 'When enabled, only the added romanization step is skipped and the original Web MiniDisc title handling is used. This applies to NetMD and Hi-MD, and some recorders may display corrupted characters.');
        Object.assign(description.style, { margin: '7px 0 0 28px', color: 'rgba(255,224,191,.78)', fontSize: '12px', lineHeight: '1.45' });
        const status = document.createElement('div');
        Object.assign(status.style, { margin: '7px 0 0 28px', color: '#e7ad78', fontSize: '11px' });
        const refresh = () => {
            input.checked = netmdOriginalTitleModeEnabled;
            status.textContent = netmdOriginalTitleModeEnabled
                ? uiText('원본 처리 방식 사용 중 · 현재 목록 전체에 적용됩니다.', 'Original title handling is active for the entire current list.')
                : uiText('기본값: 한글을 로마자로 변환합니다.', 'Default: Korean text is romanized.');
        };
        input.addEventListener('change', () => {
            netmdOriginalTitleModeEnabled = input.checked;
            notifyNetMDOriginalTitleModeChanged();
            refresh();
        });
        panel.append(row, description, status);
        const advanced = Array.from(content.querySelectorAll('.MuiAccordionSummary-root, [role="button"]')).find(element => /^(고급 설정|Advanced Options)$/.test((element.textContent || '').replace(/\s+/g, ' ').trim()))?.closest('.MuiAccordion-root');
        if (advanced?.parentElement)
            advanced.parentElement.insertBefore(panel, advanced);
        else
            content.appendChild(panel);
        refresh();
    };
    const installRH1KoreanRenameOption = () => {
        const pageHasRH1HiMD = Array.from(document.querySelectorAll('h1')).some(heading => (heading.textContent || '').replace(/\s+/g, ' ').trim() === 'HiMD (Sony MZ-RH1)');
        if (!pageHasRH1HiMD)
            return;
        const dialogTitle = document.getElementById('rename-dialog-title');
        const dialog = dialogTitle?.closest('[role="dialog"]');
        if (!dialog || dialog.querySelector('[data-rh1-korean-rename-option]') || !dialog.querySelector('#himdName'))
            return;
        const content = dialog.querySelector('.MuiDialogContent-root');
        if (!content)
            return;
        const row = document.createElement('label');
        row.dataset.rh1KoreanRenameOption = 'true';
        row.dataset.noKoreanTranslation = 'true';
        Object.assign(row.style, {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            margin: '10px 0 2px',
            padding: '12px 14px',
            border: '1px solid rgba(188, 90, 136, 0.38)',
            borderRadius: '10px',
            background: 'rgba(188, 90, 136, 0.09)',
            color: 'rgba(255, 255, 255, 0.92)',
            cursor: 'pointer',
        });
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = rh1KoreanTitleExperimentEnabled;
        input.setAttribute('aria-label', uiText('수정한 한글 제목 유지', 'Preserve edited Korean titles'));
        Object.assign(input.style, {
            width: '18px',
            height: '18px',
            margin: '2px 0 0',
            accentColor: '#bc5a88',
            cursor: 'pointer',
        });
        const copy = document.createElement('span');
        copy.innerHTML = uiText('<strong style="display:block;margin-bottom:3px">한글 제목 유지</strong><span style="display:block;color:rgba(255,255,255,.66);font-size:12px;line-height:1.45">켜면 제목·앨범·아티스트를 한글 그대로 저장합니다. 끄면 수정한 값 전체를 로마자로 변환합니다.</span>', '<strong style="display:block;margin-bottom:3px">Preserve Korean titles</strong><span style="display:block;color:rgba(255,255,255,.66);font-size:12px;line-height:1.45">When enabled, title, album, and artist text is stored in Korean. When disabled, edited values are romanized.</span>');
        input.addEventListener('change', async () => {
            const requestedState = input.checked;
            input.disabled = true;
            try {
                const result = await setRH1KoreanTitleExperiment(requestedState);
                if (!result?.ok)
                    throw new Error(result?.message || uiText('한글 제목 유지 설정을 변경하지 못했습니다.', 'Could not change the Korean title preservation setting.'));
                rh1KoreanTitleExperimentEnabled = Boolean(result.enabled);
                notifyRH1KoreanTitleModeChanged();
            }
            catch (error) {
                window.alert(error instanceof Error ? error.message : String(error));
            }
            finally {
                input.checked = rh1KoreanTitleExperimentEnabled;
                input.disabled = false;
            }
        });
        row.append(input, copy);
        content.appendChild(row);
    };
    const installNetMDKoreanRenameNotice = () => {
        const dialogTitle = document.getElementById('rename-dialog-title');
        const dialog = dialogTitle?.closest('[role="dialog"]');
        const nameInput = dialog?.querySelector('#name');
        if (!dialog || !nameInput || dialog.querySelector('#himdName'))
            return;
        const content = dialog.querySelector('.MuiDialogContent-root');
        if (!content)
            return;
        let notice = dialog.querySelector('[data-netmd-korean-rename-notice]');
        if (!notice) {
            notice = document.createElement('div');
            notice.dataset.netmdKoreanRenameNotice = 'true';
            notice.dataset.noKoreanTranslation = 'true';
            notice.textContent = uiText('NetMD 제목 영역은 한글을 직접 저장할 수 없어 적용 시 로마자로 변환됩니다. 한글 제목을 그대로 저장하려면 RH1의 Hi-MD 모드를 사용하세요.', 'NetMD title fields cannot store Korean directly, so Korean text is romanized when applied. Use the RH1 in Hi-MD mode to preserve Korean titles.');
            Object.assign(notice.style, {
                display: 'none',
                margin: '9px 0 2px',
                padding: '10px 12px',
                border: '1px solid rgba(222, 153, 87, 0.38)',
                borderRadius: '9px',
                background: 'rgba(222, 153, 87, 0.08)',
                color: 'rgba(255, 224, 191, 0.88)',
                fontSize: '12px',
                lineHeight: '1.45',
            });
            content.appendChild(notice);
        }
        const updateNotice = () => {
            const values = Array.from(dialog.querySelectorAll('#name, #fullWidthTitle')).map(input => input.value || '');
            notice.style.display = values.some(value => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(value)) ? 'block' : 'none';
        };
        if (!dialog.dataset.netmdKoreanRenameNoticeReady) {
            dialog.dataset.netmdKoreanRenameNoticeReady = 'true';
            dialog.addEventListener('input', updateNotice);
        }
        updateNotice();
    };
    let netMDFalseModeRetryAttempted = false;
    const recoverFalseNetMDModeDialog = (dialog) => {
        if (process.platform !== 'darwin' || netMDFalseModeRetryAttempted || dialog.dataset.wmdNetmdModeCheck)
            return;
        dialog.dataset.wmdNetmdModeCheck = 'true';
        const text = dialog.textContent || '';
        const describesStaleHiMDMode = text.includes('현재 기기는 Hi-MD') ||
            text.includes('현재 기기의 USB 인터페이스는 Hi-MD') ||
            text.includes('현재 기기의 USB 인터페이스가 Hi-MD') ||
            text.includes('연결된 기기는 Hi-MD') ||
            text.includes('현재 USB 인터페이스가 Hi-MD 모드에 남아 있습니다');
        if (!text.includes('NetMD 모드로 연결할 수 없습니다') ||
            !text.includes('잘못된 연결 모드가 차단되었습니다') ||
            !describesStaleHiMDMode)
            return;
        void (async () => {
            try {
                const diagnostics = await getMiniDiscDiagnostics();
                const devices = Array.isArray(diagnostics?.devices) ? diagnostics.devices : [];
                const actualNetMD = devices.some(device => device.mode === 'netmd' && device.supportsNetMD);
                const actualHiMD = devices.some(device => device.mode === 'himd' && device.supportsHiMD);
                if (!actualNetMD || actualHiMD)
                    return;
                netMDFalseModeRetryAttempted = true;
                // The recorder is already 054c:017e. The first click after a
                // Hi-MD -> NetMD relaunch can still use the renderer's old
                // Hi-MD service state. Closing this false dialog resets that
                // state; the same click then succeeds, as a manual retry does.
                const closeButton = Array.from(dialog.querySelectorAll('button')).find(button => /^(닫기|Close)$/i.test((button.textContent || '').trim()));
                closeButton?.click();
                await new Promise(resolve => setTimeout(resolve, 350));
                const netMDTarget = [...document.querySelectorAll('a, button, [role="button"]')]
                    .filter(element => !element.closest('[role="dialog"]'))
                    .find(element => {
                    const label = (element.textContent || '').replace(/\s+/g, ' ').trim();
                    return label.includes('NetMD로 연결') || /(?:connect.*netmd|netmd.*connect)/i.test(label);
                });
                netMDTarget?.click();
            }
            catch (error) {
                console.warn('Could not recover the stale NetMD mode dialog:', error);
            }
        })();
    };
    const installNetMDFormatButton = () => {
        if (process.platform !== 'win32' && process.platform !== 'darwin')
            return;
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            const text = dialog.textContent || '';
            recoverFalseNetMDModeDialog(dialog);
            if (!text.includes('NetMD 모드로 연결할 수 없습니다') ||
                (!text.includes('현재 기기는 Hi-MD') &&
                    !text.includes('현재 기기의 USB 인터페이스는 Hi-MD') &&
                    !text.includes('현재 기기의 USB 인터페이스가 Hi-MD') &&
                    !text.includes('연결된 기기는 Hi-MD'))) {
                continue;
            }
            const alertMessage = dialog.querySelector('.MuiAlert-message');
            if (alertMessage) {
                const walker = document.createTreeWalker(alertMessage, NodeFilter.SHOW_TEXT);
                let node = walker.nextNode();
                while (node) {
                    const value = node.nodeValue || '';
                    if (value.includes('현재 기기는 Hi-MD') ||
                        value.includes('현재 기기의 USB 인터페이스는 Hi-MD') ||
                        value.includes('현재 기기의 USB 인터페이스가 Hi-MD')) {
                        node.nodeValue = uiText('현재 USB 인터페이스가 Hi-MD 모드에 남아 있습니다. 이 표시만으로 디스크 포맷을 판단할 수는 없습니다. 일반 NetMD 포맷 미디어라면 USB 케이블을 뺐다가 다시 연결한 뒤 NetMD를 선택하세요. Hi-MD 포맷 미디어라면 “Hi-MD로 연결”을 선택하세요. 디스크를 지울 목적이 아니라면 전체 삭제 버튼은 누르지 마세요.', 'The USB interface is still in Hi-MD mode. This alone does not identify the disc format. For standard NetMD media, reconnect USB and select NetMD. For Hi-MD-formatted media, select “Connect with Hi-MD.” Do not use the erase action unless you intend to wipe the disc.');
                        break;
                    }
                    node = walker.nextNode();
                }
            }
            if (dialog.querySelector('[data-netmd-format-button]'))
                continue;
            const existingButtons = Array.from(dialog.querySelectorAll('button'));
            const referenceButton = existingButtons.find(button => button.textContent?.includes('Hi-MD로 연결')) ||
                existingButtons[existingButtons.length - 1];
            if (!referenceButton?.parentElement) {
                continue;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.netmdFormatButton = 'true';
            button.className = referenceButton.className;
            button.textContent = uiText('전체 삭제 후 NetMD로 초기화', 'Erase all and initialize as NetMD');
            button.style.backgroundColor = '#c62828';
            button.style.color = '#fff';
            button.style.marginRight = '8px';
            button.addEventListener('click', async () => {
                button.disabled = true;
                button.textContent = uiText('디스크 확인 중…', 'Checking disc…');
                // This is the pre-format mode-choice dialog. Close it before
                // starting the destructive confirmation/progress flow;
                // otherwise it remains underneath the progress overlay and
                // reappears after a successful Hi-MD -> NetMD conversion.
                const initialCloseButton = Array.from(dialog.querySelectorAll('button')).find(candidate => candidate !== button &&
                    /^(닫기|Close)$/i.test((candidate.textContent || '').trim()));
                initialCloseButton?.click();
                await new Promise(resolve => setTimeout(resolve, 0));
                const progress = showMiniDiscFormatProgress(uiText('NetMD 전환 진행 중', 'Switching to NetMD'));
                progress.update({ message: uiText('Hi-MD 미디어를 지우고 NetMD 모드로 전환하고 있습니다.', 'Erasing the Hi-MD media and switching to NetMD mode.') });
                try {
                    const result = await formatStandardMDToNetMD();
                    if (result?.cancelled) {
                        button.disabled = false;
                        button.textContent = uiText('전체 삭제 후 NetMD로 초기화', 'Erase all and initialize as NetMD');
                        return;
                    }
                    const resultMessage = result?.message || (result?.ok ? uiText('포맷 명령을 완료했습니다.', 'The format command completed.') : uiText('포맷에 실패했습니다.', 'Formatting failed.'));
                    if (result?.ok) {
                        progress.update({ message: uiText('NetMD 전환을 확인했습니다. 새 연결 상태로 앱을 다시 시작합니다.', 'The NetMD switch was confirmed. Restarting the app with the new connection.') });
                        await electron_1.ipcRenderer.invoke('restartAfterMiniDiscModeSwitch', 'netmd');
                        return;
                    }
                    await showMiniDiscWarning({
                        title: uiText('NetMD 포맷 실패', 'NetMD format failed'),
                        message: resultMessage,
                        detail: uiText('디스크와 USB 연결 상태를 확인한 뒤 다시 시도해 주세요.', 'Check the disc and USB connection, then try again.'),
                    });
                    button.disabled = false;
                    button.textContent = uiText('전체 삭제 후 NetMD로 초기화', 'Erase all and initialize as NetMD');
                }
                catch (error) {
                    await showMiniDiscWarning({
                        title: uiText('NetMD 포맷 오류', 'NetMD format error'),
                        message: uiText('NetMD 포맷 중 오류가 발생했습니다.', 'An error occurred while formatting as NetMD.'),
                        detail: error instanceof Error ? error.message : String(error),
                    });
                    button.disabled = false;
                    button.textContent = uiText('전체 삭제 후 NetMD로 초기화', 'Erase all and initialize as NetMD');
                }
                finally {
                    progress.close();
                }
            });
            referenceButton.parentElement.insertBefore(button, referenceButton);
        }
    };
    const showMiniDiscFormatProgress = (progressTitle = uiText('Hi-MD 포맷 진행 중', 'Formatting Hi-MD')) => {
        document.querySelector('[data-himd-format-progress]')?.remove();
        const overlay = document.createElement('div');
        overlay.dataset.himdFormatProgress = 'true';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'himd-format-progress-title');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483647',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(3px)',
            pointerEvents: 'auto',
        });
        const panel = document.createElement('div');
        Object.assign(panel.style, {
            width: 'min(560px, calc(100vw - 48px))',
            padding: '32px',
            borderRadius: '22px',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            background: '#202126',
            color: '#f7f3f6',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        });
        const title = document.createElement('h2');
        title.id = 'himd-format-progress-title';
        title.textContent = progressTitle;
        Object.assign(title.style, { margin: '0 0 18px', fontSize: '26px' });
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '16px' });
        const spinner = document.createElement('div');
        spinner.textContent = '◌';
        Object.assign(spinner.style, {
            fontSize: '38px',
            lineHeight: '1',
            color: '#ef87b5',
            animation: 'himdFormatSpin 1s linear infinite',
        });
        const message = document.createElement('p');
        message.textContent = uiText('연결된 기기와 일반 MD 상태를 확인하고 있습니다.', 'Checking the connected recorder and standard MiniDisc.');
        Object.assign(message.style, { margin: '0', fontSize: '18px', lineHeight: '1.55' });
        const warning = document.createElement('p');
        warning.textContent = uiText('완료 안내가 나타날 때까지 앱, USB 케이블 및 기기 전원을 건드리지 마세요.', 'Do not close the app, disconnect USB, or power off the recorder until completion is confirmed.');
        Object.assign(warning.style, {
            margin: '22px 0 0',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'rgba(239, 135, 181, 0.12)',
            color: '#f4bad2',
            fontSize: '15px',
            lineHeight: '1.5',
        });
        const style = document.createElement('style');
        style.textContent = '@keyframes himdFormatSpin { to { transform: rotate(360deg); } }';
        row.append(spinner, message);
        panel.append(title, row, warning);
        overlay.append(style, panel);
        document.body.appendChild(overlay);
        return {
            update(value) {
                if (value?.message)
                    message.textContent = value.message;
            },
            close() {
                overlay.remove();
            },
        };
    };
    const installHiMDFormatButton = () => {
        if (process.platform !== 'win32' && process.platform !== 'darwin')
            return;
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            const text = dialog.textContent || '';
            if ((!text.includes('Hi-MD 모드로 연결할 수 없습니다') &&
                !text.includes('Hi-MD USB 인터페이스를 기다리고 있습니다') &&
                !/cannot connect.*Hi-?MD|waiting for.*Hi-?MD USB interface/i.test(text)) ||
                (!text.includes('일반 MD') && !text.includes('NetMD') && !/standard MiniDisc/i.test(text))) {
                continue;
            }
            const alertMessage = dialog.querySelector('.MuiAlert-message');
            if (alertMessage) {
                const walker = document.createTreeWalker(alertMessage, NodeFilter.SHOW_TEXT);
                let node = walker.nextNode();
                while (node) {
                    if ((node.nodeValue || '').includes('현재 RH10은 일반 MD')) {
                        node.nodeValue = uiText('연결된 기기는 일반 MD(NetMD) 모드입니다. Hi-MD 또는 1GB Hi-MD 전용 미디어가 들어 있다면 포맷하지 말고 USB를 다시 연결한 뒤 다시 시도하세요. 아래 포맷 기능은 지워도 되는 일반 MD를 Hi-MD 형식으로 새로 초기화하려는 경우에만 사용합니다.', 'The recorder is in standard MiniDisc (NetMD) mode. If a Hi-MD or 1GB Hi-MD disc is inserted, do not format it; reconnect USB and try again. Use the format action below only to erase a standard MiniDisc and initialize it as Hi-MD.');
                        break;
                    }
                    node = walker.nextNode();
                }
            }
            if (dialog.querySelector('[data-himd-format-button]'))
                continue;
            const existingButtons = Array.from(dialog.querySelectorAll('button'));
            const referenceButton = existingButtons.find(button => button.textContent?.includes('NetMD로 연결') || /connect.*NetMD/i.test(button.textContent || '')) ||
                existingButtons[existingButtons.length - 1];
            if (!referenceButton?.parentElement) {
                continue;
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.himdFormatButton = 'true';
            button.className = referenceButton.className;
            button.textContent = uiText('일반 MD를 지우고 Hi-MD로 포맷', 'Erase standard MD and format as Hi-MD');
            button.style.backgroundColor = '#c62828';
            button.style.color = '#fff';
            button.style.marginRight = '8px';
            button.addEventListener('click', async () => {
                button.disabled = true;
                button.textContent = uiText('기기 확인 중…', 'Checking device…');
                const progress = showMiniDiscFormatProgress();
                const onProgress = (_event, value) => progress.update(value);
                electron_1.ipcRenderer.on('himd-format-progress', onProgress);
                try {
                    const result = await formatStandardMDToHiMD();
                    if (result?.cancelled) {
                        button.disabled = false;
                        button.textContent = uiText('일반 MD를 지우고 Hi-MD로 포맷', 'Erase standard MD and format as Hi-MD');
                        return;
                    }
                    await showMiniDiscWarning({
                        title: result?.ok ? uiText('Hi-MD 포맷 완료', 'Hi-MD format complete') : uiText('Hi-MD 포맷 실패', 'Hi-MD format failed'),
                        message: result?.message || (result?.ok ? uiText('Hi-MD 포맷 명령을 완료했습니다.', 'The Hi-MD format command completed.') : uiText('Hi-MD 포맷에 실패했습니다.', 'Hi-MD formatting failed.')),
                        detail: result?.ok
                            ? uiText('새 Hi-MD 파일시스템으로 다시 연결합니다.', 'Reconnecting with the new Hi-MD filesystem.')
                            : uiText('디스크와 USB 연결 상태를 확인한 뒤 다시 시도해 주세요.', 'Check the disc and USB connection, then try again.'),
                    });
                    if (result?.ok) {
                        if (process.platform === 'darwin') {
                            localStorage.setItem('wmdPendingHiMDFormat', '1');
                        }
                        const closeButton = Array.from(dialog.querySelectorAll('button')).find(candidate => candidate !== button &&
                            /^(닫기|Close)$/i.test((candidate.textContent || '').trim()));
                        closeButton?.click();
                    }
                    else {
                        button.disabled = false;
                        button.textContent = uiText('일반 MD를 지우고 Hi-MD로 포맷', 'Erase standard MD and format as Hi-MD');
                    }
                }
                catch (error) {
                    await showMiniDiscWarning({
                        title: uiText('Hi-MD 포맷 오류', 'Hi-MD format error'),
                        message: uiText('Hi-MD 포맷 중 오류가 발생했습니다.', 'An error occurred while formatting Hi-MD.'),
                        detail: error instanceof Error ? error.message : String(error),
                    });
                    button.disabled = false;
                    button.textContent = uiText('일반 MD를 지우고 Hi-MD로 포맷', 'Erase standard MD and format as Hi-MD');
                }
                finally {
                    electron_1.ipcRenderer.removeListener('himd-format-progress', onProgress);
                    progress.close();
                }
            });
            referenceButton.parentElement.insertBefore(button, referenceButton);
        }
    };
    const modeExitClickBypass = new WeakSet();
    const findModeExitMenuItem = () => Array.from(document.querySelectorAll('[role="menuitem"]')).find(element => /^(Exit|종료)$/.test((element.textContent || '').replace(/\s+/g, ' ').trim()));
    const setModeHomeButtonIcon = (button) => {
        button.innerHTML = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24"',
            ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"',
            ' stroke-linejoin="round" aria-hidden="true" focusable="false">',
            '<circle cx="12" cy="12" r="10"></circle>',
            '<path d="m14 16-4-4 4-4"></path>',
            '</svg>',
        ].join('');
    };
    let pendingEditRequestSequence = 0;
    const showModeExitProgress = () => {
        document.querySelector('[data-wmd-mode-exit-progress]')?.remove();
        if (!document.getElementById('wmd-mode-exit-progress-style')) {
            const style = document.createElement('style');
            style.id = 'wmd-mode-exit-progress-style';
            style.textContent = `
                @keyframes wmdModeExitSpin { to { transform: rotate(360deg); } }
                [data-wmd-mode-exit-progress] { position: fixed; inset: 0; z-index: 2147483646; display: flex; align-items: center; justify-content: center; background: rgba(12, 12, 16, .82); backdrop-filter: blur(3px); }
                .wmd-mode-exit-card { min-width: 340px; padding: 28px 34px; border: 1px solid rgba(208, 78, 137, .45); border-radius: 14px; background: #201f25; color: #f5f1f4; text-align: center; box-shadow: 0 18px 48px rgba(0,0,0,.5); }
                .wmd-mode-exit-spinner { width: 34px; height: 34px; margin: 0 auto 18px; border: 3px solid rgba(208,78,137,.22); border-top-color: #d04e89; border-radius: 50%; animation: wmdModeExitSpin .8s linear infinite; }
                .wmd-mode-exit-title { font-size: 16px; font-weight: 700; }
                .wmd-mode-exit-detail { margin-top: 9px; color: rgba(255,255,255,.66); font-size: 13px; }
            `;
            document.head.appendChild(style);
        }
        const overlay = document.createElement('div');
        overlay.dataset.wmdModeExitProgress = 'true';
        overlay.innerHTML = `<div class="wmd-mode-exit-card"><div class="wmd-mode-exit-spinner"></div><div class="wmd-mode-exit-title">${uiText('편집 내용을 저장하고 연결을 종료하는 중…', 'Saving edits and closing the connection…')}</div><div class="wmd-mode-exit-detail">${uiText('완료될 때까지 기기와 USB 케이블을 분리하지 마세요.', 'Do not disconnect the recorder or USB cable until this finishes.')}</div></div>`;
        document.body.appendChild(overlay);
        return overlay;
    };
    const applyPendingRendererEdits = () => new Promise((resolve) => {
        const requestId = `mode-exit-${Date.now()}-${++pendingEditRequestSequence}`;
        let timeout;
        const handleResult = (event) => {
            if (event.detail?.requestId !== requestId)
                return;
            document.removeEventListener('wmd-apply-pending-edits-result', handleResult);
            if (timeout)
                clearTimeout(timeout);
            resolve(Boolean(event.detail?.ok));
        };
        document.addEventListener('wmd-apply-pending-edits-result', handleResult);
        timeout = setTimeout(() => {
            document.removeEventListener('wmd-apply-pending-edits-result', handleResult);
            resolve(false);
        }, 70000);
        document.dispatchEvent(new CustomEvent('wmd-apply-pending-edits-request', {
            detail: { requestId },
        }));
    });
    const disconnectAndReturnHome = async (exitItem, homeButton) => {
        const pendingEditButton = Array.from(document.querySelectorAll('button[aria-label="편집 적용"], button[aria-label="Commit changes"]'))
            .find(button => !button.disabled);
        const progressOverlay = showModeExitProgress();
        if (homeButton) {
            homeButton.disabled = true;
        }
        if (pendingEditButton && !(await applyPendingRendererEdits())) {
            progressOverlay.remove();
            if (homeButton) {
                homeButton.disabled = false;
                setModeHomeButtonIcon(homeButton);
            }
            return;
        }
        try {
            const result = await returnToModeSelection();
            if (!result?.ok) {
                progressOverlay.remove();
                window.alert(result?.message || uiText('현재 연결을 정리하지 못했습니다.', 'The current connection could not be closed.'));
                if (homeButton) {
                    homeButton.disabled = false;
                    setModeHomeButtonIcon(homeButton);
                }
                return;
            }
            if (result.warning)
                console.warn('MiniDisc connection cleanup warning:', result.warning);
            progressOverlay.remove();
            if (exitItem) {
                modeExitClickBypass.add(exitItem);
                exitItem.click();
                queueMicrotask(() => modeExitClickBypass.delete(exitItem));
            }
            else {
                // Material UI does not mount the hidden Exit menu item until the
                // three-dot menu has been opened at least once. Reloading only the
                // renderer after native USB cleanup reliably resets Redux to WELCOME.
                window.location.reload();
            }
        }
        catch (error) {
            progressOverlay.remove();
            window.alert(uiText(`모드 선택 화면으로 돌아가는 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, `An error occurred while returning to mode selection: ${error instanceof Error ? error.message : String(error)}`));
            if (homeButton) {
                homeButton.disabled = false;
                setModeHomeButtonIcon(homeButton);
            }
        }
    };
    const installModeHomeButton = () => {
        const existing = document.querySelector('[data-mode-home-button]');
        const pageText = (document.body?.textContent || '').replace(/\s+/g, ' ');
        const isWelcomeScreen = pageText.includes('사용할 디스크 모드를 선택하세요') ||
            /(?:select|choose).{0,30}(?:disc|disk).{0,20}mode/i.test(pageText);
        const hasConnectedDiscTable = Boolean(document.querySelector('table'));
        if (isWelcomeScreen || !hasConnectedDiscTable) {
            existing?.remove();
            return;
        }
        const pageHeading = Array.from(document.querySelectorAll('h1')).find(heading => /^(?:HiMD \(|Sony (?:MZ|NW|MDS)-|MiniDisc)/i.test((heading.textContent || '').trim()));
        const headingRow = pageHeading?.parentElement;
        const menuButton = headingRow
            ? Array.from(headingRow.querySelectorAll(':scope > button')).find(button => !button.matches('[data-mode-home-button]'))
            : null;
        const activeOperationDialog = Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog => {
            const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
            return /녹음 중|MD에 녹음 중|Recording|Uploading|전송 중|다운로드 중|포맷 중|디스크 확인 중|기기 확인 중/i.test(text);
        });
        const isBusy = Boolean(document.querySelector('[data-wmd-loading-overlay="true"]')) || activeOperationDialog;
        const updateOperationLock = (button) => {
            button.disabled = isBusy;
            button.dataset.wmdOperationLocked = isBusy ? 'true' : 'false';
            button.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
            button.title = isBusy ? uiText('진행 중인 작업이 끝난 뒤 모드 선택 화면으로 돌아갈 수 있습니다', 'You can return to mode selection after the current operation finishes') : uiText('모드 선택 화면으로 돌아가기', 'Return to mode selection');
        };
        if (existing) {
            if (headingRow && existing.parentElement !== headingRow) {
                if (menuButton)
                    headingRow.insertBefore(existing, menuButton);
                else
                    headingRow.appendChild(existing);
            }
            updateOperationLock(existing);
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.modeHomeButton = 'true';
        setModeHomeButtonIcon(button);
        button.setAttribute('aria-label', uiText('모드 선택 화면으로 돌아가기', 'Return to mode selection'));
        updateOperationLock(button);
        Object.assign(button.style, {
            position: 'absolute',
            top: '22px',
            right: '66px',
            zIndex: '13000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            minWidth: '44px',
            minHeight: '44px',
            margin: '0',
            padding: '0',
            border: '0',
            borderRadius: '50%',
            background: 'transparent',
            color: 'rgba(244,241,243,0.72)',
            fontSize: '34px',
            fontWeight: '300',
            lineHeight: '1',
            cursor: 'pointer',
            boxShadow: 'none',
            filter: 'none',
            transition: 'color 140ms ease, transform 140ms ease',
        });
        button.addEventListener('mouseenter', () => {
            button.style.color = '#d36c9c';
            button.style.transform = 'translateX(-2px)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.color = 'rgba(244,241,243,0.72)';
            button.style.transform = 'translateX(0)';
        });
        button.addEventListener('click', () => disconnectAndReturnHome(findModeExitMenuItem(), button));
        if (headingRow) {
            if (menuButton)
                headingRow.insertBefore(button, menuButton);
            else
                headingRow.appendChild(button);
        }
        else {
            document.body.appendChild(button);
        }
    };
    const hideSettingsOverriddenByModernTheme = () => {
        const normalize = value => (value || '')
            .replace(/\s+/g, ' ')
            .replace(/:$/, '')
            .trim();
        const hiddenSettingLabels = new Set([
            'Color theme',
            '색상 테마',
            '화면 테마',
            'Stretch Web Minidisc Pro to fill the screen vertically',
            '세로 방향으로 화면 채우기',
            '세로로 화면 채우기',
            'Stretch Web Minidisc Pro to fill the screen horizontally',
            '가로 방향으로 화면 채우기',
            '가로로 화면 채우기',
        ]);
        const controlSelector = [
            'input',
            'select',
            '[role="switch"]',
            '[role="combobox"]',
            '.MuiSelect-root',
            '.MuiSelect-select',
            '.MuiSwitch-root',
        ].join(',');
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            const dialogTitle = Array.from(dialog.querySelectorAll('h1, h2, h3, [role="heading"]'))
                .find(element => /^(설정|Settings)$/.test(normalize(element.textContent)));
            if (!dialogTitle)
                continue;
            for (const element of dialog.querySelectorAll('label, span, p, div')) {
                const label = normalize(element.textContent);
                const isHiddenSetting = Array.from(hiddenSettingLabels)
                    .some(setting => label === setting ||
                    label.startsWith(`${setting}:`) ||
                    label.startsWith(`${setting} :`));
                if (!isHiddenSetting)
                    continue;
                let node = element;
                let row = null;
                for (let depth = 0; depth < 5 && node && node !== dialog; depth += 1) {
                    if (node.querySelector(controlSelector)) {
                        row = node;
                        break;
                    }
                    node = node.parentElement;
                }
                const target = row || element.parentElement || element;
                target.dataset.wmdHiddenModernSetting = 'true';
                target.style.setProperty('display', 'none', 'important');
            }
            for (const element of dialog.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span')) {
                if (normalize(element.textContent) !== '화면' &&
                    normalize(element.textContent) !== 'Display') {
                    continue;
                }
                element.dataset.wmdHiddenModernSettingHeading = 'true';
                element.style.setProperty('display', 'none', 'important');
            }
        }
    };
    const installModernLoadingState = () => {
        const spinners = Array.from(document.querySelectorAll('.MuiCircularProgress-root'))
            .filter(spinner => !spinner.closest('[role="dialog"]'));
        for (const spinner of spinners) {
            spinner.dataset.wmdLoadingSpinner = 'true';
            spinner.setAttribute('aria-label', uiText('MiniDisc 정보를 불러오는 중', 'Loading MiniDisc information'));
            const overlay = spinner.closest('.MuiBackdrop-root');
            if (overlay) {
                overlay.dataset.wmdLoadingOverlay = 'true';
                if (!overlay.querySelector('[data-wmd-loading-label]')) {
                    const label = document.createElement('div');
                    label.dataset.wmdLoadingLabel = 'true';
                    label.textContent = uiText('MiniDisc 정보를 불러오는 중', 'Loading MiniDisc information');
                    overlay.appendChild(label);
                }
            }
        }
        for (const shell of document.querySelectorAll('[data-wmd-shell]')) {
            shell.dataset.wmdLoadingState = spinners.length > 0 ? 'true' : 'false';
        }
    };
    const cleanUpModernMainMenu = () => {
        const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
        const hiddenMenuPatterns = [
            /^(레트로 모드(?:\s*\(베타\))?|Retro Mode(?:\s*\(beta\))?)$/i,
            /^(변경 내역|Changelog)$/i,
            /^(도움말 및 FAQ|지원 및 자주 묻는 질문|Support and FAQ)$/i,
            /^(후원하기|Donate|Support the project)$/i,
        ];
        for (const item of document.querySelectorAll('[role="menuitem"]')) {
            const label = normalize(item.textContent);
            if (hiddenMenuPatterns.some(pattern => pattern.test(label))) {
                item.dataset.wmdHiddenModernMenuItem = 'true';
                item.style.setProperty('display', 'none', 'important');
                continue;
            }
            if (!/^(GitHub(?:에서)? 소스 보기|Fork me on GitHub)$/i.test(label))
                continue;
            item.dataset.wmdUpstreamSourceLink = 'true';
            const text = item.querySelector('.MuiListItemText-primary') ||
                Array.from(item.querySelectorAll('span')).find(span => /GitHub|Fork me/i.test(normalize(span.textContent)));
            if (text)
                text.textContent = uiText('원본 프로젝트 · GitHub', 'Upstream project · GitHub');
        }
    };
    let requestedMiniDiscMode = null;
    let netMDNoDiscPromptShown = false;
    let netMDNoDiscPromptTimer = null;
    const installNetMDNoDiscRecovery = () => {
        const heading = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
            .find(element => /^(?:불러오는 중|Loading)(?:…|\.\.\.)?$/i.test((element.textContent || '').trim()));
        const pageText = (document.body?.textContent || '').replace(/\s+/g, ' ');
        const looksLikeNetMDNoDisc = requestedMiniDiscMode === 'netmd' &&
            Boolean(heading) &&
            /(?:디스크가 없습니다|No disc)/i.test(pageText) &&
            pageText.includes('NO DISC');
        if (!looksLikeNetMDNoDisc) {
            if (netMDNoDiscPromptTimer !== null) {
                clearTimeout(netMDNoDiscPromptTimer);
                netMDNoDiscPromptTimer = null;
            }
            netMDNoDiscPromptShown = false;
            return;
        }
        if (netMDNoDiscPromptShown || netMDNoDiscPromptTimer !== null)
            return;
        netMDNoDiscPromptTimer = setTimeout(() => {
            netMDNoDiscPromptTimer = null;
            const currentText = (document.body?.textContent || '').replace(/\s+/g, ' ');
            const stillNoDisc = requestedMiniDiscMode === 'netmd' &&
                /(?:디스크가 없습니다|No disc)/i.test(currentText) &&
                currentText.includes('NO DISC');
            if (!stillNoDisc || netMDNoDiscPromptShown)
                return;
            netMDNoDiscPromptShown = true;
            void showMiniDiscWarning({
                title: uiText('NetMD에서 미디어를 읽을 수 없습니다', 'NetMD cannot read the media'),
                message: uiText('디스크가 없거나 Hi-MD 형식의 미디어가 들어 있습니다.', 'No disc is inserted, or the media is formatted as Hi-MD.'),
                detail: uiText('Hi-MD 포맷을 유지하려면 뒤로 돌아가 Hi-MD를 선택하세요. 이 디스크를 완전히 지우고 일반 MD 형식으로 바꾸려는 경우에만 “일반 MD로 포맷”을 누르세요. 1GB Hi-MD 전용 미디어는 일반 MD로 변환할 수 없습니다.', 'To keep the Hi-MD format, go back and select Hi-MD. Select “Format as standard MD” only if you intend to erase and convert this disc. Dedicated 1GB Hi-MD media cannot be converted to standard MD.'),
                formatTarget: 'netmd',
                formatLabel: uiText('일반 MD로 포맷', 'Format as standard MD'),
            });
        }, 1500);
    };
    const installConnectionDiagnosticCopyButton = () => {
        const existing = document.querySelector('[data-wmd-connection-diagnostic-copy]');
        const errorLabel = Array.from(document.querySelectorAll('.MuiFormHelperText-root.Mui-error'))
            .find(element => {
            const text = (element.textContent || '').trim();
            if (!text || !element.closest('[data-wmd-shell="welcome"]') || element.closest('[role="dialog"]'))
                return false;
            const style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
        });
        if (!errorLabel) {
            existing?.remove();
            return;
        }
        const errorText = (errorLabel.textContent || '').trim();
        if (existing) {
            existing.dataset.wmdConnectionError = errorText;
            return;
        }
        const holder = document.createElement('div');
        holder.dataset.wmdConnectionDiagnosticCopy = 'true';
        holder.dataset.wmdConnectionError = errorText;
        Object.assign(holder.style, {
            display: 'flex',
            justifyContent: 'center',
            marginTop: '7px',
        });
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = uiText('진단 정보 복사', 'Copy diagnostics');
        button.setAttribute('aria-label', uiText('연결 오류 진단 정보 복사', 'Copy connection error diagnostics'));
        Object.assign(button.style, {
            minHeight: '32px',
            padding: '5px 12px',
            border: '1px solid rgba(224, 105, 161, .48)',
            borderRadius: '9px',
            color: '#f08ab9',
            background: 'rgba(198, 80, 139, .08)',
            font: 'inherit',
            fontSize: '12px',
            fontWeight: '700',
            cursor: 'pointer',
        });
        button.addEventListener('click', async () => {
            button.disabled = true;
            button.style.cursor = 'wait';
            button.textContent = uiText('진단 정보 모으는 중…', 'Collecting diagnostics…');
            try {
                const report = await electron_1.ipcRenderer.invoke('buildCompactConnectionDiagnostics', holder.dataset.wmdConnectionError || '');
                await electron_1.ipcRenderer.invoke('writeClipboardText', report);
                button.textContent = uiText(`복사 완료 (${String(report).length}자)`, `Copied (${String(report).length} characters)`);
            }
            catch (error) {
                console.error('Connection diagnostic copy failed:', error);
                button.textContent = uiText('복사 실패', 'Copy failed');
            }
            setTimeout(() => {
                if (!button.isConnected)
                    return;
                button.disabled = false;
                button.style.cursor = 'pointer';
                button.textContent = uiText('진단 정보 복사', 'Copy diagnostics');
            }, 1800);
        });
        holder.appendChild(button);
        // Keep the action visible even when the native helper error spans
        // thousands of characters. Appending after the label put the button
        // below the entire error report and effectively off-screen.
        errorLabel.insertAdjacentElement('beforebegin', holder);
    };
    const translateNetworkWMTransferDialog = () => {
        const isNetworkWalkman = Array.from(document.querySelectorAll('h1'))
            .some(heading => /^Sony NW-/i.test((heading.textContent || '').trim()));
        if (!isNetworkWalkman)
            return;
        const replacements = [
            [/MD에 녹음 중\.\.\.|Recording to MD\.\.\./g, uiText('네트워크 플레이어로 전송 중…', 'Transferring to the network player…')],
            [/Hi-MD는 초기 인증과 암호화 준비에 시간이 걸려 진행률이 한동안 0%로 보일 수 있습니다\. 작업이 시작될 때까지 RH10의 전원이나 USB 케이블을 분리하지 마세요\./g, uiText('네트워크 플레이어용 ATRAC 변환은 곡 수에 따라 시간이 걸릴 수 있습니다. 변환과 전송이 끝날 때까지 A3000의 전원이나 USB 케이블을 분리하지 마세요.', 'ATRAC conversion for the network player can take time depending on the number of tracks. Do not power off or disconnect the A3000 until conversion and transfer are complete.')],
            [/Hi-MD authentication and encryption setup can take time, so progress may remain at 0% for a while\. Do not power off the RH10 or disconnect USB before the operation begins\./g, uiText('네트워크 플레이어용 ATRAC 변환은 곡 수에 따라 시간이 걸릴 수 있습니다. 변환과 전송이 끝날 때까지 A3000의 전원이나 USB 케이블을 분리하지 마세요.', 'ATRAC conversion for the network player can take time depending on the number of tracks. Do not power off or disconnect the A3000 until conversion and transfer are complete.')],
            [/MD 전송 /g, uiText('플레이어 전송 ', 'Player transfer ')],
            [/MD transfer /g, uiText('플레이어 전송 ', 'Player transfer ')],
            [/녹음 취소|Cancel recording/g, uiText('전송 취소', 'Cancel transfer')],
            [/현재 트랙 후 중지 중\.\.\.|Stopping after the current track\.\.\./g, uiText('현재 곡 전송 후 중지 중…', 'Stopping after the current track…')],
        ];
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            const dialogText = (dialog.textContent || '').replace(/\s+/g, ' ');
            if (!/MD에 녹음 중|Recording to MD|파일 변환|File conversion/.test(dialogText))
                continue;
            const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                let value = node.nodeValue || '';
                for (const [pattern, replacement] of replacements)
                    value = value.replace(pattern, replacement);
                if (value !== node.nodeValue)
                    node.nodeValue = value;
            }
        }
    };
    const refreshKoreanUI = () => {
        installModernThemeMarkers();
        installLucideIcons();
        installNetMDFormatButton();
        installHiMDFormatButton();
        installModeHomeButton();
        installRH1KoreanTitleOption();
        installNetMDOriginalTitleOption();
        installRH1KoreanRenameOption();
        installNetMDKoreanRenameNotice();
        installRenameInputFocusRecovery();
        removeObsoleteWelcomeActions();
        translateKoreanUI();
        translateNetworkWMTransferDialog();
        hideSettingsOverriddenByModernTheme();
        installModernLoadingState();
        cleanUpModernMainMenu();
        installNetMDNoDiscRecovery();
        installConnectionDiagnosticCopyButton();
        installModernAlertDialogs();
        monitorStalledMDTransfer();
    };
    const showOperationToast = (message) => {
        document.querySelector('[data-wmd-operation-toast]')?.remove();
        const toast = document.createElement('div');
        toast.dataset.wmdOperationToast = 'true';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            left: '50%',
            bottom: '32px',
            zIndex: '16000',
            transform: 'translate(-50%, 8px)',
            padding: '10px 16px',
            borderRadius: '5px',
            background: 'rgba(32, 32, 32, 0.94)',
            color: '#fff',
            fontSize: '14px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            opacity: '0',
            pointerEvents: 'none',
            transition: 'opacity 140ms ease, transform 140ms ease',
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, 0)';
        });
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 8px)';
            setTimeout(() => toast.remove(), 180);
        }, 1800);
    };
    document.addEventListener('wmd-disc-rescan-complete', () => {
        showOperationToast(uiText('디스크 다시 검색 완료', 'Disc rescan complete'));
    });
    const MD_TRANSFER_STALL_TIMEOUT_MS = 90000;
    let mdTransferWatchState = null;
    let activeMDTransferStallWarning = null;
    let rendererReportedTransferActive = false;
    const reportRendererTransferActive = active => {
        active = Boolean(active);
        if (rendererReportedTransferActive === active)
            return;
        rendererReportedTransferActive = active;
        void electron_1.ipcRenderer.invoke('setTransferActive', active).catch(() => { });
    };
    const findActiveMDTransferDialog = () => Array.from(document.querySelectorAll('[role="dialog"]')).find(dialog => {
        if (!dialog.isConnected || dialog.hidden || dialog.getAttribute('aria-hidden') === 'true' || dialog.getClientRects().length === 0)
            return false;
        const text = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
        return /MD에\s*녹음\s*중|MD\s*(?:전송|Transfer)|Recording\s+to\s+MD/i.test(text) &&
            /MD\s*전송|MD\s*(?:Transfer|Upload)/i.test(text);
    }) || null;
    const readMDTransferProgress = (dialog) => {
        const text = (dialog?.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text)
            return null;
        const transferStart = text.search(/MD\s*전송|MD\s*(?:Transfer|Upload)/i);
        if (transferStart < 0)
            return null;
        const transferText = text.slice(transferStart);
        const percentages = [...transferText.matchAll(/(\d{1,3})\s*%/g)]
            .map(match => Number(match[1]))
            .filter(value => Number.isFinite(value) && value >= 0 && value <= 100);
        if (percentages.length === 0)
            return null;
        const trackMatch = transferText.match(/(?:MD\s*전송|MD\s*(?:Transfer|Upload))\s*([^%]{0,180})/i);
        return {
            percent: percentages[percentages.length - 1],
            track: (trackMatch?.[1] || '').trim().replace(/\s+/g, ' ').replace(/\s*\d{1,3}\s*$/, ''),
            text,
        };
    };
    const ensureMDTransferStallStyle = () => {
        if (document.getElementById('wmd-transfer-stall-style'))
            return;
        const style = document.createElement('style');
        style.id = 'wmd-transfer-stall-style';
        style.textContent = `
            .wmd-transfer-stall-overlay {
                position: fixed; inset: 0; z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                padding: 22px; box-sizing: border-box;
                background: rgba(3, 4, 8, .78);
                backdrop-filter: blur(7px);
            }
            .wmd-transfer-stall-panel {
                width: min(610px, calc(100vw - 36px));
                overflow: hidden; box-sizing: border-box;
                color: #f7f2f6; background: #1d1d23;
                border: 1px solid rgba(255, 255, 255, .12);
                border-radius: 18px;
                box-shadow: 0 28px 90px rgba(0, 0, 0, .7);
                font-family: inherit;
            }
            .wmd-transfer-stall-header {
                display: flex; gap: 13px; align-items: center;
                padding: 21px 23px 17px;
                border-bottom: 1px solid rgba(255, 255, 255, .09);
            }
            .wmd-transfer-stall-icon {
                display: grid; place-items: center; flex: 0 0 auto;
                width: 42px; height: 42px; border-radius: 13px;
                color: #ff899c; background: rgba(220, 70, 91, .13);
                border: 1px solid rgba(255, 110, 135, .26);
            }
            .wmd-transfer-stall-icon svg { width: 23px; height: 23px; }
            .wmd-transfer-stall-title {
                margin: 0 0 4px; font-size: 20px; line-height: 1.25;
                font-weight: 760; letter-spacing: -.02em;
            }
            .wmd-transfer-stall-subtitle {
                margin: 0; color: #aaa7b0; font-size: 13px;
            }
            .wmd-transfer-stall-content { padding: 18px 22px 16px; }
            .wmd-transfer-stall-status {
                display: grid; grid-template-columns: repeat(3, 1fr);
                gap: 8px; margin-bottom: 15px;
            }
            .wmd-transfer-stall-status-item {
                min-width: 0; padding: 11px 12px; border-radius: 11px;
                background: rgba(255, 255, 255, .045);
                border: 1px solid rgba(255, 255, 255, .075);
            }
            .wmd-transfer-stall-status-label {
                display: block; margin-bottom: 4px;
                color: #97939c; font-size: 11px;
            }
            .wmd-transfer-stall-status-value {
                display: block; overflow: hidden; text-overflow: ellipsis;
                color: #f4edf1; font-size: 14px; font-weight: 700;
                white-space: nowrap;
            }
            .wmd-transfer-stall-reasons {
                padding: 14px 16px; color: #d8d1d6;
                background: rgba(198, 80, 139, .075);
                border: 1px solid rgba(231, 104, 166, .21);
                border-radius: 12px; font-size: 13px; line-height: 1.55;
            }
            .wmd-transfer-stall-reasons strong {
                display: block; margin-bottom: 5px; color: #f2b1d0;
            }
            .wmd-transfer-stall-reasons ul { margin: 0; padding-left: 18px; }
            .wmd-transfer-stall-note {
                margin: 11px 2px 0; color: #96919a;
                font-size: 12px; line-height: 1.45;
            }
            .wmd-transfer-stall-actions {
                display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px;
                padding: 15px 21px 19px;
                border-top: 1px solid rgba(255, 255, 255, .08);
            }
            .wmd-transfer-stall-button {
                min-height: 39px; padding: 8px 14px; cursor: pointer;
                color: #ded8dc; background: transparent;
                border: 1px solid rgba(255, 255, 255, .14);
                border-radius: 10px; font: inherit;
            }
            .wmd-transfer-stall-button:hover { background: rgba(255, 255, 255, .06); }
            .wmd-transfer-stall-button-primary {
                color: #fff; background: #c6508b; border-color: #c6508b;
            }
            .wmd-transfer-stall-button-primary:hover { background: #d45d98; }
            .wmd-transfer-stall-button-danger {
                color: #ffb1bd; border-color: rgba(255, 113, 135, .34);
            }
            @media (max-width: 560px) {
                .wmd-transfer-stall-status { grid-template-columns: 1fr; }
                .wmd-transfer-stall-actions { align-items: stretch; flex-direction: column-reverse; }
                .wmd-transfer-stall-button { width: 100%; }
            }
        `;
        document.head.appendChild(style);
    };
    const buildMDTransferDiagnostics = async (snapshot) => {
        let devices = [];
        let deviceFallback = uiText('USB 장치 정보를 읽지 못했습니다.', 'USB device information could not be read.');
        try {
            const diagnostics = await Promise.race([
                getMiniDiscDiagnostics().then(value => ({ status: 'complete', value })),
                new Promise(resolve => setTimeout(() => resolve({ status: 'timeout' }), 1500)),
            ]);
            if (diagnostics.status === 'timeout') {
                deviceFallback = uiText('USB 장치 진단 시간이 초과되었습니다. 전송 화면 정보만 복사했습니다.', 'USB device diagnostics timed out. Only the transfer screen information was copied.');
            }
            else {
                devices = diagnostics.value?.devices || [];
            }
        }
        catch (_) {
            deviceFallback = uiText('USB 장치 진단에 실패했습니다. 전송 화면 정보만 복사했습니다.', 'USB device diagnostics failed. Only the transfer screen information was copied.');
        }
        const deviceLines = devices.length > 0
            ? devices.map(device => [
                device.modelHint,
                `${device.vendorIdHex}:${device.productIdHex}`,
                `USB ${device.busNumber ?? '?'}-${device.deviceAddress ?? '?'}`,
                device.mode,
                device.driverName || device.driverStatus,
            ].join(' · '))
            : [deviceFallback];
        return [
            uiText('Web MiniDisc Pro · MD 전송 정지 진단', 'Web MiniDisc Pro · stalled MD transfer diagnostics'),
            uiText(`시각: ${new Date().toLocaleString()}`, `Time: ${new Date().toLocaleString()}`),
            uiText(`화면 기기: ${document.querySelector('h1')?.textContent?.trim() || '확인되지 않음'}`, `Screen device: ${document.querySelector('h1')?.textContent?.trim() || 'Unknown'}`),
            uiText(`진행률: ${snapshot.percent}%`, `Progress: ${snapshot.percent}%`),
            uiText(`정지 시간: ${Math.max(1, Math.round((Date.now() - snapshot.changedAt) / 1000))}초`, `Stalled for: ${Math.max(1, Math.round((Date.now() - snapshot.changedAt) / 1000))} seconds`),
            uiText(`전송 항목: ${snapshot.track || '확인되지 않음'}`, `Transfer item: ${snapshot.track || 'Unknown'}`),
            uiText(`파일 변환: ${snapshot.conversionComplete ? '완료' : '확인되지 않음'}`, `File conversion: ${snapshot.conversionComplete ? 'Complete' : 'Unknown'}`),
            '',
            uiText('[연결된 MiniDisc 기기]', '[Connected MiniDisc recorders]'),
            ...deviceLines,
            '',
            uiText('[전송 화면]', '[Transfer screen]'),
            snapshot.text,
        ].join('\n');
    };
    const showMDTransferStallWarning = (snapshot, transferDialog) => {
        if (activeMDTransferStallWarning)
            return;
        void electron_1.ipcRenderer.invoke('setTransferStalled', true).catch(() => { });
        void electron_1.ipcRenderer.invoke('appendDiagnosticLog', 'MD transfer stalled', snapshot);
        ensureMDTransferStallStyle();
        const overlay = document.createElement('div');
        overlay.className = 'wmd-transfer-stall-overlay';
        overlay.setAttribute('role', 'presentation');
        const panel = document.createElement('section');
        panel.className = 'wmd-transfer-stall-panel';
        panel.setAttribute('role', 'alertdialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'wmd-transfer-stall-title');
        panel.innerHTML = `
            <header class="wmd-transfer-stall-header">
                <span class="wmd-transfer-stall-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 9v4"></path><path d="M12 17h.01"></path>
                        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"></path>
                    </svg>
                </span>
                <span>
                    <h2 class="wmd-transfer-stall-title" id="wmd-transfer-stall-title">${uiText('MD 쓰기 응답이 없습니다', 'No response while writing to MD')}</h2>
                    <p class="wmd-transfer-stall-subtitle">${uiText('진행률이 90초 동안 바뀌지 않았습니다.', 'Progress has not changed for 90 seconds.')}</p>
                </span>
            </header>
            <div class="wmd-transfer-stall-content">
                <div class="wmd-transfer-stall-status">
                    <div class="wmd-transfer-stall-status-item">
                        <span class="wmd-transfer-stall-status-label">${uiText('파일 변환', 'File conversion')}</span>
                        <span class="wmd-transfer-stall-status-value">${snapshot.conversionComplete ? uiText('완료', 'Complete') : uiText('확인 중', 'Checking')}</span>
                    </div>
                    <div class="wmd-transfer-stall-status-item">
                        <span class="wmd-transfer-stall-status-label">${uiText('MD 기록', 'MD writing')}</span>
                        <span class="wmd-transfer-stall-status-value">${uiText(`${snapshot.percent}%에서 정지`, `Stalled at ${snapshot.percent}%`)}</span>
                    </div>
                    <div class="wmd-transfer-stall-status-item">
                        <span class="wmd-transfer-stall-status-label">${uiText('USB 상태', 'USB status')}</span>
                        <span class="wmd-transfer-stall-status-value">${uiText('응답 대기 중', 'Waiting for response')}</span>
                    </div>
                </div>
                <div class="wmd-transfer-stall-reasons">
                    <strong>${uiText('가능성 높은 원인 · 확정 진단은 아닙니다', 'Likely causes · not a definitive diagnosis')}</strong>
                    <ul>
                        <li>${uiText('미디어 기록면 또는 디스크 불량', 'Defective disc or recording surface')}</li>
                        <li>${uiText('기록 헤드·레이저 등 기기 기록 계통 이상', 'Recorder write-path fault, such as the head or laser')}</li>
                        <li>${uiText('배터리·AC 어댑터 전원 부족', 'Insufficient battery or AC adapter power')}</li>
                        <li>${uiText('USB 케이블·허브·통신 불안정', 'Unstable USB cable, hub, or connection')}</li>
                    </ul>
                </div>
                <p class="wmd-transfer-stall-note">${uiText('자동 재시도는 TOC와 기록 상태를 더 꼬이게 할 수 있어 실행하지 않습니다.', 'The app will not retry automatically because that could further damage the TOC or write state.')}</p>
            </div>
            <footer class="wmd-transfer-stall-actions">
                <button type="button" class="wmd-transfer-stall-button" data-wmd-stall-copy>${uiText('진단 정보 복사', 'Copy diagnostics')}</button>
                <button type="button" class="wmd-transfer-stall-button wmd-transfer-stall-button-danger" data-wmd-stall-cancel>${uiText('앱 강제 종료…', 'Force quit app…')}</button>
                <button type="button" class="wmd-transfer-stall-button wmd-transfer-stall-button-primary" data-wmd-stall-wait>${uiText('조금 더 대기', 'Wait longer')}</button>
            </footer>
        `;
        overlay.appendChild(panel);
        let settled = false;
        const dismiss = (reason = 'dismissed') => {
            if (settled)
                return;
            settled = true;
            overlay.remove();
            activeMDTransferStallWarning = null;
            if (reason === 'resumed')
                showOperationToast(uiText('MD 전송이 다시 진행됩니다', 'The MD transfer has resumed'));
        };
        panel.querySelector('[data-wmd-stall-wait]').addEventListener('click', () => {
            if (mdTransferWatchState) {
                mdTransferWatchState.changedAt = Date.now();
                mdTransferWatchState.warnedPercent = null;
            }
            dismiss('wait');
        });
        panel.querySelector('[data-wmd-stall-copy]').addEventListener('click', async event => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await electron_1.ipcRenderer.invoke('writeClipboardText', await buildMDTransferDiagnostics(snapshot));
                button.textContent = uiText('복사 완료', 'Copied');
            }
            catch (_) {
                button.textContent = uiText('복사 실패', 'Copy failed');
            }
            setTimeout(() => {
                if (button.isConnected) {
                    button.disabled = false;
                    button.textContent = uiText('진단 정보 복사', 'Copy diagnostics');
                }
            }, 1600);
        });
        panel.querySelector('[data-wmd-stall-cancel]').addEventListener('click', async () => {
            await electron_1.ipcRenderer.invoke('forceQuitStalledTransfer');
        });
        activeMDTransferStallWarning = { dismiss, percent: snapshot.percent };
        document.body.appendChild(overlay);
        queueMicrotask(() => panel.querySelector('[data-wmd-stall-wait]')?.focus());
    };
    const monitorStalledMDTransfer = () => {
        const transferDialog = findActiveMDTransferDialog();
        reportRendererTransferActive(Boolean(transferDialog));
        const progress = readMDTransferProgress(transferDialog);
        if (!transferDialog || !progress) {
            mdTransferWatchState = null;
            void electron_1.ipcRenderer.invoke('setTransferStalled', false).catch(() => { });
            activeMDTransferStallWarning?.dismiss('complete');
            return;
        }
        const now = Date.now();
        if (!mdTransferWatchState || mdTransferWatchState.dialog !== transferDialog) {
            mdTransferWatchState = {
                dialog: transferDialog,
                percent: progress.percent,
                changedAt: now,
                warnedPercent: null,
                track: progress.track,
                text: progress.text,
            };
            return;
        }
        if (mdTransferWatchState.percent !== progress.percent ||
            mdTransferWatchState.track !== progress.track) {
            void electron_1.ipcRenderer.invoke('setTransferStalled', false).catch(() => { });
            mdTransferWatchState.percent = progress.percent;
            mdTransferWatchState.track = progress.track;
            mdTransferWatchState.text = progress.text;
            mdTransferWatchState.changedAt = now;
            mdTransferWatchState.warnedPercent = null;
            activeMDTransferStallWarning?.dismiss('resumed');
            return;
        }
        mdTransferWatchState.text = progress.text;
        if (now - mdTransferWatchState.changedAt < MD_TRANSFER_STALL_TIMEOUT_MS ||
            mdTransferWatchState.warnedPercent === progress.percent ||
            activeMDTransferStallWarning) {
            return;
        }
        mdTransferWatchState.warnedPercent = progress.percent;
        showMDTransferStallWarning({
            ...mdTransferWatchState,
            conversionComplete: /파일\s*변환\s*완료|conversion\s*(?:complete|finished)/i.test(progress.text),
        }, transferDialog);
    };
    setInterval(monitorStalledMDTransfer, 250);
    const installRenameInputFocusRecovery = () => {
        const title = document.getElementById('rename-dialog-title');
        const dialog = title?.closest('[role="dialog"]');
        if (!dialog)
            return;
        const input = dialog.querySelector('input:not([disabled]), textarea:not([disabled])');
        if (!input)
            return;
        const focusKey = `${title.textContent || ''}:${input.id || input.getAttribute('name') || 'input'}`;
        if (dialog.dataset.renameInputFocusKey === focusKey)
            return;
        dialog.dataset.renameInputFocusKey = focusKey;
        requestAnimationFrame(() => {
            if (!dialog.isConnected || !input.isConnected)
                return;
            input.focus({ preventScroll: true });
            const end = input.value.length;
            input.setSelectionRange?.(end, end);
        });
    };
    document.addEventListener('pointerdown', event => {
        const input = event.target instanceof Element
            ? event.target.closest('input, textarea')
            : null;
        if (!input || !input.closest('[role="dialog"]')?.querySelector('#rename-dialog-title'))
            return;
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }, true);
    document.addEventListener('keydown', event => {
        const input = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
            ? event.target
            : null;
        if (!input ||
            !input.closest('[role="dialog"]')?.querySelector('#rename-dialog-title') ||
            input.disabled ||
            input.readOnly ||
            event.isComposing ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey) {
            return;
        }
        const isPrintable = event.key.length === 1;
        const isBackwardDelete = event.key === 'Backspace';
        const isForwardDelete = event.key === 'Delete';
        if (!isPrintable && !isBackwardDelete && !isForwardDelete)
            return;
        const value = input.value;
        let start = input.selectionStart ?? value.length;
        let end = input.selectionEnd ?? start;
        let replacement = '';
        if (isPrintable) {
            replacement = event.key;
        }
        else if (start === end && isBackwardDelete && start > 0) {
            const previousCharacter = Array.from(value.slice(0, start)).pop() || '';
            start -= previousCharacter.length;
        }
        else if (start === end && isForwardDelete && end < value.length) {
            const nextCharacter = Array.from(value.slice(end))[0] || '';
            end += nextCharacter.length;
        }
        else if (start === end) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const nextValue = value.slice(0, start) + replacement + value.slice(end);
        const valueSetter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, nextValue);
        const caret = start + replacement.length;
        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            composed: true,
            data: replacement || null,
            inputType: isBackwardDelete
                ? 'deleteContentBackward'
                : isForwardDelete
                    ? 'deleteContentForward'
                    : 'insertText',
        }));
        input.setSelectionRange(caret, caret);
    }, true);
    const interceptModeExitClick = async (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('[role="menuitem"]')
            : null;
        if (!target || modeExitClickBypass.has(target))
            return;
        const label = (target.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^(Exit|종료)$/.test(label))
            return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await disconnectAndReturnHome(target);
    };
    document.addEventListener('click', interceptModeExitClick, true);
    const connectionClickBypass = new WeakSet();
    const interceptConnectionClick = async (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('a, button, [role="button"]')
            : null;
        if (!target || target.closest('[role="dialog"]') || connectionClickBypass.has(target)) {
            return;
        }
        const label = (target.textContent || '').replace(/\s+/g, ' ').trim();
        let mode = null;
        if (label.includes('NetMD로 연결') || /(?:connect.*netmd|netmd.*connect)/i.test(label)) {
            mode = 'netmd';
        }
        else if (label.includes('Hi-MD로 연결') || /(?:connect.*hi-?md|hi-?md.*connect)/i.test(label)) {
            mode = 'himd';
        }
        if (!mode) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const previousBusy = target.getAttribute('aria-busy');
        const previousPointerEvents = target.style.pointerEvents;
        const busyNotice = document.createElement('div');
        busyNotice.textContent = mode === 'netmd'
            ? uiText('NetMD USB 인터페이스로 전환 중…', 'Switching to the NetMD USB interface…')
            : uiText('Hi-MD USB 인터페이스로 전환 중…', 'Switching to the Hi-MD USB interface…');
        Object.assign(busyNotice.style, {
            position: 'fixed',
            left: '50%',
            bottom: '32px',
            transform: 'translateX(-50%)',
            zIndex: '2147483647',
            padding: '12px 18px',
            border: '1px solid rgba(208, 78, 137, 0.65)',
            borderRadius: '10px',
            background: 'rgba(30, 29, 35, 0.96)',
            color: '#f3f0f4',
            fontSize: '14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            pointerEvents: 'none',
        });
        document.body.appendChild(busyNotice);
        target.setAttribute('aria-busy', 'true');
        target.style.pointerEvents = 'none';
        try {
            let result = await prepareMiniDiscConnection(mode);
            if (result?.selectionRequired) {
                const selectedDeviceId = await chooseMiniDiscDevice(mode, result.candidates);
                if (!selectedDeviceId)
                    return;
                result = await prepareMiniDiscConnection(mode, selectedDeviceId);
            }
            if (result?.modeSwitchFailed && result.warning) {
                await showMiniDiscWarning(result.warning);
                return;
            }
            if (result?.proceed) {
                requestedMiniDiscMode = mode;
                connectionClickBypass.add(target);
                target.style.pointerEvents = previousPointerEvents;
                target.click();
                queueMicrotask(() => connectionClickBypass.delete(target));
            }
        }
        catch (error) {
            window.alert(uiText(`드라이버 확인 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, `An error occurred while checking the driver: ${error instanceof Error ? error.message : String(error)}`));
        }
        finally {
            if (previousBusy === null) {
                target.removeAttribute('aria-busy');
            }
            else {
                target.setAttribute('aria-busy', previousBusy);
            }
            target.style.pointerEvents = previousPointerEvents;
            busyNotice.remove();
        }
    };
    document.addEventListener('click', interceptConnectionClick, true);
    const resumePendingMiniDiscConnection = async () => {
        const deadline = Date.now() + 60000;
        let autoConnectOverlay = null;
        try {
            while (Date.now() < deadline) {
                const connectionTargets = [...document.querySelectorAll('a, button, [role="button"]')]
                    .filter((element) => !element.closest('[role="dialog"]'));
                const netMDTarget = connectionTargets.find((element) => {
                    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                    return text.includes('NetMD로 연결') || /(?:connect.*netmd|netmd.*connect)/i.test(text);
                });
                const hiMDTarget = connectionTargets.find((element) => {
                    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                    return text.includes('Hi-MD로 연결') || /(?:connect.*hi-?md|hi-?md.*connect)/i.test(text);
                });
                if ((netMDTarget || hiMDTarget) && !autoConnectOverlay) {
                    try {
                        const pendingMode = await electron_1.ipcRenderer.invoke('peekPendingMiniDiscMode');
                        if (pendingMode) {
                            autoConnectOverlay = document.createElement('div');
                            const modeName = pendingMode === 'himd' ? 'Hi-MD' : 'NetMD';
                            autoConnectOverlay.setAttribute('aria-live', 'polite');
                            Object.assign(autoConnectOverlay.style, {
                                position: 'fixed',
                                inset: '0',
                                zIndex: '2147483646',
                                display: 'grid',
                                placeItems: 'center',
                                background: 'rgba(3, 4, 8, .58)',
                                backdropFilter: 'blur(4px)',
                                pointerEvents: 'auto',
                            });
                            const message = document.createElement('div');
                            message.textContent = uiText(`${modeName} 장치를 확인하는 중… 확인되면 자동으로 연결합니다.`, `Checking the ${modeName} recorder… It will connect automatically when detected.`);
                            Object.assign(message.style, {
                                padding: '15px 20px',
                                color: '#f7f2f6',
                                background: 'rgba(30, 29, 35, .97)',
                                border: '1px solid rgba(208, 78, 137, .65)',
                                borderRadius: '12px',
                                boxShadow: '0 12px 34px rgba(0, 0, 0, .48)',
                                fontSize: '14px',
                                fontWeight: '700',
                            });
                            autoConnectOverlay.append(message);
                            document.body.append(autoConnectOverlay);
                        }
                    }
                    catch (_) { }
                }
                if (netMDTarget || hiMDTarget) {
                    try {
                        const pendingMode = await electron_1.ipcRenderer.invoke('consumePendingMiniDiscMode');
                        const target = pendingMode === 'netmd'
                            ? netMDTarget
                            : pendingMode === 'himd'
                                ? hiMDTarget
                                : null;
                        if (target) {
                            requestedMiniDiscMode = pendingMode;
                            const message = autoConnectOverlay?.firstElementChild;
                            if (message) {
                                const modeName = pendingMode === 'himd' ? 'Hi-MD' : 'NetMD';
                                message.textContent = uiText(`${modeName} 연결 화면을 여는 중…`, `Opening the ${modeName} connection screen…`);
                            }
                            target.click();
                            const transitionDeadline = Date.now() + 15000;
                            while (Date.now() < transitionDeadline) {
                                const modeCardsStillVisible = [...document.querySelectorAll('a, button, [role="button"]')]
                                    .some((element) => {
                                    if (element.closest('[role="dialog"]'))
                                        return false;
                                    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
                                    return text.includes('NetMD로 연결') ||
                                        text.includes('Hi-MD로 연결') ||
                                        /(?:connect.*(?:netmd|hi-?md)|(?:netmd|hi-?md).*connect)/i.test(text);
                                });
                                const errorDialogVisible = Boolean(document.querySelector('.wmd-warning-overlay, [role="alertdialog"], [role="dialog"]'));
                                if (!modeCardsStillVisible || errorDialogVisible)
                                    break;
                                await new Promise((resolve) => setTimeout(resolve, 100));
                            }
                            return;
                        }
                    }
                    catch (_) { }
                }
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        }
        finally {
            autoConnectOverlay?.remove();
        }
    };
    void resumePendingMiniDiscConnection();
    const installDarkContrastOverrides = () => {
        if (document.getElementById('wmd-dark-contrast-overrides'))
            return;
        if (!document.head) {
            document.addEventListener('DOMContentLoaded', installDarkContrastOverrides, { once: true });
            return;
        }
        const style = document.createElement('style');
        style.id = 'wmd-dark-contrast-overrides';
        style.textContent = `
            body .MuiDialog-paper,
            body .MuiPopover-paper,
            body .MuiMenu-paper {
                color: #f5f1f4 !important;
            }
            body .MuiDialog-paper .MuiTypography-root,
            body .MuiDialog-paper .MuiDialogContentText-root,
            body .MuiDialog-paper .MuiFormControlLabel-label,
            body .MuiDialog-paper .MuiAccordionSummary-root,
            body .MuiDialog-paper .MuiAccordionDetails-root,
            body .MuiDialog-paper .MuiTableCell-root,
            body .MuiDialog-paper .MuiListItemText-primary,
            body .MuiDialog-paper .MuiInputBase-input,
            body .MuiDialog-paper .MuiSelect-select {
                color: #f5f1f4 !important;
            }
            body .MuiDialog-paper .MuiFormLabel-root,
            body .MuiDialog-paper .MuiInputLabel-root,
            body .MuiDialog-paper .MuiFormHelperText-root,
            body .MuiDialog-paper .MuiListItemText-secondary {
                color: #bdb4bb !important;
            }
            body .MuiDialog-paper .MuiInput-underline:before,
            body .MuiDialog-paper .MuiInput-underline:hover:not(.Mui-disabled):before {
                border-bottom-color: rgba(255,255,255,.38) !important;
            }
            body .MuiDialog-paper .MuiInput-underline:after {
                border-bottom-color: #ef6aaa !important;
            }
            body .MuiDialog-paper .MuiToggleButton-root {
                color: #d7cfd4 !important;
                border-color: rgba(255,255,255,.18) !important;
                background: rgba(255,255,255,.035) !important;
            }
            body .MuiDialog-paper .MuiToggleButton-root.Mui-selected {
                color: #ffffff !important;
                background: #9b3868 !important;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
            }
            body .MuiDialog-paper .MuiToggleButton-root.Mui-selected:hover {
                background: #ad4477 !important;
            }
            body .MuiDialog-paper .MuiRadio-root,
            body .MuiDialog-paper .MuiCheckbox-root {
                color: #aaa1a8 !important;
            }
            body .MuiDialog-paper .MuiRadio-root.Mui-checked,
            body .MuiDialog-paper .MuiCheckbox-root.Mui-checked,
            body .MuiDialog-paper .MuiCheckbox-root.MuiCheckbox-indeterminate {
                color: #f06aaa !important;
            }
            body .MuiDialog-paper .MuiButton-root {
                color: #f08ab9 !important;
                font-weight: 700;
            }
            body .MuiDialog-paper .MuiIconButton-root:not(.Mui-disabled) {
                color: #ece5e9 !important;
            }
            body .MuiDialog-paper .Mui-disabled {
                color: rgba(255,255,255,.34) !important;
            }
            body .MuiMenu-paper .MuiMenuItem-root,
            body .MuiPopover-paper .MuiMenuItem-root {
                color: #f5f1f4 !important;
            }
            body .MuiMenu-paper .MuiMenuItem-root.Mui-selected,
            body .MuiPopover-paper .MuiMenuItem-root.Mui-selected {
                color: #ffffff !important;
                background: #8f315e !important;
            }
            body .MuiFormControlLabel-root .MuiCheckbox-root.Mui-checked + .MuiFormControlLabel-label {
                color: #f5f1f4 !important;
            }
        `;
        document.head.appendChild(style);
    };
    installDarkContrastOverrides();
    // MD Squirrel stays isolated from the React tree. The launcher is shown
    // only on the mode-selection screen and opens a self-contained modal.
    require("./md-squirrel-preload").install();
    const observerOptions = { childList: true, characterData: true, subtree: true };
    let refreshScheduled = false;
    const observer = new MutationObserver(() => {
        if (refreshScheduled)
            return;
        refreshScheduled = true;
        requestAnimationFrame(() => {
            refreshScheduled = false;
            observer.disconnect();
            try {
                refreshKoreanUI();
            }
            finally {
                observer.observe(document.body, observerOptions);
            }
        });
    });
    const observeAndRefreshKoreanUI = () => {
        observer.observe(document.body, observerOptions);
        observer.takeRecords();
        refreshKoreanUI();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            observeAndRefreshKoreanUI();
        }, { once: true });
    }
    else {
        observeAndRefreshKoreanUI();
    }
    console.log('====PRELOAD COMPLETE====');
    console.groupEnd();
})().catch(error => {
    console.error('PRELOAD INITIALIZATION FAILED', error);
    void electron_1.ipcRenderer.invoke('appendDiagnosticLog', 'preload initialization failed', serializeDiagnosticValue(error)).catch(() => { });
});
async function loadSettings() {
    const settings = await electron_1.ipcRenderer.invoke("fetch_settings_list");
    return settings
        .map(e => (Object.assign(Object.assign({}, e), { update: async (newValue) => {
            await electron_1.ipcRenderer.invoke("setting_update", e.name, newValue);
        } })));
}
//# sourceMappingURL=preload.js.map
