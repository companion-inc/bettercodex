# BetterCodex Status

## Architecture

BetterCodex is organized as a single repo with separate runtimes.

- `apps/desktop`: update-safe sibling BetterCodex app bundler and in-Codex Plugins/Themes UI using Codex token styling.
- `apps/web`: hosted public marketplace site built with Vite, React, and shadcn/ui.
- `apps/api`: hosted marketplace API.
- `packages/catalog`: shared schema and sample catalog.
- `packages/addons`: example addons and author fixtures.
- `plugins/bettercodex-community`: Codex-native skills for addon authors.
- Hosted marketplace: `https://bettercodex-web.companion-inc.workers.dev`.

The product vocabulary is:

- In-app surfaces: Plugins and Themes.
- In-app sections inside each surface: Installed and Marketplace.
- Hosted surface: web/API for the shared Marketplace catalog.
- Generic description: community marketplace/catalog.
- Skills are creator tooling or content inside Codex-native plugin bundles, not a third BetterCodex desktop marketplace type.

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
node apps/desktop/bin/bettercodex.js install --launch=false
node apps/desktop/bin/bettercodex.js status
node apps/desktop/bin/bettercodex.js status --app /Applications/BetterCodex.app
curl -fsS https://bettercodex-web.companion-inc.workers.dev/api/addons
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex E2E" --destination /tmp/Codex-BetterCodex-E2E.app --home /tmp/bettercodex-e2e-home --replace
codesign --verify --deep --strict --verbose=2 /tmp/Codex-BetterCodex-E2E.app
agent-browser CDP smoke against /tmp/Codex-BetterCodex-E2E.app on port 9242
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex Installed Only" --destination /tmp/Codex-BetterCodex-InstalledOnly.app --home /tmp/bettercodex-installed-only-home --replace
codesign --verify --deep --strict --verbose=2 /tmp/Codex-BetterCodex-InstalledOnly.app
agent-browser CDP installed-only smoke against /tmp/Codex-BetterCodex-InstalledOnly.app on port 9244
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex No Plugins" --destination /tmp/Codex-BetterCodex-NoPlugins.app --home /tmp/bettercodex-no-plugins-home --replace
agent-browser CDP no-plugin/right-sidebar smoke against /tmp/Codex-BetterCodex-NoPlugins.app on port 9252
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex Nav Close 2" --destination /tmp/Codex-BetterCodex-NavClose2.app --home /tmp/bettercodex-nav-close2-home --replace
agent-browser CDP right-sidebar/chat-navigation smoke against /tmp/Codex-BetterCodex-NavClose2.app on port 9254
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex UI Native" --destination /tmp/Codex-BetterCodex-UINative.app --home /tmp/bettercodex-ui-native-home --replace
agent-browser CDP native-plugin-page and BetterCodex UI comparison against /tmp/Codex-BetterCodex-UINative.app on ports 9255/9256
node apps/desktop/bin/bettercodex.js bundle --name "BetterCodex Surface" --destination /tmp/Codex-BetterCodex-Surface.app --home /tmp/bettercodex-surface-home --replace
agent-browser CDP page-surface open/close/right-sidebar smoke against /tmp/Codex-BetterCodex-Surface.app on port 9262
```

Results:

- Syntax and web typecheck passed.
- Test suite passed: 20 tests.
- npm audit passed: 0 vulnerabilities.
- Codex-native skill pack validation passed.
- Vite/React/shadcn web build passed and exported static assets to ignored `apps/web/out`.
- Cloudflare Worker/static-assets dry-run passed with Wrangler 4.105.0.
- Cloudflare Worker deployed: `https://bettercodex-web.companion-inc.workers.dev`, version `828b0178-d248-4471-8b70-ac5edba01028`.
- Disposable `/tmp/Codex-BetterCodex-RuntimeSmoke.app` patched successfully and passed codesign verification.
- CDP rendered BetterCodex inside the disposable Codex app: top tabs are only `Plugins` and `Themes`; Plugins shows installed plugins; Themes shows installed themes; in-app catalog/install cards and command-copy actions are absent.
- Installed add-ons render as native-style compact cards in the installed section, with an icon-only folder action and an enable/disable switch; search filters installed files; native Codex sidebar navigation closes the BetterCodex page and clears the BetterCodex active state.
- Installed-only CDP smoke passed in `/tmp/Codex-BetterCodex-InstalledOnly.app`: seeded local plugin/theme files; Plugins showed installed plugin cards and `Open Plugin Folder`; Themes showed `Focus Contrast` and `Open Theme Folder`; `Community plugins`, `Community themes`, copy-command text, and `[data-install]` controls were absent; enabling a plugin flipped the switch and rendered plugin UI; native Codex `Plugins` navigation closed BetterCodex.
- Installed-only evidence: `output/codex-ui-research/bettercodex-installed-only-assertions.json`, `output/codex-ui-research/bettercodex-installed-only-enable.json`, `output/codex-ui-research/bettercodex-installed-only-themes.json`, `output/codex-ui-research/bettercodex-installed-only-clickout.json`, and screenshots with the same prefix.
- Visual-fix CDP smoke passed in `/tmp/Codex-BetterCodex-VisualFix.app`: Plugins and Themes both render one compact installed card, no status pill, no catalog/install controls, icon-only folder actions with accessible folder labels, and the plugin switch still starts the local plugin.
- Visual-fix evidence: `output/codex-ui-research/bettercodex-visual-fix-assertions.json`, `output/codex-ui-research/bettercodex-visual-fix-themes.json`, `output/codex-ui-research/bettercodex-visual-fix-enable.json`, and screenshots with the same prefix.
- Starter desktop plugins were removed after review. Local BetterCodex profile has zero installed plugins; the Plugins page should render the empty installed state until the user adds their own `.plugin.js` file.
- Plugin reload now stops running plugin instances whose files have been removed from the local plugin folder, so deleting a plugin file actually removes its live UI after the installed list refreshes.
- Update survival is handled by not mutating `/Applications/Codex.app` in normal installs. `npm run desktop -- install` creates or refreshes `/Applications/BetterCodex.app`; direct official-app patching is gated behind `--unsafe-patch-official-app`.
- BetterCodex no longer closes on Codex host history changes; right-side panel open/close should keep BetterCodex mounted like the native Plugins page. Leaving BetterCodex is handled by actual left-sidebar route clicks.
- Left-sidebar chat/thread navigation now closes BetterCodex; native right-side panel toggles still keep BetterCodex mounted.
- No-plugin/right-sidebar CDP smoke passed in `/tmp/Codex-BetterCodex-NoPlugins.app`: Plugins showed `0 installed` and the empty plugin state; toggling the native right side panel open and closed left BetterCodex mounted on the Plugins page. Screenshot evidence: `output/codex-ui-research/bettercodex-no-plugins-right-sidebar.png`.
- Right-sidebar/chat-navigation CDP smoke passed in `/tmp/Codex-BetterCodex-NavClose2.app`: BetterCodex opened with `0 installed`, toggling the native `Toggle side panel` button left BetterCodex mounted, and clicking the left-sidebar chat row `Automate PR creation for companion` closed BetterCodex and cleared its active sidebar state.
- Native Codex Plugins page was measured through the running renderer: content column `728px` inside `768px` shell, header type `28px/33.6px`, search `728x32`, tabs/buttons `28px` high, installed icons `44x44`, and marketplace grid columns `350px 350px`. Source screenshot: `output/codex-ui-research/native-codex-plugins.png`.
- BetterCodex UI-native CDP smoke passed in `/tmp/Codex-BetterCodex-UINative.app`: the toolbar paints over the underlying Codex route, only `Plugins` and `Themes` are visible, only the BetterCodex sidebar row is active while open, zero-plugin empty state is a compact `44px` row, installed plugin cards render as `350x64` native-density rows, visible filenames are removed, right-side panel toggles keep BetterCodex open, and clicking native `Plugins` closes BetterCodex and restores native route state.
- BetterCodex UI-native evidence: `output/codex-ui-research/bettercodex-native-zero-after.png` and `output/codex-ui-research/bettercodex-native-installed-after2.png`.
- BetterCodex page-surface CDP smoke passed in `/tmp/Codex-BetterCodex-Surface.app`: BetterCodex mounts as a flex child of the live `MAIN` page surface, hides all native host-route children while open, restores those host children on close, keeps the native right-side panel toggle from closing or redirecting BetterCodex, and repeated BetterCodex -> native Plugins navigation restored the native Plugins active state three times with no `Plugins Skills` toolbar bleed-through. Evidence screenshot: `output/codex-ui-research/bettercodex-page-surface-open.png`.
- Hosted API responded with schema version `1` and addons from the `companion-inc/bettercodex-plugins` registry.
- Community registry `companion-inc/bettercodex-plugins` includes starter Codex workflow skills and the `Focus Contrast` theme; it has zero desktop plugin packages.
- Clean installed-flow E2E passed in `/tmp/Codex-BetterCodex-E2E.app` with fresh home `/tmp/bettercodex-e2e-home`: BetterCodex opened inside Codex, loaded local add-ons from the installed folders, applied theme CSS through `BdApi.DOM`, and refreshed installed sections immediately.
- E2E evidence: `output/codex-ui-research/bettercodex-e2e-report.json` and `output/codex-ui-research/bettercodex-e2e-installed-theme.png`.
- BetterDiscord reference re-check used upstream commit `943944b`: current source still uses the injector/preload/renderer split, local plugin/theme folders, `BdApi` Addon/Data APIs, addon-store download-to-folder flow, and plugin/theme start/stop managers.
- Official `/Applications/Codex.app` was restored from the official OpenAI DMG after updater failure from ad-hoc signing: version `26.623.70822`, build `4559`, TeamIdentifier `2DC432GLL2`, loader `no`, repair agent `no`, ASAR integrity `yes`, codesign `yes`.
- The old ad-hoc patched official app bundle is preserved at `/Applications/Codex.app.bettercodex-adhoc-20260629184211`.
- `/Applications/BetterCodex.app` is the intended BetterCodex runtime path. The previous generated `/Applications/Codex-BetterCodex.app` name is obsolete.
- Installed BetterCodex sibling-app CDP smoke passed on port `9264`: BetterCodex nav item exists, the panel opens under `MAIN`, native host children are hidden with zero visible hidden nodes, and the native `Plugins Skills` toolbar does not bleed through.
- Installed app rename verification passed: `npm run desktop -- install --launch=false` created `/Applications/BetterCodex.app` with bundle id `com.openai.codex.bettercodex` and user data `/Users/advaitpaliwal/Library/Application Support/BetterCodex`; the stale generated `/Applications/Codex-BetterCodex.app` sibling was removed.
- Official `/Applications/Codex.app` remained clean after the BetterCodex install: loader `no`, repair agent `no`, ASAR integrity `yes`, codesign `yes`, TeamIdentifier `2DC432GLL2`.
- `/Applications/BetterCodex.app` status passed: loader `yes`, repair agent `no`, ASAR integrity `yes`, codesign `yes`.
- Installed BetterCodex CDP smoke passed on port `9266`: process path is `/Applications/BetterCodex.app/Contents/MacOS/Codex-bin`, user data is `Application Support/BetterCodex`, `window.BetterCodex` and `window.BdApi` exist, BetterCodex opens under `MAIN` with only `Plugins` and `Themes`, the no-plugin empty state renders, right-side panel toggles keep BetterCodex mounted, and native Plugins navigation closes BetterCodex.
- Current local checks passed after the installed-app rename: `npm test` (22 tests), `npm run check`, and `git diff --check`.
- Commit `09da24d` was pushed to `companion-inc/bettercodex` `main`, and GitHub Actions run `28417317492` passed.
- BetterCodex now generates its own app icon during bundling: `CFBundleIconFile` is `bettercodex.icns`, the installed icon file exists at `/Applications/BetterCodex.app/Contents/Resources/bettercodex.icns`, and Quick Look rendered the preview with a teal-tinted Codex base plus a large plugin-grid accessory badge.

Current marketplace architecture update:

- Desktop Plugins/Themes pages now render both `Installed` and `Marketplace` sections under the active top-level tab; there is no top-level Store or Skills tab.
- Marketplace entries are filtered to desktop runtime types (`plugin` and `theme`) at the hosted API, web client, and desktop client, then install through the existing raw-GitHub download path into `~/.codex/bettercodex/plugins` or `~/.codex/bettercodex/themes`.
- The public website and shared catalog schema no longer expose standalone `skill` as a marketplace addon type.
- The creator skill now describes Codex skills as content packaged through Codex-native plugin bundles, while plugins/themes remain the desktop marketplace submission types.
- Submission issues default to `companion-inc/bettercodex-plugins`, matching the registry that serves `catalog.json`.
- Current checks passed after the marketplace architecture update: `npm test` (25 tests), `npm run check`, `git diff --check`, `npm run web:dry-run`, and `npm run web:deploy`.
- Cloudflare Worker/static site deployed to `https://bettercodex-web.companion-inc.workers.dev`, version `f7f89338-83eb-401d-be4f-73a5ccba1284`; live `/api/addons` returned one theme, `Focus Contrast`, and `hasSkill: false`.
- `/Applications/BetterCodex.app` was refreshed with `npm run desktop -- install --launch=false`; bundle id remains `com.openai.codex.bettercodex`.
- Disposable CDP smoke against `/tmp/Codex-BetterCodex-MarketplaceSmoke.app` verified top-level tabs `Plugins`/`Themes`, no `Skills`/`Store` text inside BetterCodex, Marketplace under both active surfaces, `Focus Contrast` install from Themes Marketplace, and local file write to `/tmp/bettercodex-marketplace-smoke-home/themes/focus-contrast.theme.css`.
