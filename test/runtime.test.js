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

  for (const filePath of [runtime.loaderPath, runtime.preloadPath, runtime.rendererPath, runtime.repairPath]) {
    childProcess.execFileSync(process.execPath, ["--check", filePath], {stdio: "inherit"});
  }

  const renderer = fs.readFileSync(runtime.rendererPath, "utf8");
  assert.equal(renderer.includes("data-install"), true);
  assert.equal(renderer.includes('section("Marketplace"'), true);
  assert.equal(renderer.includes("Community plugins"), false);
  assert.equal(renderer.includes("Community themes"), false);
  assert.equal(renderer.includes("Open Plugin Folder"), true);
  assert.equal(renderer.includes("bettercodex-card-grid"), true);
  assert.equal(renderer.includes("<div class=\"bettercodex-file\">"), false);
  assert.equal(renderer.includes("bettercodex-status"), false);
  assert.equal(renderer.includes("bettercodex-switch"), true);
  assert.equal(renderer.includes("bettercodex-market-card"), true);
  assert.equal(renderer.includes("suppressOtherNavActive"), true);
  assert.equal(renderer.includes("bettercodex-native-active-muted"), true);
  assert.equal(renderer.includes("syncHostContent"), true);
  assert.equal(renderer.includes("restoreHostContent"), true);
  assert.equal(renderer.includes("bettercodex-host-hidden"), true);
  assert.equal(renderer.includes('document.querySelector("main")'), true);
  assert.equal(renderer.includes("s.position = \"absolute\""), false);
  assert.equal(renderer.includes("shouldRestoreNativeNav"), true);
  assert.equal(renderer.includes("navItemText"), true);
  assert.equal(renderer.includes("restoreNative: shouldRestoreNativeNav(routeTarget)"), true);
  assert.equal(renderer.includes("No plugins installed yet. Add"), false);
  assert.equal(renderer.includes("pushState"), false);
  assert.equal(renderer.includes("replaceState"), false);
  assert.equal(renderer.includes("closest(\"nav, [role='navigation']\")"), true);
  assert.equal(renderer.includes("clientX <= leftBoundary"), false);
  assert.equal(renderer.includes("test(button.className"), false);

  const main = fs.readFileSync(runtime.loaderPath, "utf8");
  assert.equal(main.includes("Only plugins and themes install into the desktop client"), true);

  const config = JSON.parse(fs.readFileSync(runtime.configPath, "utf8"));
  assert.equal(config.catalogEndpoint, "https://catalog.example.test/api/addons");
  assert.equal(fs.existsSync(path.join(installRoot, "plugins")), true);
  assert.equal(fs.existsSync(path.join(installRoot, "themes")), true);

  const repair = fs.readFileSync(runtime.repairPath, "utf8");
  assert.equal(repair.includes("loader-missing-or-stale"), true);
  assert.equal(repair.includes("ElectronAsarIntegrity:Resources/app.asar:hash"), true);
});
