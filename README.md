# BetterCodex

BetterCodex adds community plugins and themes to Codex Desktop.

This repo is a monorepo with separate runtimes:

```text
apps/desktop        sibling BetterCodex app bundler, runtime injection, local plugin/theme loader, in-Codex Plugins/Themes UI
apps/web            Hosted public marketplace website, built with Vite, React, and shadcn/ui
apps/api            Hosted marketplace API for catalog, submissions, and downloads
packages/catalog    Shared catalog schema and validation
packages/addons     Example addons and author fixtures
plugins/            Codex-native BetterCodex skill pack
```

Users install the desktop client. Companion hosts the web and API.

Live hosted marketplace:

- Web: https://bettercodex-web.companion-inc.workers.dev
- API: https://bettercodex-web.companion-inc.workers.dev/api/addons

## Desktop

```bash
npm run desktop:status
npm run desktop -- install
```

The desktop installer creates or refreshes `/Applications/BetterCodex.app` instead of mutating `/Applications/Codex.app`. Keeping the official Codex app vendor-signed preserves its built-in updater. Add-ons and runtime files stay outside the app bundle under `~/.codex/bettercodex`.

Directly patching `/Applications/Codex.app` is reserved for local experiments:

```bash
npm run desktop -- install --unsafe-patch-official-app
```

That mode rewrites `app.asar`, re-signs the app ad hoc, and can break the official updater.

Desktop addons live in:

```text
~/.codex/bettercodex/plugins
~/.codex/bettercodex/themes
```

Plugins use `.plugin.js`. Themes use `.theme.css`. The in-Codex Plugins and Themes pages manage installed local files in those folders, with search, open-folder actions, installed status, and enable/disable switches. The hosted web/API surface is the distribution catalog; the desktop page stays an installed add-on manager.

## Hosted Web/API

```bash
npm run web:dev
npm run web:build
npm run web:dry-run
npm run web:deploy
```

`apps/web` is a Vite/React site using shadcn/ui components. It exports static assets to `apps/web/dist`. `apps/api` is the Cloudflare Worker that serves the hosted marketplace API for `/api/addons`, `/api/addons/:id`, and `/api/submit`.

The desktop Plugins and Themes pages use the hosted API by default:

```text
https://bettercodex-web.companion-inc.workers.dev/api/addons
```

## Codex Skill Pack

The repo also contains `bettercodex-community`, a Codex-native plugin that exposes skills for creating and installing BetterCodex addons:

```bash
codex plugin marketplace add companion-inc/bettercodex --ref main
codex plugin add bettercodex-community@bettercodex
```

## Verification

```bash
npm run check
npm test
npm audit
npm run web:dry-run
```
