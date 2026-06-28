"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {normalizeName, slugify} = require("../apps/desktop/src/bundler");

test("normalizeName keeps a short human suffix for sibling app names", () => {
  assert.equal(normalizeName("research build 2026"), "Research Build");
  assert.equal(normalizeName(""), "BetterCodex");
});

test("slugify creates bundle-id-safe suffixes", () => {
  assert.equal(slugify("Research Build"), "research-build");
  assert.equal(slugify("!!!"), "bettercodex");
});
