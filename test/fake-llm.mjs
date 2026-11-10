/**
 * Fake OpenAI-compatible endpoint for exercising turn-auto-retry end to end.
 *
 * The first real model request answers with an unterminated JSON string in the
 * tool arguments. Once a retry arrives carrying the plugin's notice, it answers
 * one valid tool call; every later request answers plain text so the turn ends.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.FAKE_PORT ?? 8799)
let seen = 0
let recovered = false

const MALFORMED = '{"command": "Get-Date'
const VALID = '{"command":"Get-Date","description":"Show current time"}'

function frame(delta, finishReason = null) {
  const payload = {
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'fake-tool',
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  }
  return `data: ${JSON.stringify(payload)}\n\n`
}

function toolCall(argumentsText) {
  return {
    tool_calls: [{
      index: 0,
      id: `call_${seen}`,
      type: 'function',
      function: { name: 'pwsh', arguments: argumentsText }
    }]
  }
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/v1/models')) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'fake-tool', object: 'model' }] }))
    return
  }
  if (request.method !== 'POST') {
    response.writeHead(404).end()
    return
  }

  let body = ''
  request.on('data', (piece) => { body += piece })
  request.on('end', () => {
    seen += 1
    // Small requests are auxiliary calls; only the large one is the model step.
    const real = body.length > 5000
    const broken = real && !body.includes('自动重试')
    const recovering = real && !broken && !recovered
    if (real && !broken) recovered = true
    console.log(`#${seen} ${broken ? 'MALFORMED' : recovering ? 'RECOVERED' : 'text'} bytes=${body.length}`)

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    })
    response.write(frame({ role: 'assistant' }))
    if (broken || recovering) {
      response.write(frame(toolCall(broken ? MALFORMED : VALID)))
      response.write(frame({}, 'tool_calls'))
    } else {
      response.write(frame({ content: '完成' }))
      response.write(frame({}, 'stop'))
    }
    response.write('data: [DONE]\n\n')
    response.end()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake llm on http://127.0.0.1:${PORT}/v1`)
})
