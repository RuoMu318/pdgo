[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $root 'scripts/validate-flowstate.ps1')
if (-not $?) {
    throw "Repository validation failed"
}

$readme = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'README.md')
if ($readme -notmatch 'FlowState') {
    throw 'README does not identify FlowState'
}

$spec = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'docs/flowstate-spec.md')
foreach ($requiredTerm in @('user approval', 'Skill', 'risk', 'blocker', 'execution')) {
    if ($spec -notmatch [regex]::Escape($requiredTerm)) {
        throw "Specification is missing required term: $requiredTerm"
    }
}

Write-Output 'FlowState smoke test passed'
