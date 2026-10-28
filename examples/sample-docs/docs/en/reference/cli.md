---
title: CLI reference
---

# CLI reference

Every command runs with `npx lantern <command>`.

## `lantern dev`

Starts a local server with live reload.

| Flag | Default | Meaning |
|---|---|---|
| `--port <number>` | `4173` | The port to listen on. |
| `--host` | off | Listen on all network interfaces, not just localhost. |
| `--open` | off | Open the site in your browser. |

```sh
npx lantern dev --port 8080 --open
```

## `lantern build`

Builds the site into `dist/`.

| Flag | Default | Meaning |
|---|---|---|
| `--out <folder>` | `dist` | Where to write the site. |
| `--base <path>` | from the config | Override `base` for this build. |

```sh
npx lantern build --out public --base /docs/
```

## `lantern preview`

Serves the built site from `dist/`, to check it before you upload it.

## `lantern check`

Finds broken links and missing alt text. It exits with code `1` when it finds a problem, so you
can run it in CI:

```yaml
- run: npx lantern check
```
