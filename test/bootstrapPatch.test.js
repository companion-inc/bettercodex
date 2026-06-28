"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {hasLoader, patchBootstrapSource, stripLoader} = require("../apps/desktop/src/bootstrapPatch");

test("patchBootstrapSource prepends one replaceable loader block", () => {
  const original = "import('./main.js');";
  const once = patchBootstrapSource(original, "/tmp/bettercodex/main.cjs");
  const twice = patchBootstrapSource(once, "/tmp/bettercodex/next.cjs");

  assert.equal(hasLoader(twice), true);
  assert.equal((twice.match(/bettercodex-loader:start/g) || []).length, 1);
  assert.equal(stripLoader(twice), original);
});
