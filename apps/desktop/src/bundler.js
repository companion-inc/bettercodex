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
    : path.join(path.dirname(appRoot), `Codex-${name}.app`);

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
    restart: false,
    storeEndpoint: options.storeEndpoint,
  });

  const infoPlist = path.join(destination, "Contents", "Info.plist");
  setPlist(infoPlist, "CFBundleDisplayName", name);
  setPlist(infoPlist, "CFBundleName", name);
  setPlist(infoPlist, "CFBundleIdentifier", `com.openai.codex.${slug}`);
  installLauncherWrapper(destination, `Codex ${name}`);
  signAndVerify(destination);

  if (options.launch) {
    childProcess.execFileSync("/usr/bin/open", ["-n", destination], {stdio: "inherit"});
  }

  return {
    bundleId: `com.openai.codex.${slug}`,
    destination,
    installResult: result,
    userDataDir: path.join(os.homedir(), "Library", "Application Support", `Codex ${name}`),
  };
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
    if (match) {
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
  createBundle,
  normalizeName,
  slugify,
};
