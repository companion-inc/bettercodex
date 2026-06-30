# Why-Chains

## BetterDiscord Way Or Codex-App-Modifier Way

Question:
Which mechanism should BetterCodex use to survive Codex updates and still feel like a BetterDiscord-style community layer?

Evidence:
- BetterDiscord `scripts/inject.ts` writes into Discord's installed `discord_desktop_core` bootstrap.
- BetterDiscord preload/runtime source hooks Discord/Electron/webpack internals and then exposes plugin/theme APIs.
- `codex-app-modifier/SKILL.md` says the Codex-safe path is a sibling app, temp ASAR extraction, repack/sign, wrapper with separate `--user-data-dir`, and launch/process verification.
- Local official Codex status proves the clean app is vendor-signed by OpenAI and unpatched.

Mechanism:
BetterDiscord works because Discord's update/install shape tolerates a direct bootstrap injection. Codex Desktop uses a signed app bundle with an updater path that failed after ad-hoc official-app mutation. A sibling app keeps Codex's signed updater path intact while still giving BetterCodex its own patched runtime.

Rejected alternatives:
- Patch `/Applications/Codex.app` by default: breaks the vendor signature/update path.
- Only build a website/plugin marketplace: does not create the in-Codex plugins/themes page or local runtime.
- Copy BetterDiscord's webpack hook shape wholesale: Codex internals differ and the existing measured Codex `MAIN` page surface is safer.

Decision:
Use BetterDiscord as the product model for plugins, themes, local addon lifecycle, API expectations, and marketplace shape. Use the codex-app-modifier sibling-app method as the install/update mechanism. The generated app name is `/Applications/BetterCodex.app` by explicit product requirement.

Verification:
Run official app status/codesign, install BetterCodex sibling, run BetterCodex status/codesign, CDP smoke the page surface, run tests/checks.

Remaining risk:
Codex DOM internals can change across upstream releases. The update procedure must rebuild BetterCodex from the latest official app and rerun the CDP smoke.

## Why The Updater Failed

Question:
Why did the official updater show an error after earlier BetterCodex work?

Evidence:
- Local status/codesign showed direct official-app patching changes the app bundle to an ad-hoc signed state.
- The restored official app reports OpenAI TeamIdentifier `2DC432GLL2`, loader `no`, integrity `yes`, and codesign `yes`.

Mechanism:
Sparkle-style desktop updaters validate and replace vendor-signed app bundles. Directly modifying `app.asar` and re-signing the official app ad hoc invalidates the vendor update assumption.

Rejected alternatives:
- Keep repairing the official app after updates: fights the updater and repeats the breakage.
- Rename the patched official app in place: still mutates the vendor bundle.

Decision:
Official app remains clean. BetterCodex lives in a sibling app and can be refreshed from the latest official app after each upstream update.

Verification:
Official app status before/after install must keep loader `no`, repair agent `no`, integrity `yes`, codesign `yes`.
