# AGENTS.md

## Codex Desktop Source Of Truth

- For any BetterCodex UI or Codex-host integration work, start from the installed Codex Desktop app: unpack `/Applications/Codex.app/Contents/Resources/app.asar` for shipped strings/code, and use a separate CDP-connected Codex instance to capture DOM roles, classes, computed styles, spacing, and interaction behavior before editing the matching surface.
- Derive selectors, layout, copy, and interaction boundaries from those source measurements, then record the evidence in `STATUS.md` when shipping the change.

## Product Vocabulary

- Keep the visible add-on model to two top-level tabs: `Plugins` and `Themes`.
- Put remote discovery under a `Marketplace` section inside the relevant tab, with local items under `Installed`.
- Present skills as plugin content when needed, not as a separate top-level category.
