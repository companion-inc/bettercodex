---
name: create-bettercodex-addon
description: Create BetterCodex plugins and themes for marketplace submission, or Codex skills for a Codex-native plugin bundle.
---

# Create BetterCodex Addon

Use this skill when the user wants to create a BetterCodex desktop addon or package a Codex skill with a Codex-native plugin.

## Addon Types

- Desktop plugin: `.plugin.js`, runs in the BetterCodex desktop runtime.
- Desktop theme: `.theme.css`, injects CSS through the BetterCodex runtime.
- Codex skill: `SKILL.md`, ships inside a Codex-native plugin bundle. It is creator tooling or plugin-bundle content, not a desktop marketplace addon.

## Required Metadata

Plugins and themes must start with a JSDoc metadata block:

```js
/**
 * @name Example
 * @version 0.1.0
 * @description Short description.
 * @author Author
 */
```

## Plugin Shape

```js
module.exports = class Example {
  start() {
    BdApi.UI.showToast("Example enabled");
  }

  stop() {}
};
```

Plugins must export an object or class with `start()` and `stop()`.

## Theme Shape

```css
/**
 * @name Example Theme
 * @version 0.1.0
 * @description Short description.
 * @author Author
 */
:root {
  --example-color: #36a481;
}
```

## Submission Checklist

- Use a stable file name ending in `.plugin.js` or `.theme.css`.
- Host downloadable desktop addons as raw GitHub HTTPS files.
- Include name, type, author, version, description, file name, and download URL.
- Keep desktop UI changes scoped to Codex surfaces and avoid destructive filesystem actions.
- Publish Codex skills by publishing the Codex-native plugin bundle that contains them; do not submit a standalone `SKILL.md` as a BetterCodex desktop marketplace addon.
