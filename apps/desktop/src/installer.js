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
const {defaultAppRoot, defaultInstallRoot} = require("./constants");
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
    signatureValid: verifyApp(paths.appRoot),
    version: pkg.version || null,
  };
}

function install(options = {}) {
  const appRoot = options.appRoot || defaultAppRoot;
  const installRoot = options.installRoot || defaultInstallRoot;
  const paths = resolveAppPaths(appRoot);
  assertCodexApp(paths);

  const runtime = writeRuntimeFiles(installRoot, {storeEndpoint: options.storeEndpoint});
  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = `/${pkg.main}`;
  const originalBootstrap = readText(archive, bootstrapPath);
  const nextBootstrap = patchBootstrapSource(originalBootstrap, runtime.loaderPath);

  fs.mkdirSync(installRoot, {recursive: true});
  const originalHash = fileSha256(paths.asarPath);
  const originalHeaderHash = archiveHeaderSha256(paths.asarPath);

  if (nextBootstrap === originalBootstrap) {
    writeManifest(installRoot, {
      appRoot,
      bootstrapPath,
      installedAt: new Date().toISOString(),
      loaderPath: runtime.loaderPath,
      originalAsarHash: originalHash,
      originalAsarHeaderHash: originalHeaderHash,
      patchedAsarHash: originalHash,
      patchedAsarHeaderHash: originalHeaderHash,
      storeEndpoint: options.storeEndpoint || null,
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
    storeEndpoint: options.storeEndpoint || null,
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
  };
}

function uninstall(options = {}) {
  const appRoot = options.appRoot || defaultAppRoot;
  const installRoot = options.installRoot || defaultInstallRoot;
  const paths = resolveAppPaths(appRoot);
  assertCodexApp(paths);

  const archive = readArchive(paths.asarPath);
  const pkg = JSON.parse(readText(archive, "/package.json"));
  const bootstrapPath = `/${pkg.main}`;
  const originalBootstrap = readText(archive, bootstrapPath);
  const nextBootstrap = stripLoader(originalBootstrap);

  if (nextBootstrap === originalBootstrap) {
    return {
      changed: false,
      message: "BetterCodex loader is not installed in app.asar",
    };
  }

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
  install,
  isCodexBundleIdentifier,
  readPlistAsarHash,
  resolveAppPaths,
  uninstall,
};
