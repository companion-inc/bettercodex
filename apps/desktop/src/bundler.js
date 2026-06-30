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
    quitBundle(`com.openai.codex.${slug}`, destination);
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
  setPlist(infoPlist, "CFBundleIdentifier", `com.openai.codex.${slug}`);
  if (installBetterCodexIcon(destination)) {
    setPlist(infoPlist, "CFBundleIconFile", "bettercodex.icns");
  }
  installLauncherWrapper(destination, name);
  signAndVerify(destination);

  if (options.launch) {
    childProcess.execFileSync("/usr/bin/open", ["-n", destination], {stdio: "inherit"});
  }

  return {
    bundleId: `com.openai.codex.${slug}`,
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
  const source = [
    path.join(resourcesDir, "icon-codex-dark-color.png"),
    path.join(resourcesDir, "icon.png"),
    path.join(resourcesDir, "default_app", "icon.png"),
  ].find((candidate) => fs.existsSync(candidate));
  if (!source) return false;

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
from PIL import Image, ImageDraw, ImageFilter

source, iconset = sys.argv[1], sys.argv[2]
base = Image.open(source).convert("RGBA")

def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def compose(size):
    icon = base.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
    tint = Image.new("RGBA", (size, size), (20, 198, 170, 0))
    mask = icon.getchannel("A").point(lambda value: int(value * 0.34))
    tint.putalpha(mask)
    icon = Image.alpha_composite(icon, tint)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    badge = (
        int(size * 0.47),
        int(size * 0.49),
        int(size * 0.96),
        int(size * 0.96),
    )
    radius = max(3, int(size * 0.12))
    rounded(sd, badge, radius, (0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, size // 48)))
    icon.alpha_composite(shadow)

    draw = ImageDraw.Draw(icon)
    rounded(draw, badge, radius, (20, 198, 170, 255), (244, 255, 252, 245), max(1, size // 42))

    pad = max(2, int(size * 0.09))
    gap = max(1, int(size * 0.032))
    left = badge[0] + pad
    top = badge[1] + pad
    tile = max(2, int((badge[2] - badge[0] - (2 * pad) - gap) / 2))
    tile_radius = max(1, int(tile * 0.28))
    tile_fill = (5, 21, 25, 230)
    for row in range(2):
        for col in range(2):
            x = left + col * (tile + gap)
            y = top + row * (tile + gap)
            rounded(draw, (x, y, x + tile, y + tile), tile_radius, tile_fill)
    return icon

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
  createBundle,
  defaultDestination,
  normalizeName,
  slugify,
  userDataDir,
};
