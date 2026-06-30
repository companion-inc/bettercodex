"use strict";

const path = require("node:path");

const {createBundle} = require("./bundler");
const {defaultAppRoot, defaultCatalogEndpoint, defaultInstallRoot} = require("./constants");
const {inspect, install, uninstall} = require("./installer");

async function main(argv) {
  const {command, options} = parseArgs(argv);

  switch (command) {
    case "status":
      printStatus(inspect(options.app));
      return;
    case "install": {
      if (options.unsafePatchOfficialApp) {
        const result = install({
          appRoot: options.app,
          installRoot: options.home,
          restart: options.restart,
          catalogEndpoint: options.catalog,
          repairAgent: options.repairAgent,
        });
        console.log(result.changed ? "BetterCodex installed into Codex.app." : result.message);
        console.log(`Install root: ${result.installRoot || options.home}`);
        console.log(`Catalog API: ${options.catalog}`);
        if (result.repairAgent) {
          console.log(`Repair agent: ${result.repairAgent.loaded ? "loaded" : result.repairAgent.installed ? "installed" : "not installed"}`);
        }
        if (result.backupDir) {
          console.log(`Backup: ${result.backupDir}`);
        }
        return;
      }
      const result = createBundle({
        appRoot: options.app,
        destination: options.destination,
        installRoot: options.home,
        launch: options.launch,
        name: options.bundleName,
        replace: true,
        catalogEndpoint: options.catalog,
      });
      console.log(`BetterCodex app installed: ${result.destination}`);
      console.log(`Bundle id: ${result.bundleId}`);
      console.log(`User data: ${result.userDataDir}`);
      return;
    }
    case "repair": {
      if (!options.unsafePatchOfficialApp) {
        console.log("Repair skipped: BetterCodex no longer mutates the official Codex.app by default.");
        console.log("Run `bettercodex install` to refresh the sibling BetterCodex app.");
        return;
      }
      const result = install({
        appRoot: options.app,
        installRoot: options.home,
        restart: options.restartRepair,
        catalogEndpoint: options.catalog,
        repairAgent: options.repairAgent,
      });
      console.log(result.changed ? "BetterCodex repaired." : result.message);
      console.log(`Install root: ${result.installRoot || options.home}`);
      if (result.repairAgent) {
        console.log(`Repair agent: ${result.repairAgent.loaded ? "loaded" : result.repairAgent.installed ? "installed" : "not installed"}`);
      }
      return;
    }
    case "bundle": {
      const result = createBundle({
        appRoot: options.app,
        destination: options.destination,
        installRoot: options.home,
        launch: options.launch,
        name: options.bundleName,
        replace: options.replace,
        catalogEndpoint: options.catalog,
      });
      console.log(`BetterCodex bundle: ${result.destination}`);
      console.log(`Bundle id: ${result.bundleId}`);
      console.log(`User data: ${result.userDataDir}`);
      return;
    }
    case "uninstall": {
      if (!options.unsafePatchOfficialApp) {
        const result = uninstall({
          appRoot: options.app,
          installRoot: options.home,
          restart: false,
          removeOnly: true,
        });
        console.log(result.message);
        return;
      }
      const result = uninstall({
        appRoot: options.app,
        installRoot: options.home,
        restart: options.restart,
      });
      console.log(result.changed ? "BetterCodex loader removed." : result.message);
      return;
    }
    case "paths":
      console.log(`App: ${options.app}`);
      console.log(`Home: ${options.home}`);
      console.log(`Catalog API: ${options.catalog}`);
      console.log(`Plugins: ${path.join(options.home, "plugins")}`);
      console.log(`Themes: ${path.join(options.home, "themes")}`);
      return;
    case "help":
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function parseArgs(argv) {
  const options = {
    app: defaultAppRoot,
    home: defaultInstallRoot,
    bundleName: "BetterCodex",
    destination: null,
    launch: false,
    replace: false,
    repairAgent: true,
    restart: true,
    restartRepair: false,
    unsafePatchOfficialApp: false,
    catalog: defaultCatalogEndpoint,
  };
  let command = "help";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (i === 0 && !arg.startsWith("-")) {
      command = arg;
      continue;
    }
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
    if (arg === "--catalog" || arg === "--store") {
      options.catalog = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--name") {
      options.bundleName = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--destination") {
      options.destination = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--replace" || arg.startsWith("--replace=")) {
      options.replace = readBooleanFlag(arg, "--replace", true);
      continue;
    }
    if (arg === "--launch" || arg.startsWith("--launch=")) {
      options.launch = readBooleanFlag(arg, "--launch", true);
      continue;
    }
    if (arg === "--restart") {
      options.restart = true;
      options.restartRepair = true;
      continue;
    }
    if (arg === "--no-restart") {
      options.restart = false;
      options.restartRepair = false;
      continue;
    }
    if (arg === "--no-repair-agent") {
      options.repairAgent = false;
      continue;
    }
    if (arg === "--unsafe-patch-official-app") {
      options.unsafePatchOfficialApp = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      command = "help";
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return {command, options};
}

function readBooleanFlag(arg, flag, defaultValue) {
  if (arg === flag) return defaultValue;
  const value = arg.slice(flag.length + 1).toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  throw new Error(`Invalid boolean for ${flag}: ${value}`);
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printStatus(status) {
  console.log(`App: ${status.appRoot}`);
  console.log(`Version: ${status.version || "unknown"}`);
  console.log(`Build: ${status.codexBuildNumber || "unknown"}`);
  console.log(`Bundle id: ${status.bundleIdentifier || "unknown"}`);
  console.log(`Package main: ${status.packageMain}`);
  console.log(`Loader installed: ${status.loaderInstalled ? "yes" : "no"}`);
  console.log(`Repair agent installed: ${status.repairAgent?.installed ? "yes" : "no"}`);
  console.log(`Repair agent loaded: ${status.repairAgent?.loaded ? "yes" : "no"}`);
  if (status.repairAgent?.plistPath) {
    console.log(`Repair agent plist: ${status.repairAgent.plistPath}`);
  }
  console.log(`ASAR integrity matches: ${status.integrityMatches ? "yes" : "no"}`);
  console.log(`Codesign valid: ${status.signatureValid ? "yes" : "no"}`);
  console.log(`ASAR archive sha256: ${status.asarHash}`);
  console.log(`ASAR header sha256: ${status.asarHeaderHash}`);
  console.log(`Plist ASAR header sha256: ${status.plistAsarHash || "missing"}`);
}

function printHelp() {
  console.log(`bettercodex

Commands:
  status              Inspect the local Codex Desktop app.
  install             Create or refresh /Applications/Codex-BetterCodex.app.
  repair              No-op by default; official Codex.app is not mutated.
  bundle              Create a sibling Codex-BetterCodex.app bundle for dev/safety.
  uninstall           Remove the BetterCodex background repair agent.
  paths               Print app, data, plugin, theme, and marketplace paths.

Options:
  --app <path>        Codex.app path. Default: ${defaultAppRoot}
  --home <path>       BetterCodex data path. Default: ${defaultInstallRoot}
  --catalog <url>     Catalog API endpoint. Default: ${defaultCatalogEndpoint}
  --name <name>       Sibling app name suffix for bundle. Default: BetterCodex
  --destination <app> Sibling app destination for bundle.
  --replace           Replace an existing destination bundle.
  --launch            Launch the sibling bundle after creating it.
  --restart           Force restart Codex after unsafe official-app patching. Default.
  --no-restart        Patch without restarting Codex.
  --no-repair-agent   Do not install the background updater-repair LaunchAgent.
  --unsafe-patch-official-app
                      Patch /Applications/Codex.app directly. This breaks the vendor
                      signature and can break Sparkle updates; use only for local experiments.
`);
}

module.exports = {
  main,
  parseArgs,
};
