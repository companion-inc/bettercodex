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
- Hosted API responded with schema version `1` and skill addons `failing-test-first, pr-ready, repo-warmup, thread-checkpoint`.
- Official `/Applications/Codex.app` on disk is patched: loader `yes`, ASAR integrity `yes`, codesign `yes`.
- Official runtime config uses `catalogEndpoint: https://bettercodex-web.companion-inc.workers.dev/api/addons`.
- Current running Codex instances need a restart to load the refreshed runtime.
