/**
 * Turn auto-retry: keep a turn alive across a failed model request.
 *
 * A malformed tool-call argument payload (for example `Unterminated string in
 * JSON at position 13`) ends the whole turn today, because nothing handles the
 * failure on the agent loop's `agent/request-error` waterfall. This plugin
 * handles it: it records the failure, appends one model-visible notice that
 * names the reason and, for a tool-call failure, the called tool's real
 * parameter contract, then asks the loop to re-run the step so the model can
 * regenerate valid arguments.
 *
 * The same failure message is only forgiven a bounded number of times. Once it
 * repeats past `maxRetries`, the plugin delegates downstream and the turn ends
 * exactly as it does without this plugin, so a genuinely stuck model still
 * stops instead of looping forever.
 *
 * @module dsh-turn-auto-retry
 */

import z from '@deepseek-ai/schemastery'

export const name = 'turn-auto-retry'

/** Tool definitions are read through the registry to quote a real parameter contract. */
export const inject = ['tools']

export const Config = z.object({
  maxRetries: z.number().step(1).min(0).max(20).default(3).volatile(),
  delayMs: z.number().step(1).min(0).max(10000).default(400).volatile()
})

/** Durable record type; the `plugin:` prefix keeps it outside released event schemas. */
const RECORD_TYPE = 'plugin:turn-auto-retry/failure'

/** Producer source stamped on every notice, so derived history renders it as a notice. */
const NOTICE_SOURCE = { kind: 'turn-auto-retry', form: 'notice' }

/** Adapters prefix a malformed tool-call payload with the tool it belongs to. */
const TOOL_CALL_FAILURE = /^Tool call \x22([^\x22]+)\x22:\s*([\s\S]*)$/u

/** Longest tool description quoted into one notice. */
const MAX_DESCRIPTION_CHARS = 600

/** Most parameters quoted into one notice. */
const MAX_PARAMETERS = 24

/** Closing instruction appended to every tool-call notice. */
const FIX_HINT = '请重新生成这次调用：arguments 必须是完整、合法的 JSON；字符串里的双引号要转义，换行写成 \\n，不要截断。'

/** Whether a value is a plain JSON object. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Resolve after `ms`, or as soon as `signal` aborts. */
function sleep(ms, signal) {
  if (!(ms > 0)) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/** Head-truncate long text for a notice. */
function clip(text, limit) {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/**
 * Build one identified user message carrying the notice.
 * @param text - model-visible notice body.
 * @param summary - collapsed-row account shown by the chat transcript.
 * @returns a fresh message; the session snapshots and freezes it on append.
 */
function createNotice(text, summary) {
  return {
    id: globalThis.crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { ...NOTICE_SOURCE, summary }
  }
}

/** Render one tool's declared parameters as notice lines. */
function parameterLines(schema) {
  const properties = isRecord(schema) ? schema.properties : undefined
  if (!isRecord(properties)) return []
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const lines = []
  for (const [key, value] of Object.entries(properties)) {
    if (lines.length >= MAX_PARAMETERS) break
    const type = isRecord(value) && typeof value.type === 'string' ? value.type : 'any'
    const note = isRecord(value) && typeof value.description === 'string' && value.description !== ''
      ? `: ${clip(value.description, 200)}`
      : ''
    lines.push(`- ${key} (${type}, ${required.has(key) ? 'required' : 'optional'})${note}`)
  }
  return lines
}

/** Build the model-visible notice for one handled failure. */
function buildNotice(failure, attempt, maxRetries, definition) {
  const head = `[自动重试 ${attempt}/${maxRetries}] 上一次模型请求失败，已自动重新生成。`
  const reason = `失败原因：${failure.message}`
  if (definition === undefined) {
    return { text: `${head}\n${reason}\n\n请重新生成上一步输出。`, summary: `自动重试 ${attempt}/${maxRetries}` }
  }
  const lines = parameterLines(definition.parameters)
  const contract = lines.length === 0
    ? `工具 ${definition.name} 没有声明参数，arguments 应为空对象 {}。`
    : [`工具 ${definition.name} 的 arguments 必须是合法 JSON 对象，参数定义如下：`, ...lines].join('\n')
  const description = typeof definition.description === 'string' && definition.description !== ''
    ? `\n工具用途：${clip(definition.description, MAX_DESCRIPTION_CHARS)}`
    : ''
  return {
    text: [head, reason, '', contract + description, '', FIX_HINT].join('\n'),
    summary: `自动重试 ${attempt}/${maxRetries} · ${definition.name}`
  }
}

/** Install the recovery listener. */
export function apply(ctx, config) {
  const runs = new WeakMap()

  ctx.on('agent/request-error', async ({ agent, turn, step, failure, signal }, next) => {
    if (signal.aborted) return next()
    // Downstream first: a provider retry policy keeps its own budget and backoff.
    const downstream = await next()
    if (downstream?.kind === 'retry' || signal.aborted) return downstream
    const maxRetries = Math.max(0, Math.trunc(config.maxRetries.get() ?? 3))
    if (maxRetries === 0) return

    const key = `${failure.code}\u0000${failure.message}`
    const previous = runs.get(agent)
    const attempt = previous !== undefined && previous.turn === turn && previous.key === key
      ? previous.count + 1
      : 1
    runs.set(agent, { turn, key, count: attempt })
    if (attempt > maxRetries) return
    const toolName = TOOL_CALL_FAILURE.exec(failure.message)?.[1]
    const definition = toolName === undefined ? undefined : ctx.tools.get(toolName, agent)
    const notice = buildNotice(failure, attempt, maxRetries, definition)

    try {
      agent.session.append(RECORD_TYPE, {
        turn, step, attempt, maxRetries,
        code: failure.code,
        message: failure.message,
        ...toolName === undefined ? {} : { tool: toolName }
      })
      agent.session.append('user/message', createNotice(notice.text, notice.summary), { surfaceOp: 'append' })
    } catch (error) {
      ctx.logger.warn('turn-auto-retry: could not record the retry notice: %o', error)
    }

    await sleep(Math.max(0, Math.trunc(config.delayMs.get() ?? 400)), signal)
    if (signal.aborted) return
    return { kind: 'retry' }
  })
}

