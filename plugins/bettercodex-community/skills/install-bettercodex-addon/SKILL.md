---
name: install-bettercodex-addon
description: Install local BetterCodex plugins and themes into the desktop runtime folders.
---

# Install BetterCodex Addon

Use this skill when the user wants to install a local BetterCodex desktop plugin or theme.

## Paths

- Plugins: `~/.codex/bettercodex/plugins`
- Themes: `~/.codex/bettercodex/themes`

## Procedure

1. Inspect the addon file and verify the metadata block.
2. Confirm the extension is `.plugin.js` or `.theme.css`.
3. Copy plugins to the plugins folder and themes to the themes folder.
4. Ask the user to reload from the BetterCodex in-Codex Plugins or Themes page when Codex is already open.

Do not install arbitrary files outside these folders.
