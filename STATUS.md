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
- CDP rendered BetterCodex inside the disposable Codex app: top tabs are only `Plugins` and `Themes`; Plugins shows `Community plugins` and `Installed plugins`; Themes shows `Community themes` and `Installed themes`; the old extra catalog tab and command-copy action are absent.
- Starter skill cards render as disabled `Installed` status buttons; search filters to `Repo Warmup`; native Codex `Plugins` navigation closes the BetterCodex panel and clears the BetterCodex active state.
- Hosted API responded with schema version `1` and addons `failing-test-first, focus-contrast, hello-codex, pr-ready, repo-warmup, thread-checkpoint`.
- Community registry `companion-inc/bettercodex-plugins` includes starter addon code for `Hello Codex` (`.plugin.js`), `Focus Contrast` (`.theme.css`), and four Codex skills; registry CI passed on commit `64f5bfb`.
- Clean installed-flow E2E passed in `/tmp/Codex-BetterCodex-E2E.app` with fresh home `/tmp/bettercodex-e2e-home`: BetterCodex opened inside Codex, `Hello Codex` installed from the hosted catalog, wrote `plugins/hello-codex.plugin.js`, started immediately, rendered the `BetterCodex` button, persisted `clicks = 1` through `BdApi.Data`, then `Focus Contrast` installed, wrote `themes/focus-contrast.theme.css`, applied `--bettercodex-focus-ring`, and refreshed the `Installed themes` section immediately.
- E2E evidence: `output/codex-ui-research/bettercodex-e2e-report.json` and `output/codex-ui-research/bettercodex-e2e-installed-theme.png`.
- BetterDiscord reference re-check used upstream commit `943944b`: current source still uses the injector/preload/renderer split, local plugin/theme folders, `BdApi` Addon/Data APIs, addon-store download-to-folder flow, and plugin/theme start/stop managers.
- Official `/Applications/Codex.app` on disk is patched: loader `yes`, ASAR integrity `yes`, codesign `yes`.
- Official runtime config uses `catalogEndpoint: https://bettercodex-web.companion-inc.workers.dev/api/addons`.
- Current running Codex instances need a restart to load the refreshed runtime.
