"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {defaultStoreEndpoint} = require("./constants");

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
    storeEndpoint: options.storeEndpoint || defaultStoreEndpoint,
    themeDir,
  };

  fs.writeFileSync(path.join(runtimeDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(runtimeDir, "main.cjs"), mainRuntimeSource(), "utf8");
  fs.writeFileSync(path.join(runtimeDir, "preload.cjs"), preloadRuntimeSource(), "utf8");
  fs.writeFileSync(path.join(runtimeDir, "renderer.cjs"), rendererRuntimeSource(), "utf8");

  return {
    configPath: path.join(runtimeDir, "config.json"),
    loaderPath: path.join(runtimeDir, "main.cjs"),
    preloadPath: path.join(runtimeDir, "preload.cjs"),
    rendererPath: path.join(runtimeDir, "renderer.cjs"),
  };
}

function mainRuntimeSource() {
  return String.raw`"use strict";

const path = require("node:path");

const runtimeDir = __dirname;
const config = require(path.join(runtimeDir, "config.json"));
const electronPath = require.resolve("electron");
const electronModule = require(electronPath);
const OriginalBrowserWindow = electronModule.BrowserWindow;

if (!OriginalBrowserWindow.__bettercodexWrapped) {
  class BetterCodexBrowserWindow extends OriginalBrowserWindow {
    constructor(options = {}) {
      const next = {...options};
      next.webPreferences = {...(next.webPreferences || {})};
      if (next.webPreferences.preload) {
        next.webPreferences.additionalArguments = [
          ...(next.webPreferences.additionalArguments || []),
          "--bettercodex-original-preload=" + next.webPreferences.preload,
        ];
      }
      next.webPreferences.preload = path.join(runtimeDir, "preload.cjs");
      super(next);
      this.webContents.once("dom-ready", () => {
        this.webContents.insertCSS(betterCodexFrameCSS()).catch(() => {});
      });
    }
  }

  BetterCodexBrowserWindow.__bettercodexWrapped = true;
  require.cache[electronPath].exports = {
    ...electronModule,
    BrowserWindow: BetterCodexBrowserWindow,
  };
}

process.env.BETTERCODEX_CONFIG = path.join(runtimeDir, "config.json");

function betterCodexFrameCSS() {
  return [
    "#bettercodex-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    ".bettercodex-button{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:42px;height:42px;border:1px solid #344042;border-radius:8px;background:#18201f;color:#58c99f;font-weight:800;box-shadow:0 12px 40px rgba(0,0,0,.34);cursor:pointer}",
    ".bettercodex-panel{position:fixed;right:18px;bottom:70px;z-index:2147483647;width:min(520px,calc(100vw - 36px));height:min(680px,calc(100vh - 110px));display:grid;grid-template-rows:auto auto 1fr;border:1px solid #344042;border-radius:8px;background:#111617;color:#eef5f2;box-shadow:0 18px 70px rgba(0,0,0,.5);overflow:hidden}",
    ".bettercodex-header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #273234}.bettercodex-title{font-weight:800}.bettercodex-close{border:0;background:transparent;color:#9fb0ad;font-size:20px;cursor:pointer}",
    ".bettercodex-tabs{display:flex;gap:6px;padding:10px;border-bottom:1px solid #273234}.bettercodex-tabs button{border:1px solid #344042;border-radius:6px;background:#18201f;color:#9fb0ad;padding:8px 10px;cursor:pointer}.bettercodex-tabs .active{background:#58c99f;color:#07100d;border-color:#58c99f}",
    ".bettercodex-content{overflow:auto;padding:12px}.bettercodex-toolbar{display:flex;gap:8px;margin-bottom:12px}.bettercodex-toolbar input{flex:1;min-width:0;border:1px solid #344042;border-radius:6px;background:#101314;color:#eef5f2;padding:9px}",
    ".bettercodex-card{display:grid;gap:8px;border:1px solid #2d383a;border-radius:8px;background:#181d1e;padding:12px;margin-bottom:10px}.bettercodex-card h3{margin:0;font-size:15px}.bettercodex-card p{margin:0;color:#9fb0ad;font-size:13px;line-height:1.4}.bettercodex-meta{color:#9fb0ad;font-size:12px}.bettercodex-actions{display:flex;gap:8px;flex-wrap:wrap}.bettercodex-actions button,.bettercodex-actions a{border:1px solid #344042;border-radius:6px;background:#202728;color:#eef5f2;padding:7px 9px;text-decoration:none;cursor:pointer}.bettercodex-actions .primary{background:#58c99f;color:#07100d;border-color:#58c99f}",
    ".bettercodex-tags{display:flex;gap:6px;flex-wrap:wrap}.bettercodex-tag{border:1px solid #344042;border-radius:999px;color:#9fb0ad;font-size:11px;padding:3px 7px}.bettercodex-empty{color:#9fb0ad;padding:18px;text-align:center}",
    ".bettercodex-toast{position:fixed;right:18px;bottom:124px;z-index:2147483647;border:1px solid #344042;border-radius:8px;background:#18201f;color:#eef5f2;padding:10px 12px;box-shadow:0 12px 40px rgba(0,0,0,.35)}"
  ].join("\n");
}
`;
}

function preloadRuntimeSource() {
  return String.raw`"use strict";

const {contextBridge, shell, webFrame} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const originalArg = process.argv.find((arg) => arg.startsWith("--bettercodex-original-preload="));
if (originalArg) {
  const originalPreload = originalArg.slice("--bettercodex-original-preload=".length);
  if (originalPreload && fs.existsSync(originalPreload)) {
    require(originalPreload);
  }
}

const config = require(process.env.BETTERCODEX_CONFIG);
const rendererPath = path.join(__dirname, "renderer.cjs");
const statePath = path.join(config.dataDir, "addons.json");

for (const dir of [config.dataDir, config.pluginDir, config.themeDir]) {
  fs.mkdirSync(dir, {recursive: true});
}

contextBridge.exposeInMainWorld("BetterCodexNative", {
  fetchStore,
  getConfig: () => ({storeEndpoint: config.storeEndpoint}),
  installAddon,
  listAddons,
  openFolder,
  readAddon,
  setEnabled,
});

window.addEventListener("DOMContentLoaded", () => {
  const source = fs.readFileSync(rendererPath, "utf8");
  webFrame.top.executeJavaScript(source).catch((error) => {
    console.error("[BetterCodex] renderer injection failed", error);
  });
});

async function fetchStore() {
  const response = await fetch(config.storeEndpoint, {
    headers: {"cache-control": "no-cache"},
  });
  if (!response.ok) {
    throw new Error("Store API returned " + response.status);
  }
  return response.json();
}

async function installAddon(addon) {
  const type = String(addon.type || "");
  if (!["plugin", "theme"].includes(type)) {
    throw new Error("Only plugins and themes install into the desktop client");
  }
  const fileName = String(addon.fileName || "");
  assertSafeFileName(fileName);
  if (type === "plugin" && !fileName.endsWith(".plugin.js")) {
    throw new Error("Plugin files must end with .plugin.js");
  }
  if (type === "theme" && !fileName.endsWith(".theme.css")) {
    throw new Error("Theme files must end with .theme.css");
  }
  const downloadUrl = String(addon.downloadUrl || "");
  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(downloadUrl)) {
    throw new Error("Store downloads must use raw GitHub HTTPS URLs");
  }

  const response = await fetch(downloadUrl, {headers: {"cache-control": "no-cache"}});
  if (!response.ok) {
    throw new Error("Download returned " + response.status);
  }
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
  return fs.readdirSync(folder)
    .filter((fileName) => fileName.endsWith(suffix))
    .map((fileName) => {
      const filePath = path.join(folder, fileName);
      const content = fs.readFileSync(filePath, "utf8");
      const meta = parseMeta(content, fileName);
      return {
        ...meta,
        enabled: Boolean(state[meta.name]),
        fileName,
      };
    });
}

function readAddon(kind, fileName) {
  assertSafeFileName(fileName);
  const folder = kind === "theme" ? config.themeDir : config.pluginDir;
  return fs.readFileSync(path.join(folder, fileName), "utf8");
}

function setEnabled(name, enabled) {
  const state = readState();
  state[name] = Boolean(enabled);
  writeState(state);
  return listAddons();
}

function openFolder(kind) {
  shell.openPath(kind === "theme" ? config.themeDir : config.pluginDir);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function parseMeta(content, fallback) {
  const meta = {};
  const block = content.match(/\/\*\*([\s\S]*?)\*\//)?.[1] || "";
  for (const line of block.split("\n")) {
    const match = line.match(/@(\w+)\s+(.+)/);
    if (match) {
      meta[match[1]] = match[2].trim();
    }
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
    await reloadLocalAddons();
    mountPanel();
  }

  async function reloadLocalAddons() {
    runtime.addons = await native.listAddons();
    for (const theme of runtime.addons.themes) {
      if (theme.enabled) {
        const css = await native.readAddon("theme", theme.fileName);
        applyStyle(theme.name, css);
      } else {
        removeStyle(theme.name);
      }
    }
    for (const plugin of runtime.addons.plugins) {
      if (plugin.enabled && !runtime.plugins.has(plugin.name)) {
        await startPlugin(plugin);
      }
      if (!plugin.enabled && runtime.plugins.has(plugin.name)) {
        stopPlugin(plugin.name);
      }
    }
  }

  async function startPlugin(plugin) {
    const source = await native.readAddon("plugin", plugin.fileName);
    const module = {exports: {}};
    const runner = new Function("module", "exports", "BdApi", source + "\nreturn module.exports;");
    const exported = runner(module, module.exports, new BdApi(plugin.name));
    const instance = typeof exported === "function" ? new exported() : exported;
    if (!instance || typeof instance.start !== "function" || typeof instance.stop !== "function") {
      throw new Error(plugin.name + " must export start() and stop()");
    }
    instance.start();
    runtime.plugins.set(plugin.name, instance);
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

  function mountPanel() {
    if (document.querySelector("#bettercodex-root")) return;
    const root = document.createElement("div");
    root.id = "bettercodex-root";
    root.innerHTML = '<button class="bettercodex-button" title="BetterCodex Store">BC</button><section class="bettercodex-panel" hidden><header class="bettercodex-header"><div class="bettercodex-title">BetterCodex Store</div><button class="bettercodex-close" aria-label="Close">x</button></header><nav class="bettercodex-tabs"><button data-tab="store" class="active">Store</button><button data-tab="plugins">Plugins</button><button data-tab="themes">Themes</button></nav><div class="bettercodex-content"></div></section>';
    document.body.appendChild(root);
    const panel = root.querySelector(".bettercodex-panel");
    const content = root.querySelector(".bettercodex-content");
    root.querySelector(".bettercodex-button").addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderTab("store", content);
    });
    root.querySelector(".bettercodex-close").addEventListener("click", () => {
      panel.hidden = true;
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        root.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
        renderTab(button.dataset.tab, content);
      });
    });
  }

  async function renderTab(tab, content) {
    if (tab === "store") return renderStore(content);
    await reloadLocalAddons();
    const list = tab === "themes" ? runtime.addons.themes : runtime.addons.plugins;
    content.innerHTML = '<div class="bettercodex-toolbar"><button data-open-folder>Open folder</button><button data-reload>Reload</button></div>' + (list.length ? list.map((addon) => localCard(addon)).join("") : '<div class="bettercodex-empty">No local ' + escapeHtml(tab) + ' installed.</div>');
    content.querySelector("[data-open-folder]")?.addEventListener("click", () => native.openFolder(tab === "themes" ? "theme" : "plugin"));
    content.querySelector("[data-reload]")?.addEventListener("click", async () => {
      await reloadLocalAddons();
      renderTab(tab, content);
    });
    content.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        await native.setEnabled(button.dataset.name, button.dataset.enabled !== "true");
        await reloadLocalAddons();
        renderTab(tab, content);
      });
    });
  }

  async function renderStore(content) {
    content.innerHTML = '<div class="bettercodex-toolbar"><input type="search" placeholder="Search Store"><button data-refresh>Refresh</button></div><div class="bettercodex-empty">Loading Store...</div>';
    let payload;
    try {
      payload = await native.fetchStore();
    } catch (error) {
      content.innerHTML = '<div class="bettercodex-empty">' + escapeHtml(error.message) + '</div>';
      return;
    }
    let query = "";
    const render = () => {
      const addons = (payload.addons || []).filter((addon) => {
        if (!["plugin", "theme"].includes(addon.type)) return false;
        const haystack = [addon.name, addon.author, addon.description, ...(addon.tags || [])].join(" ").toLowerCase();
        return !query || haystack.includes(query);
      });
      const body = addons.length ? addons.map(storeCard).join("") : '<div class="bettercodex-empty">No Store items match.</div>';
      content.querySelector(".bettercodex-empty, .bettercodex-results")?.remove();
      const results = document.createElement("div");
      results.className = "bettercodex-results";
      results.innerHTML = body;
      content.appendChild(results);
      results.querySelectorAll("[data-install]").forEach((button) => {
        button.addEventListener("click", async () => {
          const addon = addons.find((item) => item.id === button.dataset.install);
          button.textContent = "Installing...";
          await native.installAddon(addon);
          await reloadLocalAddons();
          button.textContent = "Installed";
        });
      });
    };
    content.querySelector("input").addEventListener("input", (event) => {
      query = event.currentTarget.value.trim().toLowerCase();
      render();
    });
    content.querySelector("[data-refresh]").addEventListener("click", () => renderStore(content));
    render();
  }

  function storeCard(addon) {
    return '<article class="bettercodex-card"><h3>' + escapeHtml(addon.name) + '</h3><p>' + escapeHtml(addon.description) + '</p><div class="bettercodex-meta">' + escapeHtml(addon.type) + ' by ' + escapeHtml(addon.author) + '</div><div class="bettercodex-tags">' + (addon.tags || []).map((tag) => '<span class="bettercodex-tag">' + escapeHtml(tag) + '</span>').join("") + '</div><div class="bettercodex-actions"><button class="primary" data-install="' + escapeHtml(addon.id) + '">Install</button><a href="' + escapeHtml(addon.sourceUrl || addon.downloadUrl) + '" target="_blank" rel="noreferrer">Source</a></div></article>';
  }

  function localCard(addon) {
    return '<article class="bettercodex-card"><h3>' + escapeHtml(addon.name) + '</h3><p>' + escapeHtml(addon.description) + '</p><div class="bettercodex-meta">' + escapeHtml(addon.fileName) + '</div><div class="bettercodex-actions"><button data-toggle data-name="' + escapeHtml(addon.name) + '" data-enabled="' + String(Boolean(addon.enabled)) + '">' + (addon.enabled ? "Disable" : "Enable") + '</button></div></article>';
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
          load() { return null; },
          save() {},
          delete() {},
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
