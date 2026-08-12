const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const extensionDirectory = path.join(repositoryRoot, "extension");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readExtensionConfig() {
  const context = { globalThis: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(extensionDirectory, "config.js"), "utf8"),
    context,
    { filename: "extension/config.js" }
  );
  return context.globalThis.MOCHILENS_CONFIG;
}

async function checkRemoteHealth(config) {
  if (process.env.SKIP_REMOTE_HEALTH === "1") {
    console.log("Remote health check skipped.");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${config.backendUrl}/api/health`, {
      signal: controller.signal
    });
    assert.equal(response.ok, true, `Health endpoint returned HTTP ${response.status}`);
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.phase, config.requiredBackendPhase);
    assert.equal(health.contractVersion, config.requiredBackendContract);
    assert.equal(health.aiProvider, config.requiredAIProvider);
    assert.equal(health.bailianConfigured, true);
    assert.equal(typeof health.revision, "string");
    assert.ok(health.revision.length > 0);
    console.log(
      `Remote backend verified: ${health.aiProvider}, phase ${health.phase}, revision ${health.revision}`
    );
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const manifest = readJSON(path.join(extensionDirectory, "manifest.json"));
  const packageJSON = readJSON(path.join(repositoryRoot, "backend", "package.json"));
  const config = readExtensionConfig();
  const expectedPermission = `${config.backendUrl}/*`;

  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJSON.scripts.test, "node --test");
  assert.deepEqual(manifest.host_permissions, [expectedPermission]);
  assert.match(config.backendUrl, /^https:\/\/[a-z0-9.-]+$/i);
  assert.equal(config.requiredBackendContract, "2026-08-12");
  assert.equal(config.requiredAIProvider, "aliyun-bailian");
  assert.ok(fs.existsSync(path.join(repositoryRoot, "render.yaml")));

  console.log(
    `Local release configuration verified: extension ${manifest.version}, ${config.backendUrl}`
  );
  await checkRemoteHealth(config);
}

main().catch((error) => {
  console.error(`Release check failed: ${error.message}`);
  process.exitCode = 1;
});
