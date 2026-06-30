# Runtime Contracts

User input modes:
- CLI: `bettercodex install`, `bundle`, `status`, `paths`.
- In-app: BetterCodex sidebar row opens the Plugins/Themes page; right side panel toggle leaves BetterCodex mounted; native route clicks leave BetterCodex.
- Local filesystem: user drops `.plugin.js` and `.theme.css` files into BetterCodex folders.

Model/task request:
- Not model-driven at runtime. Add-ons are explicit local JavaScript/CSS files with metadata and lifecycle methods.

Tool invocation/result:
- Local plugins can use exposed BetterCodex/BdApi-style APIs for DOM, data, plugin/theme access, and UI insertion.
- Themes inject CSS and custom properties through the theme manager.
- Hosted catalog fetch returns addon metadata and download URLs.

Approval request/decision:
- Normal install is reversible and operates on generated `/Applications/BetterCodex.app`.
- Direct official app patch requires `--unsafe-patch-official-app`.

Event feed:
- Folder changes trigger addon list refresh and plugin/theme start/stop reconciliation.
- Navigation changes close BetterCodex only when the user actually leaves through native route/sidebar selection.

Sidecar lifecycle:
- No background repair agent for the sibling-app flow.
- Old official-app repair agent path remains only for unsafe legacy mode.

Observation contracts:
- `status --app /Applications/Codex.app`: loader `no`, integrity `yes`, codesign `yes`.
- `status --app /Applications/BetterCodex.app`: loader `yes`, integrity `yes`, codesign `yes`.
- Process list for BetterCodex launch must include `/Applications/BetterCodex.app` and `--user-data-dir=/Users/advaitpaliwal/Library/Application Support/BetterCodex`.

Secrets/config names:
- `BETTERCODEX_CATALOG_ENDPOINT` can override the hosted API at install/runtime generation when wired through constants.
- No local secret is needed for browsing/installing public catalog content.
