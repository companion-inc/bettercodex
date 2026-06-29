# BetterCodex Status

## Architecture

BetterCodex is organized as a single repo with separate runtimes.

- `apps/desktop`: user-installed Codex patcher and in-Codex Plugins/Themes UI using Codex token styling.
- `apps/web`: hosted public marketplace site built with Vite, React, and shadcn/ui.
- `apps/api`: hosted marketplace API.
- `packages/catalog`: shared schema and sample catalog.
- `packages/addons`: example addons and author fixtures.
- `plugins/bettercodex-community`: Codex-native skills for addon authors.
- Hosted marketplace: `https://bettercodex-web.companion-inc.workers.dev`.

The product vocabulary is:

- In-app surfaces: Plugins and Themes.
- Hosted surface: web/API.
- Generic description: community marketplace/catalog.

## Verification

Last local verification:

```bash
npm run check
npm test
npm audit
python3 /Users/advaitpaliwal/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/bettercodex-community
npm run web:build
npm run web:dry-run
npm run web:deploy
node apps/desktop/bin/bettercodex.js bundle --name "Runtime Smoke" --destination /tmp/Codex-BetterCodex-RuntimeSmoke.app --replace
codesign --verify --deep --strict --verbose=2 /tmp/Codex-BetterCodex-RuntimeSmoke.app
CDP screenshot/browser assertions against /tmp/Codex-BetterCodex-RuntimeSmoke.app
node apps/desktop/bin/bettercodex.js install --no-restart
node apps/desktop/bin/bettercodex.js status
curl -fsS https://bettercodex-web.companion-inc.workers.dev/api/addons
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex E2E" --destination /tmp/Codex-BetterCodex-E2E.app --home /tmp/bettercodex-e2e-home --replace
codesign --verify --deep --strict --verbose=2 /tmp/Codex-BetterCodex-E2E.app
agent-browser CDP smoke against /tmp/Codex-BetterCodex-E2E.app on port 9242
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex Installed Only" --destination /tmp/Codex-BetterCodex-InstalledOnly.app --home /tmp/bettercodex-installed-only-home --replace
codesign --verify --deep --strict --verbose=2 /tmp/Codex-BetterCodex-InstalledOnly.app
agent-browser CDP installed-only smoke against /tmp/Codex-BetterCodex-InstalledOnly.app on port 9244
```

Results:

- Syntax and web typecheck passed.
- Test suite passed: 17 tests.
- npm audit passed: 0 vulnerabilities.
- Codex-native skill pack validation passed.
- Vite/React/shadcn web build passed and exported static assets to ignored `apps/web/out`.
- Cloudflare Worker/static-assets dry-run passed with Wrangler 4.105.0.
- Cloudflare Worker deployed: `https://bettercodex-web.companion-inc.workers.dev`, version `828b0178-d248-4471-8b70-ac5edba01028`.
- Disposable `/tmp/Codex-BetterCodex-RuntimeSmoke.app` patched successfully and passed codesign verification.
- CDP rendered BetterCodex inside the disposable Codex app: top tabs are only `Plugins` and `Themes`; Plugins shows installed plugins; Themes shows installed themes; in-app catalog/install cards and command-copy actions are absent.
- Installed add-on rows render an `Installed` status and an enable/disable switch; search filters installed files; native Codex sidebar navigation closes the BetterCodex page and clears the BetterCodex active state.
- Installed-only CDP smoke passed in `/tmp/Codex-BetterCodex-InstalledOnly.app`: seeded local `hello-codex.plugin.js` and `focus-contrast.theme.css`; Plugins showed `Hello Codex`, `Installed`, and `Open Plugin Folder`; Themes showed `Focus Contrast`, `Installed`, and `Open Theme Folder`; `Community plugins`, `Community themes`, copy-command text, and `[data-install]` controls were absent; enabling the plugin flipped the switch and rendered the plugin-created button; native Codex `Plugins` navigation closed BetterCodex.
- Installed-only evidence: `output/codex-ui-research/bettercodex-installed-only-assertions.json`, `output/codex-ui-research/bettercodex-installed-only-enable.json`, `output/codex-ui-research/bettercodex-installed-only-themes.json`, `output/codex-ui-research/bettercodex-installed-only-clickout.json`, and screenshots with the same prefix.
- Hosted API responded with schema version `1` and addons `failing-test-first, focus-contrast, hello-codex, pr-ready, repo-warmup, thread-checkpoint`.
- Community registry `companion-inc/bettercodex-plugins` includes starter addon code for `Hello Codex` (`.plugin.js`), `Focus Contrast` (`.theme.css`), and four Codex skills; registry CI passed on commit `64f5bfb`.
- Clean installed-flow E2E passed in `/tmp/Codex-BetterCodex-E2E.app` with fresh home `/tmp/bettercodex-e2e-home`: BetterCodex opened inside Codex, loaded local `Hello Codex` from `plugins/hello-codex.plugin.js`, started immediately, rendered the `BetterCodex` button, persisted `clicks = 1` through `BdApi.Data`, then loaded local `Focus Contrast` from `themes/focus-contrast.theme.css`, applied `--bettercodex-focus-ring`, and refreshed the installed themes section immediately.
- E2E evidence: `output/codex-ui-research/bettercodex-e2e-report.json` and `output/codex-ui-research/bettercodex-e2e-installed-theme.png`.
- BetterDiscord reference re-check used upstream commit `943944b`: current source still uses the injector/preload/renderer split, local plugin/theme folders, `BdApi` Addon/Data APIs, addon-store download-to-folder flow, and plugin/theme start/stop managers.
- Official `/Applications/Codex.app` on disk is patched: loader `yes`, ASAR integrity `yes`, codesign `yes`.
- Official runtime config uses `catalogEndpoint: https://bettercodex-web.companion-inc.workers.dev/api/addons`.
- Current running Codex instances need a restart to load the refreshed runtime.
