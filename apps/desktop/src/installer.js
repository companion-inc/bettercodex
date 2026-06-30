"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  archiveHeaderSha256,
  asarHeaderSha256,
  fileSha256,
  readArchive,
  readText,
  writeArchive,
  writeArchiveWithChanges,
} = require("./asar");
const {hasLoader, patchBootstrapSource, stripLoader} = require("./bootstrapPatch");
const {defaultAppRoot, defaultInstallRoot, repairAgentLabel, repairAgentPath} = require("./constants");
const {writeRuntimeFiles} = require("./runtimeFiles");

function resolveAppPaths(appRoot = defaultAppRoot) {
  return {
    appRoot,
    asarPath: path.join(appRoot, "Contents", "Resources", "app.asar"),
    infoPlistPath: path.join(appRoot, "Contents", "Info.plist"),
    resourcesDir: path.join(appRoot, "Contents", "Resources"),
  };
}

function inspect(appRoot = defaultAppRoot) {
  const paths = resolveAppPaths(appRoot);
  assertCodexApp(paths);

  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = `/${pkg.main}`;
  const bootstrap = readText(archive, bootstrapPath);
  const plistHash = readPlistAsarHash(paths.infoPlistPath);
  const asarHeaderHash = archiveHeaderSha256(paths.asarPath);

  return {
    appRoot: paths.appRoot,
    asarHash: fileSha256(paths.asarPath),
    asarHeaderHash,
    bootstrapPath,
    bundleIdentifier: readPlistValue(paths.infoPlistPath, "CFBundleIdentifier"),
    codexBuildNumber: pkg.codexBuildNumber || null,
    integrityMatches: plistHash === asarHeaderHash,
    loaderInstalled: hasLoader(bootstrap),
    packageMain: pkg.main,
    plistAsarHash: plistHash,
    repairAgent: inspectRepairAgent(),
    signatureValid: verifyApp(paths.appRoot),
    version: pkg.version || null,
  };
}

function install(options = {}) {
  const appRoot = options.appRoot || defaultAppRoot;
  const installRoot = options.installRoot || defaultInstallRoot;
  const paths = resolveAppPaths(appRoot);
  assertCodexApp(paths);

  const catalogEndpoint = options.catalogEndpoint || options.storeEndpoint;
  const runtime = writeRuntimeFiles(installRoot, {catalogEndpoint});
  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = `/${pkg.main}`;
  const originalBootstrap = readText(archive, bootstrapPath);
  const nextBootstrap = patchBootstrapSource(originalBootstrap, runtime.loaderPath);

  fs.mkdirSync(installRoot, {recursive: true});
  const originalHash = fileSha256(paths.asarPath);
  const originalHeaderHash = archiveHeaderSha256(paths.asarPath);

  if (nextBootstrap === originalBootstrap) {
    const repairAgent = options.repairAgent === false ? inspectRepairAgent() : installRepairAgent({
      appRoot,
      installRoot,
      nodePath: process.execPath,
      repairPath: runtime.repairPath,
    });
    writeManifest(installRoot, {
      appRoot,
      bootstrapPath,
      installedAt: new Date().toISOString(),
      loaderPath: runtime.loaderPath,
      originalAsarHash: originalHash,
      originalAsarHeaderHash: originalHeaderHash,
      patchedAsarHash: originalHash,
      patchedAsarHeaderHash: originalHeaderHash,
      catalogEndpoint: catalogEndpoint || null,
      repairAgent,
      version: pkg.version || null,
    });
    if (options.restart) {
      restartCodex(paths);
    }
    return {
      changed: false,
      installRoot,
      loaderPath: runtime.loaderPath,
      message: "BetterCodex runtime refreshed; app.asar already has the loader",
      repairAgent,
    };
  }

  const backupDir = backupAppState(paths, installRoot, {
    asarHash: originalHash,
    asarHeaderHash: originalHeaderHash,
    version: pkg.version || null,
  });

  const nextAsar = writeArchiveWithChanges(archive, new Map([[bootstrapPath, nextBootstrap]]));
  writeArchive(paths.asarPath, nextAsar);
  const patchedHash = fileSha256(paths.asarPath);
  const patchedHeaderHash = asarHeaderSha256(nextAsar);
  updatePlistAsarHash(paths.infoPlistPath, patchedHeaderHash);
  signAndVerify(paths.appRoot);
  const repairAgent = options.repairAgent === false ? inspectRepairAgent() : installRepairAgent({
    appRoot,
    installRoot,
    nodePath: process.execPath,
    repairPath: runtime.repairPath,
  });

  writeManifest(installRoot, {
    appRoot,
    backupDir,
    bootstrapPath,
    installedAt: new Date().toISOString(),
    loaderPath: runtime.loaderPath,
    originalAsarHash: originalHash,
    originalAsarHeaderHash: originalHeaderHash,
    patchedAsarHash: patchedHash,
    patchedAsarHeaderHash: patchedHeaderHash,
    catalogEndpoint: catalogEndpoint || null,
    repairAgent,
    version: pkg.version || null,
  });

  if (options.restart) {
    restartCodex(paths);
  }

  return {
    backupDir,
    changed: true,
    installRoot,
    loaderPath: runtime.loaderPath,
    patchedHash,
    patchedHeaderHash,
    repairAgent,
  };
}

function uninstall(options = {}) {
  const appRoot = options.appRoot || defaultAppRoot;
  const installRoot = options.installRoot || defaultInstallRoot;
  if (options.removeOnly) {
    const wasInstalled = inspectRepairAgent().installed;
    const repairAgent = removeRepairAgent();
    return {
      changed: wasInstalled,
      message: wasInstalled
        ? "BetterCodex repair agent removed."
        : "BetterCodex repair agent is not installed.",
      repairAgent,
    };
  }
  const paths = resolveAppPaths(appRoot);
  assertCodexApp(paths);

  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = `/${pkg.main}`;
  const originalBootstrap = readText(archive, bootstrapPath);
  const nextBootstrap = stripLoader(originalBootstrap);

  if (nextBootstrap === originalBootstrap) {
    const repairAgent = removeRepairAgent();
    return {
      changed: false,
      message: "BetterCodex loader is not installed in app.asar",
      repairAgent,
    };
  }

  removeRepairAgent();
  backupAppState(paths, installRoot, {
    asarHash: fileSha256(paths.asarPath),
    asarHeaderHash: archiveHeaderSha256(paths.asarPath),
    uninstallBackup: true,
    version: pkg.version || null,
  });

  const nextAsar = writeArchiveWithChanges(archive, new Map([[bootstrapPath, nextBootstrap]]));
  writeArchive(paths.asarPath, nextAsar);
  const nextHeaderHash = asarHeaderSha256(nextAsar);
  updatePlistAsarHash(paths.infoPlistPath, nextHeaderHash);
  signAndVerify(paths.appRoot);

  if (options.restart) {
    restartCodex(paths);
  }

  return {
    changed: true,
    patchedHash: fileSha256(paths.asarPath),
    patchedHeaderHash: nextHeaderHash,
  };
}

function assertCodexApp(paths) {
  if (!fs.existsSync(paths.appRoot)) {
    throw new Error(`Codex app not found: ${paths.appRoot}`);
  }
  if (!fs.existsSync(paths.asarPath)) {
    throw new Error(`Codex app.asar not found: ${paths.asarPath}`);
  }
  if (!fs.existsSync(paths.infoPlistPath)) {
    throw new Error(`Codex Info.plist not found: ${paths.infoPlistPath}`);
  }
  const bundleId = readPlistValue(paths.infoPlistPath, "CFBundleIdentifier");
  if (!isCodexBundleIdentifier(bundleId)) {
    throw new Error(`Expected com.openai.codex or com.openai.codex.<name>, found ${bundleId || "unknown bundle id"}`);
  }
}

function isCodexBundleIdentifier(bundleId) {
  return bundleId === "com.openai.codex" || String(bundleId || "").startsWith("com.openai.codex.");
}

function backupAppState(paths, installRoot, metadata) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(installRoot, "backups", timestamp);
  fs.mkdirSync(backupDir, {recursive: true});
  fs.copyFileSync(paths.asarPath, path.join(backupDir, "app.asar"));
  fs.copyFileSync(paths.infoPlistPath, path.join(backupDir, "Info.plist"));
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify({appRoot: paths.appRoot, ...metadata}, null, 2)}\n`,
    "utf8",
  );
  return backupDir;
}

function writeManifest(installRoot, manifest) {
  fs.mkdirSync(installRoot, {recursive: true});
  fs.writeFileSync(
    path.join(installRoot, "install.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function installRepairAgent({appRoot, installRoot, nodePath, repairPath}) {
  if (process.platform !== "darwin") {
    return {installed: false, loaded: false, plistPath: null, reason: "unsupported-platform"};
  }
  const logDir = path.join(installRoot, "logs");
  fs.mkdirSync(path.dirname(repairAgentPath), {recursive: true});
  fs.mkdirSync(logDir, {recursive: true});
  const plist = repairAgentPlist({
    appRoot,
    installRoot,
    nodePath,
    repairPath,
    stderrPath: path.join(logDir, "repair.err.log"),
    stdoutPath: path.join(logDir, "repair.out.log"),
  });
  fs.writeFileSync(repairAgentPath, plist, "utf8");
  reloadRepairAgent();
  return inspectRepairAgent();
}

function removeRepairAgent() {
  if (process.platform !== "darwin") return {installed: false, loaded: false, plistPath: null};
  unloadRepairAgent();
  try {
    fs.rmSync(repairAgentPath, {force: true});
  } catch {}
  return inspectRepairAgent();
}

function inspectRepairAgent() {
  if (process.platform !== "darwin") {
    return {installed: false, loaded: false, plistPath: null, reason: "unsupported-platform"};
  }
  const installed = fs.existsSync(repairAgentPath);
  return {
    installed,
    label: repairAgentLabel,
    loaded: installed && isRepairAgentLoaded(),
    plistPath: repairAgentPath,
  };
}

function repairAgentPlist({appRoot, installRoot, nodePath, repairPath, stderrPath, stdoutPath}) {
  const watchPaths = [
    path.join(appRoot, "Contents", "Info.plist"),
    path.join(appRoot, "Contents", "Resources", "app.asar"),
  ];
  const args = [
    nodePath,
    repairPath,
    "--app",
    appRoot,
    "--home",
    installRoot,
    "--quiet",
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${escapePlist(repairAgentLabel)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map((value) => `    <string>${escapePlist(value)}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>StartInterval</key>',
    '  <integer>120</integer>',
    '  <key>WatchPaths</key>',
    '  <array>',
    ...watchPaths.map((value) => `    <string>${escapePlist(value)}</string>`),
    '  </array>',
    '  <key>StandardOutPath</key>',
    `  <string>${escapePlist(stdoutPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${escapePlist(stderrPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join("\n");
}

function reloadRepairAgent() {
  unloadRepairAgent();
  const domain = launchAgentDomain();
  try {
    childProcess.execFileSync("/bin/launchctl", ["bootstrap", domain, repairAgentPath], {stdio: "ignore"});
  } catch {}
  try {
    childProcess.execFileSync("/bin/launchctl", ["kickstart", "-k", `${domain}/${repairAgentLabel}`], {stdio: "ignore"});
  } catch {}
}

function unloadRepairAgent() {
  try {
    childProcess.execFileSync("/bin/launchctl", ["bootout", launchAgentDomain(), repairAgentPath], {stdio: "ignore"});
  } catch {}
}

function isRepairAgentLoaded() {
  try {
    childProcess.execFileSync("/bin/launchctl", ["print", `${launchAgentDomain()}/${repairAgentLabel}`], {stdio: "ignore"});
    return true;
  } catch {
    return false;
  }
}

function launchAgentDomain() {
  return `gui/${process.getuid()}`;
}

function escapePlist(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readPlistValue(infoPlistPath, key) {
  try {
    return childProcess.execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", `Print :${key}`, infoPlistPath],
      {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]},
    ).trim();
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
    ["-c", `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`, infoPlistPath],
    {stdio: "inherit"},
  );
}

function verifyApp(appRoot) {
  try {
    childProcess.execFileSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", appRoot],
      {stdio: "ignore"},
    );
    return true;
  } catch {
    return false;
  }
}

function signAndVerify(appRoot) {
  childProcess.execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", appRoot], {
    stdio: "inherit",
  });
  childProcess.execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appRoot],
    {stdio: "inherit"},
  );
}

function restartCodex(paths) {
  const currentPid = String(process.pid);
  try {
    const output = childProcess.execFileSync("/bin/ps", ["axo", "pid=,command="], {
      encoding: "utf8",
    });
    for (const line of output.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!match || match[1] === currentPid) {
        continue;
      }
      const command = match[2];
      if (command.includes(`${paths.appRoot}/Contents/MacOS/Codex`)) {
        try {
          process.kill(Number(match[1]), "SIGKILL");
        } catch {}
      }
    }
  } catch {}

  childProcess.spawnSync("/usr/bin/open", ["-a", paths.appRoot], {
    detached: true,
    stdio: "ignore",
  });
}

module.exports = {
  assertCodexApp,
  inspect,
  inspectRepairAgent,
  install,
  installRepairAgent,
  isCodexBundleIdentifier,
  readPlistAsarHash,
  removeRepairAgent,
  resolveAppPaths,
  uninstall,
};
