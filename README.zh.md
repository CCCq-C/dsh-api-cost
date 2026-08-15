# dsh-api-cost

[English](README.md) | 中文

一个 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）
的 Host + Web Client 插件：**实时显示本会话 API 用量开销**——把 provider 上报的
token 用量（未缓存输入 / 缓存命中输入 / 输出）按可配置的模型费率计价，在输入栏
上方渲染一条实时成本条。可通过 `dsh plugin add` 安装。

## 特性

- **`apiCost` 会话投影**（node half）：对会话日志做纯函数折叠，把每个 provider
  用量样本按当前模型费率计价——流式 usage chunk 实时更新成本，最终
  `assistant/message` 不会重复计费。
- **输入栏上方成本条**（browser half）：`API 开销 $0.0023  1.2K + 3.4K tok`，
  实时刷新；悬停显示分桶明细（输入 / 缓存命中 / 缓存写入 / 输出 + 模型 id）。
- **可配置定价**：美元 / 每百万 tokens；未知模型回退默认费率表，按模型覆盖走
  插件行的 `config`（见[配置](#配置)）。
- **中英双语**，跟随宿主 UI 语言。
- **自包含**：无需改动宿主仓库——包内 `cordis.patch.yml` 以 bundle layer 自动
  插入自己的 row。

## 安装

```sh
dsh plugin --profile web add dsh-api-cost
```

安装器会把包加入 web profile 的 dependencies 与 bundle 列表；重启 `dsh web` 后
loader 自动应用包内 `cordis.patch.yml`。然后打开任意会话发一条消息——成本条出现
在输入栏上方，并随 token 流式输出实时增长。

手动安装（同一机制，绕过安装器）：编辑 `$DSH_HOME/profiles/web/package.json`，
在 `dependencies` 加 `"dsh-api-cost": "<版本>"`、在 `dsh.profile.bundles` 数组加
`"dsh-api-cost"`，然后在该目录跑 `pnpm install` 并重启。

Peer 依赖为官方 `@deepseek-ai/*` 包（`^0.1.0-rc.6`）与 `react`，均由宿主提供。

## 配置

插件自带可用默认值，且没有 `Config` schema：通过给 profile 的
`cordis.patch.yml`（如 `$DSH_HOME/profiles/web/cordis.patch.yml`）里 `api-cost`
行设置 `config` 来覆盖定价：

```yaml
- id: api-cost
  config:
    currency: USD
    # 未知模型回退费率（美元 / 每百万 tokens）
    rates:
      input: 0.27
      cacheRead: 0.07
      cacheWrite: 0.27
      output: 1.1
    # 按模型覆盖（部分对象，缺失字段回退到 rates）
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

计费分桶遵循 harness 的 `TokenUsage` 约定（互斥计数）：DeepSeek 的
`prompt_tokens` 已含缓存命中，官方 adapter 已把 `cacheReadTokens` 从
`inputTokens` 中扣除，因此：

| 分桶 | 含义 | 费率 |
|---|---|---|
| `inputTokens` | 缓存未命中输入 | `input` |
| `cacheReadTokens` | 缓存命中输入 | `cacheRead` |
| `cacheWriteTokens` | 缓存写入（DeepSeek 不报告） | `cacheWrite` |
| `outputTokens` | 输出 | `output` |

> `deepseek-v4-pro` / `deepseek-v4-flash` 的默认价是占位值，官方定价公布后请更新。

## 投影

`apiCost` 会话投影暴露：

| 字段 | 含义 |
|---|---|
| `cost` | 总成本（货币单位） |
| `inputCost` / `cacheReadCost` / `cacheWriteCost` / `outputCost` | 分桶成本 |
| `inputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens` | 分桶 tokens |
| `model` / `provider` | 当前路由（last-wins） |
| `currency` | 货币代码 |

## 已知限制

- **是估算不是账单**：成本由本地会话日志计算，可能与官方账单有差异（provider 侧
  缓存、价格变动、模型更名等）。费率表是唯一事实来源，请保持更新。
- **模型切换粒度**：每个用量样本按其上报时的当前路由计价，会话中途切换模型后，
  后续 step 按新模型费率计价。
- **子代理**有独立的 session id，不会汇总进父会话的成本条。

## License

[MIT](LICENSE)
