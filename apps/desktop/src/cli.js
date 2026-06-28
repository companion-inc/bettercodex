"use strict";

const path = require("node:path");

const {createBundle} = require("./bundler");
const {defaultAppRoot, defaultInstallRoot, defaultStoreEndpoint} = require("./constants");
const {inspect, install, uninstall} = require("./installer");

async function main(argv) {
  const {command, options} = parseArgs(argv);

  switch (command) {
    case "status":
      printStatus(inspect(options.app));
      return;
    case "install": {
      const result = install({
        appRoot: options.app,
        installRoot: options.home,
        restart: options.restart,
        storeEndpoint: options.store,
      });
      console.log(result.changed ? "BetterCodex installed." : result.message);
      console.log(`Install root: ${result.installRoot || options.home}`);
      console.log(`Store API: ${options.store}`);
      if (result.backupDir) {
        console.log(`Backup: ${result.backupDir}`);
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
        storeEndpoint: options.store,
      });
      console.log(`BetterCodex bundle: ${result.destination}`);
      console.log(`Bundle id: ${result.bundleId}`);
      console.log(`User data: ${result.userDataDir}`);
      return;
    }
    case "uninstall": {
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
      console.log(`Store API: ${options.store}`);
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
    restart: true,
    store: defaultStoreEndpoint,
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
    if (arg === "--store") {
      options.store = requireValue(argv, i, arg);
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
    if (arg === "--replace") {
      options.replace = true;
      continue;
    }
    if (arg === "--launch") {
      options.launch = true;
      continue;
    }
    if (arg === "--restart") {
      options.restart = true;
      continue;
    }
    if (arg === "--no-restart") {
      options.restart = false;
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
  install             Patch Codex Desktop and install the BetterCodex runtime.
  bundle              Create a sibling Codex-BetterCodex.app bundle for dev/safety.
  uninstall           Remove the BetterCodex loader from Codex Desktop.
  paths               Print app, data, plugin, theme, and Store paths.

Options:
  --app <path>        Codex.app path. Default: ${defaultAppRoot}
  --home <path>       BetterCodex data path. Default: ${defaultInstallRoot}
  --store <url>       Store API endpoint. Default: ${defaultStoreEndpoint}
  --name <name>       Sibling app name suffix for bundle. Default: BetterCodex
  --destination <app> Sibling app destination for bundle.
  --replace           Replace an existing destination bundle.
  --launch            Launch the sibling bundle after creating it.
  --restart           Force restart Codex after install/uninstall. Default.
  --no-restart        Patch without restarting Codex.
`);
}

module.exports = {
  main,
  parseArgs,
};
