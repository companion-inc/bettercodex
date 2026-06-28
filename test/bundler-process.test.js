"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("bundle cleanup source skips current process ids", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../apps/desktop/src/bundler.js"),
    "utf8",
  );
  assert.match(source, /process\.pid/);
  assert.match(source, /process\.ppid/);
  assert.match(source, /!ownPids\.has/);
});
