# AGENTS.md

## Codex Desktop Source Of Truth

- For any BetterCodex UI or Codex-host integration work, start from the installed Codex Desktop app: unpack `/Applications/Codex.app/Contents/Resources/app.asar` for shipped strings/code, and use a separate CDP-connected Codex instance to capture DOM roles, classes, computed styles, spacing, and interaction behavior before editing the matching surface.
- Derive selectors, layout, copy, and interaction boundaries from those source measurements, then record the evidence in `STATUS.md` when shipping the change.
- Treat `/Applications/Codex.app` as the vendor-signed source app. Read or restore it for evidence, then ship BetterCodex mutations through `npm run desktop -- install` or `npm run desktop -- bundle` so the changed runtime lives in `/Applications/BetterCodex.app` or a disposable sibling bundle.
- Patch the official Codex bundle only for an explicitly requested local experiment using `--unsafe-patch-official-app`, and report that this breaks the vendor signature/update path.
- For BetterCodex app icon changes, verify the installed sibling app's visible icon path: `CFBundleIconFile`, legacy `icon.icns`/`electron.icns`/`app.icns`, app-level icon PNGs, Launch Services registration, Dock/cache refresh, and a relaunched `/Applications/BetterCodex.app`.

## Product Vocabulary

- Keep the visible add-on model to two top-level tabs: `Plugins` and `Themes`.
- Put remote discovery under a `Marketplace` section inside the relevant tab, with local items under `Installed`.
- Present skills as plugin content when needed, not as a separate top-level category.
