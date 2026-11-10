# dsh-turn-auto-retry

DeepSeek Harness 插件。模型请求失败时，本轮原本会当场判死——最常见的原因是模型给出的工具参数不是合法 JSON（`Unterminated string in JSON at position N`）。

本插件让这一轮活下来：记录失败、把失败原因和被调用工具**真实的参数契约**回喂给模型，然后重跑该步。只有同一条失败信息重复超过可配置上限，才真正停止。

## 安装

```bash
dsh plugin --profile <name> add /绝对路径/dsh-turn-auto-retry
```

或让 Harness 的插件管理器指向该目录。bundle patch 只插入一行，无需其他步骤。

## 设置

设置 → 通用，行「同一失败的允许重试次数」（填 0 关闭）；完整页面在 Plugins → 失败自动重试，含重试等待时间。

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `maxRetries` | 3 | 同一条失败信息允许重试的次数，再重复一次即结束本轮。 |
| `delayMs` | 400 | 重跑失败步骤前的等待毫秒数。 |

计数按失败信息原文比较；换了失败内容或进入新一轮会清零。

## 原理

插件监听 agent loop 的 `agent/request-error` waterfall。它先调用 `next()`，让提供方的重试策略保留自己的预算与退避，只有下游不处理时才接管。

接管时追加一条 `plugin:turn-auto-retry/failure` 记录和一条模型可见提示，内容包括：失败原文；工具调用失败时该工具的真实参数契约（名称、类型、必填与否、说明，取自工具注册表）；以及「重新生成完整合法 JSON」的要求。随后返回 `{ kind: 'retry' }`。提示是 surface 消息，因此重试请求里带着它。

## 测试

```bash
npm test          # 逻辑层：假 agent/session + 伪造失败
npm run test:e2e  # 端到端：本地假模型 + 真实 harness（headless）
```

`test/e2e.ps1` 会起一个假的 OpenAI 兼容端点：第一次请求返回截断的工具参数 JSON，只有重试请求里带上提示后才返回合法调用——跑通即证明提示确实进了模型上下文。脚本同时跑反向对照（`maxRetries: 0`），该轮必须照旧失败。

## 限制

- 只覆盖模型请求失败；工具执行报错本来就会作为工具结果回给模型。
- 每次重试都是一次计费的提供方请求。
- 提示最多引用 24 个参数，过长描述会被截断。

## 许可

MIT
