# BetterCodex

BetterCodex adds community plugins and themes to Codex Desktop.

This repo is a monorepo with separate runtimes:

```text
apps/desktop        Codex patcher, runtime injection, local plugin/theme loader, in-Codex Plugins/Themes UI
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

Desktop addons live in:

```text
~/.codex/bettercodex/plugins
~/.codex/bettercodex/themes
```

Plugins use `.plugin.js`. Themes use `.theme.css`. The in-Codex Plugins and Themes pages fetch the hosted marketplace API and install selected files into those folders. The pages inherit Codex token colors, borders, typography, and surfaces so they read as part of Codex rather than as a separate website frame.

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
