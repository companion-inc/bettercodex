# BetterCodex Status

## Architecture

BetterCodex is organized as a single repo with separate runtimes.

- `apps/desktop`: user-installed Codex patcher and in-Codex Store.
- `apps/web`: hosted public site.
- `apps/api`: hosted Store API.
- `packages/catalog`: shared schema and sample catalog.
- `packages/addons`: example addons and author fixtures.
- `plugins/bettercodex-community`: Codex-native skills for addon authors.

The product vocabulary is:

- In-app surface: Store.
- Hosted surface: web/API.
- Generic description: community catalog.

## Verification

Last local verification:

```bash
npm run check
npm test
python3 /Users/advaitpaliwal/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/bettercodex-community
npm run web:dry-run
npm run desktop:status
npm run desktop -- bundle --name Smoke --destination /tmp/Codex-BetterCodex-Monorepo-Smoke.app --replace --store https://bettercodex.companion.ai/api/addons
npm run desktop -- status --app /tmp/Codex-BetterCodex-Monorepo-Smoke.app
```

Results:

- Syntax check passed.
- Test suite passed: 16 tests.
- Codex-native skill pack validation passed.
- Cloudflare Worker/static-assets dry-run passed.
- Official `/Applications/Codex.app` stayed unmodified: loader `no`, ASAR integrity `yes`, codesign `yes`.
- Disposable `/tmp/Codex-BetterCodex-Monorepo-Smoke.app` patched successfully: loader `yes`, ASAR integrity `yes`, codesign `yes`.
