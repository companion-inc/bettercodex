"use strict";

const os = require("node:os");
const path = require("node:path");

const markerStart = "/* bettercodex-loader:start */";
const markerEnd = "/* bettercodex-loader:end */";
const defaultAppRoot = process.env.CODEX_APP_ROOT || "/Applications/Codex.app";
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const defaultInstallRoot = process.env.BETTERCODEX_HOME || path.join(codexHome, "bettercodex");
const defaultStoreEndpoint = process.env.BETTERCODEX_STORE_URL || "https://bettercodex-web.companion-inc.workers.dev/api/addons";

module.exports = {
  codexHome,
  defaultAppRoot,
  defaultInstallRoot,
  defaultStoreEndpoint,
  markerEnd,
  markerStart,
};
