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

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const runtimeDir = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(runtimeDir, "config.json"), "utf8"));
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
  ipcMain.handle("bettercodex:getConfig", () => ({storeEndpoint: config.storeEndpoint}));
  ipcMain.handle("bettercodex:getStyles", () => betterCodexFrameCSS());
  ipcMain.handle("bettercodex:fetchStore", () => fetchStore());
  ipcMain.handle("bettercodex:listAddons", () => listAddons());
  ipcMain.handle("bettercodex:readAddon", (event, kind, fileName) => readAddon(kind, fileName));
  ipcMain.handle("bettercodex:installAddon", (event, addon) => installAddon(addon));
  ipcMain.handle("bettercodex:setEnabled", (event, name, enabled) => setEnabled(name, enabled));
  ipcMain.handle("bettercodex:openFolder", (event, kind) => shell.openPath(kind === "theme" ? config.themeDir : config.pluginDir));
}

async function fetchStore() {
  const response = await fetch(config.storeEndpoint, {headers: {"cache-control": "no-cache"}});
  if (!response.ok) throw new Error("Store API returned " + response.status);
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
  if (!/^https:\/\/raw\.githubusercontent\.com\//.test(downloadUrl)) throw new Error("Store downloads must use raw GitHub HTTPS URLs");
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
    ".bettercodex-panel{display:none;overflow-y:auto;color:var(--color-token-foreground,inherit)}",
    "#bettercodex-nav-item.bettercodex-active{background:var(--color-token-list-hover-background,#ffffff14)}",
    ".bettercodex-panel.bettercodex-open{display:block}",
    ".bettercodex-page{max-width:720px;margin:0 auto;padding:56px 24px 96px;display:flex;flex-direction:column;gap:20px}",
    ".bettercodex-search{display:flex;align-items:center;height:44px;padding:0 14px;border:1px solid var(--color-token-border-default,#ffffff1a);border-radius:14px;background:var(--color-token-main-surface-secondary,transparent)}",
    ".bettercodex-input{min-width:0;flex:1;background:transparent;border:0;outline:none;color:var(--color-token-foreground,inherit);font:inherit;font-size:15px}",
    ".bettercodex-input::placeholder{color:var(--color-token-text-secondary,#9ca3af)}",
    ".bettercodex-tabs{display:flex;gap:2px;border-bottom:1px solid var(--color-token-border-default,#ffffff14)}",
    ".bettercodex-tabs button{position:relative;border:0;background:transparent;color:var(--color-token-text-secondary,#9ca3af);padding:8px 12px;font:inherit;font-size:14px;font-weight:500;cursor:pointer}",
    ".bettercodex-tabs button.active{color:var(--color-token-foreground,inherit)}",
    ".bettercodex-tabs button.active::after{content:'';position:absolute;left:10px;right:10px;bottom:-1px;height:2px;border-radius:2px;background:var(--color-token-foreground,currentColor)}",
    ".bettercodex-list{display:flex;flex-direction:column;gap:2px}",
    ".bettercodex-section-row{display:flex;align-items:center;justify-content:space-between;gap:12px}",
    ".bettercodex-sec{font-size:18px;line-height:24px;font-weight:500;color:var(--color-token-foreground,inherit);margin:6px 0 10px}",
    ".bettercodex-row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px}",
    ".bettercodex-row:hover{background:var(--color-token-list-hover-background,#ffffff0d)}",
    ".bettercodex-ico{font-size:16px;font-weight:600}",
    ".bettercodex-grow{min-width:0;flex:1}",
    ".bettercodex-name{font-size:14px;font-weight:500;color:var(--color-token-foreground,inherit)}",
    ".bettercodex-desc{font-size:13px;line-height:1.4;color:var(--color-token-text-secondary,#9ca3af);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".bettercodex-act{flex-shrink:0;height:32px;border:1px solid var(--color-token-border-default,#ffffff1f);border-radius:9px;background:transparent;color:var(--color-token-foreground,inherit);padding:0 14px;font:inherit;font-size:13px;font-weight:500;cursor:pointer}",
    ".bettercodex-act:hover{background:var(--color-token-list-hover-background,#ffffff12)}",
    ".bettercodex-act.primary{background:var(--color-token-interactive-label-accent-default,#0285ff);color:#fff;border-color:transparent}",
    ".bettercodex-act:disabled{opacity:.5;cursor:default}",
    ".bettercodex-empty{color:var(--color-token-text-secondary,#9ca3af);padding:28px 4px;font-size:14px}",
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
    fetchStore: () => ipcRenderer.invoke("bettercodex:fetchStore"),
    listAddons: () => ipcRenderer.invoke("bettercodex:listAddons"),
    readAddon: (kind, fileName) => ipcRenderer.invoke("bettercodex:readAddon", kind, fileName),
    installAddon: (addon) => ipcRenderer.invoke("bettercodex:installAddon", addon),
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
    try { await renderCurrent(); } catch (error) { /* pre-render the store so the page opens instantly */ }
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
      if (runtime.openLocation && location.href !== runtime.openLocation) {
        closePanel();
        return;
      }
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
        // Codex CSP blocks new Function(); a plugin that can't run must not break BetterCodex.
        console.error("[BetterCodex] plugin failed:", plugin.name, error && error.message);
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

  // Native-feeling dismissal: Codex owns navigation. Any host click outside the BetterCodex
  // page means the user is leaving, so we remove our page before Codex's React route renders.
  function closeOnNavAway() {
    if (runtime.navAwayBound) return;
    runtime.navAwayBound = true;
    document.addEventListener("click", (event) => {
      if (!runtime.panel || !runtime.panel.classList.contains("bettercodex-open")) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-bettercodex-nav='true']") || target.closest(".bettercodex-panel")) return;
      closePanel();
    }, true);
  }

  function bindHostNavigationTeardown() {
    if (runtime.hostNavigationBound) return;
    runtime.hostNavigationBound = true;

    const closeForHostNavigation = () => {
      if (runtime.panel && runtime.panel.classList.contains("bettercodex-open")) closePanel();
    };

    for (const method of ["pushState", "replaceState"]) {
      try {
        const original = history[method];
        if (typeof original !== "function" || original.__bettercodexWrapped) continue;
        const wrapped = function bettercodexHistoryWrapper(...args) {
          const before = location.href;
          const result = original.apply(this, args);
          if (location.href !== before) queueMicrotask(closeForHostNavigation);
          return result;
        };
        wrapped.__bettercodexWrapped = true;
        wrapped.__bettercodexOriginal = original;
        history[method] = wrapped;
      } catch (error) { /* popstate/hashchange still cover browser navigation */ }
    }

    window.addEventListener("popstate", closeForHostNavigation, true);
    window.addEventListener("hashchange", closeForHostNavigation, true);
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
      return;
    }
    const root = ensureRoot();
    root.innerHTML =
      '<section class="bettercodex-panel">' +
        '<div class="bettercodex-page">' +
          '<div class="flex flex-col gap-2 px-2">' +
            '<h1 class="heading-xl font-normal text-token-foreground">BetterCodex</h1>' +
            '<p class="text-lg leading-6 text-token-text-secondary">Community plugins and themes for Codex.</p>' +
          '</div>' +
          '<div class="bettercodex-search"><input class="bettercodex-input" type="search" placeholder="Search BetterCodex" aria-label="Search BetterCodex"></div>' +
          '<nav class="bettercodex-tabs"><button data-tab="store" class="active">Store</button><button data-tab="plugins">Plugins</button><button data-tab="themes">Themes</button></nav>' +
          '<div class="bettercodex-content"></div>' +
        '</div>' +
      '</section>';
    runtime.panel = root.querySelector(".bettercodex-panel");
    runtime.content = root.querySelector(".bettercodex-content");
    runtime.activeTab = "store";
    runtime.query = "";
    closeOnNavAway();
    root.querySelector(".bettercodex-input").addEventListener("input", (event) => {
      runtime.query = event.currentTarget.value.trim();
      renderCurrent();
    });
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        root.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
        runtime.activeTab = button.dataset.tab;
        renderCurrent();
      });
    });
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
    setNavActive(true);
    renderCurrent();
  }

  function closePanel() {
    if (!runtime.panel) return;
    runtime.panel.classList.remove("bettercodex-open");
    setNavActive(false);
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
    if (runtime.activeTab === "themes") return renderLocal("themes");
    if (runtime.activeTab === "plugins") return renderLocal("plugins");
    return renderStore();
  }

  function sectionHeader(text) {
    return '<div class="bettercodex-sec">' + escapeHtml(text) + '</div>';
  }

  function iconTile(name) {
    const letter = escapeHtml((String(name || "?").trim().charAt(0) || "?").toUpperCase());
    return '<span class="bettercodex-ico flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-token-border-default text-token-text-secondary">' + letter + '</span>';
  }

  async function renderStore() {
    const content = runtime.content;
    let payload = runtime.storePayload;
    if (!payload) {
      content.innerHTML = '<div class="bettercodex-empty">Loading store…</div>';
      try {
        payload = await native.fetchStore();
        runtime.storePayload = payload;
      } catch (error) {
        content.innerHTML = '<div class="bettercodex-empty">Could not reach the BetterCodex store. ' + escapeHtml(error.message) + '</div>';
        return;
      }
    }
    const query = (runtime.query || "").toLowerCase();
    const installed = new Set([...runtime.addons.plugins, ...runtime.addons.themes].map((addon) => addon.name));
    const addons = (payload.addons || []).filter((addon) => {
      if (!["plugin", "theme"].includes(addon.type)) return false;
      const haystack = [addon.name, addon.author, addon.description, ...(addon.tags || [])].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });
    if (!addons.length) {
      content.innerHTML = sectionHeader("Store") + '<div class="bettercodex-empty">No store items match your search.</div>';
      return;
    }
    content.innerHTML = sectionHeader("Available") + '<div class="bettercodex-list">' + addons.map((addon) => storeCard(addon, installed.has(addon.name))).join("") + '</div>';
    content.querySelectorAll("[data-install]").forEach((button) => {
      button.addEventListener("click", async () => {
        const addon = addons.find((item) => item.id === button.dataset.install);
        if (!addon) return;
        button.disabled = true;
        button.textContent = "Installing…";
        try {
          await native.installAddon(addon);
          await reloadLocalAddons();
          button.textContent = "Installed";
          showToast(addon.name + " installed");
        } catch (error) {
          button.disabled = false;
          button.textContent = "Install";
          showToast(error.message);
        }
      });
    });
  }

  async function renderLocal(tab) {
    const content = runtime.content;
    await reloadLocalAddons();
    const query = (runtime.query || "").toLowerCase();
    const all = tab === "themes" ? runtime.addons.themes : runtime.addons.plugins;
    const list = all.filter((addon) => !query || (addon.name + " " + (addon.description || "")).toLowerCase().includes(query));
    const heading = tab === "themes" ? "Installed themes" : "Installed plugins";
    const folderRow = '<div class="bettercodex-section-row">' + sectionHeader(heading) + '<button class="bettercodex-act" data-open-folder>Open folder</button></div>';
    content.innerHTML = folderRow + (list.length
      ? '<div class="bettercodex-list">' + list.map(localCard).join("") + '</div>'
      : '<div class="bettercodex-empty">No ' + escapeHtml(tab) + ' installed yet. Browse the Store tab to add some.</div>');
    content.querySelector("[data-open-folder]")?.addEventListener("click", () => native.openFolder(tab === "themes" ? "theme" : "plugin"));
    content.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        await native.setEnabled(button.dataset.name, button.dataset.enabled !== "true");
        await reloadLocalAddons();
        renderLocal(tab);
      });
    });
  }

  function storeCard(addon, isInstalled) {
    const action = isInstalled
      ? '<button class="bettercodex-act" disabled>Installed</button>'
      : '<button class="bettercodex-act primary" data-install="' + escapeHtml(addon.id) + '">Install</button>';
    return '<div class="bettercodex-row">' + iconTile(addon.name) +
      '<div class="bettercodex-grow"><div class="bettercodex-name">' + escapeHtml(addon.name) + '</div>' +
      '<div class="bettercodex-desc">' + escapeHtml(addon.description || (addon.type + " by " + addon.author)) + '</div></div>' +
      action + '</div>';
  }

  function localCard(addon) {
    const toggle = '<button class="bettercodex-act' + (addon.enabled ? "" : " primary") + '" data-toggle data-name="' + escapeHtml(addon.name) + '" data-enabled="' + String(Boolean(addon.enabled)) + '">' + (addon.enabled ? "Enabled" : "Enable") + '</button>';
    return '<div class="bettercodex-row">' + iconTile(addon.name) +
      '<div class="bettercodex-grow"><div class="bettercodex-name">' + escapeHtml(addon.name) + '</div>' +
      '<div class="bettercodex-desc">' + escapeHtml(addon.description || addon.fileName) + '</div></div>' +
      toggle + '</div>';
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
