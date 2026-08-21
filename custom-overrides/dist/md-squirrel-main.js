"use strict";

const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn } = require("child_process");
const fetch = require("node-fetch");
const ElectronStoreModule = require("electron-store");
const ElectronStore = ElectronStoreModule.default || ElectronStoreModule;

const AUDIO_EXTENSIONS = new Set([
    ".mp3", ".flac", ".m4a", ".mp4", ".aac", ".ogg", ".opus", ".wav", ".wma",
    ".aif", ".aiff", ".ape", ".wv", ".tta", ".tak", ".mka", ".dsf", ".dff",
]);
const MUSICBRAINZ_USER_AGENT = "MD-Squirrel/0.1.0 (https://github.com/run240/web-minidisc-pro-custom)";
let lastMusicBrainzRequestAt = 0;
let mdLabelMakerWindow = null;
let preserveLabelDraftOnClose = false;

function getUILanguage() {
    try {
        const configured = new ElectronStore().get("uiLanguage", "auto");
        if (configured === "ko" || configured === "en")
            return configured;
    }
    catch (_) { }
    return /^ko(?:-|$)/i.test(app.getLocale()) ? "ko" : "en";
}

function uiText(korean, english) {
    return getUILanguage() === "ko" ? korean : english;
}

function labelRelaunchStatePath() {
    return path.join(app.getPath("userData"), "minidisc-label-maker-relaunch.json");
}

function preserveLabelDraftForRelaunch() {
    preserveLabelDraftOnClose = true;
    const shouldReopen = Boolean(mdLabelMakerWindow && !mdLabelMakerWindow.isDestroyed());
    try {
        if (shouldReopen) {
            fs.writeFileSync(labelRelaunchStatePath(), JSON.stringify({ reopen: true }), "utf8");
        }
        else {
            fs.rmSync(labelRelaunchStatePath(), { force: true });
        }
    }
    catch (error) {
        console.warn("MiniDisc label relaunch state save failed:", error);
    }
}

function placeLabelMakerNearMain(mainWindow, labelWindow) {
    if (!mainWindow || mainWindow.isDestroyed() || !labelWindow || labelWindow.isDestroyed())
        return;
    const mainBounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(mainBounds);
    const workArea = display.workArea;
    const labelBounds = labelWindow.getBounds();
    const width = Math.min(labelBounds.width, workArea.width);
    const height = Math.min(labelBounds.height, workArea.height);
    const centeredX = mainBounds.x + Math.round((mainBounds.width - width) / 2);
    const centeredY = mainBounds.y + Math.round((mainBounds.height - height) / 2);
    const x = Math.max(workArea.x, Math.min(centeredX, workArea.x + workArea.width - width));
    const y = Math.max(workArea.y, Math.min(centeredY, workArea.y + workArea.height - height));
    labelWindow.setBounds({ x, y, width, height });
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function sanitizeFilename(value) {
    const sanitized = String(value || "")
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/[. ]+$/g, "")
        .trim();
    return sanitized || uiText("제목 없음", "Untitled");
}

function compactArtists(artists) {
    if (!artists)
        return "";
    if (Array.isArray(artists))
        return artists.map(item => item?.name || item).filter(Boolean).join(", ");
    return String(artists);
}

async function listAudioFiles(folder, depth = 0) {
    if (depth > 6)
        return [];
    const entries = await fsp.readdir(folder, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            files.push(fullPath);
        }
        else if (entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            !/\[English\](?: \(\d+\))?$/i.test(entry.name)) {
            files.push(...await listAudioFiles(fullPath, depth + 1));
        }
        if (files.length > 5000)
            throw new Error(uiText("음원이 5,000개를 넘어 앨범 단위의 폴더를 선택해 주세요.", "More than 5,000 audio files were found. Choose an album-level folder."));
    }
    return files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

async function scanFolder(folder) {
    const { parseFile } = await import("music-metadata");
    const files = await listAudioFiles(folder);
    const tracks = [];
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        let metadata = { common: {}, format: {} };
        try {
            metadata = await parseFile(file, { duration: true, skipCovers: true });
        }
        catch (_) { }
        const common = metadata.common || {};
        const fallbackTitle = path.basename(file, path.extname(file));
        const artist = compactArtists(common.artists) || common.artist || "";
        tracks.push({
            id: `${index}-${path.basename(file)}`,
            sourcePath: file,
            filename: path.basename(file),
            extension: path.extname(file),
            trackNumber: common.track?.no || index + 1,
            trackNumberFromTag: Boolean(common.track?.no),
            discNumber: common.disk?.no || 1,
            title: common.title || fallbackTitle,
            artist,
            album: common.album || "",
            albumArtist: common.albumartist || "",
            duration: Math.round(metadata.format?.duration || 0),
            englishTitle: common.title || fallbackTitle,
            englishArtist: common.albumartist || artist,
            englishAlbum: common.album || "",
        });
    }
    return tracks;
}

function escapeMusicBrainzQuery(value) {
    return String(value || "").replace(/(["\\])/g, "\\$1");
}

function buildArtistSearchCandidates(value) {
    const original = String(value || "").trim();
    if (!original)
        return [];
    const candidates = [];
    const add = candidate => {
        const cleaned = String(candidate || "")
            .replace(/\s+/g, " ")
            .replace(/^[\s,;|/／·・–—-]+|[\s,;|/／·・–—-]+$/g, "")
            .trim();
        if (cleaned && !candidates.some(item => item.toLocaleLowerCase() === cleaned.toLocaleLowerCase()))
            candidates.push(cleaned);
    };
    add(original);
    // 폴더/태그에 함께 적힌 한글·일본어 별칭은 MusicBrainz의 대표 아티스트명과
    // 일치하지 않는 경우가 많다. 정확 검색이 실패하면 괄호 속 별칭을 뺀 이름을 쓴다.
    add(original
        .replace(/\([^)]*\)/g, " ")
        .replace(/（[^）]*）/g, " ")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/【[^】]*】/g, " "));
    for (const part of original.split(/[|/／]/)) {
        add(part
            .replace(/[()[\]{}（）【】]/g, " ")
            .replace(/\s+/g, " "));
    }
    return candidates;
}

async function fetchMusicBrainzJson(url) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const elapsed = Date.now() - lastMusicBrainzRequestAt;
        if (elapsed < 1050)
            await wait(1050 - elapsed);
        lastMusicBrainzRequestAt = Date.now();
        const response = await fetch(url, {
            headers: {
                "User-Agent": MUSICBRAINZ_USER_AGENT,
                "Accept": "application/json",
            },
        });
        if (response.ok)
            return response.json();
        if (![429, 502, 503, 504].includes(response.status) || attempt === 2)
            throw new Error(uiText(`MusicBrainz 요청 실패 (${response.status})`, `MusicBrainz request failed (${response.status})`));
        // MusicBrainz가 잠시 혼잡할 때 첫 클릭만 실패하지 않도록 짧게 기다렸다 재시도한다.
        await wait(1200 * (attempt + 1));
    }
    throw new Error(uiText("MusicBrainz 요청에 응답이 없습니다.", "MusicBrainz did not respond."));
}

async function findCanonicalArtistNames(artist) {
    const original = String(artist || "").trim();
    if (!original)
        return [];
    const query = encodeURIComponent(original);
    const data = await fetchMusicBrainzJson(`https://musicbrainz.org/ws/2/artist/?query=${query}&fmt=json&limit=5`);
    const names = [];
    for (const candidate of data.artists || []) {
        if ((candidate.score || 0) < 70)
            continue;
        const name = String(candidate.name || "").trim();
        if (name && !names.some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase()))
            names.push(name);
    }
    return names.slice(0, 3);
}

async function searchReleases({ artist, album }) {
    const artistCandidates = buildArtistSearchCandidates(artist);
    const albumName = String(album || "").trim();
    if (!artistCandidates.length && !albumName)
        throw new Error(uiText("아티스트나 앨범 정보가 필요합니다.", "Artist or album information is required."));

    const searches = artistCandidates.map(candidate => {
        const parts = [`artist:"${escapeMusicBrainzQuery(candidate)}"`];
        if (albumName)
            parts.push(`release:"${escapeMusicBrainzQuery(albumName)}"`);
        return { parts, candidate };
    });
    if (!artistCandidates.length && albumName)
        searches.push({ parts: [`release:"${escapeMusicBrainzQuery(albumName)}"`], candidate: "" });

    let releases = [];
    let matchedArtist = "";
    for (const search of searches) {
        const query = encodeURIComponent(search.parts.join(" AND "));
        const data = await fetchMusicBrainzJson(`https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=10`);
        if ((data.releases || []).length) {
            releases = data.releases;
            matchedArtist = search.candidate;
            break;
        }
    }

    // 대표 이름이 한글 태그와 다른 경우(예: 스텔라장 → Stella Jang)에는
    // 아티스트 별칭 검색으로 공식 이름을 찾은 뒤 앨범을 다시 조회한다.
    if (!releases.length && artistCandidates.length && albumName) {
        const canonicalNames = await findCanonicalArtistNames(artist);
        for (const canonicalName of canonicalNames) {
            if (artistCandidates.some(item => item.toLocaleLowerCase() === canonicalName.toLocaleLowerCase()))
                continue;
            const query = encodeURIComponent(
                `artist:"${escapeMusicBrainzQuery(canonicalName)}" AND release:"${escapeMusicBrainzQuery(albumName)}"`);
            const data = await fetchMusicBrainzJson(`https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=10`);
            if ((data.releases || []).length) {
                releases = data.releases;
                matchedArtist = canonicalName;
                break;
            }
        }
    }

    // 앨범명만으로 검색하면 동명의 전혀 다른 음반이 높은 점수로 나타날 수 있다.
    // 아티스트를 확인하지 못한 경우에는 안전하게 빈 결과를 반환한다.
    const mappedReleases = releases.map(release => ({
        id: release.id,
        title: release.title,
        artist: (release["artist-credit"] || []).map(credit => credit.name).join(""),
        date: release.date || "",
        country: release.country || "",
        language: release["text-representation"]?.language || "",
        script: release["text-representation"]?.script || "",
        status: release.status || "",
        trackCount: release["track-count"] || 0,
        score: release.score || 0,
        matchedArtist,
    }));
    const latinReleases = mappedReleases.filter(release =>
        release.script === "Latn" || release.language === "eng");
    // 영문판이 함께 등록돼 있다면 한글·일본어 문자판은 보여주지 않는다.
    // 국가 코드보다 MusicBrainz의 문자 체계(script) 정보가 제목 언어 판별에 더 정확하다.
    return latinReleases.length ? latinReleases : mappedReleases.filter(release => release.country !== "KR");
}

async function getReleaseTracks(releaseId) {
    const data = await fetchMusicBrainzJson(`https://musicbrainz.org/ws/2/release/${encodeURIComponent(releaseId)}?inc=recordings+artist-credits&fmt=json`);
    const tracks = (data.media || []).flatMap((medium, mediumIndex) => (medium.tracks || []).map(track => ({
        discNumber: medium.position || mediumIndex + 1,
        position: track.position,
        number: track.number,
        title: track.title || track.recording?.title || "",
        artist: (track["artist-credit"] || track.recording?.["artist-credit"] || [])
            .map(credit => credit.name)
            .join(""),
    })));
    return {
        title: data.title || "",
        artist: (data["artist-credit"] || []).map(credit => credit.name).join(""),
        language: data["text-representation"]?.language || "",
        script: data["text-representation"]?.script || "",
        country: data.country || "",
        tracks,
    };
}

async function fetchITunesJson(url) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(url, {
            headers: {
                "User-Agent": MUSICBRAINZ_USER_AGENT,
                "Accept": "application/json",
            },
        });
        if (response.ok)
            return response.json();
        if (attempt === 1)
            throw new Error(uiText(`Apple 음악 검색 실패 (${response.status})`, `Apple Music search failed (${response.status})`));
        await wait(700);
    }
    throw new Error(uiText("Apple 음악 검색에 응답이 없습니다.", "Apple Music search did not respond."));
}

function hasLatinTitle(value) {
    return /[A-Za-z]/.test(String(value || ""));
}

function hasEastAsianTitle(value) {
    return /[가-힣ㄱ-ㅎㅏ-ㅣぁ-ゟ゠-ヿ一-龯]/u.test(String(value || ""));
}

async function getITunesCandidates(track, artistOverride = "") {
    const artist = artistOverride || track.albumArtist || track.artist || "";
    const term = [artist, track.title].filter(Boolean).join(" ").trim();
    if (!term)
        return [];
    const url = `https://itunes.apple.com/search?media=music&entity=song&country=US&limit=8&term=${encodeURIComponent(term)}`;
    const data = await fetchITunesJson(url);
    return (data.results || [])
        .filter(result => result.kind === "song" && hasLatinTitle(result.trackName))
        .map((result, resultIndex) => {
            const duration = Math.round(Number(result.trackTimeMillis || 0) / 1000);
            const durationDiff = track.duration && duration
                ? Math.abs(Number(track.duration) - duration)
                : null;
            return {
                title: result.trackName || "",
                artist: result.artistName || "",
                album: result.collectionName || "",
                duration,
                durationDiff,
                rank: resultIndex,
                url: result.trackViewUrl || "",
            };
        })
        .sort((left, right) => {
            // 검색 상위권을 우선하되 재생시간이 크게 다른 동명곡은 뒤로 보낸다.
            const leftPenalty = left.rank * 4 + (left.durationDiff === null ? 8 : Math.min(left.durationDiff, 60));
            const rightPenalty = right.rank * 4 + (right.durationDiff === null ? 8 : Math.min(right.durationDiff, 60));
            return leftPenalty - rightPenalty;
        });
}

async function findITunesArtistName(artist) {
    const original = String(artist || "").trim();
    if (!original)
        return "";
    const url = `https://itunes.apple.com/search?media=music&entity=musicArtist&country=US&limit=5&term=${encodeURIComponent(original)}`;
    const data = await fetchITunesJson(url);
    return String((data.results || []).find(result => hasLatinTitle(result.artistName))?.artistName || "").trim();
}

async function searchITunesTracks(tracks) {
    if (!Array.isArray(tracks) || !tracks.length)
        throw new Error(uiText("검색할 곡이 없습니다.", "There are no tracks to search."));
    const matches = [];
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (hasLatinTitle(track.title) && !hasEastAsianTitle(track.title)) {
            matches.push({
                id: track.id,
                match: null,
                candidates: [],
                originalArtist: track.albumArtist || track.artist || "",
                preserved: true,
            });
            continue;
        }
        const candidates = await getITunesCandidates(track);
        matches.push({
            id: track.id,
            match: candidates[0] || null,
            candidates: candidates.slice(0, 3),
            originalArtist: track.albumArtist || track.artist || "",
        });
        if (index < tracks.length - 1)
            await wait(120);
    }

    // 같은 폴더에서 성공한 결과를 이용해 한글 아티스트명과 공식 영문명을 연결한다.
    // 예: "스텔라 장"으로 0건인 곡을 "Stella Jang"으로 다시 검색한다.
    const artistVotes = new Map();
    for (const result of matches) {
        if (!result.originalArtist || !result.match?.artist)
            continue;
        const key = result.originalArtist.toLocaleLowerCase();
        if (!artistVotes.has(key))
            artistVotes.set(key, new Map());
        const votes = artistVotes.get(key);
        votes.set(result.match.artist, (votes.get(result.match.artist) || 0) + 1);
    }
    const canonicalArtists = new Map();
    for (const [key, votes] of artistVotes)
        canonicalArtists.set(key, [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "");

    // 곡 검색으로 공식 이름을 얻지 못한 단독 아티스트도 Apple의 아티스트 검색으로 보완한다.
    for (const result of matches) {
        const originalArtist = result.originalArtist;
        if (!originalArtist || !hasEastAsianTitle(originalArtist))
            continue;
        const key = originalArtist.toLocaleLowerCase();
        if (canonicalArtists.get(key))
            continue;
        const canonicalArtist = await findITunesArtistName(originalArtist);
        if (canonicalArtist)
            canonicalArtists.set(key, canonicalArtist);
        await wait(120);
    }

    for (let index = 0; index < matches.length; index += 1) {
        const result = matches[index];
        if (!result.originalArtist)
            continue;
        const canonicalArtist = canonicalArtists.get(result.originalArtist.toLocaleLowerCase()) || "";
        result.canonicalArtist = canonicalArtist;
        if (result.match)
            continue;
        if (result.preserved) {
            continue;
        }
        if (!canonicalArtist)
            continue;
        const candidates = await getITunesCandidates(tracks[index], canonicalArtist);
        result.match = candidates[0] || null;
        result.candidates = candidates.slice(0, 3);
        result.retriedArtist = canonicalArtist;
        await wait(120);
    }
    return matches;
}

function runFfmpeg(argumentsList) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = require("ffmpeg-static");
        const child = spawn(ffmpegPath, argumentsList, {
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", chunk => {
            stderr += chunk.toString();
            if (stderr.length > 12000)
                stderr = stderr.slice(-12000);
        });
        child.once("error", reject);
        child.once("close", code => {
            if (code === 0)
                resolve();
            else
                reject(new Error(stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(" ")));
        });
    });
}

async function uniqueOutputFolder(sourceFolder) {
    const parent = path.dirname(sourceFolder);
    const base = `${path.basename(sourceFolder)} [English]`;
    let candidate = path.join(parent, base);
    let counter = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(parent, `${base} (${counter})`);
        counter += 1;
    }
    await fsp.mkdir(candidate, { recursive: true });
    return candidate;
}

async function uniqueOutputPath(folder, baseName, extension) {
    let candidate = path.join(folder, `${baseName}${extension}`);
    let counter = 2;
    while (fs.existsSync(candidate)) {
        candidate = path.join(folder, `${baseName} (${counter})${extension}`);
        counter += 1;
    }
    return candidate;
}

function isPathInside(parent, candidate) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function createEnglishCopies(window, { sourceFolder, tracks }) {
    if (!sourceFolder || !Array.isArray(tracks) || tracks.length === 0)
        throw new Error(uiText("복사할 음원이 없습니다.", "There are no audio files to copy."));
    const outputFolder = await uniqueOutputFolder(sourceFolder);
    const results = [];
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (!isPathInside(sourceFolder, track.sourcePath))
            throw new Error(uiText("선택한 폴더 밖의 파일은 처리할 수 없습니다.", "Files outside the selected folder cannot be processed."));
        const extension = path.extname(track.sourcePath).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(extension))
            throw new Error(uiText(`지원하지 않는 음원 형식입니다: ${extension}`, `Unsupported audio format: ${extension}`));
        const number = String(track.trackNumber || index + 1).padStart(2, "0");
        const baseName = sanitizeFilename(`${number} - ${track.englishTitle || track.title}`);
        const outputPath = await uniqueOutputPath(outputFolder, baseName, extension);
        const temporaryPath = path.join(outputFolder, `.md-squirrel-${Date.now()}-${index}${extension}`);
        let tagsUpdated = false;
        let warning = "";
        try {
            await runFfmpeg([
                "-hide_banner", "-loglevel", "error", "-y",
                "-i", track.sourcePath,
                "-map", "0",
                "-c", "copy",
                "-metadata", `title=${track.englishTitle || track.title || ""}`,
                "-metadata", `artist=${track.englishArtist || track.artist || ""}`,
                "-metadata", `album=${track.englishAlbum || track.album || ""}`,
                "-metadata", `album_artist=${track.englishArtist || track.albumArtist || track.artist || ""}`,
                "-metadata", `track=${track.trackNumber || ""}`,
                "-metadata", `disc=${track.discNumber || ""}`,
                temporaryPath,
            ]);
            await fsp.rename(temporaryPath, outputPath);
            tagsUpdated = true;
        }
        catch (error) {
            await fsp.rm(temporaryPath, { force: true }).catch(() => { });
            await fsp.copyFile(track.sourcePath, outputPath);
            warning = uiText(`태그 변경 실패, 파일명만 변경됨: ${error.message}`, `Tag update failed; only the filename was changed: ${error.message}`);
        }
        results.push({ filename: path.basename(outputPath), tagsUpdated, warning });
        window.webContents.send("mdSquirrelGenerateProgress", {
            current: index + 1,
            total: tracks.length,
            filename: path.basename(outputPath),
        });
    }
    return { outputFolder, results };
}

function setupMDSquirrelIPC(window) {
    const labelDraftPath = path.join(app.getPath("userData"), "minidisc-label-maker-draft.json");
    let reopenLabelMaker = false;
    try {
        reopenLabelMaker = JSON.parse(fs.readFileSync(labelRelaunchStatePath(), "utf8"))?.reopen === true;
    }
    catch (error) {
        if (error?.code !== "ENOENT")
            console.warn("MiniDisc label relaunch state load failed:", error);
    }
    finally {
        try {
            fs.rmSync(labelRelaunchStatePath(), { force: true });
        }
        catch (error) {
            console.warn("MiniDisc label relaunch state cleanup failed:", error);
        }
    }
    ipcMain.removeHandler("mdLabelMakerLoadDraft");
    ipcMain.handle("mdLabelMakerLoadDraft", async () => {
        try {
            return JSON.parse(await fsp.readFile(labelDraftPath, "utf8"));
        }
        catch (error) {
            if (error?.code !== "ENOENT")
                console.warn("MiniDisc label draft load failed:", error);
            return null;
        }
    });
    ipcMain.removeHandler("mdLabelMakerSaveDraft");
    ipcMain.handle("mdLabelMakerSaveDraft", async (_, project) => {
        if (!project || !Array.isArray(project.labels) || !project.labels.length)
            return { ok: false };
        const temporaryPath = `${labelDraftPath}.tmp`;
        try {
            await fsp.mkdir(path.dirname(labelDraftPath), { recursive: true });
            await fsp.writeFile(temporaryPath, JSON.stringify(project), "utf8");
            await fsp.rm(labelDraftPath, { force: true });
            await fsp.rename(temporaryPath, labelDraftPath);
            return { ok: true };
        }
        catch (error) {
            await fsp.rm(temporaryPath, { force: true }).catch(() => { });
            console.warn("MiniDisc label draft save failed:", error);
            return { ok: false, message: error?.message || String(error) };
        }
    });
    ipcMain.removeHandler("mdLabelMakerOpen");
    const openLabelMaker = async () => {
        if (mdLabelMakerWindow && !mdLabelMakerWindow.isDestroyed()) {
            placeLabelMakerNearMain(window, mdLabelMakerWindow);
            mdLabelMakerWindow.show();
            mdLabelMakerWindow.focus();
            return true;
        }
        mdLabelMakerWindow = new BrowserWindow({
            width: 1320,
            height: 860,
            minWidth: 980,
            minHeight: 680,
            modal: false,
            show: false,
            autoHideMenuBar: true,
            backgroundColor: "#111014",
            title: uiText("MiniDisc 라벨 만들기", "MiniDisc Label Maker"),
            icon: path.join(__dirname, "..", "renderer", "assets", "md-label-maker.png"),
            webPreferences: {
                preload: path.join(__dirname, "md-label-maker-preload.js"),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });
        placeLabelMakerNearMain(window, mdLabelMakerWindow);
        let discardingLabelDraft = false;
        mdLabelMakerWindow.on("close", event => {
            if (preserveLabelDraftOnClose)
                return;
            if (discardingLabelDraft) {
                event.preventDefault();
                return;
            }
            event.preventDefault();
            discardingLabelDraft = true;
            mdLabelMakerWindow?.webContents.send("mdLabelMakerDiscardDraft");
            setTimeout(() => {
                void fsp.rm(labelDraftPath, { force: true }).finally(() => {
                    if (mdLabelMakerWindow && !mdLabelMakerWindow.isDestroyed())
                        mdLabelMakerWindow.destroy();
                });
            }, 60);
        });
        mdLabelMakerWindow.once("ready-to-show", () => mdLabelMakerWindow?.show());
        mdLabelMakerWindow.once("closed", () => {
            mdLabelMakerWindow = null;
        });
        mdLabelMakerWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url))
                void shell.openExternal(url);
            return { action: "deny" };
        });
        await mdLabelMakerWindow.loadFile(path.join(__dirname, "..", "renderer", "md-label-maker", "index.html"), {
            query: { lang: getUILanguage() },
        });
        return true;
    };
    ipcMain.handle("mdLabelMakerOpen", openLabelMaker);
    if (reopenLabelMaker) {
        setImmediate(() => {
            void openLabelMaker().catch(error => console.warn("MiniDisc label window restore failed:", error));
        });
    }
    ipcMain.handle("mdSquirrelSelectFolder", async () => {
        const result = await dialog.showOpenDialog(window, {
            title: uiText("MD Squirrel - 음원 폴더 선택", "MD Squirrel - Choose audio folder"),
            properties: ["openDirectory"],
        });
        return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle("mdSquirrelScanFolder", (_, folder) => scanFolder(folder));
    ipcMain.handle("mdSquirrelSearchReleases", (_, query) => searchReleases(query));
    ipcMain.handle("mdSquirrelGetReleaseTracks", (_, releaseId) => getReleaseTracks(releaseId));
    ipcMain.handle("mdSquirrelSearchITunesTracks", (_, tracks) => searchITunesTracks(tracks));
    ipcMain.handle("mdSquirrelOpenWebSearch", (_, payload) => {
        const title = String(payload?.title || "").trim().slice(0, 300);
        const artist = String(payload?.artist || "").trim().slice(0, 300);
        const query = [title, artist, uiText("영어 제목", "English title")].filter(Boolean).join(" ");
        if (!query)
            throw new Error(uiText("검색할 제목이나 아티스트가 없습니다.", "Enter a title or artist to search."));
        return shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    });
    ipcMain.handle("mdSquirrelCreateCopies", (_, payload) => createEnglishCopies(window, payload));
    ipcMain.handle("mdSquirrelOpenPath", (_, targetPath) => shell.openPath(targetPath));
}

module.exports = { preserveLabelDraftForRelaunch, setupMDSquirrelIPC };
