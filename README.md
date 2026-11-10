# dsh-turn-auto-retry

DeepSeek Harness plugin. When a model request fails, the turn normally dies on
the spot 鈥?most often because the model emitted tool-call arguments that are not
valid JSON (`Unterminated string in JSON at position N`).

This plugin keeps the turn alive: it records the failure, tells the model why it
failed and how the called tool actually has to be called, then re-runs the step.
Only when the *same* failure message repeats past a configurable limit does the
turn really stop.

## Install

```bash
dsh plugin --profile <name> add /absolute/path/to/dsh-turn-auto-retry
```

Or point the Harness plugin manager at the directory. The bundle patch inserts
one row; nothing else is required.

## Settings

Settings 鈫?General, row **Retries per identical failure** (0 disables the
plugin), and the full page under Plugins 鈫?Turn auto-retry with the retry delay.

| Field | Default | Meaning |
| --- | --- | --- |
| `maxRetries` | 3 | Retries allowed for one identical failure message. The next repeat ends the turn. |
| `delayMs` | 400 | Wait before re-running the failed step. |

The counter compares the failure message verbatim and resets on a different
message or a new turn.

## How it works

The plugin listens on the agent loop's `agent/request-error` waterfall. It calls
`next()` first, so a provider retry policy keeps its own budget and backoff, and
only acts when downstream declines.

For a handled failure it appends one `plugin:turn-auto-retry/failure` record and
one model-visible notice carrying:

- the failure message verbatim;
- for a tool-call failure, the called tool's real parameter contract (name,
  type, required or optional, description) read from the tool registry;
- an instruction to regenerate complete, valid JSON.

Then it returns `{ kind: 'retry' }`. The notice is a surface message, so the
retried request contains it.

## Testing

```bash
npm test          # logic: fabricated failures against a fake agent/session
npm run test:e2e  # end to end: local fake model, real harness, headless
```

`test/e2e.ps1` starts a fake OpenAI-compatible endpoint that answers the first
request with truncated tool-call JSON and only answers valid once the retry
carries the notice 鈥?so a pass proves the notice reached the model. It also runs
the negative control (`maxRetries: 0`), which must leave the turn failed.

## Limitations

- Covers model-request failures only. Tool execution errors already reach the
  model as tool results.
- A retry is another billed provider request.
- The notice quotes at most 24 parameters and clips long descriptions.

## License

MIT

