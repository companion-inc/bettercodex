"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {parseArgs} = require("../apps/desktop/src/cli");

test("parseArgs keeps install sibling-safe by default", () => {
  const parsed = parseArgs(["install", "--app", "/Applications/Codex.app"]);
  assert.equal(parsed.command, "install");
  assert.equal(parsed.options.app, "/Applications/Codex.app");
  assert.equal(parsed.options.restart, true);
  assert.equal(parsed.options.repairAgent, true);
  assert.equal(parsed.options.unsafePatchOfficialApp, false);
});

test("parseArgs supports no-restart and custom marketplace API", () => {
  const parsed = parseArgs([
    "install",
    "--no-restart",
    "--no-repair-agent",
    "--home",
    "/tmp/bettercodex",
    "--catalog",
    "https://marketplace.example.test/api/addons",
  ]);
  assert.equal(parsed.options.home, "/tmp/bettercodex");
  assert.equal(parsed.options.restart, false);
  assert.equal(parsed.options.repairAgent, false);
  assert.equal(parsed.options.catalog, "https://marketplace.example.test/api/addons");
});

test("parseArgs supports repair without restart by default", () => {
  const parsed = parseArgs(["repair"]);
  assert.equal(parsed.command, "repair");
  assert.equal(parsed.options.restartRepair, false);
  assert.equal(parsed.options.repairAgent, true);
  assert.equal(parsed.options.unsafePatchOfficialApp, false);
});

test("parseArgs requires an explicit unsafe flag for official app patching", () => {
  const parsed = parseArgs(["install", "--unsafe-patch-official-app"]);
  assert.equal(parsed.command, "install");
  assert.equal(parsed.options.unsafePatchOfficialApp, true);
});

test("parseArgs supports sibling bundle options", () => {
  const parsed = parseArgs([
    "bundle",
    "--name",
    "Research Build",
    "--destination",
    "/Applications/Codex-Research.app",
    "--replace",
    "--launch",
  ]);

  assert.equal(parsed.command, "bundle");
  assert.equal(parsed.options.bundleName, "Research Build");
  assert.equal(parsed.options.destination, "/Applications/Codex-Research.app");
  assert.equal(parsed.options.replace, true);
  assert.equal(parsed.options.launch, true);
});

test("parseArgs supports explicit boolean bundle flags", () => {
  const parsed = parseArgs(["install", "--launch=false", "--replace=true"]);
  assert.equal(parsed.options.launch, false);
  assert.equal(parsed.options.replace, true);
});
