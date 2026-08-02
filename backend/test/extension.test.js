const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionDirectory = path.resolve(__dirname, "..", "..", "extension");

function readExtensionFile(fileName) {
  return fs.readFileSync(path.join(extensionDirectory, fileName), "utf8");
}

test("扩展使用 Manifest V3 和 MochiLens 品牌版本", () => {
  const manifest = JSON.parse(readExtensionFile("manifest.json"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "MochiLens");
  assert.equal(manifest.version, "0.8.2");
  assert.equal(manifest.minimum_chrome_version, "116");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.icons[128], "icons/icon-128.png");
  assert.deepEqual(manifest.host_permissions, [
    "https://mochilens-api.onrender.com/*"
  ]);
  assert.ok(manifest.permissions.includes("tabCapture"));
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.equal(manifest.background.service_worker, "background.js");
});

test("扩展 JavaScript 文件语法有效", () => {
  for (const fileName of [
    "popup.js",
    "content.js",
    "page-bridge.js",
    "background.js",
    "offscreen.js"
  ]) {
    assert.doesNotThrow(
      () => new vm.Script(readExtensionFile(fileName), { filename: fileName }),
      `${fileName} 应通过语法检查`
    );
  }
});

test("popup.js 查询的界面元素都存在", () => {
  const popupHTML = readExtensionFile("popup.html");
  const popupJavaScript = readExtensionFile("popup.js");
  const queriedIds = [
    ...popupJavaScript.matchAll(/document\.querySelector\("#([^"\n]+)"\)/g)
  ].map((match) => match[1]);

  assert.ok(queriedIds.length > 0);

  for (const id of queriedIds) {
    assert.ok(popupHTML.includes(`id="${id}"`), `popup.html 缺少 #${id}`);
  }
});

test("弹窗使用紧凑的视频解析流程文案", () => {
  const popupHTML = readExtensionFile("popup.html");
  const popupJavaScript = readExtensionFile("popup.js");

  assert.match(popupHTML, /视频解析/);
  assert.match(popupHTML, /查看视频字幕/);
  assert.match(popupHTML, /解析视频后可以针对视频提问/);
  assert.equal(popupHTML.includes("Video ID"), false);
  assert.equal(popupHTML.includes("获取字幕后"), false);
  assert.equal(popupJavaScript.includes("获取字幕后"), false);
  assert.match(popupHTML, /使用音频识别/);
  assert.match(popupHTML, /不会读取麦克风/);
  assert.match(popupHTML, /开头、中间、结尾各 3 秒/);
  assert.match(popupJavaScript, /sampleDurationSeconds/);
});

test("API Key 未出现在扩展代码中", () => {
  const extensionSource = [
    "manifest.json",
    "popup.html",
    "popup.js",
    "content.js",
    "page-bridge.js"
  ]
    .map(readExtensionFile)
    .join("\n");

  assert.equal(extensionSource.includes("OPENAI_API_KEY"), false);
  assert.equal(/sk-[A-Za-z0-9_-]{12,}/.test(extensionSource), false);
});

test("扩展只连接已部署的 MochiLens 后端", () => {
  const popupJavaScript = readExtensionFile("popup.js");
  const backgroundJavaScript = readExtensionFile("background.js");
  const remoteBackendURL = "https://mochilens-api.onrender.com";

  assert.ok(popupJavaScript.includes(remoteBackendURL));
  assert.ok(backgroundJavaScript.includes(remoteBackendURL));
  assert.equal(popupJavaScript.includes("127.0.0.1:3000"), false);
  assert.equal(backgroundJavaScript.includes("127.0.0.1:3000"), false);
});

test("MochiLens 图标文件完整", () => {
  for (const size of [16, 32, 48, 128]) {
    const iconPath = path.join(extensionDirectory, "icons", `icon-${size}.png`);
    assert.equal(fs.existsSync(iconPath), true, `缺少 ${size}px 图标`);
    assert.ok(fs.statSync(iconPath).size > 0, `${size}px 图标为空`);
  }
});
