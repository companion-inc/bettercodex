# Architecture

System shape:
BetterCodex has three surfaces:

1. `apps/desktop`: local sibling Electron app builder and runtime injection layer.
2. `apps/web` plus `apps/api`: hosted public marketplace site/API on Cloudflare.
3. `plugins/bettercodex-community`: Codex-native skill pack for addon authors and installers.

The desktop surface is intentionally local-first for runtime execution. The marketplace is hosted by Companion.

Runtime boundaries:
- `/Applications/Codex.app` is a clean vendor app and source bundle.
- `/Applications/BetterCodex.app` is a copied, patched, ad-hoc-signed sibling app.
- The sibling app launch wrapper passes `--user-data-dir="$HOME/Library/Application Support/BetterCodex"` so Chromium state is separate before app JavaScript runs.
- BetterCodex runtime files live outside the app under `~/.codex/bettercodex`.
- Plugins and themes execute in the BetterCodex renderer through the local addon manager/API.

Storage/config/secrets:
- `~/.codex/bettercodex/plugins`: local `.plugin.js` files.
- `~/.codex/bettercodex/themes`: local `.theme.css` files.
- `~/.codex/bettercodex/settings.json`: local enabled/disabled state and runtime settings.
- Hosted catalog endpoint defaults to `https://bettercodex-web.companion-inc.workers.dev/api/addons`.
- No marketplace secrets are required for local plugin/theme execution.

Event flow:
- CLI copies official Codex to `BetterCodex.app`, patches packed ASAR through installer/runtime files, rewrites plist name/id, installs launcher wrapper, signs/verifies.
- User launches BetterCodex.
- Runtime adds a BetterCodex sidebar entry and mounts a page surface inside Codex `MAIN`.
- Plugins/Themes tabs read local folders, render installed items, and start/stop enabled add-ons.
- Hosted marketplace data is fetched only for discovery/download flows.

Tool routing:
- Desktop local flow uses `apps/desktop/bin/bettercodex.js`.
- Web/API flow uses `npm run web:*` and Cloudflare Wrangler.
- Codex-native install/create helper flow uses the `bettercodex-community` plugin skills.

Failure modes:
- Official app patched directly: vendor signature breaks and Sparkle updater can fail. Default install avoids this.
- App renamed only in plist but not wrapper profile: Chromium uses the wrong profile. The bundler now locks `Application Support/BetterCodex`.
- BetterDiscord webpack hooks copied directly: fragile because Codex internals differ. BetterCodex uses measured Codex DOM/page integration instead.
- Marketplace embedded as local-only UI: wrong boundary. The hosted site/API is Companion-owned infrastructure.
