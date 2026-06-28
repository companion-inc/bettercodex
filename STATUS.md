# BetterCodex Status

## Architecture

BetterCodex is organized as a single repo with separate runtimes.

- `apps/desktop`: user-installed Codex patcher and in-Codex Store panel using Codex token styling.
- `apps/web`: hosted public site built with Next.js App Router and shadcn/ui, exported as Worker static assets.
- `apps/api`: hosted Store API.
- `packages/catalog`: shared schema and sample catalog.
- `packages/addons`: example addons and author fixtures.
- `plugins/bettercodex-community`: Codex-native skills for addon authors.
- Hosted Store: `https://bettercodex-web.companion-inc.workers.dev`.

The product vocabulary is:

- In-app surface: Store.
- Hosted surface: web/API.
- Generic description: community catalog.

## Verification

Last local verification:

```bash
npm run check
npm test
npm audit
python3 /Users/advaitpaliwal/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/bettercodex-community
npm run web:dry-run
npm run web:build
npm run desktop:status
npm run desktop -- bundle --name Smoke --destination /tmp/Codex-BetterCodex-Monorepo-Smoke.app --replace
npm run desktop -- status --app /tmp/Codex-BetterCodex-Monorepo-Smoke.app
Playwright screenshot/browser assertions against http://localhost:8787
curl -fsS https://bettercodex-web.companion-inc.workers.dev/api/addons
```

Results:

- Syntax and web typecheck passed.
- Test suite passed: 17 tests.
- npm audit passed: 0 vulnerabilities.
- Codex-native skill pack validation passed.
- Next.js/shadcn web build passed and exported static assets to `apps/web/out`.
- Cloudflare Worker/static-assets dry-run passed.
- Playwright captured desktop/mobile renders and browser assertions passed: hosted API schema `1`, seed cards rendered, tabs/search worked, no console errors, no horizontal overflow.
- Cloudflare Worker deployed: `https://bettercodex-web.companion-inc.workers.dev`.
- Hosted API responded with schema version `1` and seed addons `hello-codex,focus-contrast`.
- Official `/Applications/Codex.app` stayed unmodified: loader `no`, ASAR integrity `yes`, codesign `yes`.
- Disposable `/tmp/Codex-BetterCodex-Monorepo-Smoke.app` patched successfully: loader `yes`, ASAR integrity `yes`, codesign `yes`.
- Smoke runtime config points at `https://bettercodex-web.companion-inc.workers.dev/api/addons`.
