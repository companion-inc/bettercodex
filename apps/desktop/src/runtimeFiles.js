"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {defaultCatalogEndpoint} = require("./constants");

function writeRuntimeFiles(installRoot, options = {}) {
  const runtimeDir = path.join(installRoot, "runtime");
  const dataDir = path.join(installRoot, "data");
  const pluginDir = path.join(installRoot, "plugins");
  const themeDir = path.join(installRoot, "themes");
  const logDir = path.join(installRoot, "logs");
  for (const dir of [runtimeDir, dataDir, pluginDir, themeDir, logDir]) {
    fs.mkdirSync(dir, {recursive: true});
  }

  const config = {
    dataDir,
    pluginDir,
    catalogEndpoint: options.catalogEndpoint || options.storeEndpoint || defaultCatalogEndpoint,
    themeDir,
  };

  fs.writeFileSync(path.join(runtimeDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(runtimeDir, "main.cjs"), mainRuntimeSource(), "utf8");
  fs.writeFileSync(path.join(runtimeDir, "preload.cjs"), preloadRuntimeSource(), "utf8");
  fs.writeFileSync(path.join(runtimeDir, "renderer.cjs"), rendererRuntimeSource(), "utf8");
  fs.writeFileSync(path.join(runtimeDir, "repair.cjs"), repairRuntimeSource(), "utf8");

  return {
    configPath: path.join(runtimeDir, "config.json"),
    loaderPath: path.join(runtimeDir, "main.cjs"),
    preloadPath: path.join(runtimeDir, "preload.cjs"),
    repairPath: path.join(runtimeDir, "repair.cjs"),
    rendererPath: path.join(runtimeDir, "renderer.cjs"),
  };
}

function repairRuntimeSource() {
  return String.raw`#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const markerStart = "/* bettercodex-loader:start */";
const markerEnd = "/* bettercodex-loader:end */";
const defaultInstallRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    app: process.env.CODEX_APP_ROOT || "/Applications/Codex.app",
    home: defaultInstallRoot,
    quiet: false,
    restart: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--app") {
      options.app = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--home") {
      options.home = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (arg === "--restart") {
      options.restart = true;
      continue;
    }
    throw new Error("Unknown option: " + arg);
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(flag + " requires a value");
  return value;
}

function repair(options = {}) {
  const installRoot = path.resolve(options.home || defaultInstallRoot);
  const paths = resolveAppPaths(options.app || "/Applications/Codex.app");
  assertCodexApp(paths);

  const loaderPath = path.join(installRoot, "runtime", "main.cjs");
  if (!fs.existsSync(loaderPath)) throw new Error("BetterCodex runtime loader not found: " + loaderPath);

  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = "/" + pkg.main;
  const originalBootstrap = readText(archive, bootstrapPath);
  const nextBootstrap = patchBootstrapSource(originalBootstrap, loaderPath);
  const originalHeaderHash = archiveHeaderSha256(paths.asarPath);
  const plistHeaderHash = readPlistAsarHash(paths.infoPlistPath);

  let changed = false;
  let backupDir = null;
  let finalHeaderHash = originalHeaderHash;
  if (nextBootstrap !== originalBootstrap) {
    backupDir = backupAppState(paths, installRoot, {
      repairedAt: new Date().toISOString(),
      reason: "loader-missing-or-stale",
      version: pkg.version || null,
      asarHeaderHash: originalHeaderHash,
    });
    const nextAsar = writeArchiveWithChanges(archive, new Map([[bootstrapPath, nextBootstrap]]));
    writeArchive(paths.asarPath, nextAsar);
    finalHeaderHash = asarHeaderSha256(nextAsar);
    changed = true;
  }

  const needsIntegrityRepair = readPlistAsarHash(paths.infoPlistPath) !== finalHeaderHash;
  const needsSignatureRepair = !verifyApp(paths.appRoot);
  if (changed || needsIntegrityRepair) {
    updatePlistAsarHash(paths.infoPlistPath, finalHeaderHash);
  }
  if (changed || needsIntegrityRepair || needsSignatureRepair) {
    signAndVerify(paths.appRoot);
    changed = true;
  }

  const result = {
    appRoot: paths.appRoot,
    backupDir,
    changed,
    loaderInstalled: true,
    originalHeaderHash,
    patchedHeaderHash: finalHeaderHash,
    plistHeaderHashBefore: plistHeaderHash,
    version: pkg.version || null,
  };
  writeRepairState(installRoot, result);
  log(installRoot, (changed ? "repaired " : "ok ") + paths.appRoot + " " + finalHeaderHash);
  if (changed && options.restart) restartCodex(paths);
  return result;
}

function resolveAppPaths(appRoot) {
  return {
    appRoot,
    asarPath: path.join(appRoot, "Contents", "Resources", "app.asar"),
    infoPlistPath: path.join(appRoot, "Contents", "Info.plist"),
  };
}

function assertCodexApp(paths) {
  if (!fs.existsSync(paths.appRoot)) throw new Error("Codex app not found: " + paths.appRoot);
  if (!fs.existsSync(paths.asarPath)) throw new Error("Codex app.asar not found: " + paths.asarPath);
  if (!fs.existsSync(paths.infoPlistPath)) throw new Error("Codex Info.plist not found: " + paths.infoPlistPath);
  const bundleId = readPlistValue(paths.infoPlistPath, "CFBundleIdentifier");
  if (bundleId !== "com.openai.codex" && !String(bundleId || "").startsWith("com.openai.codex.")) {
    throw new Error("Expected Codex bundle id, found " + (bundleId || "unknown"));
  }
}

function patchBootstrapSource(source, loaderPath) {
  const block = [
    markerStart,
    "try {",
    "  require(" + JSON.stringify(loaderPath) + ");",
    "} catch (error) {",
    "  console.error('[BetterCodex] failed to load runtime', error);",
    "}",
    markerEnd,
    "",
  ].join("\n");
  if (hasLoader(source)) return source.replace(loaderRegex(), block);
  return block + source;
}

function hasLoader(source) {
  return source.includes(markerStart) && source.includes(markerEnd);
}

function loaderRegex() {
  return new RegExp(escapeRegex(markerStart) + "[\\s\\S]*?" + escapeRegex(markerEnd) + "\\n?\\n?", "m");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

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
    node = node.files && node.files[part];
    if (!node) throw new Error("ASAR entry not found: " + filePath);
  }
  if (node.files || node.unpacked) throw new Error("ASAR entry is not a packed file: " + filePath);
  return node;
}

function writeArchiveWithChanges(archive, changes) {
  const header = JSON.parse(JSON.stringify(archive.header));
  const files = collectFiles(header).sort((a, b) => Number(a.entry.offset || 0) - Number(b.entry.offset || 0));
  let offset = 0;
  const chunks = [];
  for (const file of files) {
    const normalized = "/" + file.path;
    const replacement = changes.has(normalized) ? changes.get(normalized) : changes.get(file.path);
    const content = replacement === undefined ? readFile(archive, normalized) : Buffer.from(String(replacement), "utf8");
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
    const filePath = base ? base + "/" + name : name;
    if (entry.files) result.push(...collectFiles(entry, filePath));
    else if (!entry.unpacked) result.push({path: filePath, entry});
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

function asarHeaderSha256(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  return sha256(buffer.subarray(16, 16 + jsonLength));
}

function archiveHeaderSha256(filePath) {
  return asarHeaderSha256(fs.readFileSync(filePath));
}

function backupAppState(paths, installRoot, metadata) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(installRoot, "backups", timestamp + "-repair");
  fs.mkdirSync(backupDir, {recursive: true});
  fs.copyFileSync(paths.asarPath, path.join(backupDir, "app.asar"));
  fs.copyFileSync(paths.infoPlistPath, path.join(backupDir, "Info.plist"));
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({appRoot: paths.appRoot, ...metadata}, null, 2) + "\n", "utf8");
  return backupDir;
}

function readPlistValue(infoPlistPath, key) {
  try {
    return childProcess.execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :" + key, infoPlistPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readPlistAsarHash(infoPlistPath) {
  try {
    return childProcess.execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :ElectronAsarIntegrity:Resources/app.asar:hash", infoPlistPath],
      {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]},
    ).trim();
  } catch {
    return null;
  }
}

function updatePlistAsarHash(infoPlistPath, hash) {
  childProcess.execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Set :ElectronAsarIntegrity:Resources/app.asar:hash " + hash, infoPlistPath],
    {stdio: "ignore"},
  );
}

function verifyApp(appRoot) {
  try {
    childProcess.execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appRoot], {stdio: "ignore"});
    return true;
  } catch {
    return false;
  }
}

function signAndVerify(appRoot) {
  childProcess.execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", appRoot], {stdio: "ignore"});
  childProcess.execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appRoot], {stdio: "ignore"});
}

function restartCodex(paths) {
  const currentPid = String(process.pid);
  try {
    const output = childProcess.execFileSync("/bin/ps", ["axo", "pid=,command="], {encoding: "utf8"});
    for (const line of output.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!match || match[1] === currentPid) continue;
      if (match[2].includes(paths.appRoot + "/Contents/MacOS/Codex")) {
        try { process.kill(Number(match[1]), "SIGKILL"); } catch {}
      }
    }
  } catch {}
  childProcess.spawnSync("/usr/bin/open", ["-a", paths.appRoot], {detached: true, stdio: "ignore"});
}

function writeRepairState(installRoot, result) {
  const dataDir = path.join(installRoot, "data");
  fs.mkdirSync(dataDir, {recursive: true});
  fs.writeFileSync(path.join(dataDir, "repair.json"), JSON.stringify({...result, checkedAt: new Date().toISOString()}, null, 2) + "\n", "utf8");
}

function log(installRoot, message) {
  try {
    const logDir = path.join(installRoot, "logs");
    fs.mkdirSync(logDir, {recursive: true});
    fs.appendFileSync(path.join(logDir, "repair.log"), "[" + new Date().toISOString() + "] " + message + "\n", "utf8");
  } catch {}
}

if (require.main === module) {
  let options = null;
  try {
    options = parseArgs(process.argv.slice(2));
    const result = repair(options);
    if (!options.quiet) console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const installRoot = options && options.home ? options.home : defaultInstallRoot;
    log(installRoot, "failed " + (error && error.message ? error.message : String(error)));
    if (!options || !options.quiet) console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  repair,
};
`;
}

function mainRuntimeSource() {
  return String.raw`"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const runtimeDir = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(runtimeDir, "config.json"), "utf8"));
config.catalogEndpoint = config.catalogEndpoint || config.storeEndpoint;
const rendererPath = path.join(runtimeDir, "renderer.cjs");
const preloadPath = path.join(runtimeDir, "preload.cjs");
const statePath = path.join(config.dataDir, "addons.json");

for (const dir of [config.dataDir, config.pluginDir, config.themeDir]) {
  try { fs.mkdirSync(dir, {recursive: true}); } catch (error) { /* ignore */ }
}

// Codex sandboxes its renderer, so a Node-using preload cannot load (require("node:fs")
// throws "module not found" even with sandbox:false requested). So we do NOT touch Codex's
// own preload. Instead: register a tiny Node-free bridge preload at the session level (it
// only uses electron contextBridge + ipcRenderer), run every filesystem/network action in
// THIS main process over IPC, and inject the renderer UI from main. We still intercept
// require("electron") so Codex constructs our BrowserWindow subclass and we can hook it.
try {
  const electron = require("electron");
  const {app, ipcMain, session, shell} = electron;
  const OriginalBrowserWindow = electron.BrowserWindow;

  registerIpc(ipcMain, shell);

  const seenSessions = new WeakSet();
  function addPreload(ses) {
    if (!ses || seenSessions.has(ses)) return;
    seenSessions.add(ses);
    try {
      const existing = ses.getPreloads ? ses.getPreloads() : [];
      if (!existing.includes(preloadPath)) ses.setPreloads([...existing, preloadPath]);
    } catch (error) { /* ignore */ }
  }

  if (app && app.whenReady) {
    app.whenReady().then(() => addPreload(session.defaultSession)).catch(() => {});
  }

  if (OriginalBrowserWindow && !OriginalBrowserWindow.__bettercodexWrapped) {
    class BetterCodexBrowserWindow extends OriginalBrowserWindow {
      constructor(options = {}) {
        super(options);
        try { addPreload(this.webContents.session); } catch (error) { /* ignore */ }
        const inject = () => {
          this.webContents.insertCSS(betterCodexFrameCSS()).catch(() => {});
          try {
            this.webContents.executeJavaScript(fs.readFileSync(rendererPath, "utf8"), true).catch(() => {});
          } catch (error) { /* ignore */ }
        };
        this.webContents.on("dom-ready", inject);
        this.webContents.on("did-finish-load", inject);
      }
    }
    BetterCodexBrowserWindow.__bettercodexWrapped = true;

    const patchedElectron = new Proxy(electron, {
      get(target, prop) {
        if (prop === "BrowserWindow") return BetterCodexBrowserWindow;
        return target[prop];
      },
    });
    const originalLoad = Module._load;
    Module._load = function bettercodexLoad(request) {
      if (request === "electron") return patchedElectron;
      return originalLoad.apply(this, arguments);
    };
    console.error("[BetterCodex] loader active (require intercept + session preload + main-side renderer)");
  }
} catch (error) {
  console.error("[BetterCodex] failed to load runtime", error);
}

function registerIpc(ipcMain, shell) {
  if (!ipcMain || ipcMain.__bettercodexReady) return;
  ipcMain.__bettercodexReady = true;
  ipcMain.handle("bettercodex:getConfig", () => ({catalogEndpoint: config.catalogEndpoint}));
  ipcMain.handle("bettercodex:getStyles", () => betterCodexFrameCSS());
  ipcMain.handle("bettercodex:fetchCatalog", () => fetchCatalog());
  ipcMain.handle("bettercodex:listAddons", () => listAddons());
  ipcMain.handle("bettercodex:readAddon", (event, kind, fileName) => readAddon(kind, fileName));
  ipcMain.handle("bettercodex:installAddon", (event, addon) => installAddon(addon));
  ipcMain.handle("bettercodex:runPlugin", (event, fileName, pluginName) => runPlugin(event.sender, fileName, pluginName));
  ipcMain.handle("bettercodex:setEnabled", (event, name, enabled) => setEnabled(name, enabled));
  ipcMain.handle("bettercodex:openFolder", (event, kind) => shell.openPath(kind === "theme" ? config.themeDir : config.pluginDir));
}

async function fetchCatalog() {
  const response = await fetch(config.catalogEndpoint, {headers: {"cache-control": "no-cache"}});
  if (!response.ok) throw new Error("Community catalog returned " + response.status);
  return response.json();
}

async function installAddon(addon) {
  const type = String(addon.type || "");
  if (!["plugin", "theme"].includes(type)) throw new Error("Only plugins and themes install into the desktop client");
  const fileName = String(addon.fileName || "");
  assertSafeFileName(fileName);
  if (type === "plugin" && !fileName.endsWith(".plugin.js")) throw new Error("Plugin files must end with .plugin.js");
  if (type === "theme" && !fileName.endsWith(".theme.css")) throw new Error("Theme files must end with .theme.css");
  const downloadUrl = String(addon.downloadUrl || "");
  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(downloadUrl)) throw new Error("Community downloads must use raw GitHub HTTPS URLs");
  const response = await fetch(downloadUrl, {headers: {"cache-control": "no-cache"}});
  if (!response.ok) throw new Error("Download returned " + response.status);
  const text = await response.text();
  const folder = type === "theme" ? config.themeDir : config.pluginDir;
  fs.writeFileSync(path.join(folder, fileName), text, "utf8");
  const state = readState();
  state[addon.name || fileName] = true;
  writeState(state);
  return listAddons();
}

function listAddons() {
  const state = readState();
  return {
    plugins: readFolder(config.pluginDir, ".plugin.js", state),
    themes: readFolder(config.themeDir, ".theme.css", state),
  };
}

function readFolder(folder, suffix, state) {
  let names = [];
  try { names = fs.readdirSync(folder); } catch (error) { names = []; }
  return names.filter((fileName) => fileName.endsWith(suffix)).map((fileName) => {
    const content = fs.readFileSync(path.join(folder, fileName), "utf8");
    const meta = parseMeta(content, fileName);
    return {...meta, enabled: Boolean(state[meta.name]), fileName};
  });
}

function readAddon(kind, fileName) {
  assertSafeFileName(fileName);
  const folder = kind === "theme" ? config.themeDir : config.pluginDir;
  return fs.readFileSync(path.join(folder, fileName), "utf8");
}

async function runPlugin(webContents, fileName, pluginName) {
  assertSafeFileName(fileName);
  if (!fileName.endsWith(".plugin.js")) throw new Error("Plugin files must end with .plugin.js");
  const source = fs.readFileSync(path.join(config.pluginDir, fileName), "utf8");
  const name = String(pluginName || parseMeta(source, fileName).name || fileName);
  return webContents.executeJavaScript(pluginRunnerSource(name, source), true);
}

function pluginRunnerSource(pluginName, source) {
  return [
    "(async () => {",
    "  const pluginName = " + JSON.stringify(pluginName) + ";",
    "  if (!window.BetterCodex || !window.BdApi) throw new Error('BetterCodex runtime is not ready');",
    "  if (window.BetterCodex.plugins.has(pluginName)) return true;",
    "  const module = {exports: {}};",
    "  const exports = module.exports;",
    "  const BdApi = window.BdApi(pluginName);",
    source,
    "  const exported = module.exports;",
    "  const instance = typeof exported === 'function' ? new exported() : exported;",
    "  if (!instance || typeof instance.start !== 'function' || typeof instance.stop !== 'function') throw new Error(pluginName + ' must export start() and stop()');",
    "  await instance.start();",
    "  window.BetterCodex.plugins.set(pluginName, instance);",
    "  return true;",
    "})()",
  ].join("\n");
}

function setEnabled(name, enabled) {
  const state = readState();
  state[name] = Boolean(enabled);
  writeState(state);
  return listAddons();
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (error) { return {}; }
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function parseMeta(content, fallback) {
  const meta = {};
  const block = (content.match(/\/\*\*([\s\S]*?)\*\//) || [])[1] || "";
  for (const line of block.split("\n")) {
    const match = line.match(/@(\w+)\s+(.+)/);
    if (match) meta[match[1]] = match[2].trim();
  }
  return {
    name: meta.name || fallback,
    version: meta.version || "0.0.0",
    description: meta.description || "",
    author: meta.author || "Unknown",
  };
}

function assertSafeFileName(fileName) {
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new Error("Unsafe file name");
  }
}

function betterCodexFrameCSS() {
  return [
    "#bettercodex-root{font:inherit}",
    ".bettercodex-panel{display:none;overflow:hidden;background:var(--color-token-main-surface-primary,#181818);color:var(--color-token-foreground,inherit);font-size:14px;line-height:21px;isolation:isolate}",
    "#bettercodex-nav-item.bettercodex-active{background:var(--color-token-list-hover-background,#ffffff14)}",
    ".bettercodex-native-active-muted{background:transparent!important}",
    ".bettercodex-panel.bettercodex-open{display:flex;flex-direction:column;min-height:0}",
    ".bettercodex-toolbar{position:relative;z-index:2;height:46px;margin-left:16px;padding-right:8px;display:flex;align-items:center;gap:8px;background:var(--color-token-main-surface-primary,#181818);user-select:none;contain:layout paint}",
    ".bettercodex-toolbar-tabs{display:inline-flex;align-items:center;gap:2px}",
    ".bettercodex-tab{border:1px solid transparent;border-radius:12.5px;height:28px;padding:0 8px;background:transparent;color:var(--color-token-text-tertiary,var(--color-token-text-secondary,#8f8f8f));font:inherit;font-size:14px;line-height:18px;cursor:pointer;white-space:nowrap}",
    ".bettercodex-tab:hover{background:var(--color-token-list-hover-background,#ffffff12);color:var(--color-token-foreground,inherit)}",
    ".bettercodex-tab.active{background:var(--color-token-foreground-5,rgba(255,255,255,.05));color:var(--color-token-foreground,inherit)}",
    ".bettercodex-scroll{position:relative;min-height:0;flex:1;overflow-y:auto;scrollbar-gutter:stable}",
    ".bettercodex-search-shell{position:sticky;top:0;z-index:30;background:var(--color-token-main-surface-primary,#141414)}",
    ".bettercodex-search-shell::after{content:'';pointer-events:none;position:absolute;left:-12px;right:-12px;top:100%;height:8px;background:var(--color-token-main-surface-primary,#141414)}",
    ".bettercodex-clear[hidden]{display:none!important}",
    ".bettercodex-section-stack{display:flex;min-height:0;flex:1;flex-direction:column;gap:32px}",
    ".bettercodex-section{display:flex;flex-direction:column;gap:16px}",
    ".bettercodex-section.compact{gap:4px}",
    ".bettercodex-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-token-border-light,var(--color-token-border-default,#ffffff14));padding:0 2px 8px 8px}",
    ".bettercodex-section-title{font-size:16px;line-height:24px;font-weight:500;color:var(--color-token-foreground,inherit)}",
    ".bettercodex-section-accessory{display:flex;align-items:center;gap:10px;flex-shrink:0}",
    ".bettercodex-count{font-size:13px;line-height:22px;color:var(--color-token-description-foreground,var(--color-token-text-secondary,#8f8f8f))}",
    ".bettercodex-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,350px),1fr));column-gap:28px;row-gap:16px}",
    "@media (max-width:900px){.bettercodex-card-grid{grid-template-columns:1fr}}",
    ".bettercodex-card{display:flex;min-height:63px;align-items:center;justify-content:center;border:0;border-radius:20px;padding:10px;gap:12px;color:var(--color-token-foreground,inherit);cursor:default}",
    ".bettercodex-card:hover{background:var(--color-token-foreground-5,rgba(255,255,255,.05))}",
    ".bettercodex-ico{width:44px!important;height:44px!important;margin-top:0;font-size:14px;font-weight:600;border-radius:12px;background:var(--color-token-foreground-5,rgba(255,255,255,.05))}",
    ".bettercodex-grow{min-width:0;flex:1}",
    ".bettercodex-card .bettercodex-grow{min-height:43px;justify-content:center;gap:1px!important}",
    ".bettercodex-name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:14px;line-height:20px;font-weight:500;color:var(--color-token-foreground,inherit);overflow:hidden}",
    ".bettercodex-desc{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;font-size:14px;line-height:18px;color:var(--color-token-description-foreground,var(--color-token-text-secondary,#9ca3af));overflow:hidden}",
    ".bettercodex-act{flex-shrink:0;display:flex;align-items:center;height:28px;border:1px solid var(--color-token-border-default,#ffffff1f);border-radius:12.5px;background:transparent;color:var(--color-token-foreground,inherit);padding:0 10px;font:inherit;font-size:14px;line-height:18px;cursor:pointer}",
    ".bettercodex-act:hover{background:var(--color-token-list-hover-background,#ffffff12)}",
    ".bettercodex-act.primary{background:var(--color-token-foreground-5,rgba(255,255,255,.05));border-color:transparent}",
    ".bettercodex-act:disabled{opacity:.5;cursor:default}",
    ".bettercodex-icon-act{width:28px;justify-content:center;padding:0}",
    ".bettercodex-actions{display:flex;align-self:center;align-items:center;gap:10px;flex-shrink:0}",
    ".bettercodex-switch{position:relative;display:inline-flex;width:34px;height:20px;flex-shrink:0;align-items:center;border:0;border-radius:999px;background:var(--color-token-border-default,#ffffff24);padding:2px;cursor:pointer;transition:background-color .12s ease}",
    ".bettercodex-switch[aria-checked='true']{background:var(--color-token-foreground,#f4f4f5)}",
    ".bettercodex-switch span{display:block;width:16px;height:16px;border-radius:999px;background:var(--color-token-main-surface-primary,#141414);box-shadow:0 1px 2px #00000040;transform:translateX(0);transition:transform .12s ease}",
    ".bettercodex-switch[aria-checked='true'] span{transform:translateX(14px)}",
    ".bettercodex-switch:disabled{opacity:.5;cursor:default}",
    ".bettercodex-empty{display:flex;min-height:44px;align-items:center;justify-content:flex-start;padding:0 8px;text-align:left;color:var(--color-token-text-tertiary,var(--color-token-text-secondary,#9ca3af));font-size:14px;line-height:21px}",
    ".bettercodex-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;border:1px solid var(--color-token-border-default,#ffffff1f);border-radius:10px;background:var(--color-token-main-surface-primary,#1a1a1a);color:var(--color-token-foreground,inherit);padding:10px 12px;box-shadow:0 12px 40px #00000040}"
  ].join("\n");
}
`;
}

function preloadRuntimeSource() {
  return String.raw`"use strict";

// Sandbox-safe bridge preload. Runs in Codex's sandboxed renderer alongside Codex's own
// preload (added via session.setPreloads, not by replacing Codex's preload). It may only
// use electron's contextBridge + ipcRenderer -- no node:fs/path -- so all real work happens
// in the main process over IPC.
const {contextBridge, ipcRenderer} = require("electron");

try {
  contextBridge.exposeInMainWorld("BetterCodexNative", {
    getConfig: () => ipcRenderer.invoke("bettercodex:getConfig"),
    getStyles: () => ipcRenderer.invoke("bettercodex:getStyles"),
    fetchCatalog: () => ipcRenderer.invoke("bettercodex:fetchCatalog"),
    listAddons: () => ipcRenderer.invoke("bettercodex:listAddons"),
    readAddon: (kind, fileName) => ipcRenderer.invoke("bettercodex:readAddon", kind, fileName),
    installAddon: (addon) => ipcRenderer.invoke("bettercodex:installAddon", addon),
    runPlugin: (fileName, pluginName) => ipcRenderer.invoke("bettercodex:runPlugin", fileName, pluginName),
    setEnabled: (name, enabled) => ipcRenderer.invoke("bettercodex:setEnabled", name, enabled),
    openFolder: (kind) => ipcRenderer.invoke("bettercodex:openFolder", kind),
  });
} catch (error) {
  // contextBridge throws if this frame lacks context isolation; safe to ignore.
}
`;
}

function rendererRuntimeSource() {
  return String.raw`(() => {
  const native = window.BetterCodexNative;
  if (!native || window.BetterCodex?.loaded) return;

  const runtime = {
    loaded: true,
    plugins: new Map(),
    styles: new Map(),
    addons: {plugins: [], themes: []},
  };

  const BdApi = createApi(runtime);
  window.BetterCodex = runtime;
  window.BdApi = BdApi;

  boot();

  async function boot() {
    try { await injectStyles(); } catch (error) { /* non-fatal */ }
    try { await reloadLocalAddons(); } catch (error) { /* non-fatal */ }
    try { mountPanel(); } catch (error) { /* non-fatal */ }
    try { bindHostNavigationTeardown(); } catch (error) { /* non-fatal */ }
    try { ensureSidebarItem(); } catch (error) { /* non-fatal */ }
    try { await renderCurrent(); } catch (error) { /* pre-render community content so the page opens instantly */ }
  }

  // The element Codex renders its pages into — the BetterCodex page mounts inside this so it
  // sits exactly where every other Codex page sits (same flow, bounds, scroll, surface).
  function findContentEl() {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll('[class*="overflow-hidden"]')) {
      if (el.closest("#bettercodex-root")) continue;
      if (!/(^|\s)flex-1(\s|$)/.test(el.className || "")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.4 && r.height > window.innerHeight * 0.4) {
        const area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      }
    }
    return best;
  }

  // The exact surface color Codex paints behind its pages (walk up to the first opaque bg).
  function effectiveBg(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    }
    return "var(--color-token-main-surface-primary, #1a1a1a)";
  }

  // Render the BetterCodex page INSIDE Codex's content container, filling it — exactly where
  // every other page renders (same flow, bounds, scroll, surface) — not a viewport overlay.
  function mountInContainer() {
    const container = findContentEl();
    if (!container || !runtime.panel) return false;
    if (runtime.panel.parentElement !== container) container.appendChild(runtime.panel);
    const s = runtime.panel.style;
    s.position = "absolute";
    s.left = "0"; s.top = "0"; s.right = "0"; s.bottom = "0"; s.width = ""; s.height = "";
    s.zIndex = "20";
    s.background = effectiveBg(container);
    runtime.container = container;
    runtime.openLocation = location.href;
    return true;
  }

  // Codex re-renders its content area on navigation; keep our page in the live container while open.
  function observeContainer() {
    if (runtime.containerObserver || !runtime.container || !runtime.container.parentElement) return;
    runtime.containerObserver = new MutationObserver(() => {
      if (!runtime.panel || !runtime.panel.classList.contains("bettercodex-open")) return;
      if (!document.contains(runtime.container)) runtime.container = findContentEl();
      if (runtime.container && runtime.panel.parentElement !== runtime.container) {
        runtime.panel.style.background = effectiveBg(runtime.container);
        runtime.container.appendChild(runtime.panel);
      }
    });
    runtime.containerObserver.observe(runtime.container.parentElement, {childList: true, subtree: true});
  }

  // Give the BetterCodex sidebar item the same active treatment Codex gives the page you're
  // on: aria-current plus the persistent row background (Codex uses bg-token-list-hover-background).
  function setNavActive(on) {
    const item = document.getElementById("bettercodex-nav-item");
    if (!item) return;
    if (on) {
      item.setAttribute("aria-current", "page");
      item.classList.add("bettercodex-active");
    } else {
      item.removeAttribute("aria-current");
      item.classList.remove("bettercodex-active");
    }
  }

  function suppressOtherNavActive() {
    restoreOtherNavActive();
    runtime.suppressedNav = [];
    for (const item of document.querySelectorAll("nav button[aria-current='page'], [role='navigation'] button[aria-current='page'], nav button.bg-token-list-hover-background, [role='navigation'] button.bg-token-list-hover-background")) {
      if (item.id === "bettercodex-nav-item" || item.closest("#bettercodex-root")) continue;
      runtime.suppressedNav.push({
        item,
        className: item.className,
        ariaCurrent: item.getAttribute("aria-current"),
      });
      item.removeAttribute("aria-current");
      item.classList.remove("bg-token-list-hover-background");
      item.classList.add("bettercodex-native-active-muted");
    }
  }

  function restoreOtherNavActive() {
    if (!runtime.suppressedNav) return;
    for (const entry of runtime.suppressedNav) {
      if (!entry.item || !document.contains(entry.item)) continue;
      entry.item.className = entry.className;
      if (entry.ariaCurrent) entry.item.setAttribute("aria-current", entry.ariaCurrent);
      else entry.item.removeAttribute("aria-current");
    }
    runtime.suppressedNav = [];
  }

  // Codex's CSP silently drops webContents.insertCSS and <style> tags. A constructable
  // stylesheet applied via adoptedStyleSheets goes through the CSSOM and bypasses CSP.
  async function injectStyles() {
    if (runtime.stylesInjected) return;
    let css = "";
    try { css = await native.getStyles(); } catch (error) { css = ""; }
    if (!css) return;
    try {
      if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in Document.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      } else {
        const style = document.createElement("style");
        style.id = "bettercodex-style";
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
      }
      runtime.stylesInjected = true;
    } catch (error) { /* ignore */ }
  }

  function bettercodexIcon() {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-xs" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.4" fill="currentColor"></rect><rect x="9" y="2" width="5" height="5" rx="1.4" fill="currentColor"></rect><rect x="2" y="9" width="5" height="5" rx="1.4" fill="currentColor"></rect><rect x="9" y="9" width="5" height="5" rx="1.4" fill="currentColor"></rect></svg>';
  }

  // Clone the styling of a real Codex sidebar row so our item reads as native.
  function findSidebarAnchor() {
    const wanted = ["Plugins", "New chat", "Library", "Search", "Scheduled"];
    const buttons = Array.from(document.querySelectorAll("button, a"));
    const native = buttons.filter((b) => !b.closest("#bettercodex-root") && /h-\[var\(--height-token-row\)\]/.test(b.className || ""));
    for (const label of wanted) {
      const match = native.find((b) => (b.textContent || "").trim() === label);
      if (match) return match;
    }
    return native[0] || null;
  }

  function mountSidebarItem() {
    if (document.getElementById("bettercodex-nav-item")) return true;
    const anchor = findSidebarAnchor();
    if (!anchor || !anchor.parentElement) return false;
    const list = anchor.parentElement;
    const innerCls = anchor.firstElementChild
      ? anchor.firstElementChild.className
      : "flex min-w-0 items-center text-base gap-2 flex-1 text-token-foreground";
    const item = document.createElement("button");
    item.type = "button";
    item.id = "bettercodex-nav-item";
    item.dataset.bettercodexNav = "true";
    item.className = anchor.className;
    item.innerHTML = '<div class="' + escapeHtml(innerCls) + '">' + bettercodexIcon() + '<span>BetterCodex</span></div>';
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFromSidebar();
    });
    list.appendChild(item);
    return true;
  }

  function ensureSidebarItem() {
    let tries = 0;
    const tick = () => {
      tries += 1;
      const mounted = mountSidebarItem();
      if (mounted) { observeSidebar(); return; }
      if (tries <= 20) setTimeout(tick, 700);
    };
    tick();
  }

  // Codex re-renders its sidebar (React); re-add our item whenever it disappears.
  function observeSidebar() {
    if (runtime.sidebarObserver) return;
    const observer = new MutationObserver(() => {
      if (!document.getElementById("bettercodex-nav-item")) mountSidebarItem();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    runtime.sidebarObserver = observer;
  }

  async function reloadLocalAddons() {
    runtime.addons = await native.listAddons();
    for (const theme of runtime.addons.themes) {
      try {
        if (theme.enabled) {
          const css = await native.readAddon("theme", theme.fileName);
          applyStyle(theme.name, css);
        } else {
          removeStyle(theme.name);
        }
      } catch (error) {
        console.error("[BetterCodex] theme failed:", theme.name, error && error.message);
      }
    }
    for (const plugin of runtime.addons.plugins) {
      try {
        if (plugin.enabled && !runtime.plugins.has(plugin.name)) {
          await startPlugin(plugin);
        }
        if (!plugin.enabled && runtime.plugins.has(plugin.name)) {
          stopPlugin(plugin.name);
        }
      } catch (error) {
        // A plugin that can't run must not break BetterCodex itself.
        console.error("[BetterCodex] plugin failed:", plugin.name, error && error.message);
      }
    }
    const localPluginNames = new Set(runtime.addons.plugins.map((plugin) => plugin.name));
    for (const name of Array.from(runtime.plugins.keys())) {
      if (!localPluginNames.has(name)) stopPlugin(name);
    }
  }

  async function startPlugin(plugin) {
    await native.runPlugin(plugin.fileName, plugin.name);
  }

  function stopPlugin(name) {
    const instance = runtime.plugins.get(name);
    if (!instance) return;
    try {
      instance.stop();
    } finally {
      runtime.plugins.delete(name);
      BdApi.Patcher.unpatchAll(name);
      BdApi.DOM.removeStyle(name);
    }
  }

  function applyStyle(name, css) {
    let node = runtime.styles.get(name);
    if (!node) {
      node = document.createElement("style");
      node.dataset.bettercodexStyle = name;
      document.head.appendChild(node);
      runtime.styles.set(name, node);
    }
    node.textContent = css;
  }

  function removeStyle(name) {
    const node = runtime.styles.get(name);
    if (node) node.remove();
    runtime.styles.delete(name);
  }

  // Native-feeling dismissal: a normal page does not close when the user clicks empty space
  // or a control inside the page. It only leaves when a real Codex sidebar route is chosen.
  function closeOnSidebarNavigation() {
    if (runtime.sidebarNavigationBound) return;
    runtime.sidebarNavigationBound = true;
    document.addEventListener("click", (event) => {
      if (!runtime.panel || !runtime.panel.classList.contains("bettercodex-open")) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-bettercodex-nav='true']") || target.closest(".bettercodex-panel")) return;
      const routeTarget = target.closest("button, a, [role='button'], [role='link'], [tabindex]");
      if (!routeTarget) return;
      const navigation = target.closest("nav, [role='navigation']");
      if (!navigation) return;
      closePanel({restoreNative: false});
    }, true);
  }

  function bindHostNavigationTeardown() {
    if (runtime.hostNavigationBound) return;
    runtime.hostNavigationBound = true;
    // Codex uses history state for non-route UI, including the right side panel.
    // BetterCodex leaves only when a real left-sidebar route is clicked.
  }

  function ensureRoot() {
    let root = document.getElementById("bettercodex-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "bettercodex-root";
      document.body.appendChild(root);
    }
    return root;
  }

  // Full-page surface laid over Codex's main content area, styled like the native Plugins page.
  function mountPanel() {
    // Reacquire the panel wherever it lives (it gets moved into Codex's content container on open).
    const existing = document.querySelector(".bettercodex-panel");
    if (existing) {
      runtime.panel = existing;
      runtime.content = existing.querySelector(".bettercodex-content");
      bindPanelControls();
      return;
    }
    const root = ensureRoot();
    root.innerHTML =
      '<section class="bettercodex-panel">' +
        '<div class="bettercodex-toolbar">' +
          '<div class="bettercodex-toolbar-tabs" role="tablist" aria-label="BetterCodex sections">' +
            '<button type="button" data-tab="plugins" class="' + topTabClass(true) + '" role="tab" aria-selected="true">Plugins</button>' +
            '<button type="button" data-tab="themes" class="' + topTabClass(false) + '" role="tab" aria-selected="false">Themes</button>' +
          '</div>' +
        '</div>' +
        '<div class="bettercodex-scroll">' +
          '<div class="mx-auto w-full max-w-[var(--thread-content-max-width)] px-panel pt-panel pb-4">' +
            '<div class="flex flex-col gap-2 px-2">' +
              '<h1 class="bettercodex-title heading-xl font-normal text-token-foreground">Plugins</h1>' +
              '<p class="bettercodex-subtitle text-lg leading-6 text-token-text-secondary">Installed BetterCodex plugins</p>' +
            '</div>' +
          '</div>' +
          '<div class="bettercodex-search-shell">' +
            '<div class="mx-auto w-full max-w-[var(--thread-content-max-width)] px-panel pb-2">' +
              '<label class="no-drag flex items-center gap-2 border border-token-input-border px-2.5 py-0 text-base leading-[18px] backdrop-blur-sm h-8 rounded-full bg-token-input-background/90 electron:dark:bg-token-dropdown-background w-full min-w-0" for="bettercodex-page-search">' +
                searchIcon() +
                '<input id="bettercodex-page-search" class="bettercodex-input min-w-0 flex-1 bg-transparent text-base leading-[18px] text-token-input-foreground outline-none select-text placeholder:text-token-input-placeholder-foreground [&::placeholder]:select-none" type="search" placeholder="Search plugins" aria-label="Search BetterCodex">' +
                '<button type="button" class="bettercodex-clear flex shrink-0 cursor-interaction text-token-text-secondary hover:text-token-foreground" data-clear-search aria-label="Clear search" hidden>' + clearIcon() + '</button>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="bettercodex-content mx-auto flex min-h-0 w-full max-w-[var(--thread-content-max-width)] flex-1 flex-col px-panel pt-5 pb-panel !pt-6"></div>' +
        '</div>' +
      '</section>';
    runtime.panel = root.querySelector(".bettercodex-panel");
    runtime.content = root.querySelector(".bettercodex-content");
    runtime.activeTab = "plugins";
    runtime.query = "";
    closeOnSidebarNavigation();
    bindPanelControls();
    updatePageHeader();
  }

  function bindPanelControls() {
    if (!runtime.panel || runtime.controlsBound) return;
    runtime.controlsBound = true;
    const input = runtime.panel.querySelector(".bettercodex-input");
    const clear = runtime.panel.querySelector("[data-clear-search]");
    input?.addEventListener("input", (event) => {
      runtime.query = event.currentTarget.value.trim();
      updateSearchUi();
      renderCurrent();
    });
    clear?.addEventListener("click", () => {
      runtime.query = "";
      if (input) input.value = "";
      updateSearchUi();
      renderCurrent();
    });
    runtime.panel.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTab(button.dataset.tab || "plugins");
        renderCurrent();
      });
    });
  }

  function topTabClass(active) {
    return "bettercodex-tab" + (active ? " active" : "");
  }

  function setActiveTab(tab) {
    runtime.activeTab = ["plugins", "themes"].includes(tab) ? tab : "plugins";
    if (!runtime.panel) return;
    runtime.panel.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === runtime.activeTab;
      button.className = topTabClass(active);
      button.setAttribute("aria-selected", String(active));
    });
    updatePageHeader();
    updateSearchUi();
  }

  function updatePageHeader() {
    if (!runtime.panel) return;
    const title = runtime.panel.querySelector(".bettercodex-title");
    const subtitle = runtime.panel.querySelector(".bettercodex-subtitle");
    const isThemes = runtime.activeTab === "themes";
    if (title) title.textContent = isThemes ? "Themes" : "Plugins";
    if (subtitle) subtitle.textContent = isThemes ? "Customize Codex with local themes" : "Customize Codex with local plugins";
  }

  function updateSearchUi() {
    if (!runtime.panel) return;
    const input = runtime.panel.querySelector(".bettercodex-input");
    const clear = runtime.panel.querySelector("[data-clear-search]");
    const label = runtime.activeTab === "themes" ? "Search themes" : "Search plugins";
    if (input) input.setAttribute("placeholder", label);
    if (clear) clear.hidden = !(runtime.query || "").trim();
  }

  function searchIcon() {
    return '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm text-token-text-secondary" aria-hidden="true"><path d="M9.25 15.5a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5Zm4.62-1.63 3.38 3.38" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>';
  }

  function clearIcon() {
    return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';
  }

  function openPanel() {
    if (!runtime.panel) return;
    if (mountInContainer()) {
      observeContainer();
    } else {
      // Fallback: viewport overlay if Codex's content container can't be found.
      const root = document.getElementById("bettercodex-root");
      if (root && runtime.panel.parentElement !== root) root.appendChild(runtime.panel);
      const left = sidebarWidth();
      const s = runtime.panel.style;
      s.position = "fixed"; s.left = left + "px"; s.top = "0"; s.right = "0"; s.bottom = "0";
      s.width = ""; s.height = ""; s.zIndex = "2147483646";
      s.background = "var(--color-token-main-surface-primary, #1a1a1a)";
    }
    runtime.panel.classList.add("bettercodex-open");
    suppressOtherNavActive();
    setNavActive(true);
    renderCurrent();
  }

  function closePanel(options = {}) {
    if (!runtime.panel) return;
    runtime.panel.classList.remove("bettercodex-open");
    setNavActive(false);
    if (options.restoreNative !== false) restoreOtherNavActive();
    else runtime.suppressedNav = [];
    if (runtime.containerObserver) { runtime.containerObserver.disconnect(); runtime.containerObserver = null; }
    runtime.openLocation = null;
    parkPanel();
  }

  function parkPanel() {
    if (!runtime.panel) return;
    const root = ensureRoot();
    if (runtime.panel.parentElement !== root) root.appendChild(runtime.panel);
    const s = runtime.panel.style;
    s.position = "";
    s.left = ""; s.top = ""; s.right = ""; s.bottom = ""; s.width = ""; s.height = "";
    s.zIndex = "";
    s.background = "";
  }

  function openFromSidebar() {
    if (!runtime.panel || !document.documentElement.contains(runtime.panel)) mountPanel();
    if (!runtime.panel) return;
    // Like every native sidebar item: clicking it navigates to the page. If you're already
    // there, it stays — it does not toggle closed. You leave by clicking another page.
    if (runtime.panel.classList.contains("bettercodex-open")) return;
    openPanel();
  }

  // Offset the surface so Codex's left sidebar stays visible beside it.
  function sidebarWidth() {
    const item = document.getElementById("bettercodex-nav-item");
    if (!item) return 248;
    let node = item;
    for (let i = 0; i < 8 && node.parentElement; i += 1) {
      const parent = node.parentElement;
      if (parent.getBoundingClientRect().width > window.innerWidth * 0.6) break;
      node = parent;
    }
    return Math.max(180, Math.round(node.getBoundingClientRect().right));
  }

  function renderCurrent() {
    if (!runtime.content) return;
    setActiveTab(runtime.activeTab || "plugins");
    const token = (runtime.renderToken || 0) + 1;
    runtime.renderToken = token;
    return renderAddonPage(runtime.activeTab, token);
  }

  function isCurrentRender(token, tab) {
    return runtime.renderToken === token && runtime.activeTab === tab && runtime.content;
  }

  function sectionHeader(text, accessory = "") {
    const right = accessory ? '<div class="bettercodex-section-accessory">' + accessory + '</div>' : "";
    return '<div class="bettercodex-section-heading"><h2 class="bettercodex-section-title">' + escapeHtml(text) + '</h2>' + right + '</div>';
  }

  function section(title, body, options = {}) {
    const compact = options.compact ? " compact" : "";
    return '<section class="bettercodex-section' + compact + '">' + sectionHeader(title, options.accessory || "") + body + '</section>';
  }

  function iconTile(name) {
    const letter = escapeHtml((String(name || "?").trim().charAt(0) || "?").toUpperCase());
    return '<span class="bettercodex-ico flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-token-text-secondary">' + letter + '</span>';
  }

  async function renderAddonPage(tab, token) {
    const content = runtime.content;
    content.innerHTML = '<div class="bettercodex-empty"><span class="loading-shimmer-pure-text font-medium">Loading installed add-ons...</span></div>';
    await reloadLocalAddons();
    if (!isCurrentRender(token, tab)) return;
    const query = (runtime.query || "").toLowerCase();
    const isThemes = tab === "themes";
    const localAddons = isThemes ? runtime.addons.themes : runtime.addons.plugins;
    const local = localAddons.filter((addon) => {
      const haystack = [addon.name, addon.fileName, addon.author, addon.description].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });
    const installedLabel = "Installed";
    const folderLabel = isThemes ? "Open Theme Folder" : "Open Plugin Folder";
    const installedAccessory = '<button type="button" class="bettercodex-act bettercodex-icon-act" data-open-folder aria-label="' + folderLabel + '" title="' + folderLabel + '">' + folderIcon() + '</button>';
    const installedBody = local.length
      ? '<div class="bettercodex-card-grid">' + local.map(localCard).join("") + '</div>'
      : '<div class="bettercodex-empty">No ' + escapeHtml(isThemes ? "themes" : "plugins") + ' installed</div>';
    const installedCount = '<span class="bettercodex-count">' + String(local.length) + ' installed</span>';
    content.innerHTML = '<div class="bettercodex-section-stack">' +
      section(installedLabel, installedBody, {accessory: installedCount + installedAccessory}) +
    '</div>';
    content.querySelector("[data-open-folder]")?.addEventListener("click", () => native.openFolder(tab === "themes" ? "theme" : "plugin"));
    content.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        await native.setEnabled(button.dataset.name, button.dataset.enabled !== "true");
        await reloadLocalAddons();
        renderCurrent();
      });
    });
  }

  function localCard(addon) {
    const enabled = Boolean(addon.enabled);
    const toggle = '<div class="bettercodex-actions"><button class="bettercodex-switch" type="button" role="switch" aria-label="' + escapeHtml((enabled ? "Disable " : "Enable ") + addon.name) + '" aria-checked="' + String(enabled) + '" data-toggle data-name="' + escapeHtml(addon.name) + '" data-enabled="' + String(enabled) + '"><span></span></button></div>';
    return '<div class="bettercodex-card group">' + iconTile(addon.name) +
      '<div class="bettercodex-grow flex min-w-0 flex-1 flex-col gap-1" title="' + escapeHtml(addon.fileName) + '"><div class="bettercodex-name">' + escapeHtml(addon.name) + '</div>' +
      '<div class="bettercodex-desc">' + escapeHtml(addon.description || (addon.enabled ? "Enabled" : "Disabled")) + '</div></div>' +
      toggle + '</div>';
  }

  function folderIcon() {
    return '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm" aria-hidden="true"><path d="M3.25 6.75A2.25 2.25 0 0 1 5.5 4.5h3.05c.47 0 .92.18 1.26.5l.9.85c.2.19.46.3.74.3h3.05a2.25 2.25 0 0 1 2.25 2.25v4.85a2.25 2.25 0 0 1-2.25 2.25h-9A2.25 2.25 0 0 1 3.25 13.25v-6.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path></svg>';
  }

  function createApi(runtime) {
    const patches = new Map();
    function api(pluginName) {
      return {
        DOM: {
          addStyle(id, css) { applyStyle(id || pluginName, css); },
          removeStyle(id) { removeStyle(id || pluginName); },
        },
        Data: {
          load(key) { return loadPluginData(pluginName, key); },
          save(key, value) { return savePluginData(pluginName, key, value); },
          delete(key) { return deletePluginData(pluginName, key); },
        },
        Logger: {
          log: (...args) => console.log("[" + pluginName + "]", ...args),
          warn: (...args) => console.warn("[" + pluginName + "]", ...args),
          error: (...args) => console.error("[" + pluginName + "]", ...args),
        },
        Patcher: {
          after(id, object, method, callback) { return patch(pluginName, "after", object, method, callback); },
          before(id, object, method, callback) { return patch(pluginName, "before", object, method, callback); },
          instead(id, object, method, callback) { return patch(pluginName, "instead", object, method, callback); },
          unpatchAll() { unpatchAll(pluginName); },
        },
        Plugins: {
          getAll: () => runtime.addons.plugins,
        },
        Themes: {
          getAll: () => runtime.addons.themes,
        },
        UI: {
          showToast,
        },
      };
    }
    api.DOM = api("BetterCodex").DOM;
    api.Data = api("BetterCodex").Data;
    api.Logger = api("BetterCodex").Logger;
    api.Patcher = {
      ...api("BetterCodex").Patcher,
      unpatchAll,
    };
    api.Plugins = api("BetterCodex").Plugins;
    api.Themes = api("BetterCodex").Themes;
    api.UI = api("BetterCodex").UI;
    return api;

    function dataKey(pluginName, key) {
      return "bettercodex:data:" + encodeURIComponent(pluginName) + ":" + encodeURIComponent(String(key || "default"));
    }

    function loadPluginData(pluginName, key) {
      try {
        const value = window.localStorage.getItem(dataKey(pluginName, key));
        return value === null ? null : JSON.parse(value);
      } catch (error) {
        console.warn("[BetterCodex] failed to load plugin data", pluginName, key, error && error.message);
        return null;
      }
    }

    function savePluginData(pluginName, key, value) {
      try {
        window.localStorage.setItem(dataKey(pluginName, key), JSON.stringify(value));
        return value;
      } catch (error) {
        console.warn("[BetterCodex] failed to save plugin data", pluginName, key, error && error.message);
        return null;
      }
    }

    function deletePluginData(pluginName, key) {
      try {
        window.localStorage.removeItem(dataKey(pluginName, key));
        return true;
      } catch (error) {
        console.warn("[BetterCodex] failed to delete plugin data", pluginName, key, error && error.message);
        return false;
      }
    }

    function patch(owner, mode, object, method, callback) {
      if (!object || typeof object[method] !== "function") throw new Error("Target method not found");
      const original = object[method];
      const unpatch = () => { object[method] = original; };
      patches.set(owner, [...(patches.get(owner) || []), unpatch]);
      object[method] = function patched(...args) {
        if (mode === "before") callback(this, args);
        if (mode === "instead") return callback(this, args, original.bind(this));
        const result = original.apply(this, args);
        if (mode === "after") callback(this, args, result);
        return result;
      };
      return unpatch;
    }

    function unpatchAll(owner) {
      if (owner) {
        for (const unpatch of patches.get(owner) || []) unpatch();
        patches.delete(owner);
        return;
      }
      for (const unpatches of patches.values()) {
        for (const unpatch of unpatches) unpatch();
      }
      patches.clear();
    }
  }

  function showToast(message) {
    const node = document.createElement("div");
    node.className = "bettercodex-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();`;
}

module.exports = {
  writeRuntimeFiles,
};
