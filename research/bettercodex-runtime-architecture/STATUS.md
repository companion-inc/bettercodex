# Status

Confidence: 99/100 after local app rebuild, CDP smoke, tests, and checks. Remaining confidence gap is push and CI.

Objective:
Make BetterCodex a BetterDiscord-style community plugin/theme layer for Codex while preserving Codex Desktop updates. The runtime must install as `/Applications/BetterCodex.app`, not `Codex-BetterCodex.app`, and the official `/Applications/Codex.app` must stay vendor-signed and unmodified.

Known facts:
- BetterDiscord directly mutates Discord's installed `discord_desktop_core` bootstrap in `scripts/inject.ts`, then uses preload/renderer hooks, `BdApi`, plugin manager, and theme manager to run local `.plugin.js` and `.theme.css` addons.
- The `codex-app-modifier` skill says never to modify the original Codex app for normal work; create a sibling app, edit a temp-extracted ASAR, repack/sign it, launch it, and verify the actual process and `--user-data-dir`.
- BetterCodex already has the right product split: desktop plugin/theme loader, hosted web/API marketplace, and Codex-native skill pack.
- Local inspection showed official `/Applications/Codex.app` is clean: build `4559`, TeamIdentifier `2DC432GLL2`, loader `no`, ASAR integrity `yes`, codesign `yes`.
- Old generated `/Applications/Codex-BetterCodex.app` exists and works, but the requested installed app name is `/Applications/BetterCodex.app`.

Open questions:
- None on architecture. Remaining work is push and CI.

Next action:
- Stage, commit, push, and watch GitHub checks.

Verification log:
- BetterDiscord source cloned at commit `943944b7431ed4acccf528454666233f1084537c`.
- zats skills source cloned at commit `4296dd6c4ad18ae64fa6ee043c13c4f0be3524d8`.
- Official app status command showed loader `no`, repair agent `no`, ASAR integrity `yes`, codesign `yes`.
- Official codesign showed TeamIdentifier `2DC432GLL2`.
- `npm run desktop -- install --launch=false` created `/Applications/BetterCodex.app` with bundle id `com.openai.codex.bettercodex` and user data `/Users/advaitpaliwal/Library/Application Support/BetterCodex`.
- Removed stale generated `/Applications/Codex-BetterCodex.app`.
- Post-install official status stayed clean: loader `no`, ASAR integrity `yes`, codesign `yes`.
- Post-install BetterCodex status passed: loader `yes`, ASAR integrity `yes`, codesign `yes`.
- Running process command line: `/Applications/BetterCodex.app/Contents/MacOS/Codex-bin --user-data-dir=/Users/advaitpaliwal/Library/Application Support/BetterCodex --remote-debugging-port=9266`.
- CDP smoke passed: `window.BetterCodex` and `window.BdApi` exist; `#bettercodex-root` mounted; panel opened on Plugins; tabs are exactly `Plugins` and `Themes`; empty state says `No plugins installed`; hidden host visible count is `0`; native `Plugins Skills` toolbar did not bleed through.
- Right side panel toggle kept BetterCodex mounted and active.
- Native Plugins click closed BetterCodex and cleared the active state.
- `npm test` passed: 22 tests.
- `npm run check` passed: syntax/runtime file check and web typecheck.
- `git diff --check` passed.

Mutation log:
- Changed `apps/desktop/src/bundler.js` default destination/profile naming to `BetterCodex.app` and `Application Support/BetterCodex`.
- Added tests locking the new app/profile names.
- Updated CLI help, README, and project AGENTS guidance to the new app name.
- Added `.gitignore` rules so cloned reference repos stay local while research notes can be committed.
