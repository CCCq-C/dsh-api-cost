# dsh-api-cost

English | [中文](README.zh.md)

A Host + Web Client plugin for [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`): shows the **real-time per-session API cost** — the provider-reported
token usage (uncached input / cache-hit input / output) priced with a
configurable per-model rate table, rendered as a live chip above the composer.
Installable via `dsh plugin add`.

## Features

- **`apiCost` session projection** (host half): a pure fold over the session
  log that prices each provider usage sample at the model's rate, so streaming
  usage chunks update the cost live and the finalized `assistant/message` never
  double-counts.
- **Composer-dock chip** (browser half): `API cost $0.0023  1.2K + 3.4K tok`,
  updating in real time; hover shows a per-bucket breakdown (input / cache hit /
  cache write / output, plus the model id).
- **Configurable pricing**: USD per one million tokens; unknown models fall back
  to a default rate table, and per-model overrides ride the plugin row's
  `config` (see [Configuration](#configuration)).
- **Bilingual UI** (中文 / English), following the host locale.
- **Self-contained**: no host-repository changes — the in-package
  `cordis.patch.yml` inserts its own row as a bundle layer.

## Installation

```sh
dsh plugin --profile web add dsh-api-cost
```

The installer adds the package to the web profile's dependencies and bundle
list; after restarting `dsh web`, the loader applies the in-package
`cordis.patch.yml` automatically. Then open any session and send a message —
the cost chip appears above the composer and ticks up as tokens stream.

Manual install (same mechanism, bypassing the installer): edit
`$DSH_HOME/profiles/web/package.json` — add `"dsh-api-cost": "<version>"` to
`dependencies` and `"dsh-api-cost"` to the `dsh.profile.bundles` array — then
run `pnpm install` in that directory and restart.

Peer dependencies are the official `@deepseek-ai/*` packages (`^0.1.0-rc.6`)
plus `react`, all provided by the host.

## Configuration

The plugin ships usable defaults and has no `Config` schema: override pricing by
setting `config` on the `api-cost` row in the profile's `cordis.patch.yml`
(e.g. `$DSH_HOME/profiles/web/cordis.patch.yml`):

```yaml
- id: api-cost
  config:
    currency: USD
    # fallback rates for unknown models (USD per 1M tokens)
    rates:
      input: 0.27
      cacheRead: 0.07
      cacheWrite: 0.27
      output: 1.1
    # per-model overrides (partial objects merge over `rates`)
    models:
      deepseek-chat:
        input: 0.27
        cacheRead: 0.07
        cacheWrite: 0.27
        output: 1.1
      deepseek-reasoner:
        input: 0.55
        cacheRead: 0.14
        cacheWrite: 0.55
        output: 2.19
      deepseek-v4-pro:
        input: 0.27
        cacheRead: 0.07
        cacheWrite: 0.27
        output: 1.1
      deepseek-v4-flash:
        input: 0.14
        cacheRead: 0.03
        cacheWrite: 0.14
        output: 0.55
```

Billing buckets follow the harness `TokenUsage` convention (disjoint counts):
DeepSeek's `prompt_tokens` already includes cache hits, and the official
adapter subtracts `cacheReadTokens` out of `inputTokens`, so:

| bucket | meaning | rate |
|---|---|---|
| `inputTokens` | cache-miss input | `input` |
| `cacheReadTokens` | cache-hit input | `cacheRead` |
| `cacheWriteTokens` | cache write (not reported by DeepSeek) | `cacheWrite` |
| `outputTokens` | output | `output` |

> `deepseek-v4-pro` / `deepseek-v4-flash` defaults are placeholders — update
> them once official pricing is published.

## Projection

The `apiCost` session projection exposes:

| field | meaning |
|---|---|
| `cost` | total cost (currency units) |
| `inputCost` / `cacheReadCost` / `cacheWriteCost` / `outputCost` | per-bucket cost |
| `inputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens` | per-bucket tokens |
| `model` / `provider` | current route (last-wins) |
| `currency` | currency code |

## Known Limitations

- **Estimate, not a bill**: cost is computed from the local session log and may
  differ from the official invoice (provider-side caching, price changes,
  model renames). The rate table is the single source of truth — keep it
  current.
- **Model-switch granularity**: each usage sample is priced at the route that
  was current when it was reported, so switching models mid-session prices
  later steps at the new model's rate.
- **Subagents** have their own session ids and are not aggregated into the
  parent session's chip.

## License

[MIT](LICENSE)
