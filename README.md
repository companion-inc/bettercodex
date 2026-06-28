# BetterCodex

BetterCodex adds a community Store to Codex Desktop.

This repo is a monorepo with separate runtimes:

```text
apps/desktop        Codex patcher, runtime injection, local plugin/theme loader, in-Codex Store
apps/web            Hosted public website
apps/api            Hosted Store API for catalog, submissions, and downloads
packages/catalog    Shared catalog schema and validation
packages/addons     Example addons and author fixtures
plugins/            Codex-native BetterCodex skill pack
```

Users install the desktop client. Companion hosts the web and API.

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

Plugins use `.plugin.js`. Themes use `.theme.css`. The in-Codex Store fetches the hosted Store API and installs selected files into those folders.

## Hosted Web/API

```bash
npm run web:dev
npm run web:dry-run
```

`apps/web` is the public website. `apps/api` is the Cloudflare Worker that serves `/api/addons`, `/api/addons/:id`, and `/api/submit`.

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
npm run web:dry-run
```
