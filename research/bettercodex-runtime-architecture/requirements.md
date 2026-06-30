# Requirements

Goal:
Ship BetterCodex as the Codex equivalent of a BetterDiscord community layer: users can run a local modified Codex experience with community plugins/themes, while Companion hosts the public marketplace website/API.

Product shape:
- Desktop app: `/Applications/BetterCodex.app`.
- Official source app: `/Applications/Codex.app`, kept vendor-signed and unmodified.
- In-Codex top-level add-on tabs: `Plugins` and `Themes`.
- Marketplace discovery lives under each tab when present, with installed local items under `Installed`.
- Hosted marketplace is Companion infrastructure, not something each user runs locally.
- Skills are plugin content when relevant, not a third top-level category.

Non-goals:
- Do not directly patch the official Codex app for normal installs.
- Do not expose `Store` as the product name.
- Do not ship starter desktop plugins just to fill the page.
- Do not keep the generated installed app named `Codex-BetterCodex.app`.

Naming constraints:
- Visible app bundle: `BetterCodex.app`.
- Bundle id: `com.openai.codex.bettercodex`.
- User data profile: `~/Library/Application Support/BetterCodex`.
- Addon home: `~/.codex/bettercodex`.

Inputs:
- Official Codex app bundle.
- BetterCodex desktop loader/runtime files.
- Hosted catalog endpoint.
- Local plugin/theme folders.

Outputs:
- Installed sibling app that opens as BetterCodex.
- Clean official Codex app with working updater path.
- Research and status docs with source-backed decision chain.
- Pushed GitHub state.

Acceptance criteria:
- `npm run desktop -- install --launch=false` creates `/Applications/BetterCodex.app`.
- Status for `/Applications/Codex.app` reports loader `no`, ASAR integrity `yes`, codesign `yes`.
- Status for `/Applications/BetterCodex.app` reports loader `yes`, ASAR integrity `yes`, codesign `yes`.
- BetterCodex opens under Codex `MAIN`; right side panel toggles do not redirect it; native route clicks leave it.
- Tests and checks pass.
- Commit and push succeed.

Approval boundaries:
- Removing the old generated `/Applications/Codex-BetterCodex.app` is in scope because it is a stale BetterCodex-generated artifact and conflicts with the requested name.
- Removing or modifying `/Applications/Codex.app` is out of scope except read-only status/codesign checks.
