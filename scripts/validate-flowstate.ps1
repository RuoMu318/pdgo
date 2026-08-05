[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$errors = [System.Collections.Generic.List[string]]::new()

function Require-Path([string]$relativePath) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
        $errors.Add("Missing required path: $relativePath")
    }
}

function Require-JsonManifest([string]$relativePath, [string]$expectedName) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
        return
    }
    try {
        $manifest = Get-Content -Raw -Encoding utf8 -LiteralPath $path | ConvertFrom-Json
        if ([string]$manifest.name -ne $expectedName) {
            $errors.Add("Manifest $relativePath has name '$($manifest.name)', expected '$expectedName'")
        }
    } catch {
        $errors.Add("Invalid JSON manifest: $relativePath ($($_.Exception.Message))")
    }
}

@(
    'README.md',
    'AGENTS.md',
    'docs/flowstate-spec.md',
    'docs/skill-routing.md',
    'schemas/plan.yaml',
    'schemas/user-plan-approval.yaml',
    'schemas/dispatch.yaml',
    'schemas/execution-report.yaml',
    'schemas/review-decision.yaml',
    'schemas/skill-manifest.yaml',
    'skills/flowstate-project-method/SKILL.md',
    'skills/flowstate-project-method/agents/openai.yaml',
    'skills/flowstate-project-method/references/routing.md',
    'skills/flowstate-project-method/references/approval-gate.md'
) | ForEach-Object { Require-Path $_ }

Require-JsonManifest '.codex-plugin/plugin.json' 'flowstate'
Require-JsonManifest '.claude-plugin/plugin.json' 'flowstate'
Require-JsonManifest '.cursor-plugin/plugin.json' 'flowstate'
Require-JsonManifest '.kimi-plugin/plugin.json' 'flowstate'
Require-JsonManifest '.opencode/plugin.json' 'flowstate'
Require-JsonManifest 'gemini-extension.json' 'flowstate'

$skillPath = Join-Path $root 'skills/flowstate-project-method/SKILL.md'
if (Test-Path -LiteralPath $skillPath) {
    $skillText = Get-Content -Raw -Encoding utf8 -LiteralPath $skillPath
    if ($skillText -notmatch '(?ms)^---\s*\r?\nname:\s*flowstate-project-method\s*\r?\ndescription:\s*.+?\r?\n---') {
        $errors.Add('Skill frontmatter is missing required name/description fields')
    }
    if ($skillText -match '\[TODO:') {
        $errors.Add('Skill contains an unresolved TODO placeholder')
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "FlowState validation passed: $root"
