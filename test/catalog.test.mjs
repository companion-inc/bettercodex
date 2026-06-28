import test from "node:test";
import assert from "node:assert/strict";

import {
  catalogResponse,
  sampleCatalog,
  slugify,
  validateCatalog,
  validateSubmission,
} from "../packages/catalog/src/index.mjs";

test("catalog validates sample addons", () => {
  const addons = validateCatalog(sampleCatalog);
  assert.equal(addons.length, 0);
});

test("catalogResponse wraps addons with schema metadata", () => {
  const response = catalogResponse(sampleCatalog);
  assert.equal(response.schemaVersion, 1);
  assert.ok(response.generatedAt);
  assert.equal(response.addons.length, 0);
});

test("submission validation requires raw GitHub downloads", () => {
  assert.throws(() => validateSubmission({
    author: "Companion",
    description: "Unsafe source",
    downloadUrl: "https://example.com/plugin.js",
    fileName: "unsafe.plugin.js",
    name: "Unsafe",
    type: "plugin",
    version: "0.1.0",
  }), /raw GitHub/);
});

test("slugify produces stable catalog ids", () => {
  assert.equal(slugify("Focus Contrast!"), "focus-contrast");
});
