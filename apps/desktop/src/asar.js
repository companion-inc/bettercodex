"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function readArchive(filePath) {
  const buffer = fs.readFileSync(filePath);
  const jsonLength = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + jsonLength).toString("utf8"));
  const bodyOffset = 8 + buffer.readUInt32LE(4);
  return {bodyOffset, buffer, filePath, header};
}

function readText(archive, filePath) {
  return readFile(archive, filePath).toString("utf8");
}

function readFile(archive, filePath) {
  const entry = getFileEntry(archive.header, filePath);
  const start = archive.bodyOffset + Number(entry.offset || 0);
  return archive.buffer.subarray(start, start + Number(entry.size || 0));
}

function getFileEntry(header, filePath) {
  const parts = normalizeAsarPath(filePath).split("/").filter(Boolean);
  let node = header;
  for (const part of parts) {
    node = node.files?.[part];
    if (!node) {
      throw new Error(`ASAR entry not found: ${filePath}`);
    }
  }
  if (node.files || node.unpacked) {
    throw new Error(`ASAR entry is not a packed file: ${filePath}`);
  }
  return node;
}

function writeArchiveWithChanges(archive, changes) {
  const header = JSON.parse(JSON.stringify(archive.header));
  const files = collectFiles(header).sort((a, b) => Number(a.entry.offset || 0) - Number(b.entry.offset || 0));
  let offset = 0;
  const chunks = [];

  for (const file of files) {
    const normalized = `/${file.path}`;
    const replacement = changes.has(normalized) ? changes.get(normalized) : changes.get(file.path);
    const content = replacement === undefined
      ? readFile(archive, normalized)
      : Buffer.from(String(replacement), "utf8");
    file.entry.offset = String(offset);
    file.entry.size = content.length;
    chunks.push(content);
    offset += content.length;
  }

  return Buffer.concat([makeHeader(header), ...chunks]);
}

function collectFiles(header, base = "") {
  const result = [];
  for (const [name, entry] of Object.entries(header.files || {})) {
    const filePath = base ? `${base}/${name}` : name;
    if (entry.files) {
      result.push(...collectFiles(entry, filePath));
    } else if (!entry.unpacked) {
      result.push({path: filePath, entry});
    }
  }
  return result;
}

function makeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const padding = (4 - (json.length % 4)) % 4;
  const pickleSize = 4 + json.length + padding;
  const headerSize = 4 + pickleSize;
  const buffer = Buffer.alloc(8 + headerSize);
  buffer.writeUInt32LE(4, 0);
  buffer.writeUInt32LE(headerSize, 4);
  buffer.writeUInt32LE(pickleSize, 8);
  buffer.writeUInt32LE(json.length, 12);
  json.copy(buffer, 16);
  return buffer;
}

function normalizeAsarPath(filePath) {
  return filePath.split(path.sep).join("/").replace(/^\/+/, "");
}

function writeArchive(filePath, buffer) {
  fs.writeFileSync(filePath, buffer);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function asarHeaderSha256(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return sha256(buffer.subarray(16, 16 + jsonLength));
}

function archiveHeaderSha256(filePath) {
  return asarHeaderSha256(fs.readFileSync(filePath));
}

module.exports = {
  archiveHeaderSha256,
  asarHeaderSha256,
  collectFiles,
  fileSha256,
  getFileEntry,
  makeHeader,
  readArchive,
  readFile,
  readText,
  sha256,
  writeArchive,
  writeArchiveWithChanges,
};
