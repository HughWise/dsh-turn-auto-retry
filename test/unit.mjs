/**
 * Logic-level test: drives the plugin's request-error listener with fabricated
 * failures and a fake agent/session. No model, no harness.
 *
 * Run with `npm test`.
 */
import { apply, Config } from '../index.js'

const config = Config({ maxRetries: 3, delayMs: 0 })

function makeAgent() {
  const events = []
  return {
    events,
    session: {
      append(type, data, opts) {
        events.push({ type, data, opts })
        return { seq: events.length }
      }
    }
  }
}

const tools = new Map([
  ['pwsh', {
    name: 'pwsh',
    description: 'Run a PowerShell command.',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Command text.' },
        description: { type: 'string' }
      }
    }
  }]
])

let handler
const ctx = {
  on(name, fn) { if (name === 'agent/request-error') handler = fn },
  tools: { get: (name) => tools.get(name) },
  logger: { warn() {} }
}

apply(ctx, config)

const signal = new AbortController().signal
const failure = {
  code: 'MALFORMED_RESPONSE',
  message: 'Tool call \x22pwsh\x22: Unterminated string in JSON at position 13 (line 1 column 14)'
}
const decline = () => Promise.resolve(undefined)
const agent = makeAgent()

const results = []
for (let i = 1; i <= 5; i++) {
  results.push(await handler({ agent, turn: 1, step: 1, provider: 'p', failure, signal }, decline))
}

console.log('attempts:', results.map((r) => r?.kind ?? 'terminal').join(' '))

const notices = agent.events.filter((e) => e.type === 'user/message')
const records = agent.events.filter((e) => e.type.startsWith('plugin:'))
console.log('notices:', notices.length, 'records:', records.length)
console.log('record keys:', Object.keys(records[0].data).join(','))
console.log('summary:', notices[0].data.source.summary)
console.log('--- notice text ---')
console.log(notices[0].data.content[0].text)

// A different failure starts a fresh run.
const other = { code: 'SERVER', message: 'boom' }
const afterOther = await handler({ agent, turn: 1, step: 2, provider: 'p', failure: other, signal }, decline)
console.log('different failure ->', afterOther?.kind ?? 'terminal')

// A new turn resets the run even for the same message.
const nextTurn = await handler({ agent, turn: 2, step: 1, provider: 'p', failure, signal }, decline)
console.log('new turn ->', nextTurn?.kind ?? 'terminal')

// A downstream retry keeps its own budget and appends no notice.
const before = agent.events.length
const downstream = await handler({ agent, turn: 3, step: 1, provider: 'p', failure, signal }, () => Promise.resolve({ kind: 'retry' }))
console.log('downstream retry ->', downstream.kind, 'events added:', agent.events.length - before)

// maxRetries 0 disables the plugin.
const off = Config({ maxRetries: 0, delayMs: 0 })
let offHandler
apply({ on: (_n, fn) => { offHandler = fn }, tools: ctx.tools, logger: ctx.logger }, off)
const disabled = await offHandler({ agent: makeAgent(), turn: 1, step: 1, provider: 'p', failure, signal }, decline)
console.log('disabled ->', disabled?.kind ?? 'terminal')
