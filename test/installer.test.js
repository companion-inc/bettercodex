"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {isCodexBundleIdentifier} = require("../apps/desktop/src/installer");

test("isCodexBundleIdentifier accepts official and BetterCodex sibling ids", () => {
  assert.equal(isCodexBundleIdentifier("com.openai.codex"), true);
  assert.equal(isCodexBundleIdentifier("com.openai.codex.smoke"), true);
  assert.equal(isCodexBundleIdentifier("com.companion.bettercodex"), true);
  assert.equal(isCodexBundleIdentifier("com.openai.codexmalformed"), false);
  assert.equal(isCodexBundleIdentifier("com.example.codex"), false);
});
