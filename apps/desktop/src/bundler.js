"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {defaultAppRoot, defaultInstallRoot} = require("./constants");
const {install} = require("./installer");

function createBundle(options = {}) {
  const appRoot = options.appRoot || defaultAppRoot;
  const installRoot = options.installRoot || defaultInstallRoot;
  const name = normalizeName(options.name || "BetterCodex");
  const slug = slugify(name);
  const bundleId = bundleIdentifierForSlug(slug);
  const destination = options.destination
    ? path.resolve(options.destination)
    : defaultDestination(appRoot, name);

  if (!fs.existsSync(appRoot)) {
    throw new Error(`Codex app not found: ${appRoot}`);
  }
  if (fs.existsSync(destination)) {
    if (!options.replace) {
      throw new Error(`Destination exists: ${destination}. Rerun with --replace to overwrite it.`);
    }
    quitBundle(bundleId, destination);
    fs.rmSync(destination, {force: true, recursive: true});
  }

  childProcess.execFileSync("/usr/bin/ditto", [appRoot, destination], {stdio: "inherit"});

  const result = install({
    appRoot: destination,
    installRoot,
    repairAgent: false,
    restart: false,
    catalogEndpoint: options.catalogEndpoint || options.storeEndpoint,
  });

  const infoPlist = path.join(destination, "Contents", "Info.plist");
  setPlist(infoPlist, "CFBundleDisplayName", name);
  setPlist(infoPlist, "CFBundleName", name);
  setPlist(infoPlist, "CFBundleIdentifier", bundleId);
  if (installBetterCodexIcon(destination)) {
    setPlist(infoPlist, "CFBundleIconFile", "bettercodex.icns");
  }
  installLauncherWrapper(destination, name);
  signAndVerify(destination);

  if (options.launch) {
    childProcess.execFileSync("/usr/bin/open", ["-n", destination], {stdio: "inherit"});
  }

  return {
    bundleId,
    destination,
    installResult: result,
    userDataDir: userDataDir(name),
  };
}

function defaultDestination(appRoot, name) {
  return path.join(path.dirname(appRoot), `${normalizeName(name)}.app`);
}

function userDataDir(name) {
  return path.join(os.homedir(), "Library", "Application Support", normalizeName(name));
}

function normalizeName(name) {
  const words = String(name)
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2);
  const value = words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join(" ");
  return value || "BetterCodex";
}

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-") || "bettercodex";
}

function bundleIdentifierForSlug(slug) {
  return `com.companion.${slug || "bettercodex"}`;
}

function quitBundle(bundleId, destination) {
  const ownPids = new Set([process.pid, process.ppid].filter(Boolean).map(String));
  childProcess.spawnSync("/usr/bin/osascript", [
    "-e",
    `tell application id "${bundleId}" to quit`,
  ], {stdio: "ignore"});

  const processList = childProcess.spawnSync("/bin/ps", ["-axo", "pid=,args="], {
    encoding: "utf8",
  });
  for (const line of processList.stdout.split("\n")) {
    if (!line.includes(destination)) {
      continue;
    }
    const match = /^\s*(\d+)/.exec(line);
    if (match && !ownPids.has(match[1])) {
      try {
        process.kill(Number(match[1]), "SIGKILL");
      } catch {}
    }
  }
}

function setPlist(infoPlist, key, value) {
  childProcess.execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", `Set :${key} ${value}`, infoPlist],
    {stdio: "inherit"},
  );
}

function installLauncherWrapper(destination, userDataName) {
  const macosDir = path.join(destination, "Contents", "MacOS");
  const executable = path.join(macosDir, "Codex");
  const realExecutable = path.join(macosDir, "Codex-bin");
  if (!fs.existsSync(realExecutable)) {
    fs.renameSync(executable, realExecutable);
  }
  fs.writeFileSync(
    executable,
    [
      "#!/bin/sh",
      "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
      `exec "$DIR/Codex-bin" --user-data-dir="$HOME/Library/Application Support/${userDataName}" "$@"`,
      "",
    ].join("\n"),
    {encoding: "utf8", mode: 0o755},
  );
}

function installBetterCodexIcon(destination) {
  const resourcesDir = path.join(destination, "Contents", "Resources");
  const source = path.join(__dirname, "..", "assets", "bettercodex-icon.png");
  if (!fs.existsSync(source)) return false;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bettercodex-icon-"));
  const iconset = path.join(tempDir, "bettercodex.iconset");
  const iconPath = path.join(resourcesDir, "bettercodex.icns");
  try {
    fs.mkdirSync(iconset);
    childProcess.execFileSync("python3", ["-c", betterCodexIconPython(), source, iconset], {
      stdio: "inherit",
    });
    childProcess.execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", iconPath], {
      stdio: "inherit",
    });
    for (const filename of ["icon.icns", "electron.icns", "app.icns"]) {
      fs.copyFileSync(iconPath, path.join(resourcesDir, filename));
    }
    for (const filename of ["icon.png", "icon-codex-dark-color.png", "icon-codex-light.png"]) {
      const target = path.join(resourcesDir, filename);
      if (fs.existsSync(target)) {
        fs.copyFileSync(source, target);
      }
    }
    const defaultAppIcon = path.join(resourcesDir, "default_app", "icon.png");
    if (fs.existsSync(defaultAppIcon)) {
      fs.copyFileSync(source, defaultAppIcon);
    }
    return fs.existsSync(iconPath);
  } catch (error) {
    console.warn(`BetterCodex icon generation skipped: ${error.message}`);
    return false;
  } finally {
    fs.rmSync(tempDir, {force: true, recursive: true});
  }
}

function betterCodexIconPython() {
  return String.raw`
import os
import sys
from PIL import Image

source, iconset = sys.argv[1], sys.argv[2]
base = Image.open(source).convert("RGBA")

def compose(size):
    return base.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")

outputs = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for filename, size in outputs:
    compose(size).save(os.path.join(iconset, filename))
`;
}

function signAndVerify(destination) {
  childProcess.spawnSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", destination], {
    stdio: "ignore",
  });
  childProcess.execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", destination], {
    stdio: "inherit",
  });
  childProcess.execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", destination],
    {stdio: "inherit"},
  );
}

module.exports = {
  betterCodexIconPython,
  bundleIdentifierForSlug,
  createBundle,
  defaultDestination,
  normalizeName,
  slugify,
  userDataDir,
};
