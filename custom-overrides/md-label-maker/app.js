const LABEL_UI_LANGUAGE = new URLSearchParams(window.location.search).get("lang") ||
  localStorage.getItem("wmdUiLanguage") ||
  (/^ko(?:-|$)/i.test(navigator.language || "") ? "ko" : "en");
const isKoreanUI = LABEL_UI_LANGUAGE === "ko";
const uiText = (korean, english) => isKoreanUI ? korean : english;

const STATIC_LABEL_TRANSLATIONS = new Map(Object.entries({
  "MiniDisc 라벨 만들기": "MiniDisc Label Maker",
  "라벨 설정": "Label settings",
  "저장": "Save",
  "작업 불러오기": "Load project",
  "연결된 MD 목록 가져오기": "Import connected MD tracks",
  "출력할 라벨": "Labels to output",
  "디스크": "Disc",
  "케이스": "Case",
  "측면": "Spine",
  "선택한 라벨만 용지 크기에 맞춰 자동으로 배치합니다.": "Only selected label types are arranged automatically for the paper size.",
  "인쇄 용지": "Print paper",
  "용지 크기": "Paper size",
  "포토 4×6인치 (101.6 × 152.4mm)": "Photo 4×6 in (101.6 × 152.4 mm)",
  "미니 포토 2×3 (50 × 76mm)": "Mini photo 2×3 in (50 × 76 mm)",
  "카드형 포토 (54 × 86mm)": "Card photo (54 × 86 mm)",
  "엽서 (100 × 148mm)": "Postcard (100 × 148 mm)",
  "사용자 지정": "Custom",
  "가로 (mm)": "Width (mm)",
  "세로 (mm)": "Height (mm)",
  "용지 구성": "Sheet layout",
  "현재 라벨로 용지 채우기": "Fill sheet with current label",
  "목록의 여러 라벨 배치": "Arrange multiple labels from the list",
  "A4 한 장당 라벨 수": "Labels per A4 sheet",
  "편집할 라벨": "Label to edit",
  "추가": "Add",
  "복제": "Duplicate",
  "삭제": "Delete",
  "라벨마다 제목, 트랙, 이미지, 색상과 배치를 따로 설정할 수 있습니다. 빈 칸에는 첫 번째 라벨이 반복됩니다.": "Each label can have its own title, tracks, images, colors, and layout. Empty slots repeat the first label.",
  "앨범 정보": "Album information",
  "앨범명": "Album title",
  "아티스트명": "Artist",
  "연도": "Year",
  "글꼴": "Font",
  "색상": "Colors",
  "디스크 배경": "Disc background",
  "디스크 글자": "Disc text",
  "케이스 배경": "Case background",
  "케이스 글자": "Case text",
  "측면 배경": "Spine background",
  "측면 글자": "Spine text",
  "디스크 라벨": "Disc label",
  "배치": "Layout",
  "정사각형 이미지와 제목": "Square image and title",
  "작은 이미지와 트랙 목록": "Small image and track list",
  "배경 이미지와 트랙 목록": "Background image and track list",
  "트랙 목록": "Track list",
  "전체 라벨 이미지": "Full label image",
  "글자만": "Text only",
  "디스크 이미지": "Disc image",
  "디스크 이미지 지우기": "Clear disc image",
  "전체 라벨 이미지 권장 크기:": "Recommended full-label image size:",
  "재단 크기 320×486~360×547px 또는": "Trim size 320×486–360×547 px, or",
  "2mm 여백 포함 360×528~400×587px": "360×528–400×587 px including 2 mm bleed",
  "이미지 맞춤": "Image fit",
  "꽉 채우기": "Cover",
  "전체 보기": "Contain",
  "케이스 라벨": "Case label",
  "형식": "Format",
  "J 카드": "J-card",
  "이미지": "Image",
  "이미지와 트랙 목록": "Image and track list",
  "제목 영역 표시": "Show title area",
  "J 카드 측면 정보 표시": "Show J-card spine information",
  "케이스 이미지": "Case image",
  "케이스 이미지 지우기": "Clear case image",
  "전체 케이스 이미지 권장 크기:": "Recommended full-case image size:",
  "재단 크기 640×541~700×592px 또는": "Trim size 640×541–700×592 px, or",
  "2mm 여백 포함 680×580~740×632px": "680×580–740×632 px including 2 mm bleed",
  "라벨에 표시할 곡": "Tracks shown on the label",
  "디스크 또는 케이스에서 트랙 목록 배치를 선택했을 때 사용됩니다.": "Used when a track-list layout is selected for the disc or case.",
  "측면 라벨": "Spine label",
  "앨범명 : 아티스트명 자동 사용": "Use album title : artist automatically",
  "직접 입력": "Custom text",
  "MiniDisc 로고": "MiniDisc logo",
  "로고 모양": "Logo style",
  "명암 자동 선택": "Automatic contrast",
  "검은색 로고": "Black logo",
  "흰색 로고": "White logo",
  "이모지 💽": "Emoji 💽",
  "로고 없음": "No logo",
  "로고 위치": "Logo position",
  "오른쪽 아래": "Bottom right",
  "왼쪽 아래": "Bottom left",
  "오른쪽 위": "Top right",
  "A4 인쇄 미리보기": "A4 print preview",
  "인쇄 미리보기": "Print preview",
  "A4 · 210 × 297mm · 100% 실제 크기": "A4 · 210 × 297 mm · 100% actual size",
  "닫기": "Close",
  "저장 형식 선택": "Choose save format",
  "저장할 형식을 선택하세요.": "Choose a format to save.",
  "모든 작업은 컴퓨터 안에서 처리되며 외부로 전송되지 않습니다. 원본 CC0 프로젝트와 문제 제보는": "All work is processed locally and is not uploaded. See the original CC0 project and report issues on",
  "에서 확인할 수 있습니다. 원작자 후원은": ". Support the original author through",
  "를 이용해 주세요.": ".",
}));

function translateStaticLabelMakerUI() {
  document.documentElement.lang = LABEL_UI_LANGUAGE;
  if (isKoreanUI) return;
  document.title = "MiniDisc Label Maker";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const original = node.nodeValue || "";
    const trimmed = original.trim();
    const translated = STATIC_LABEL_TRANSLATIONS.get(trimmed);
    if (!translated) continue;
    node.nodeValue = `${original.match(/^\s*/)?.[0] || ""}${translated}${original.match(/\s*$/)?.[0] || ""}`;
  }
  for (const element of document.querySelectorAll("[aria-label], [title]")) {
    for (const attribute of ["aria-label", "title"]) {
      const value = element.getAttribute(attribute);
      const translated = STATIC_LABEL_TRANSLATIONS.get(value || "");
      if (translated) element.setAttribute(attribute, translated);
    }
  }
}

translateStaticLabelMakerUI();

const PT_TO_MM = 0.352777778;
let PAGE = { width: 210, height: 297 };
const PAPER_SIZES = {
  a4: { name: "A4", width: 210, height: 297, copies: [1, 2, 4, 6] },
  "photo-4x6": { name: uiText("포토 4×6인치", "Photo 4×6 in"), width: 101.6, height: 152.4, copies: [1] },
  "mini-2x3": { name: uiText("미니 포토 2×3인치", "Mini photo 2×3 in"), width: 50, height: 76, copies: [1], layout: "disc-spine" },
  "card-photo": { name: uiText("카드형 포토용지", "Card photo paper"), width: 54, height: 86, copies: [1], layout: "disc-spine" },
  postcard: { name: uiText("엽서", "Postcard"), width: 100, height: 148, copies: [1] },
};
const A4_COPY_OPTIONS = {
  full: [1, 2, 4, 6],
  "case-disc": [1, 2, 4],
  "case-spine": [1, 2, 4, 6],
  "disc-spine": [1, 2, 4, 6, 8, 12, 16],
  disc: [1, 2, 4, 6, 8, 12, 16],
  case: [1, 2, 4, 6, 8],
  spine: [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96],
  none: [1],
};
const BLEED = 2;
const IMAGE_BLEED = 1;
const SPINE_BLEED = 0.5;
const CROP_GAP = 2;
const SPINE_CROP_GAP = 0.8;
const CROP_LEN = 2.5;
const SPINE_CROP_LEN = 1.1;
const CROP_STROKE = 0.5 * PT_TO_MM;
const J_CARD_SCORE_Y = 5;
const CASE_ROW_GAP = 5;

const labelSizes = {
  disc: { width: 36.7, height: 55.7, chamfer: 1.5 },
  spine: { width: 59, height: 3.5 },
  case: { width: 71, height: 60 },
  jCard: { width: 68, height: 64 },
};

const state = {
  labels: [],
  selectedIndex: 0,
  isSyncingControls: false,
};

const builtInLogos = {
  black: "./assets/minidisc-logo-black.svg",
  white: "./assets/minidisc-logo-white.svg",
};

const pdfFonts = {
  Inter: "./assets/fonts/Inter.ttf",
  "IBM Plex Sans": "./assets/fonts/IBMPlexSans.ttf",
  "Source Sans 3": "./assets/fonts/SourceSans3.ttf",
  "Roboto Condensed": "./assets/fonts/RobotoCondensed.ttf",
  "Work Sans": "./assets/fonts/WorkSans.ttf",
  "Libre Baskerville": "./assets/fonts/LibreBaskerville.ttf",
  "Cormorant Garamond": "./assets/fonts/CormorantGaramond.ttf",
  "Playfair Display": "./assets/fonts/PlayfairDisplay.ttf",
  Spectral: "./assets/fonts/Spectral.ttf",
  "Space Grotesk": "./assets/fonts/SpaceGrotesk.ttf",
  "Bebas Neue": "./assets/fonts/BebasNeue.ttf",
  "Archivo Black": "./assets/fonts/ArchivoBlack.ttf",
  Oswald: "./assets/fonts/Oswald.ttf",
  Staatliches: "./assets/fonts/Staatliches.ttf",
  "Unica One": "./assets/fonts/UnicaOne.ttf",
};

const previewArtwork = [
  {
    disc: "./assets/album-covers/melodic-techno-minimal-album-cover-391x558.png",
    case: "./assets/album-covers/melodic-techno-minimal-album-cover-700x512.png",
  },
  {
    disc: "./assets/album-covers/synthwave-album-cover-391x558.png",
    case: "./assets/album-covers/synthwave-album-cover-700x512.png",
  },
  {
    disc: "./assets/album-covers/alt-singer-songwriter-light-album-cover-391x558.png",
    case: "./assets/album-covers/alt-singer-songwriter-light-album-cover-700x512.png",
  },
  {
    disc: "./assets/album-covers/melodic-techno-light-album-cover-391x558.png",
    case: "./assets/album-covers/melodic-techno-light-album-cover-700x512.png",
  },
  {
    disc: "./assets/album-covers/cyberpunk-city-album-cover-391x558.png",
    case: "./assets/album-covers/cyberpunk-city-album-cover-700x512.png",
  },
  {
    disc: "./assets/album-covers/alt-rock-amp-album-cover-391x558.png",
    case: "./assets/album-covers/alt-rock-amp-album-cover-700x512.png",
  },
];

const previewPalettes = [
  {
    discBg: "#f1e5d3",
    discText: "#172130",
    caseBg: "#111820",
    caseText: "#f5efe4",
    spineBg: "#efe3cf",
    spineText: "#172130",
  },
  {
    discBg: "#17142b",
    discText: "#ffd6f3",
    caseBg: "#120f25",
    caseText: "#fdd7fb",
    spineBg: "#f5d5ef",
    spineText: "#191129",
  },
  {
    discBg: "#efe0c9",
    discText: "#32271d",
    caseBg: "#2b241d",
    caseText: "#f4e7d2",
    spineBg: "#ead9be",
    spineText: "#2b241d",
  },
  {
    discBg: "#dce8e2",
    discText: "#223548",
    caseBg: "#172637",
    caseText: "#ecf2ec",
    spineBg: "#d9e7e0",
    spineText: "#213344",
  },
  {
    discBg: "#1d132d",
    discText: "#ffb5e8",
    caseBg: "#11101f",
    caseText: "#fbd0ee",
    spineBg: "#241331",
    spineText: "#ffcaef",
  },
  {
    discBg: "#d6c0a2",
    discText: "#241f1b",
    caseBg: "#211b17",
    caseText: "#f1dec2",
    spineBg: "#d8bea0",
    spineText: "#241f1b",
  },
];

const controls = {};
document.querySelectorAll("input, select, textarea").forEach((el) => {
  controls[el.id] = el;
});

const LOGO_CONTROL_IDS = new Set(["logo-style", "logo-corner", "logo-disc", "logo-case"]);

const sheetHost = document.getElementById("sheet-host");

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const fontStack = (labelConfig) => `"${escapeXml(labelConfig.font)}"`;

const textMeasureCanvas = document.createElement("canvas");
const textMeasureContext = textMeasureCanvas.getContext("2d");
const MM_TO_CSS_PX = 96 / 25.4;

function measureTextWidth(value, fontSize, font, weight = "normal") {
  if (!textMeasureContext) return String(value || "").length * fontSize * 0.55;
  textMeasureContext.font = `${weight} ${fontSize * MM_TO_CSS_PX}px "${font}"`;
  return textMeasureContext.measureText(String(value || "")).width / MM_TO_CSS_PX;
}

function fitTextToWidth(value, { maxWidth, fontSize, minFontSize, font, weight = "normal" }) {
  const original = String(value || "");
  if (!original || !textMeasureContext || maxWidth <= 0) return { text: original, fontSize };
  const measure = (text, size) => measureTextWidth(text, size, font, weight);
  const originalWidth = measure(original, fontSize);
  if (originalWidth <= maxWidth) return { text: original, fontSize };

  const fittedSize = Math.max(minFontSize, fontSize * (maxWidth / originalWidth));
  if (measure(original, fittedSize) <= maxWidth) {
    return { text: original, fontSize: Number(fittedSize.toFixed(2)) };
  }

  const suffix = "…";
  let low = 0;
  let high = original.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${original.slice(0, middle)}${suffix}`, minFontSize) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return { text: `${original.slice(0, low).trimEnd()}${suffix}`, fontSize: minFontSize };
}

function fittedSvgText(value, options) {
  const fitted = fitTextToWidth(value, options);
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const baseline = options.baseline ? ` dominant-baseline="${options.baseline}"` : "";
  return `<text x="${options.x}" y="${options.y}" fill="${options.fill}" font-family="${escapeXml(options.font)}" font-size="${fitted.fontSize}"${weight}${anchor}${baseline}>${escapeXml(fitted.text)}</text>`;
}

const defaultLogoSettings = () => ({
  logoStyle: "auto",
  logoCorner: "bottom-right",
  logoDisc: true,
  logoCase: true,
});

function textLines(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function currentLabelFromControls() {
  return {
    album: controls.album.value,
    artist: controls.artist.value,
    year: controls.year.value,
    font: controls.font.value,
    discBg: controls["disc-bg"].value,
    discText: controls["disc-text"].value,
    caseBg: controls["case-bg"].value,
    caseText: controls["case-text"].value,
    spineBg: controls["spine-bg"].value,
    spineText: controls["spine-text"].value,
    discLayout: controls["disc-layout"].value,
    discImageFit: controls["disc-image-fit"].value,
    caseFormat: controls["case-format"].value,
    caseLayout: controls["case-layout"].value,
    caseImageFit: controls["case-image-fit"].value,
    caseTitleBlock: controls["case-title-block"].checked,
    jCardSpineInfo: controls["j-card-spine-info"].checked,
    tracks: textLines(controls.tracks.value),
    spineAuto: controls["spine-auto"].checked,
    spineFreeform: controls["spine-freeform"].value,
    discImage: state.labels[state.selectedIndex]?.discImage || "",
    caseImage: state.labels[state.selectedIndex]?.caseImage || "",
    sourceDiscFingerprint: state.labels[state.selectedIndex]?.sourceDiscFingerprint || "",
    previewIndex: state.labels[state.selectedIndex]?.previewIndex || 0,
    logoStyle: controls["logo-style"].value,
    logoCorner: controls["logo-corner"].value,
    logoDisc: controls["logo-disc"].checked,
    logoCase: controls["logo-case"].checked,
  };
}

function createLabel(overrides = {}) {
  const previewIndex = overrides.previewIndex || 0;
  return {
    album: "Blue Hour",
    artist: "Mika Vale",
    year: "2026",
    font: "Inter",
    ...previewPalette(previewIndex),
    discLayout: "square",
    discImageFit: "cover",
    caseFormat: "case",
    caseLayout: "image-tracks",
    caseImageFit: "cover",
    caseTitleBlock: true,
    jCardSpineInfo: true,
    tracks: ["01 Night Drive", "02 Glass Station", "03 Blue Hour", "04 Static Bloom", "05 Magnetic Sky", "06 Last Train"],
    spineAuto: true,
    spineFreeform: "BLUE HOUR : MIKA VALE",
    discImage: "",
    caseImage: "",
    sourceDiscFingerprint: "",
    previewIndex,
    ...defaultLogoSettings(),
    ...overrides,
  };
}

function previewImage(labelConfig, placement) {
  const index = labelConfig.previewIndex % previewArtwork.length;
  return previewArtwork[index][placement];
}

function previewPalette(index) {
  return previewPalettes[index % previewPalettes.length];
}

function syncLogoSettings() {
  if (controls["logo-corner"].value === "top-left") {
    controls["logo-corner"].value = "bottom-right";
  }
}

function saveSelectedLabel() {
  if (state.isSyncingControls || !state.labels.length) return;
  state.labels[state.selectedIndex] = currentLabelFromControls();
}

function labelForCopy(index) {
  saveSelectedLabel();
  if (controls["paper-size"].value !== "a4" || controls["sheet-mode"].value !== "multiple") return state.labels[state.selectedIndex];
  const pageSize = Math.max(1, Number(controls.copies.value) || 1);
  const pageStart = Math.floor(state.selectedIndex / pageSize) * pageSize;
  return state.labels[(pageStart + index) % state.labels.length] || state.labels[0];
}

function labelIndexForCopy(index) {
  if (controls["paper-size"].value !== "a4" || controls["sheet-mode"].value !== "multiple") return state.selectedIndex;
  const pageSize = Math.max(1, Number(controls.copies.value) || 1);
  const pageStart = Math.floor(state.selectedIndex / pageSize) * pageSize;
  return (pageStart + index) % state.labels.length;
}

function selectLabel(index) {
  const nextIndex = Math.min(Math.max(Number(index) || 0, 0), state.labels.length - 1);
  if (nextIndex === state.selectedIndex) return;
  saveSelectedLabel();
  state.selectedIndex = nextIndex;
  syncLabelPicker();
  syncLabelControls();
  renderSheet();
}

function syncLabelControls() {
  const labelConfig = state.labels[state.selectedIndex];
  if (!labelConfig) return;
  state.isSyncingControls = true;
  controls.album.value = labelConfig.album;
  controls.artist.value = labelConfig.artist;
  controls.year.value = labelConfig.year;
  controls.font.value = labelConfig.font;
  controls["disc-bg"].value = labelConfig.discBg;
  controls["disc-text"].value = labelConfig.discText;
  controls["case-bg"].value = labelConfig.caseBg;
  controls["case-text"].value = labelConfig.caseText;
  controls["spine-bg"].value = labelConfig.spineBg;
  controls["spine-text"].value = labelConfig.spineText;
  controls["disc-layout"].value = labelConfig.discLayout;
  controls["disc-image-fit"].value = labelConfig.discImageFit || "cover";
  controls["case-format"].value = labelConfig.caseFormat || "case";
  controls["case-layout"].value = labelConfig.caseLayout;
  controls["case-image-fit"].value = labelConfig.caseImageFit || "cover";
  controls["case-title-block"].checked = labelConfig.caseTitleBlock ?? true;
  controls["j-card-spine-info"].checked = labelConfig.jCardSpineInfo ?? true;
  controls.tracks.value = labelConfig.tracks.join("\n");
  controls["spine-auto"].checked = labelConfig.spineAuto;
  controls["spine-freeform"].value = labelConfig.spineFreeform;
  controls["logo-style"].value = labelConfig.logoStyle || "auto";
  controls["logo-corner"].value = labelConfig.logoCorner || "bottom-right";
  controls["logo-disc"].checked = labelConfig.logoDisc ?? true;
  controls["logo-case"].checked = labelConfig.logoCase ?? true;
  controls["disc-image"].value = "";
  controls["case-image"].value = "";
  state.isSyncingControls = false;
  syncSpineFreeform();
  syncTracklisting();
  syncCaseFormatHint();
  syncCaseOptions();
  syncImageClearButtons();
}

function syncLabelPicker() {
  const picker = controls["selected-label"];
  picker.innerHTML = state.labels
    .map((labelConfig, index) => {
      const name = labelConfig.album || uiText(`라벨 ${index + 1}`, `Label ${index + 1}`);
      return `<option value="${index}">${uiText(`라벨 ${index + 1}`, `Label ${index + 1}`)}: ${escapeXml(name)}</option>`;
    })
    .join("");
  picker.value = String(Math.min(state.selectedIndex, state.labels.length - 1));
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function chamferPath({ x, y, width, height, chamfer }) {
  return [
    `M ${x + chamfer} ${y}`,
    `H ${x + width}`,
    `V ${y + height}`,
    `H ${x}`,
    `V ${y + chamfer}`,
    "Z",
  ].join(" ");
}

function bleedBox(label) {
  return {
    x: label.x - BLEED,
    y: label.y - BLEED,
    width: label.width + BLEED * 2,
    height: label.height + BLEED * 2,
  };
}

function imageBleedBox(label) {
  return {
    x: label.x - IMAGE_BLEED,
    y: label.y - IMAGE_BLEED,
    width: label.width + IMAGE_BLEED * 2,
    height: label.height + IMAGE_BLEED * 2,
  };
}

function labelAt(kind, x, y) {
  return { ...labelSizes[kind], x, y };
}

function caseLabelFor(label, labelConfig) {
  const size = labelConfig.caseFormat === "j-card" ? labelSizes.jCard : labelSizes.case;
  return { ...label, width: size.width, height: size.height };
}

function caseHeightFor(labelConfig) {
  return labelConfig?.caseFormat === "j-card" ? labelSizes.jCard.height : labelSizes.case.height;
}

function selectedOutputParts({ compactPaper = false } = {}) {
  return {
    disc: controls["output-disc"]?.checked ?? true,
    case: compactPaper ? false : (controls["output-case"]?.checked ?? true),
    spine: controls["output-spine"]?.checked ?? true,
  };
}

function outputArrangement(parts) {
  if (parts.disc && parts.case && parts.spine) return "full";
  if (parts.disc && parts.case) return "case-disc";
  if (parts.case && parts.spine) return "case-spine";
  if (parts.disc && parts.spine) return "disc-spine";
  if (parts.disc) return "disc";
  if (parts.case) return "case";
  if (parts.spine) return "spine";
  return "none";
}

function arrangementRequirements(labelConfig) {
  const caseWidth = labelConfig?.caseFormat === "j-card" ? labelSizes.jCard.width : labelSizes.case.width;
  const caseHeight = caseHeightFor(labelConfig);
  const cropAllowance = (CROP_GAP + CROP_LEN) * 2;
  const spineAllowance = (SPINE_CROP_GAP + SPINE_CROP_LEN) * 2;
  const caseBounds = { width: caseWidth + cropAllowance, height: caseHeight + cropAllowance };
  const discBounds = { width: labelSizes.disc.width + cropAllowance, height: labelSizes.disc.height + cropAllowance };
  const spineBounds = { width: labelSizes.spine.width + spineAllowance, height: labelSizes.spine.height + spineAllowance };
  return {
    full: { width: caseBounds.width, height: 10 + caseHeight + 7 + labelSizes.disc.height + CROP_GAP + CROP_LEN },
    "case-disc": { width: Math.max(caseBounds.width, discBounds.width), height: caseBounds.height + discBounds.height + 4 },
    "case-spine": { width: Math.max(caseBounds.width, spineBounds.width), height: caseBounds.height + spineBounds.height + 4 },
    "disc-spine": { width: 50, height: 65 },
    disc: discBounds,
    spine: spineBounds,
    case: caseBounds,
  };
}

function selectedArrangement(labelConfig, { compactPaper = false } = {}) {
  const arrangement = outputArrangement(selectedOutputParts({ compactPaper }));
  if (arrangement === "none") return "none";
  const requirement = arrangementRequirements(labelConfig)[arrangement];
  if (arrangement === "spine") {
    return (PAGE.width >= requirement.width && PAGE.height >= requirement.height)
      || (PAGE.width >= requirement.height && PAGE.height >= requirement.width)
      ? arrangement
      : "none";
  }
  return PAGE.width >= requirement.width && PAGE.height >= requirement.height ? arrangement : "none";
}

function singlePaperCopy(labelConfig, { compactPaper = false } = {}) {
  const arrangement = selectedArrangement(labelConfig, { compactPaper });
  const caseWidth = labelConfig?.caseFormat === "j-card" ? labelSizes.jCard.width : labelSizes.case.width;
  const caseHeight = caseHeightFor(labelConfig);
  if (arrangement === "full") {
    const caseY = 10;
    return {
      disc: labelAt("disc", (PAGE.width - labelSizes.disc.width) / 2, caseY + caseHeight + 7),
      case: labelAt("case", (PAGE.width - caseWidth) / 2, caseY),
      spine: { ...labelAt("spine", (PAGE.width - labelSizes.spine.width) / 2, 2), rotated: false },
    };
  }
  if (arrangement === "disc-spine") {
    const spineX = PAGE.width - SPINE_CROP_GAP - SPINE_CROP_LEN - labelSizes.spine.height;
    const discX = Math.max(CROP_GAP + CROP_LEN, (spineX - 2 - labelSizes.disc.width) / 2);
    return {
      disc: labelAt("disc", discX, (PAGE.height - labelSizes.disc.height) / 2),
      case: null,
      spine: { x: spineX, y: (PAGE.height - labelSizes.spine.width) / 2, width: labelSizes.spine.height, height: labelSizes.spine.width, rotated: true },
    };
  }
  if (arrangement === "case-disc") {
    const groupHeight = caseHeight + 7 + labelSizes.disc.height;
    const caseY = (PAGE.height - groupHeight) / 2;
    return {
      disc: labelAt("disc", (PAGE.width - labelSizes.disc.width) / 2, caseY + caseHeight + 7),
      case: labelAt("case", (PAGE.width - caseWidth) / 2, caseY),
      spine: null,
    };
  }
  if (arrangement === "case-spine") {
    const groupHeight = labelSizes.spine.height + 7 + caseHeight;
    const spineY = (PAGE.height - groupHeight) / 2;
    return {
      disc: null,
      case: labelAt("case", (PAGE.width - caseWidth) / 2, spineY + labelSizes.spine.height + 7),
      spine: { ...labelAt("spine", (PAGE.width - labelSizes.spine.width) / 2, spineY), rotated: false },
    };
  }
  if (arrangement === "disc") {
    return { disc: labelAt("disc", (PAGE.width - labelSizes.disc.width) / 2, (PAGE.height - labelSizes.disc.height) / 2), case: null, spine: null };
  }
  if (arrangement === "case") {
    return { disc: null, case: labelAt("case", (PAGE.width - caseWidth) / 2, (PAGE.height - caseHeight) / 2), spine: null };
  }
  if (arrangement === "spine") {
    return { disc: null, case: null, spine: { ...labelAt("spine", (PAGE.width - labelSizes.spine.width) / 2, (PAGE.height - labelSizes.spine.height) / 2), rotated: false } };
  }
  return null;
}

function a4SubsetCopies(count, labelConfigs, arrangement) {
  if (arrangement === "disc") {
    return Array.from({ length: count }, (_, index) => ({
      disc: labelAt("disc", 8 + (index % 4) * 49, 8 + Math.floor(index / 4) * 68), case: null, spine: null,
    }));
  }
  if (arrangement === "spine") {
    return Array.from({ length: count }, (_, index) => ({
      disc: null, case: null, spine: { ...labelAt("spine", 8 + (index % 3) * 66, 8 + Math.floor(index / 3) * 9), rotated: false },
    }));
  }
  if (arrangement === "disc-spine") {
    return Array.from({ length: count }, (_, index) => {
      const cellX = 5 + (index % 4) * 51;
      const cellY = 7 + Math.floor(index / 4) * 68;
      return {
        disc: labelAt("disc", cellX, cellY + (65 - labelSizes.disc.height) / 2),
        case: null,
        spine: { x: cellX + 41.5, y: cellY + 3, width: labelSizes.spine.height, height: labelSizes.spine.width, rotated: true },
      };
    });
  }
  if (arrangement === "case-disc") {
    return Array.from({ length: count }, (_, index) => {
      const y = 8 + index * 70;
      return { disc: labelAt("disc", 165, y + 2), case: labelAt("case", 8, y), spine: null };
    });
  }
  if (arrangement === "case" || arrangement === "case-spine") {
    return Array.from({ length: count }, (_, index) => {
      const caseHeight = caseHeightFor(labelConfigs[index]);
      const row = Math.floor(index / 2);
      const x = index % 2 === 0 ? 8 : 86;
      const y = 8 + row * (arrangement === "case-spine" ? 76 : 69);
      return {
        disc: null,
        case: labelAt("case", x, y),
        spine: arrangement === "case-spine" ? { ...labelAt("spine", x + 6, y + caseHeight + 3), rotated: false } : null,
      };
    });
  }
  return [];
}

function fittedGrid(itemWidth, itemHeight, margin = 2) {
  const columns = Math.floor((PAGE.width - margin * 2) / itemWidth);
  const rows = Math.floor((PAGE.height - margin * 2) / itemHeight);
  return { columns, rows, capacity: Math.max(0, columns * rows), margin };
}

function nonA4SubsetPlan(labelConfig, arrangement) {
  const cropAllowance = (CROP_GAP + CROP_LEN) * 2;
  const spineAllowance = (SPINE_CROP_GAP + SPINE_CROP_LEN) * 2;
  const caseWidth = labelConfig?.caseFormat === "j-card" ? labelSizes.jCard.width : labelSizes.case.width;
  const caseHeight = caseHeightFor(labelConfig);

  if (arrangement === "disc") {
    return { arrangement, grid: fittedGrid(labelSizes.disc.width + cropAllowance, labelSizes.disc.height + cropAllowance) };
  }
  if (arrangement === "case") {
    return { arrangement, grid: fittedGrid(caseWidth + cropAllowance, caseHeight + cropAllowance) };
  }
  if (arrangement === "spine") {
    const horizontal = fittedGrid(labelSizes.spine.width + spineAllowance, labelSizes.spine.height + spineAllowance);
    const vertical = fittedGrid(labelSizes.spine.height + spineAllowance, labelSizes.spine.width + spineAllowance);
    return vertical.capacity > horizontal.capacity
      ? { arrangement, grid: vertical, rotated: true }
      : { arrangement, grid: horizontal, rotated: false };
  }
  if (arrangement === "disc-spine") {
    return { arrangement, grid: fittedGrid(48, 65, 1) };
  }
  return { arrangement, grid: { columns: 1, rows: 1, capacity: selectedArrangement(labelConfig) === arrangement ? 1 : 0, margin: 2 } };
}

function nonA4SubsetCopies(count, labelConfigs, arrangement) {
  const plan = nonA4SubsetPlan(labelConfigs[0], arrangement);
  if (!plan.grid.capacity) return [];
  if (!["disc", "case", "spine", "disc-spine"].includes(arrangement)) {
    const copy = singlePaperCopy(labelConfigs[0]);
    return copy ? [copy] : [];
  }
  const cropInset = CROP_GAP + CROP_LEN;
  const spineInset = SPINE_CROP_GAP + SPINE_CROP_LEN;
  const discTileWidth = labelSizes.disc.width + cropInset * 2;
  const discTileHeight = labelSizes.disc.height + cropInset * 2;
  const caseTileWidth = (labelConfigs[0]?.caseFormat === "j-card" ? labelSizes.jCard.width : labelSizes.case.width) + cropInset * 2;
  const caseTileHeight = caseHeightFor(labelConfigs[0]) + cropInset * 2;
  const spineTileWidth = (plan.rotated ? labelSizes.spine.height : labelSizes.spine.width) + spineInset * 2;
  const spineTileHeight = (plan.rotated ? labelSizes.spine.width : labelSizes.spine.height) + spineInset * 2;

  return Array.from({ length: Math.min(count, plan.grid.capacity) }, (_, index) => {
    const column = index % plan.grid.columns;
    const row = Math.floor(index / plan.grid.columns);
    if (arrangement === "disc") {
      return { disc: labelAt("disc", plan.grid.margin + column * discTileWidth + cropInset, plan.grid.margin + row * discTileHeight + cropInset), case: null, spine: null };
    }
    if (arrangement === "case") {
      return { disc: null, case: labelAt("case", plan.grid.margin + column * caseTileWidth + cropInset, plan.grid.margin + row * caseTileHeight + cropInset), spine: null };
    }
    if (arrangement === "spine") {
      const x = plan.grid.margin + column * spineTileWidth + spineInset;
      const y = plan.grid.margin + row * spineTileHeight + spineInset;
      return {
        disc: null,
        case: null,
        spine: plan.rotated
          ? { x, y, width: labelSizes.spine.height, height: labelSizes.spine.width, rotated: true }
          : { ...labelAt("spine", x, y), rotated: false },
      };
    }
    const cellX = plan.grid.margin + column * 48;
    const cellY = plan.grid.margin + row * 65;
    return {
      disc: labelAt("disc", cellX + 2, cellY + (65 - labelSizes.disc.height) / 2),
      case: null,
      spine: { x: cellX + 42, y: cellY + 3, width: labelSizes.spine.height, height: labelSizes.spine.width, rotated: true },
    };
  });
}

function copyOptionsForCapacity(capacity) {
  const standard = [1, 2, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];
  const options = standard.filter((count) => count <= capacity);
  if (capacity > 0 && !options.includes(capacity)) options.push(capacity);
  return options.length ? options.sort((a, b) => a - b) : [1];
}

function sheetCopies(labelConfigs = []) {
  const count = Number(controls.copies.value);
  const compactPaper = ["mini-2x3", "card-photo"].includes(controls["paper-size"].value);
  if (controls["paper-size"].value !== "a4") {
    const arrangement = outputArrangement(selectedOutputParts({ compactPaper }));
    return nonA4SubsetCopies(count, labelConfigs, arrangement);
  }
  const arrangement = outputArrangement(selectedOutputParts());
  if (arrangement !== "full") return a4SubsetCopies(count, labelConfigs, arrangement);
  const caseXs = [8, 86];
  const discMainYs = [8, 73, 138, 203];
  const discBottomXs = [83, 124, 165, 165];
  const usedCaseRows = Math.ceil(count / 2);
  const caseRowHeights = Array.from({ length: usedCaseRows }, (_, row) =>
    Math.max(
      caseHeightFor(labelConfigs[row * 2]),
      row * 2 + 1 < count ? caseHeightFor(labelConfigs[row * 2 + 1]) : 0,
    )
  );
  const caseYs = caseRowHeights.reduce((rows, height, index) => {
    rows.push(index === 0 ? 8 : rows[index - 1] + caseRowHeights[index - 1] + CASE_ROW_GAP);
    return rows;
  }, []);
  const spineY = count ? caseYs[usedCaseRows - 1] + caseRowHeights[usedCaseRows - 1] + CASE_ROW_GAP : 203;
  const spineBlock = { x: 8, y: spineY, gap: 5.4 };

  return Array.from({ length: count }, (_, index) => {
    const caseCol = index % 2;
    const caseRow = Math.floor(index / 2);
    const caseX = caseXs[caseCol];
    const caseY = caseYs[caseRow];
    const discX = index < 4 ? 165 : discBottomXs[index - 4];
    const discY = index < 4 ? discMainYs[index] : discMainYs[3];

    return {
      disc: labelAt("disc", discX, discY),
      case: labelAt("case", caseX, caseY),
      spine: { ...labelAt("spine", spineBlock.x, spineBlock.y + index * spineBlock.gap), rotated: false },
    };
  });
}

function cropMarks(label, includeChamfer = false, gap = CROP_GAP, length = CROP_LEN, chamferStroke = "") {
  const left = label.x;
  const right = label.x + label.width;
  const top = label.y;
  const bottom = label.y + label.height;
  const marks = [
    [left, top - gap, left, top - gap - length],
    [left, bottom + gap, left, bottom + gap + length],
    [right, top - gap, right, top - gap - length],
    [right, bottom + gap, right, bottom + gap + length],
    [left - gap, top, left - gap - length, top],
    [right + gap, top, right + gap + length, top],
    [left - gap, bottom, left - gap - length, bottom],
    [right + gap, bottom, right + gap + length, bottom],
  ];
  const lines = marks
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`)
    .join("");

  const chamferStyle = chamferStroke ? ` style="stroke: ${chamferStroke};"` : "";
  const chamfer = includeChamfer
    ? `<line x1="${label.x}" y1="${label.y + label.chamfer}" x2="${label.x + label.chamfer}" y2="${label.y}"${chamferStyle} />`
    : "";

  return `<g class="crop-marks">${lines}${chamfer}</g>`;
}

function jCardFoldMarks(label) {
  const y = label.y + J_CARD_SCORE_Y;
  return `<g class="fold-marks">
    <line x1="${label.x}" y1="${y}" x2="${label.x + label.width}" y2="${y}" />
    <line x1="${label.x - CROP_GAP - CROP_LEN}" y1="${y}" x2="${label.x - CROP_GAP}" y2="${y}" />
    <line x1="${label.x + label.width + CROP_GAP}" y1="${y}" x2="${label.x + label.width + CROP_GAP + CROP_LEN}" y2="${y}" />
  </g>`;
}

function imageFill(href, box, mode = "cover") {
  if (!href) return "";
  const preserve = mode === "contain" ? "xMidYMid meet" : "xMidYMid slice";
  return `<image href="${href}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="${preserve}" />`;
}

function previewTarget(contents, label, labelIndex, placement) {
  const isSelected = labelIndex === state.selectedIndex;
  const album = state.labels[labelIndex]?.album || uiText(`라벨 ${labelIndex + 1}`, `Label ${labelIndex + 1}`);
  return `<g class="label-preview-target${isSelected ? " is-selected" : ""}" data-label-index="${labelIndex}" role="button" tabindex="0" aria-label="${escapeXml(uiText(`${album} 라벨 편집`, `Edit ${album} label`))}">
    <title>${escapeXml(uiText(`${album} 편집`, `Edit ${album}`))}</title>
    ${contents}
    ${isSelected ? "" : `<rect data-preview-control="true" class="preview-dim" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="0.8" />`}
    <rect data-preview-control="true" class="preview-hit-area" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="0.8" data-placement="${placement}" />
  </g>`;
}

function placeholderArt(box, variant = "disc") {
  const dark = variant === "case";
  const base = dark ? "#18212b" : "#dfe6e1";
  const mid = dark ? "#2a3945" : "#aeb9b2";
  const accent = dark ? "#d9b36c" : "#0f6f77";
  const soft = dark ? "#334553" : "#f5efe2";
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;

  return `<g>
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${base}" />
    <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height * 0.34}" fill="${soft}" opacity="0.82" />
    <circle cx="${cx}" cy="${cy}" r="${Math.min(box.width, box.height) * 0.31}" fill="none" stroke="${accent}" stroke-width="1.1" opacity="0.78" />
    <circle cx="${cx}" cy="${cy}" r="${Math.min(box.width, box.height) * 0.13}" fill="${accent}" opacity="0.75" />
    <path d="M ${box.x - 2} ${box.y + box.height * 0.72} L ${box.x + box.width * 0.35} ${box.y + box.height * 0.45} L ${box.x + box.width + 2} ${box.y + box.height * 0.82}" fill="none" stroke="${mid}" stroke-width="1.3" opacity="0.9" />
    <path d="M ${box.x + box.width * 0.12} ${box.y + box.height + 2} L ${box.x + box.width * 0.82} ${box.y - 2}" fill="none" stroke="#ffffff" stroke-width="0.65" opacity="${dark ? "0.18" : "0.55"}" />
    <path d="M ${box.x + box.width * 0.72} ${box.y + box.height + 2} L ${box.x + box.width + 2} ${box.y + box.height * 0.55}" fill="none" stroke="#ffffff" stroke-width="0.65" opacity="${dark ? "0.14" : "0.48"}" />
  </g>`;
}

function colorLuminance(hex) {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function logoEnabled(placement) {
  return placement !== "spine";
}

function logoHref(placement, labelConfig) {
  const style = labelConfig.logoStyle || "auto";
  if (style === "none" || style === "emoji") return "";
  if (style === "black" || style === "white") return builtInLogos[style];

  const bg = labelConfig[`${placement}Bg`] || labelConfig.caseBg;
  return colorLuminance(bg) < 0.45 ? builtInLogos.white : builtInLogos.black;
}

function logoUse(label, placement, labelConfig) {
  const href = logoHref(placement, labelConfig);
  const logoStyle = labelConfig.logoStyle || "auto";
  if (!logoEnabled(placement) || !labelConfig[`logo${placement[0].toUpperCase()}${placement.slice(1)}`]) return "";
  if (!href && logoStyle !== "emoji") return "";
  const width = 12;
  const height = 5;
  const corner = placement === "disc" && labelConfig.logoCorner === "bottom-left" ? "bottom-right" : labelConfig.logoCorner || "bottom-right";
  const marginX = corner.endsWith("right") ? -1.6 : 1.2;
  const marginY = 1.2;
  const x = corner.endsWith("left") ? label.x + marginX : label.x + label.width - width - marginX;
  const y = corner.startsWith("top") ? label.y + marginY : label.y + label.height - height - marginY;
  if (logoStyle === "emoji") {
    const fontSize = 4.6;
    return `<text x="${x + width / 2}" y="${y + height * 0.8}" text-anchor="middle" fill="${labelConfig[`${placement}Text`] || labelConfig.caseText}" font-size="${fontSize}">💽</text>`;
  }
  return `<image href="${href}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" />`;
}

function limitedDiscTracks(tracks, maximum) {
  const lines = (tracks || []).filter(Boolean);
  if (!lines.length) return [uiText("트랙 목록 없음", "No tracks")];
  if (lines.length <= maximum) return lines;
  const visibleCount = Math.max(1, maximum - 1);
  return [...lines.slice(0, visibleCount), uiText(`… 외 ${lines.length - visibleCount}곡`, `… and ${lines.length - visibleCount} more`)];
}

function splitTextAtWidth(value, maxWidth, fontSize, font) {
  const text = String(value || "").trim();
  if (!text || measureTextWidth(text, fontSize, font) <= maxWidth) return [text, ""];
  let low = 1;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measureTextWidth(text.slice(0, middle), fontSize, font) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  let cut = Math.max(1, low);
  const candidate = text.slice(0, cut);
  const wordBreak = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("　"));
  if (wordBreak >= Math.floor(candidate.length * 0.58)) cut = wordBreak;
  return [text.slice(0, cut).trimEnd(), text.slice(cut).trimStart()];
}

function renderWrappedDiscTracks(tracks, { x, y, maxWidth, fontSize, font, fill, lineHeight, maxLines }) {
  let result = "";
  let visualLine = 0;
  const source = limitedDiscTracks(tracks, maxLines);

  for (let trackIndex = 0; trackIndex < source.length; trackIndex += 1) {
    const track = source[trackIndex];
    if (visualLine >= maxLines) break;
    const numberPrefix = String(track).match(/^\s*\d{1,3}[.\s　]+/)?.[0] || "";
    const continuationIndent = numberPrefix ? Math.min(maxWidth * 0.25, measureTextWidth(numberPrefix, fontSize, font)) : 0;
    let remaining = String(track).trim();
    let partIndex = 0;

    while (remaining && visualLine < maxLines) {
      const indent = partIndex > 0 ? continuationIndent : 0;
      const availableWidth = maxWidth - indent;
      let [part, tail] = splitTextAtWidth(remaining, availableWidth, fontSize, font);
      const isLastSlot = visualLine === maxLines - 1;
      if (isLastSlot && (tail || trackIndex < source.length - 1)) {
        const overflowText = `${remaining}${trackIndex < source.length - 1 ? " …" : ""}`;
        part = fitTextToWidth(overflowText, {
          maxWidth: availableWidth,
          fontSize,
          minFontSize: fontSize,
          font,
        }).text;
        tail = "";
      }
      result += `<text x="${x + indent}" y="${y + visualLine * lineHeight}" fill="${fill}" font-family="${escapeXml(font)}" font-size="${fontSize}">${escapeXml(part)}</text>`;
      visualLine += 1;
      remaining = tail;
      partIndex += 1;
    }
  }
  return result;
}

function renderDenseTrackRows(tracks, { x, y, bottomY, maxWidth, font, fill, maxRows = 18, maxFontSize = 2.05, minFontSize = 1.45, maxLineHeight = 3.15 }) {
  const rows = limitedDiscTracks(tracks, maxRows);
  if (!rows.length) return "";
  const lineHeight = rows.length > 1
    ? Math.min(maxLineHeight, (bottomY - y) / (rows.length - 1))
    : maxLineHeight;
  const fontSize = Math.min(maxFontSize, Math.max(minFontSize, lineHeight * 0.72));
  return rows.map((line, index) => fittedSvgText(line, {
    x,
    y: y + index * lineHeight,
    maxWidth,
    fontSize,
    minFontSize: fontSize,
    font,
    fill,
  })).join("");
}

function renderTwoColumnTrackRows(tracks, { x, y, bottomY, width, gap = 3, font, fill, maxRows = 24 }) {
  const rows = limitedDiscTracks(tracks, maxRows);
  if (!rows.length) return "";
  const leftCount = Math.ceil(rows.length / 2);
  const rowsPerColumn = Math.max(1, leftCount);
  const columnWidth = (width - gap) / 2;
  const lineHeight = rowsPerColumn > 1 ? Math.min(3.35, (bottomY - y) / (rowsPerColumn - 1)) : 3.35;
  const fontSize = Math.min(2.35, Math.max(1.75, lineHeight * 0.72));
  return rows.map((line, index) => {
    const column = index < leftCount ? 0 : 1;
    const row = column === 0 ? index : index - leftCount;
    return fittedSvgText(line, {
      x: x + column * (columnWidth + gap),
      y: y + row * lineHeight,
      maxWidth: columnWidth,
      fontSize,
      minFontSize: fontSize,
      font,
      fill,
    });
  }).join("");
}

function renderDisc(label, copyIndex, labelConfig, labelIndex) {
  const clipId = `disc-clip-${copyIndex}`;
  const path = chamferPath(label);
  const bg = labelConfig.discBg;
  const text = labelConfig.discText;
  const layout = labelConfig.discLayout;
  const tracks = labelConfig.tracks || [];
  const denseImageTracks = layout === "image-tracks" && tracks.length > 10;
  let body = `<rect x="${label.x - BLEED}" y="${label.y - BLEED}" width="${label.width + BLEED * 2}" height="${label.height + BLEED * 2}" fill="${bg}" />
    <path d="${path}" fill="${bg}" />`;

  if (layout === "full") {
    body += imageFill(labelConfig.discImage || previewImage(labelConfig, "disc"), imageBleedBox(label), labelConfig.discImageFit || "cover");
  } else if (layout === "square") {
    const size = 31.5;
    const img = { x: label.x + 2.1, y: label.y + 10.6, width: size, height: size };
    body += `<g clip-path="url(#${clipId})">${imageFill(labelConfig.discImage || previewImage(labelConfig, "disc"), img, labelConfig.discImageFit || "cover")}</g>`;
  } else if (layout === "image-tracks" && tracks.length <= 10) {
    const img = { x: label.x + (label.width - 14) / 2, y: label.y + 9, width: 14, height: 14 };
    body += imageFill(labelConfig.discImage || previewImage(labelConfig, "disc"), img, labelConfig.discImageFit || "cover");
  } else if (denseImageTracks) {
    const img = { x: label.x + label.width - 10.4, y: label.y + 1.4, width: 8.2, height: 8.2 };
    body += imageFill(labelConfig.discImage || previewImage(labelConfig, "disc"), img, labelConfig.discImageFit || "cover");
  } else if (layout === "background-tracks") {
    body += imageFill(labelConfig.discImage || previewImage(labelConfig, "disc"), imageBleedBox(label), labelConfig.discImageFit || "cover");
    body += `<path d="${path}" fill="${bg}" opacity="0.72" />`;
  }

  if (layout !== "full") {
    body += fittedSvgText(labelConfig.album, { x: label.x + 2.2, y: label.y + 5.7, maxWidth: denseImageTracks ? label.width - 14.8 : label.width - 4.4, fontSize: 3.4, minFontSize: 2.35, font: labelConfig.font, fill: text, weight: "bold" });
    body += fittedSvgText(labelConfig.artist, { x: label.x + 2.2, y: label.y + label.height - 6.2, maxWidth: label.width - 4.4, fontSize: 2.6, minFontSize: 1.9, font: labelConfig.font, fill: text, weight: "bold" });
    body += fittedSvgText(labelConfig.year, { x: label.x + 2.2, y: label.y + label.height - 2.6, maxWidth: label.width - 4.4, fontSize: 2.2, minFontSize: 1.8, font: labelConfig.font, fill: text });
  }

  if (layout === "tracks" || layout === "background-tracks") {
    body += tracks.length <= 10
      ? renderWrappedDiscTracks(tracks, { x: label.x + 2.2, y: label.y + 10.7, maxWidth: label.width - 4.4, fontSize: 2.05, font: labelConfig.font, fill: text, lineHeight: 3.15, maxLines: 11 })
      : renderDenseTrackRows(tracks, { x: label.x + 2.2, y: label.y + 10.7, bottomY: label.y + label.height - 9.2, maxWidth: label.width - 4.4, font: labelConfig.font, fill: text, maxRows: 18 });
  } else if (layout === "image-tracks") {
    if (tracks.length <= 7) {
      body += renderWrappedDiscTracks(tracks, { x: label.x + 2.2, y: label.y + 27, maxWidth: label.width - 4.4, fontSize: 1.95, font: labelConfig.font, fill: text, lineHeight: 3.05, maxLines: 7 });
    } else if (tracks.length <= 10) {
      body += renderDenseTrackRows(tracks, { x: label.x + 2.2, y: label.y + 27, bottomY: label.y + label.height - 9.2, maxWidth: label.width - 4.4, font: labelConfig.font, fill: text, maxRows: 10, maxFontSize: 1.75, minFontSize: 1.3, maxLineHeight: 2.7 });
    } else {
      body += renderDenseTrackRows(tracks, { x: label.x + 2.2, y: label.y + 10.7, bottomY: label.y + label.height - 9.2, maxWidth: label.width - 4.4, font: labelConfig.font, fill: text, maxRows: 18 });
    }
  }

  body += logoUse(label, "disc", labelConfig);

  const chamferStroke = colorLuminance(bg) < 0.45 ? "#ffffff" : "";
  const contents = `<clipPath id="${clipId}"><path d="${path}" /></clipPath><g clip-path="url(#${clipId})">${body}</g>${cropMarks(label, true, CROP_GAP, CROP_LEN, chamferStroke)}`;
  return previewTarget(contents, label, labelIndex, "disc");
}

function renderCase(label, copyIndex, labelConfig, labelIndex) {
  label = caseLabelFor(label, labelConfig);
  const clipId = `case-clip-${copyIndex}`;
  const bg = labelConfig.caseBg;
  const text = labelConfig.caseText;
  const layout = labelConfig.caseLayout;
  const tracks = labelConfig.tracks || [];
  const isJCard = labelConfig.caseFormat === "j-card";
  const contentY = isJCard ? 1 : 0;
  const showTitleBlock = labelConfig.caseTitleBlock ?? true;
  const showJCardSpineInfo = labelConfig.jCardSpineInfo ?? true;
  const artistYear = [labelConfig.artist, labelConfig.year].filter(Boolean).join(" - ");
  const spineCopy = labelConfig.spineAuto ? [labelConfig.album, labelConfig.artist].filter(Boolean).join(" : ") : labelConfig.spineFreeform;
  let body = `<rect x="${label.x - BLEED}" y="${label.y - BLEED}" width="${label.width + BLEED * 2}" height="${label.height + BLEED * 2}" fill="${bg}" />
    <rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" fill="${bg}" />`;
  const titleBlock = () => `<rect x="${label.x + 4}" y="${label.y + 4 + contentY}" width="${label.width - 8}" height="13" fill="${bg}" opacity="0.88" />
    ${fittedSvgText(labelConfig.album, { x: label.x + 6, y: label.y + 9.5 + contentY, maxWidth: label.width - 12, fontSize: 4.2, minFontSize: 2.7, font: labelConfig.font, fill: text, weight: "bold" })}
    ${fittedSvgText(artistYear, { x: label.x + 6, y: label.y + 14 + contentY, maxWidth: label.width - 12, fontSize: 2.5, minFontSize: 1.8, font: labelConfig.font, fill: text })}`;
  const textPanel = (x, y, width, height) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${bg}" opacity="0.88" />`;

  if (layout === "image") {
    body += imageFill(labelConfig.caseImage || previewImage(labelConfig, "case"), imageBleedBox(label), labelConfig.caseImageFit || "cover");
  } else if (layout === "background-tracks") {
    body += imageFill(labelConfig.caseImage || previewImage(labelConfig, "case"), imageBleedBox(label), labelConfig.caseImageFit || "cover");
    body += titleBlock();
    const panel = { x: label.x + 4, y: label.y + 20 + contentY, width: label.width - 8, height: 36 };
    body += textPanel(panel.x, panel.y, panel.width, panel.height);
    body += renderDenseTrackRows(tracks, { x: panel.x + 2, y: panel.y + 5, bottomY: panel.y + panel.height - 2, maxWidth: panel.width - 4, font: labelConfig.font, fill: text, maxRows: 18, maxFontSize: 2.1, minFontSize: 1.4, maxLineHeight: 2.7 });
  } else if (layout === "image-tracks") {
    const img = { x: label.x + 5, y: label.y + 16 + contentY, width: 27, height: 27 };
    body += fittedSvgText(labelConfig.album, { x: label.x + 5, y: label.y + 8 + contentY, maxWidth: label.width - 10, fontSize: 4.6, minFontSize: 2.8, font: labelConfig.font, fill: text, weight: "bold" });
    body += fittedSvgText(artistYear, { x: label.x + 5, y: label.y + 12.5 + contentY, maxWidth: label.width - 10, fontSize: 2.7, minFontSize: 1.8, font: labelConfig.font, fill: text, weight: "bold" });
    body += imageFill(labelConfig.caseImage || previewImage(labelConfig, "case"), img, labelConfig.caseImageFit || "cover");
    body += renderDenseTrackRows(tracks, { x: label.x + 36, y: label.y + 18 + contentY, bottomY: label.y + label.height - 5, maxWidth: label.width - 39, font: labelConfig.font, fill: text, maxRows: 18, maxFontSize: 2.25, minFontSize: 1.4, maxLineHeight: 3 });
  } else {
    body += fittedSvgText(labelConfig.album, { x: label.x + 5, y: label.y + 8 + contentY, maxWidth: label.width - 10, fontSize: 5.2, minFontSize: 3, font: labelConfig.font, fill: text, weight: "bold" });
    body += fittedSvgText(artistYear, { x: label.x + 5, y: label.y + 13 + contentY, maxWidth: label.width - 10, fontSize: 3, minFontSize: 2, font: labelConfig.font, fill: text, weight: "bold" });
    if (tracks.length > 14) {
      body += renderTwoColumnTrackRows(tracks, { x: label.x + 5, y: label.y + 20 + contentY, bottomY: label.y + label.height - 4, width: label.width - 10, font: labelConfig.font, fill: text, maxRows: 24 });
    } else {
      body += renderDenseTrackRows(tracks, { x: label.x + 5, y: label.y + 20 + contentY, bottomY: label.y + label.height - 4, maxWidth: label.width - 10, font: labelConfig.font, fill: text, maxRows: 14, maxFontSize: 2.35, minFontSize: 1.65, maxLineHeight: 3.2 });
    }
  }

  if (layout === "image" && showTitleBlock) {
    body += titleBlock();
  }

  if (isJCard) {
    body += `<rect x="${label.x}" y="${label.y}" width="${label.width}" height="${J_CARD_SCORE_Y}" fill="${bg}" />`;
    if (layout !== "image" || showJCardSpineInfo) {
      body += fittedSvgText(spineCopy, { x: label.x + 3, y: label.y + J_CARD_SCORE_Y / 2, maxWidth: label.width - 6, fontSize: 2.75, minFontSize: 1.8, font: labelConfig.font, fill: text, weight: "bold", baseline: "middle" });
    }
  }

  body += logoUse(label, "case", labelConfig);
  const foldMarks = isJCard ? jCardFoldMarks(label) : "";
  const contents = `<clipPath id="${clipId}"><rect x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" /></clipPath><g clip-path="url(#${clipId})">${body}</g>${cropMarks(label)}${foldMarks}`;
  return previewTarget(contents, label, labelIndex, "case");
}

function renderSpine(label, labelConfig, labelIndex) {
  const bg = labelConfig.spineBg;
  const text = labelConfig.spineText;
  const spineText = labelConfig.spineAuto
    ? [labelConfig.album, labelConfig.artist].filter(Boolean).join(" : ")
    : labelConfig.spineFreeform;

  if (label.rotated) {
    const local = { x: 0, y: 0, width: labelSizes.spine.width, height: labelSizes.spine.height };
    const contents = `${cropMarks(label, false, SPINE_CROP_GAP, SPINE_CROP_LEN)}
    <g transform="translate(${label.x + label.width} ${label.y}) rotate(90)">
      <rect x="${-SPINE_BLEED}" y="${-SPINE_BLEED}" width="${local.width + SPINE_BLEED * 2}" height="${local.height + SPINE_BLEED * 2}" fill="${bg}" />
      ${fittedSvgText(spineText, { x: 2, y: 2.5, maxWidth: local.width - 4, fontSize: 2.75, minFontSize: 1.8, font: labelConfig.font, fill: text, weight: "bold", baseline: "middle" })}
    </g>`;
    return previewTarget(contents, label, labelIndex, "spine");
  }

  const contents = `<g>
    <rect x="${label.x - SPINE_BLEED}" y="${label.y - SPINE_BLEED}" width="${label.width + SPINE_BLEED * 2}" height="${label.height + SPINE_BLEED * 2}" fill="${bg}" />
    ${fittedSvgText(spineText, { x: label.x + 2, y: label.y + 2.5, maxWidth: label.width - 4, fontSize: 2.75, minFontSize: 1.8, font: labelConfig.font, fill: text, weight: "bold", baseline: "middle" })}
  </g>${cropMarks(label, false, SPINE_CROP_GAP, SPINE_CROP_LEN)}`;
  return previewTarget(contents, label, labelIndex, "spine");
}

function renderSheet() {
  const count = Number(controls.copies.value);
  const labelConfigs = Array.from({ length: count }, (_, index) => labelForCopy(index));
  const labelIndexes = Array.from({ length: count }, (_, index) => labelIndexForCopy(index));
  const copies = sheetCopies(labelConfigs);
  const cases = copies.map((copy, index) => copy.case ? renderCase(copy.case, index, labelConfigs[index], labelIndexes[index]) : "").join("");
  const spines = copies.map((copy, index) => copy.spine ? renderSpine(copy.spine, labelConfigs[index], labelIndexes[index]) : "").join("");
  const discs = copies.map((copy, index) => copy.disc ? renderDisc(copy.disc, index, labelConfigs[index], labelIndexes[index]) : "").join("");
  const compactPaper = ["mini-2x3", "card-photo"].includes(controls["paper-size"].value);
  const requestedArrangement = outputArrangement(selectedOutputParts({ compactPaper }));
  const requestedRequirement = requestedArrangement !== "none" ? arrangementRequirements(labelConfigs[0])[requestedArrangement] : null;
  const noticeDetail = requestedRequirement
    ? uiText(
      `필요한 최소 크기 ${Math.ceil(requestedRequirement.width)} × ${Math.ceil(requestedRequirement.height)}mm`,
      `Minimum required size: ${Math.ceil(requestedRequirement.width)} × ${Math.ceil(requestedRequirement.height)} mm`,
    )
    : uiText("상단에서 출력할 라벨을 하나 이상 선택하세요", "Select at least one label type above");
  const noFitNotice = copies.length === 0
    ? `<g font-family="Inter, sans-serif" text-anchor="middle" fill="#6d6670">
        <text x="${PAGE.width / 2}" y="${PAGE.height / 2 - 2}" font-size="${Math.min(3.2, PAGE.width / 14)}" font-weight="700">${uiText("라벨을 배치할 공간이 부족합니다", "Not enough space to arrange labels")}</text>
        <text x="${PAGE.width / 2}" y="${PAGE.height / 2 + 4}" font-size="${Math.min(2.2, PAGE.width / 20)}">${noticeDetail}</text>
      </g>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}">
    <style>
      .crop-marks line { stroke: #8f969c; stroke-width: ${CROP_STROKE}; vector-effect: non-scaling-stroke; }
      .fold-marks line { stroke: #8f969c; stroke-width: ${CROP_STROKE}; stroke-dasharray: 1.2 0.8; vector-effect: non-scaling-stroke; }
      .label-preview-target { cursor: pointer; outline: none; }
      .preview-dim { fill: #09080b; opacity: 0.38; pointer-events: none; transition: opacity 120ms ease; }
      .label-preview-target:hover .preview-dim { opacity: 0.12; }
      .preview-hit-area { fill: transparent; stroke: transparent; stroke-width: 0.8; vector-effect: non-scaling-stroke; pointer-events: all; }
      .label-preview-target:hover .preview-hit-area { stroke: #e376aa; }
      .label-preview-target:focus-visible .preview-hit-area { stroke: #e376aa; stroke-width: 1.25; }
      .label-preview-target.is-selected .preview-hit-area { stroke: #c94f88; stroke-width: 1.25; }
      text { dominant-baseline: alphabetic; }
    </style>
    <rect width="${PAGE.width}" height="${PAGE.height}" fill="#fff" />
    ${cases}
    ${spines}
    ${discs}
    ${noFitNotice}
  </svg>`;
  sheetHost.innerHTML = svg;
  scheduleAutoSaveDraft();
  return svg;
}

function syncSheetMode() {
  const labelSetField = document.getElementById("label-set-field");
  labelSetField.classList.toggle("hidden", controls["sheet-mode"].value !== "multiple");
  syncLabelPicker();
}

function selectedPaper() {
  const key = controls["paper-size"].value;
  if (key !== "custom") return PAPER_SIZES[key] || PAPER_SIZES.a4;
  const width = Math.min(500, Math.max(10, Number(controls["custom-paper-width"].value) || 100));
  const height = Math.min(500, Math.max(10, Number(controls["custom-paper-height"].value) || 148));
  return { name: uiText("사용자 지정", "Custom"), width, height, copies: [1] };
}

function syncPaperSize({ preferMaxCopies = false } = {}) {
  const paper = selectedPaper();
  const previousCopies = Number(controls.copies.value);
  const compactPaper = ["mini-2x3", "card-photo"].includes(controls["paper-size"].value);
  PAGE = { width: paper.width, height: paper.height };
  document.getElementById("custom-paper-field").classList.toggle("hidden", controls["paper-size"].value !== "custom");
  document.getElementById("case-label-section").classList.toggle("hidden", compactPaper);
  document.querySelectorAll(".case-only-field").forEach((field) => field.classList.toggle("hidden", compactPaper));
  controls["output-case"].disabled = compactPaper;
  const compatibility = document.getElementById("paper-compatibility");
  const parts = selectedOutputParts({ compactPaper });
  const requestedArrangement = outputArrangement(parts);
  const activeArrangement = selectedArrangement(state.labels[state.selectedIndex], { compactPaper });
  const arrangementNames = {
    full: uiText("케이스 + 디스크 + 측면", "Case + disc + spine"),
    "case-disc": uiText("케이스 + 디스크", "Case + disc"),
    "case-spine": uiText("케이스 + 측면", "Case + spine"),
    "disc-spine": uiText("디스크 + 측면", "Disc + spine"),
    disc: uiText("디스크", "Disc"),
    case: uiText("케이스", "Case"),
    spine: uiText("측면", "Spine"),
  };
  const requirement = requestedArrangement !== "none" ? arrangementRequirements(state.labels[state.selectedIndex])[requestedArrangement] : null;
  compatibility.textContent = controls["paper-size"].value === "mini-2x3"
    ? uiText("LG 포켓포토 · 샤오미 · Canon ZINK 계열 규격", "LG Pocket Photo · Xiaomi · Canon ZINK compatible")
    : controls["paper-size"].value === "card-photo"
      ? uiText("Canon SELPHY 카드형 규격", "Canon SELPHY card-size format")
      : controls["paper-size"].value === "custom"
        ? activeArrangement !== "none"
          ? uiText(`현재 크기: ${arrangementNames[activeArrangement]} 라벨 자동 배치`, `Current size: automatic ${arrangementNames[activeArrangement]} layout`)
          : requestedArrangement === "none"
            ? uiText("출력할 라벨을 하나 이상 선택하세요.", "Select at least one label type to output.")
            : uiText(
              `선택한 구성에는 최소 ${Math.ceil(requirement.width)} × ${Math.ceil(requirement.height)}mm가 필요합니다.`,
              `The selected layout requires at least ${Math.ceil(requirement.width)} × ${Math.ceil(requirement.height)} mm.`,
            )
        : "";
  compatibility.classList.toggle("hidden", !compatibility.textContent);
  const nonA4Capacity = controls["paper-size"].value === "a4"
    ? 0
    : nonA4SubsetPlan(state.labels[state.selectedIndex], requestedArrangement).grid.capacity;
  const availableCopies = controls["paper-size"].value === "a4"
    ? (A4_COPY_OPTIONS[requestedArrangement] || PAPER_SIZES.a4.copies)
    : copyOptionsForCapacity(nonA4Capacity);
  controls.copies.innerHTML = availableCopies
    .map((count) => `<option value="${count}">${count}-up</option>`)
    .join("");
  controls.copies.value = String(
    preferMaxCopies || !availableCopies.includes(previousCopies)
      ? availableCopies.at(-1)
      : previousCopies,
  );
  document.getElementById("copies-label").textContent = uiText(`${paper.name} 한 장당 라벨 수`, `Labels per ${paper.name} sheet`);
  document.getElementById("paper-summary").textContent = uiText(
    `${paper.name} · ${paper.width} × ${paper.height}mm · 100% 실제 크기`,
    `${paper.name} · ${paper.width} × ${paper.height} mm · 100% actual size`,
  );
  syncSheetMode();
  syncTracklisting();
}

function syncSpineFreeform() {
  document.getElementById("spine-freeform-field").classList.toggle("hidden", controls["spine-auto"].checked);
}

function syncTracklisting() {
  const compactPaper = ["mini-2x3", "card-photo"].includes(controls["paper-size"].value);
  const discUsesTracks = ["tracks", "image-tracks", "background-tracks"].includes(controls["disc-layout"].value);
  const caseUsesTracks = !compactPaper && controls["case-layout"].value !== "image";
  document.getElementById("track-list-section").classList.toggle("hidden", !discUsesTracks && !caseUsesTracks);
}

function syncCaseOptions() {
  const isFullImage = controls["case-layout"].value === "image";
  const isJCard = controls["case-format"].value === "j-card";
  document.getElementById("case-image-options").classList.toggle("hidden", !isFullImage);
  document.getElementById("j-card-spine-info-option").classList.toggle("hidden", !isFullImage || !isJCard);
}

function syncCaseFormatHint() {
  const isJCard = controls["case-format"].value === "j-card";
  document.getElementById("case-image-size-title").textContent = isJCard
    ? uiText("전체 J 카드 이미지 권장 크기:", "Recommended full J-card image size:")
    : uiText("전체 케이스 이미지 권장 크기:", "Recommended full-case image size:");
  document.getElementById("case-image-trim-size").textContent = isJCard
    ? uiText("재단 크기 640×602~700×659px 또는", "Trim size 640×602–700×659 px, or")
    : uiText("재단 크기 640×541~700×592px 또는", "Trim size 640×541–700×592 px, or");
  document.getElementById("case-image-bleed-size").textContent = isJCard
    ? uiText("2mm 여백 포함 680×642~740×699px", "680×642–740×699 px including 2 mm bleed")
    : uiText("2mm 여백 포함 680×580~740×632px", "680×580–740×632 px including 2 mm bleed");
}

function syncImageClearButtons() {
  const labelConfig = state.labels[state.selectedIndex];
  document.getElementById("clear-disc-image").classList.toggle("hidden", !labelConfig?.discImage);
  document.getElementById("clear-case-image").classList.toggle("hidden", !labelConfig?.caseImage);
}

function download(name, contents, type) {
  const blob = new Blob([contents], { type });
  downloadBlob(name, blob);
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function pdfFontFileName(fontFamily) {
  return `${fontFamily.replace(/[^a-z0-9]/gi, "")}.ttf`;
}

function usedFontFamilies(labelConfigs) {
  return [...new Set(labelConfigs.map((labelConfig) => labelConfig.font))];
}

async function registerPdfFonts(pdf, labelConfigs) {
  const fontFamilies = usedFontFamilies(labelConfigs);

  await Promise.all(
    fontFamilies.map(async (fontFamily) => {
      const path = pdfFonts[fontFamily];
      if (!path) return;

      const response = await fetch(path);
      if (!response.ok) throw new Error(`Unable to load PDF font: ${fontFamily}`);

      const fileName = pdfFontFileName(fontFamily);
      const base64 = arrayBufferToBase64(await response.arrayBuffer());
      pdf.addFileToVFS(fileName, base64);
      pdf.addFont(fileName, fontFamily, "normal");
      pdf.addFont(fileName, fontFamily, "bold");
    }),
  );
}

async function embedSvgFonts(svg, labelConfigs) {
  const rules = await Promise.all(
    usedFontFamilies(labelConfigs).map(async (fontFamily) => {
      const path = pdfFonts[fontFamily];
      if (!path) return "";

      const response = await fetch(path);
      if (!response.ok) throw new Error(`Unable to load SVG font: ${fontFamily}`);

      const base64 = arrayBufferToBase64(await response.arrayBuffer());
      return `@font-face { font-family: "${fontFamily}"; src: url("data:font/truetype;base64,${base64}") format("truetype"); font-weight: 400 900; font-style: normal; }`;
    }),
  );

  const style = svg.querySelector("style") || document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `${rules.filter(Boolean).join("\n")}\n${style.textContent}`;
  if (!style.parentNode) svg.insertBefore(style, svg.firstChild);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function imageHrefToDataUrl(href) {
  if (href.startsWith("data:")) return href;

  const response = await fetch(href);
  if (!response.ok) throw new Error(`Unable to load image: ${href}`);
  return blobToDataUrl(await response.blob());
}

async function rasterizeImageForPdf(dataUrl, imageNode) {
  if (dataUrl.startsWith("data:image/svg")) return dataUrl;

  const image = await loadImage(dataUrl);
  const boxWidth = Number(imageNode.getAttribute("width"));
  const boxHeight = Number(imageNode.getAttribute("height"));
  const scale = 12;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(boxWidth * scale));
  canvas.height = Math.max(1, Math.round(boxHeight * scale));

  const context = canvas.getContext("2d");
  const boxRatio = canvas.width / canvas.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const preserve = imageNode.getAttribute("preserveAspectRatio") || "xMidYMid meet";
  const shouldCover = preserve.includes("slice");
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let targetX = 0;
  let targetY = 0;
  let targetWidth = canvas.width;
  let targetHeight = canvas.height;

  if (shouldCover && imageRatio > boxRatio) {
    sourceWidth = image.naturalHeight * boxRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else if (shouldCover && imageRatio < boxRatio) {
    sourceHeight = image.naturalWidth / boxRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  } else if (!shouldCover && imageRatio > boxRatio) {
    targetHeight = canvas.width / imageRatio;
    targetY = (canvas.height - targetHeight) / 2;
  } else if (!shouldCover && imageRatio < boxRatio) {
    targetWidth = canvas.height * imageRatio;
    targetX = (canvas.width - targetWidth) / 2;
  }

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function prepareSvgForExport(svg, options = {}) {
  const clone = svg.cloneNode(true);
  const { embedFonts = false, labelConfigs = [], rasterizeImages = false } = options;
  const images = Array.from(clone.querySelectorAll("image"));

  clone.querySelectorAll("[data-preview-control]").forEach((node) => node.remove());

  if (embedFonts) await embedSvgFonts(clone, labelConfigs);

  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute("href");
      if (!href) return;

      const dataUrl = await imageHrefToDataUrl(href);
      const exportUrl = rasterizeImages ? await rasterizeImageForPdf(dataUrl, image) : dataUrl;
      image.setAttribute("href", exportUrl);
      image.setAttributeNS("http://www.w3.org/1999/xlink", "href", exportUrl);
    }),
  );

  return clone;
}

async function downloadSvg() {
  renderSheet();
  const svg = sheetHost.querySelector("svg");
  if (!svg) return;
  const labelConfigs = sheetCopies().map((_, index) => labelForCopy(index));
  const preparedSvg = await prepareSvgForExport(svg, { embedFonts: true, labelConfigs });
  const contents = new XMLSerializer().serializeToString(preparedSvg);
  download("minidisc-labels.svg", contents, "image/svg+xml");
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(uiText("PNG 이미지를 만들지 못했습니다.", "Could not create the PNG image."))), "image/png");
  });
}

async function downloadPng() {
  renderSheet();
  const svg = sheetHost.querySelector("svg");
  if (!svg) return;
  const button = document.getElementById("open-save-dialog");
  const previousText = button.textContent;
  button.textContent = uiText("PNG 만드는 중...", "Creating PNG...");
  button.disabled = true;
  let imageUrl = "";
  try {
    const labelConfigs = sheetCopies().map((_, index) => labelForCopy(index));
    const preparedSvg = await prepareSvgForExport(svg, { embedFonts: true, labelConfigs });
    const contents = new XMLSerializer().serializeToString(preparedSvg);
    imageUrl = URL.createObjectURL(new Blob([contents], { type: "image/svg+xml;charset=utf-8" }));
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((PAGE.width / 25.4) * 300);
    canvas.height = Math.round((PAGE.height / 25.4) * 300);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const paperName = controls["paper-size"].value.replace(/[^a-z0-9-]/gi, "-");
    downloadBlob(`minidisc-labels-${paperName}-300dpi.png`, await canvasToPngBlob(canvas));
  } catch (error) {
    console.error(error);
    window.alert(uiText(
      `300DPI PNG를 만들지 못했습니다. (${error?.message || error})`,
      `Could not create the 300 DPI PNG. (${error?.message || error})`,
    ));
  } finally {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    button.textContent = previousText;
    button.disabled = false;
  }
}

async function downloadPdf() {
  renderSheet();
  const svg = sheetHost.querySelector("svg");
  const labelConfigs = sheetCopies().map((_, index) => labelForCopy(index));
  const jsPDF = window.jspdf?.jsPDF;
  const svg2pdf = window.svg2pdf?.svg2pdf || window.svg2pdf;

  if (!svg || !jsPDF || typeof svg2pdf !== "function") {
    window.print();
    return;
  }

  const button = document.getElementById("open-save-dialog");
  const previousText = button.textContent;
  button.textContent = "...";
  button.disabled = true;

  try {
    const pdf = new jsPDF({
      orientation: PAGE.width > PAGE.height ? "landscape" : "portrait",
      unit: "mm",
      format: [PAGE.width, PAGE.height],
      compress: true,
      hotfixes: ["px_scaling"],
    });
    await registerPdfFonts(pdf, labelConfigs);
    const pdfSvg = await prepareSvgForExport(svg, { rasterizeImages: true });
    await svg2pdf(pdfSvg, pdf, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
    downloadBlob("minidisc-labels.pdf", pdf.output("blob"));
  } catch (error) {
    console.error(error);
    window.print();
  } finally {
    button.textContent = previousText;
    button.disabled = false;
  }
}

async function handleImageUpload(event, key) {
  saveSelectedLabel();
  state.labels[state.selectedIndex][key] = await fileToDataUrl(event.target.files[0]);
  syncImageClearButtons();
  renderSheet();
}

function clearImage(key, inputId) {
  saveSelectedLabel();
  state.labels[state.selectedIndex][key] = "";
  controls[inputId].value = "";
  syncImageClearButtons();
  renderSheet();
}

function distinctTrackValues(tracks, key) {
  return [...new Set(tracks.map((track) => String(track[key] || "").trim()).filter(Boolean))];
}

function commonTrackValue(tracks, key) {
  const values = distinctTrackValues(tracks, key);
  return values.length === 1 ? values[0] : "";
}

const appDialog = {
  backdrop: document.getElementById("app-dialog"),
  title: document.getElementById("app-dialog-title"),
  message: document.getElementById("app-dialog-message"),
  detail: document.getElementById("app-dialog-detail"),
  icon: document.getElementById("app-dialog-icon"),
  actions: document.getElementById("app-dialog-actions"),
  close: document.getElementById("app-dialog-close"),
};

let resolveAppDialog = null;

function closeAppDialog(value = null) {
  appDialog.backdrop.classList.add("hidden");
  if (resolveAppDialog) {
    const resolve = resolveAppDialog;
    resolveAppDialog = null;
    resolve(value);
  }
}

function showAppDialog({ icon = "!", title, message, detail = "", actions = [] }) {
  if (resolveAppDialog) closeAppDialog(null);
  appDialog.icon.textContent = icon;
  appDialog.title.textContent = title;
  appDialog.message.textContent = message;
  appDialog.detail.textContent = detail;
  appDialog.detail.classList.toggle("hidden", !detail);
  appDialog.actions.replaceChildren();

  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    if (action.primary) button.classList.add("primary");
    if (action.wide) button.classList.add("wide-action");
    const titleNode = document.createElement("span");
    titleNode.className = "app-dialog-action-title";
    titleNode.textContent = action.label;
    button.append(titleNode);
    if (action.note) {
      const noteNode = document.createElement("span");
      noteNode.className = "app-dialog-action-note";
      noteNode.textContent = action.note;
      button.append(noteNode);
    }
    button.addEventListener("click", () => closeAppDialog(action.value));
    appDialog.actions.append(button);
  });

  appDialog.backdrop.classList.remove("hidden");
  requestAnimationFrame(() => appDialog.actions.querySelector("button")?.focus());
  return new Promise((resolve) => {
    resolveAppDialog = resolve;
  });
}

async function showSaveDialog() {
  const choice = await showAppDialog({
    icon: "💾",
    title: uiText("저장 형식 선택", "Choose save format"),
    message: uiText("현재 용지와 라벨 배치를 어떤 형식으로 저장할까요?", "Which format should be used to save the current sheet and label layout?"),
    actions: [
      { value: "pdf", label: "PDF", note: uiText("인쇄 및 공유용", "For printing and sharing"), primary: true },
      { value: "png", label: "PNG 300DPI", note: uiText("포토프린터·이미지 인쇄용", "For photo printers and image printing") },
      { value: "svg", label: "SVG", note: uiText("벡터 편집용", "For vector editing") },
      { value: "project", label: uiText("작업 파일", "Project file"), note: uiText("나중에 다시 편집할 JSON", "JSON that can be edited later") },
    ],
  });
  if (choice === "pdf") await downloadPdf();
  if (choice === "png") await downloadPng();
  if (choice === "svg") await downloadSvg();
  if (choice === "project") saveProject();
}

async function showMiniDiscImportError(result) {
  const notConnected = result?.code === "not-connected";
  await showAppDialog({
    icon: "!",
    title: notConnected
      ? uiText("먼저 MiniDisc에 연결해 주세요", "Connect to a MiniDisc first")
      : uiText("곡 목록을 가져오지 못했습니다", "Could not import the track list"),
    message: result?.message || uiText("MiniDisc 곡 목록을 가져오지 못했습니다.", "Could not import the MiniDisc track list."),
    detail: notConnected
      ? uiText(
        "메인 앱에서 NetMD 또는 Hi-MD를 선택하고, 곡 목록이 모두 표시된 뒤 다시 눌러 주세요.",
        "Select NetMD or Hi-MD in the main app, wait for the full track list to appear, and try again.",
      )
      : uiText("기기와 미디어 상태를 확인한 뒤 다시 시도해 주세요.", "Check the device and media, then try again."),
    actions: [{ value: "close", label: uiText("확인", "OK"), primary: true, wide: true }],
  });
}

function discFingerprint(result) {
  return JSON.stringify({
    mode: result.mode,
    title: String(result.discTitle || "").trim(),
    tracks: result.tracks.map((track) => [
      String(track.title || "").trim(),
      String(track.album || "").trim(),
      String(track.artist || "").trim(),
      Number(track.duration) || 0,
    ]),
  });
}

function isPristineDemoProject() {
  return state.labels.length === 6
    && state.labels.map((labelConfig) => labelConfig.album).join("|")
      === "Blue Hour|Silver Map|Signal Garden|Late Static|Neon Civic|Amp Weather";
}

async function applyMiniDiscResult(result) {
  saveSelectedLabel();
  const commonAlbum = commonTrackValue(result.tracks, "album");
  const commonArtist = commonTrackValue(result.tracks, "artist");
  const album = result.discTitle || commonAlbum || uiText("제목 없는 디스크", "Untitled disc");
  const tracks = result.tracks.map((track, index) => `${String(index + 1).padStart(2, "0")} ${track.title || uiText("제목 없음", "Untitled")}`);
  const fingerprint = discFingerprint(result);
  // Import always targets the label the user explicitly selected. Matching a
  // previously imported disc must not silently jump back to another label.
  const labelConfig = state.labels[state.selectedIndex];
  state.labels[state.selectedIndex] = {
    ...labelConfig,
    album,
    artist: commonArtist,
    tracks,
    sourceDiscFingerprint: fingerprint,
  };
  syncLabelPicker();
  syncLabelControls();
  renderSheet();
  await showAppDialog({
    icon: "✓",
    title: uiText("MD 목록 가져오기 완료!", "MD track list imported!"),
    message: uiText(
      `${result.mode === "himd" ? "Hi-MD" : "NetMD"}에서 ${result.tracks.length}곡을 현재 라벨에 적용했습니다.`,
      `Applied ${result.tracks.length} tracks from ${result.mode === "himd" ? "Hi-MD" : "NetMD"} to the current label.`,
    ),
    actions: [{ value: "close", label: uiText("확인", "OK"), primary: true, wide: true }],
  });
}

async function importMiniDiscTracks() {
  const button = document.getElementById("import-md-tracks");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = uiText("연결된 MD 확인 중...", "Checking connected MD...");
  try {
    saveSelectedLabel();
    await window.mdLabelMaker?.saveDraft?.(projectData());
    if (!window.mdLabelMaker?.readDisc) {
      await showMiniDiscImportError({
        message: uiText(
          "현재 실행본에서는 MD 곡 목록 가져오기를 사용할 수 없습니다. 프로그램을 갱신한 뒤 다시 시도해 주세요.",
          "MD track-list import is unavailable in this build. Update the app and try again.",
        ),
      });
      return;
    }
    const result = await window.mdLabelMaker.readDisc();
    if (!result?.ok) {
      await showMiniDiscImportError(result);
      return;
    }
    await applyMiniDiscResult(result);
  } catch (error) {
    console.error(error);
    await showMiniDiscImportError({
      message: uiText(
        `MiniDisc 곡 목록을 가져오지 못했습니다. (${error?.message || error})`,
        `Could not import the MiniDisc track list. (${error?.message || error})`,
      ),
    });
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

window.mdLabelMaker?.onDiscardDraft?.(() => {
  autoDraftReady = false;
  clearTimeout(autoDraftTimer);
  autoDraftTimer = null;
});

function projectData() {
  saveSelectedLabel();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sheet: {
      mode: controls["sheet-mode"].value,
      copies: controls.copies.value,
      selectedIndex: state.selectedIndex,
      paperSize: controls["paper-size"].value,
      customPaperWidth: controls["custom-paper-width"].value,
      customPaperHeight: controls["custom-paper-height"].value,
      outputDisc: controls["output-disc"].checked,
      outputCase: controls["output-case"].checked,
      outputSpine: controls["output-spine"].checked,
    },
    labels: state.labels.map((labelConfig) => ({
      ...labelConfig,
      tracks: [...labelConfig.tracks],
    })),
  };
}

let autoDraftReady = false;
let autoDraftTimer = null;

async function saveAutoDraftNow() {
  if (!autoDraftReady || !window.mdLabelMaker?.saveDraft) return;
  clearTimeout(autoDraftTimer);
  autoDraftTimer = null;
  try {
    await window.mdLabelMaker.saveDraft(projectData());
  } catch (error) {
    console.warn(uiText("라벨 작업 자동 저장 실패:", "Label project auto-save failed:"), error);
  }
}

function scheduleAutoSaveDraft() {
  if (!autoDraftReady || !window.mdLabelMaker?.saveDraft) return;
  clearTimeout(autoDraftTimer);
  autoDraftTimer = setTimeout(() => void saveAutoDraftNow(), 450);
}

function applyProjectData(project) {
  if (!Array.isArray(project?.labels) || !project.labels.length) {
    throw new Error(uiText("라벨 정보가 없는 작업 파일입니다.", "This project file contains no label data."));
  }

  state.labels = project.labels.map((labelConfig, index) => normalizeProjectLabel(labelConfig, index, project.logo));
  state.selectedIndex = Math.min(Math.max(Number(project.sheet?.selectedIndex) || 0, 0), state.labels.length - 1);

  controls["sheet-mode"].value = project.sheet?.mode || "multiple";
  controls["paper-size"].value = project.sheet?.paperSize === "imagebox" ? "mini-2x3" : (project.sheet?.paperSize || "a4");
  controls["custom-paper-width"].value = project.sheet?.customPaperWidth || "100";
  controls["custom-paper-height"].value = project.sheet?.customPaperHeight || "148";
  controls["output-disc"].checked = project.sheet?.outputDisc ?? true;
  controls["output-case"].checked = project.sheet?.outputCase ?? true;
  controls["output-spine"].checked = project.sheet?.outputSpine ?? true;
  syncPaperSize();
  if (Array.from(controls.copies.options).some((option) => option.value === String(project.sheet?.copies))) {
    controls.copies.value = String(project.sheet.copies);
  }

  syncLabelPicker();
  syncLabelControls();
  syncSheetMode();
  syncSpineFreeform();
  syncTracklisting();
  syncImageClearButtons();
  renderSheet();
}

async function restoreAutoDraft() {
  if (!window.mdLabelMaker?.loadDraft) return false;
  try {
    const project = await window.mdLabelMaker.loadDraft();
    if (!project) return false;
    applyProjectData(project);
    return true;
  } catch (error) {
    console.warn(uiText("라벨 작업 자동 복구 실패:", "Label project auto-restore failed:"), error);
    return false;
  }
}

function normalizeProjectLabel(labelConfig, index, legacyLogo = {}) {
  const logoDefaults = {
    logoStyle: legacyLogo.style || "auto",
    logoCorner: legacyLogo.corner || "bottom-right",
    logoDisc: legacyLogo.disc ?? true,
    logoCase: legacyLogo.case ?? true,
  };
  return createLabel({
    ...logoDefaults,
    ...labelConfig,
    caseTitleBlock: labelConfig.caseTitleBlock ?? true,
    jCardSpineInfo: labelConfig.jCardSpineInfo ?? true,
    tracks: Array.isArray(labelConfig.tracks) ? labelConfig.tracks : textLines(labelConfig.tracks || ""),
    previewIndex: Number.isFinite(Number(labelConfig.previewIndex)) ? Number(labelConfig.previewIndex) : index % previewArtwork.length,
  });
}

function saveProject() {
  const contents = JSON.stringify(projectData(), null, 2);
  download("minidisc-labels-project.json", contents, "application/json");
}

async function loadProjectFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  try {
    const project = JSON.parse(await file.text());
    applyProjectData(project);
  } catch (error) {
    console.error(error);
    window.alert(uiText("작업 파일을 불러오지 못했습니다.", "Could not load the project file."));
  }
}

controls["disc-image"].addEventListener("change", (event) => handleImageUpload(event, "discImage"));
controls["case-image"].addEventListener("change", (event) => handleImageUpload(event, "caseImage"));

controls["selected-label"].addEventListener("change", () => {
  if (state.isSyncingControls) return;
  selectLabel(controls["selected-label"].value);
});

sheetHost.addEventListener("click", (event) => {
  const target = event.target.closest?.(".label-preview-target");
  if (!target) return;
  selectLabel(target.dataset.labelIndex);
});

sheetHost.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target.closest?.(".label-preview-target");
  if (!target) return;
  event.preventDefault();
  selectLabel(target.dataset.labelIndex);
});

document.getElementById("add-label").addEventListener("click", () => {
  saveSelectedLabel();
  state.labels.push(createLabel({
    album: uiText(`라벨 ${state.labels.length + 1}`, `Label ${state.labels.length + 1}`),
    artist: "",
    year: "",
    previewIndex: state.labels.length % previewArtwork.length,
  }));
  state.selectedIndex = state.labels.length - 1;
  syncLabelPicker();
  syncLabelControls();
  renderSheet();
});

document.getElementById("duplicate-label").addEventListener("click", () => {
  saveSelectedLabel();
  const source = state.labels[state.selectedIndex];
  state.labels.splice(state.selectedIndex + 1, 0, {
    ...source,
    tracks: [...source.tracks],
  });
  state.selectedIndex += 1;
  syncLabelPicker();
  syncLabelControls();
  renderSheet();
});

document.getElementById("delete-label").addEventListener("click", () => {
  if (state.labels.length === 1) return;
  state.labels.splice(state.selectedIndex, 1);
  state.selectedIndex = Math.max(0, state.selectedIndex - 1);
  syncLabelPicker();
  syncLabelControls();
  renderSheet();
});

document.querySelectorAll("input, select, textarea").forEach((el) => {
  if (el.type === "file" || el.id === "selected-label") return;
  el.addEventListener("input", () => {
    if (LOGO_CONTROL_IDS.has(el.id)) {
      syncLogoSettings();
      saveSelectedLabel();
    } else {
      saveSelectedLabel();
      syncLabelPicker();
    }
    if (el.id === "spine-auto") syncSpineFreeform();
    if (el.id === "case-layout" || el.id === "disc-layout") syncTracklisting();
    if (el.id === "case-format") syncCaseFormatHint();
    if (el.id === "case-layout" || el.id === "case-format") syncCaseOptions();
    renderSheet();
  });
  el.addEventListener("change", () => {
    if (LOGO_CONTROL_IDS.has(el.id)) {
      syncLogoSettings();
      saveSelectedLabel();
    } else {
      saveSelectedLabel();
      syncLabelPicker();
    }
    if (el.id === "spine-auto") syncSpineFreeform();
    if (el.id === "case-layout" || el.id === "disc-layout") syncTracklisting();
    if (el.id === "case-format") syncCaseFormatHint();
    if (el.id === "case-layout" || el.id === "case-format") syncCaseOptions();
    if (["output-disc", "output-case", "output-spine"].includes(el.id)) syncPaperSize({ preferMaxCopies: true });
    if (el.id === "case-format") syncPaperSize();
    renderSheet();
  });
});

controls["sheet-mode"].addEventListener("change", syncSheetMode);
controls["paper-size"].addEventListener("change", () => {
  syncPaperSize({ preferMaxCopies: true });
  renderSheet();
});
[controls["custom-paper-width"], controls["custom-paper-height"]].forEach((control) => {
  control.addEventListener("input", () => {
    if (controls["paper-size"].value !== "custom") return;
    syncPaperSize();
    renderSheet();
  });
});

document.getElementById("open-save-dialog").addEventListener("click", showSaveDialog);

document.getElementById("load-project").addEventListener("click", () => {
  controls["project-file"].click();
});

document.getElementById("import-md-tracks").addEventListener("click", importMiniDiscTracks);

appDialog.close.addEventListener("click", () => closeAppDialog(null));
appDialog.backdrop.addEventListener("click", (event) => {
  if (event.target === appDialog.backdrop) closeAppDialog(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !appDialog.backdrop.classList.contains("hidden")) closeAppDialog(null);
});

controls["project-file"].addEventListener("change", loadProjectFile);

document.getElementById("clear-disc-image").addEventListener("click", () => {
  clearImage("discImage", "disc-image");
});

document.getElementById("clear-case-image").addEventListener("click", () => {
  clearImage("caseImage", "case-image");
});

state.labels = [
  createLabel({ previewIndex: 0 }),
  createLabel({
    album: "Silver Map",
    artist: "Arlo Chen",
    year: "1999",
    tracks: ["01 North Pier", "02 Silver Map", "03 Rooms Above", "04 Broadcast"],
    previewIndex: 1,
  }),
  createLabel({
    album: "Signal Garden",
    artist: "Nia Kade",
    year: "2003",
    tracks: ["01 Folded Signal", "02 Seed Tone", "03 Garden Wall", "04 Receiver"],
    previewIndex: 2,
  }),
  createLabel({
    album: "Late Static",
    artist: "Mika Vale",
    year: "2001",
    tracks: ["01 Late Static", "02 Soft Error", "03 Return Path", "04 Wake"],
    previewIndex: 3,
  }),
  createLabel({
    album: "Neon Civic",
    artist: "Juno Trace",
    year: "2041",
    tracks: ["01 Neon Civic", "02 Glass Arcade", "03 Night Market", "04 Exit Ramp"],
    previewIndex: 4,
  }),
  createLabel({
    album: "Amp Weather",
    artist: "The Satellites",
    year: "2008",
    tracks: ["01 Amp Weather", "02 Feedback Coast", "03 Open Chord", "04 Last Rehearsal"],
    previewIndex: 5,
  }),
];

async function initializeLabelMaker() {
  const restored = await restoreAutoDraft();
  if (!restored) {
    syncLogoSettings();
    syncPaperSize();
    syncLabelPicker();
    syncLabelControls();
    syncSheetMode();
    syncSpineFreeform();
    syncTracklisting();
    syncImageClearButtons();
    renderSheet();
  }
  autoDraftReady = true;
  scheduleAutoSaveDraft();
  requestAnimationFrame(renderSheet);
}

void initializeLabelMaker();
window.addEventListener("load", renderSheet, { once: true });
window.addEventListener("beforeunload", () => void saveAutoDraftNow());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void saveAutoDraftNow();
});
