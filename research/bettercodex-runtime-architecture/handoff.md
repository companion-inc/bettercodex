# Handoff

Read first:
- `STATUS.md`
- `why-chains.md`
- `architecture.md`
- `apps/desktop/src/bundler.js`
- `apps/desktop/src/runtimeFiles.js`

Confidence:
99/100 after local app rebuild, smoke, tests, and checks. Architecture decision and local runtime behavior are settled; push and CI remain.

Done:
- Read BetterDiscord source for installer, preload, plugin manager, and theme manager.
- Read codex-app-modifier skill source for Codex app modification workflow.
- Verified clean official Codex app before current rename.
- Renamed generated install target/profile in code to `BetterCodex.app` and `Application Support/BetterCodex`.
- Added tests for the naming contract.
- Installed `/Applications/BetterCodex.app`.
- Removed stale generated `/Applications/Codex-BetterCodex.app`.
- Verified official Codex stayed clean after install.
- Verified BetterCodex loader, profile, and installed-app CDP behavior.
- `npm test`, `npm run check`, and `git diff --check` passed.

Not done:
- Commit/push/watch CI.

Do next:
1. Run `npm run desktop -- install --launch=false`.
2. Verify official Codex is still clean.
3. Verify `/Applications/BetterCodex.app` has loader `yes`.
4. Launch BetterCodex with CDP and smoke the Plugins page/right sidebar behavior.
5. Run tests/checks.
6. Commit and push.

Do not repeat:
- Do not patch `/Applications/Codex.app` without `--unsafe-patch-official-app`.
- Do not call the desktop page `Store`.
- Do not add starter desktop plugins just to make the page look populated.
- Do not treat skills as a third top-level tab.

Commands:
- `node apps/desktop/bin/bettercodex.js status --app /Applications/Codex.app`
- `node apps/desktop/bin/bettercodex.js status --app /Applications/BetterCodex.app`
- `npm run desktop -- install --launch=false`
- `npm test`
- `npm run check`

Blockers:
None known.
