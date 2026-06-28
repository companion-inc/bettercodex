"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  asarHeaderSha256,
  makeHeader,
  readArchive,
  readText,
  sha256,
  writeArchiveWithChanges,
} = require("../apps/desktop/src/asar");

test("writeArchiveWithChanges replaces packed file contents", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bettercodex-asar-"));
  const asarPath = path.join(dir, "app.asar");
  const first = Buffer.from("hello", "utf8");
  const second = Buffer.from("world", "utf8");
  const header = {
    files: {
      "package.json": {size: first.length, offset: "0"},
      "bootstrap.js": {size: second.length, offset: String(first.length)},
    },
  };
  fs.writeFileSync(asarPath, Buffer.concat([makeHeader(header), first, second]));

  const archive = readArchive(asarPath);
  const next = writeArchiveWithChanges(
    archive,
    new Map([["/bootstrap.js", "patched"]]),
  );
  fs.writeFileSync(asarPath, next);

  const patched = readArchive(asarPath);
  assert.equal(readText(patched, "/package.json"), "hello");
  assert.equal(readText(patched, "/bootstrap.js"), "patched");
});

test("asarHeaderSha256 hashes the raw ASAR header JSON", () => {
  const header = {
    files: {
      "package.json": {size: 5, offset: "0"},
    },
  };
  const headerBuffer = makeHeader(header);
  const jsonLength = headerBuffer.readUInt32LE(12);
  const json = headerBuffer.subarray(16, 16 + jsonLength);

  assert.equal(asarHeaderSha256(Buffer.concat([headerBuffer, Buffer.from("hello")])), sha256(json));
});
