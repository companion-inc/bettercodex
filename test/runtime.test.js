"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {writeRuntimeFiles} = require("../apps/desktop/src/runtimeFiles");

test("writeRuntimeFiles emits syntax-valid runtime files", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bettercodex-runtime-"));
  const runtime = writeRuntimeFiles(installRoot, {
    catalogEndpoint: "https://catalog.example.test/api/addons",
  });

  for (const filePath of [runtime.loaderPath, runtime.preloadPath, runtime.rendererPath]) {
    childProcess.execFileSync(process.execPath, ["--check", filePath], {stdio: "inherit"});
  }

  const renderer = fs.readFileSync(runtime.rendererPath, "utf8");
  assert.equal(renderer.includes("data-install"), false);
  assert.equal(renderer.includes("Community plugins"), false);
  assert.equal(renderer.includes("Community themes"), false);
  assert.equal(renderer.includes("Open Plugin Folder"), true);
  assert.equal(renderer.includes("bettercodex-card-grid"), true);
  assert.equal(renderer.includes("bettercodex-status"), false);
  assert.equal(renderer.includes("bettercodex-switch"), true);

  const config = JSON.parse(fs.readFileSync(runtime.configPath, "utf8"));
  assert.equal(config.catalogEndpoint, "https://catalog.example.test/api/addons");
  assert.equal(fs.existsSync(path.join(installRoot, "plugins")), true);
  assert.equal(fs.existsSync(path.join(installRoot, "themes")), true);
});
