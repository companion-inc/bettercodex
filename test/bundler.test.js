"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  betterCodexIconPython,
  defaultDestination,
  normalizeName,
  slugify,
  userDataDir,
} = require("../apps/desktop/src/bundler");

test("normalizeName keeps a short human suffix for sibling app names", () => {
  assert.equal(normalizeName("research build 2026"), "Research Build");
  assert.equal(normalizeName(""), "BetterCodex");
});

test("slugify creates bundle-id-safe suffixes", () => {
  assert.equal(slugify("Research Build"), "research-build");
  assert.equal(slugify("!!!"), "bettercodex");
});

test("default BetterCodex bundle path is not Codex-prefixed", () => {
  assert.equal(
    defaultDestination("/Applications/Codex.app", "BetterCodex"),
    "/Applications/BetterCodex.app",
  );
});

test("default BetterCodex user data path is not Codex-prefixed", () => {
  assert.match(userDataDir("BetterCodex"), /\/Library\/Application Support\/BetterCodex$/);
});

test("BetterCodex icon generator adds an accessory badge", () => {
  const source = betterCodexIconPython();
  assert.match(source, /20, 198, 170/);
  assert.match(source, /icon_512x512@2x\.png/);
});
