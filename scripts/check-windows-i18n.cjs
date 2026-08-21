"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const files = [
  "custom-overrides/dist/main.js",
  "custom-overrides/dist/preload.js",
  "custom-overrides/dist/md-squirrel-main.js",
  "custom-overrides/dist/md-squirrel-preload.js",
  "custom-overrides/renderer/assets/index-DdAyCQFX.js",
];

const intentionalKorean = new Map([
  ["custom-overrides/dist/main.js", new Set(["한국어"])],
  ["custom-overrides/dist/preload.js", new Set([
    "사용할 디스크 모드를 선택하세요",
    "현재 기기는 Hi-MD",
    "현재 기기의 USB 인터페이스는 Hi-MD",
    "현재 기기의 USB 인터페이스가 Hi-MD",
    "연결된 기기는 Hi-MD",
    "현재 USB 인터페이스가 Hi-MD 모드에 남아 있습니다",
    "NetMD 모드로 연결할 수 없습니다",
    "잘못된 연결 모드가 차단되었습니다",
    "NetMD로 연결",
    "Hi-MD로 연결",
    "Hi-MD 모드로 연결할 수 없습니다",
    "Hi-MD USB 인터페이스를 기다리고 있습니다",
    "일반 MD",
    "현재 RH10은 일반 MD",
    "button[aria-label=\"편집 적용\"]",
    "색상 테마",
    "화면 테마",
    "세로 방향으로 화면 채우기",
    "세로로 화면 채우기",
    "가로 방향으로 화면 채우기",
    "가로로 화면 채우기",
    "화면",
    "디스크가 없습니다",
  ])],
  ["custom-overrides/dist/md-squirrel-preload.js", new Set([
    "사용할 디스크 모드를 선택하세요",
    "button[aria-label=\"편집 적용\"], button[aria-label=\"Commit changes\"]",
    "NetMD로 연결",
    "Hi-MD로 연결",
  ])],
]);

function hasLocalizedAncestor(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) &&
        ts.isIdentifier(current.expression) &&
        ["uiText", "wmdCustomText"].includes(current.expression.text)) {
      return true;
    }
  }
  return false;
}

function isInsideNamedDeclaration(node, names) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) &&
        ts.isIdentifier(current.name) &&
        names.includes(current.name.text)) {
      return true;
    }
  }
  return false;
}

function checkText(file, sourceFile, node, value, failures) {
  if (!/[가-힣]/.test(value) || hasLocalizedAncestor(node))
    return;
  if (value.length > 10000)
    return; // Character encoding lookup data, not UI copy.
  if (file.endsWith("preload.js") &&
      isInsideNamedDeclaration(node, ["koreanText", "koreanAttributes"])) {
    return;
  }
  if (file === "custom-overrides/dist/preload.js" &&
      isInsideNamedDeclaration(node, ["translateKoreanUI"])) {
    return;
  }
  if (intentionalKorean.get(file)?.has(value))
    return;
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  failures.push(`${file}:${position.line + 1}: ${JSON.stringify(value.slice(0, 180))}`);
}

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkText(file, sourceFile, node, node.text, failures);
    }
    else if (ts.isTemplateExpression(node)) {
      checkText(file, sourceFile, node, node.head.text, failures);
      for (const span of node.templateSpans)
        checkText(file, sourceFile, span.literal, span.literal.text, failures);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

if (failures.length) {
  console.error("Unlocalized Korean UI text found:\n" + failures.join("\n"));
  process.exit(1);
}

console.log("Windows Korean/English UI audit: PASS");
