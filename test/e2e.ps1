# End-to-end check: fake model answers malformed JSON first, valid after the
# retry carries the notice. Exit 0 = pass.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dsh = 'D:\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$env:FAKE_API_KEY = 'test-key'

function New-Patch([int]$retries) {
  $file = Join-Path $env:TEMP "tar-e2e-$retries.yml"
  @(
    '- id: llm-pi-ai'
    "  name: '@deepseek-ai/dsh-llm-pi-ai'"
    '  config:'
    '    providers:'
    '      fake:'
    '        displayName: Fake test model'
    '        api: openai-completions'
    '        apiKeyEnv: FAKE_API_KEY'
    '        baseURL: http://127.0.0.1:8799/v1'
    '        models:'
    '          - id: fake-tool'
    '            name: fake-tool'
    '            input:'
    '              - text'
    '- insert:'
    '    - id: turn-auto-retry-e2e'
    "      name: '$($root.Replace('\', '/'))/index.js'"
    '      config:'
    "        maxRetries: $retries"
    '        delayMs: 0'
    '- id: agent-default-model'
    "  name: '@deepseek-ai/dsh-agent-default-model'"
    '  config:'
    '    provider: fake'
    '    model: fake-tool'
  ) | Set-Content $file -Encoding utf8
  return $file
}

function Invoke-Case([int]$retries) {
  $patch = New-Patch $retries
  # A failing run writes to stderr; keep that from terminating the script.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $dsh headless --patch $patch --permission-mode danger-full-access 'say hi' 2>&1 | Out-String
  }
  finally {
    $ErrorActionPreference = $previous
    Remove-Item $patch -Force
  }
  return $out
}

$server = Start-Process node -ArgumentList (Join-Path $PSScriptRoot 'fake-llm.mjs') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 1
try {
  $ok = (Invoke-Case 3) -notmatch 'MALFORMED_RESPONSE'
  Write-Output $(if ($ok) { 'PASS: recovered after one malformed tool call' } else { 'FAIL: did not recover' })

  $off = (Invoke-Case 0) -match 'MALFORMED_RESPONSE'
  Write-Output $(if ($off) { 'PASS: disabled plugin leaves the turn failed' } else { 'FAIL: disabled plugin still recovered' })

  if ($ok -and $off) { exit 0 } else { exit 1 }
}
finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
