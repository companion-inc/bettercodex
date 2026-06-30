# Verification Matrix

| Claim | Deterministic check | Live smoke check | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Official Codex remains updater-safe | `node apps/desktop/bin/bettercodex.js status --app /Applications/Codex.app`; `codesign -dv --verbose=4 /Applications/Codex.app` | None needed | Loader no, integrity yes, codesign yes, TeamIdentifier `2DC432GLL2` | Passed before and after install | Re-run after future upstream updates |
| BetterCodex installs as `BetterCodex.app` | `npm run desktop -- install --launch=false`; status on `/Applications/BetterCodex.app` | Launch with CDP port | Destination `/Applications/BetterCodex.app`, bundle id `com.openai.codex.bettercodex`, user-data-dir `Application Support/BetterCodex` | Passed | None |
| Old `Codex-BetterCodex.app` name is gone from user-facing install path | `rg -n "Codex-BetterCodex" README.md AGENTS.md apps test` | Finder/app path check | Active docs/help/code use `BetterCodex.app`; stale generated app removed | Passed | Historical notes may mention old name as obsolete evidence |
| BetterCodex UI stays mounted on right-panel toggle | CDP DOM check against running BetterCodex | Click right side panel button | BetterCodex remains open/active; no toolbar overlap | Passed on installed app | Re-run after future Codex upgrades |
| Tests pass | `npm test`; `npm run check`; `git diff --check` | None | 22 tests passed; check passed; diff check passed | Passed | None |
| Push is durable | `git status`, `git commit`, `git push`, `gh run list/watch` | GitHub checks | Commit hash and push result | Pending | Run last |
