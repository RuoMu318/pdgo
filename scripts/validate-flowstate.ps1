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
    'docs/dispatch-runtime.md',
    'docs/skill-catalog.md',
    'docs/external-agent-repository.md',
    'docs/external-agents.md',
    'schemas/plan.yaml',
    'schemas/dispatcher-state.yaml',
    'schemas/external-agent.yaml',
    'schemas/user-plan-approval.yaml',
    'schemas/dispatch.yaml',
    'schemas/execution-report.yaml',
    'schemas/review-decision.yaml',
    'schemas/skill-manifest.yaml',
    'skills/flowstate-project-method/SKILL.md',
    'skills/flowstate-project-method/skill-manifest.yaml',
    'skills/flowstate-project-method/agents/openai.yaml',
    'skills/flowstate-skill-authoring/SKILL.md',
    'skills/flowstate-skill-authoring/skill-manifest.yaml',
    'skills/flowstate-skill-authoring/agents/openai.yaml',
    'skills/skill-index.json',
    'skills/skill-index.md',
    'skills/category-index.json',
    'skills/category-index.md',
    'profiles/external-agent-sources.json',
    'integrations/external-agents/agency-agents/index.json',
    'integrations/external-agents/agency-agents/provider.json',
    'integrations/external-agents/agency-agents/LICENSE',
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

$indexPath = Join-Path $root 'skills/skill-index.json'
if (Test-Path -LiteralPath $indexPath) {
    try {
        $index = Get-Content -Raw -Encoding utf8 -LiteralPath $indexPath | ConvertFrom-Json
        $entries = @($index.skills)
        $ids = @($entries | ForEach-Object { [string]$_.skill_id })
        if (($ids | Sort-Object -Unique).Count -ne $ids.Count) {
            $errors.Add('Skill index contains duplicate skill_id values')
        }
        foreach ($entry in $entries) {
            if ([string]::IsNullOrWhiteSpace([string]$entry.path)) {
                $errors.Add('Skill index entry is missing path')
            } elseif (-not (Test-Path -LiteralPath (Join-Path $root ([string]$entry.path)))) {
                $errors.Add("Skill index path does not exist: $($entry.path)")
            } else {
                $entryRoot = Join-Path $root ([string]$entry.path)
                foreach ($requiredSkillFile in @('SKILL.md', 'skill-manifest.yaml', 'agents/openai.yaml')) {
                    if (-not (Test-Path -LiteralPath (Join-Path $entryRoot $requiredSkillFile))) {
                        $errors.Add("Skill index entry is missing $requiredSkillFile`: $($entry.skill_id)")
                    }
                }
            }
        }
    } catch {
        $errors.Add("Invalid Skill index: $($_.Exception.Message)")
    }
}

$categoryIndexPath = Join-Path $root 'skills/category-index.json'
if (Test-Path -LiteralPath $categoryIndexPath) {
    try {
        $categoryIndex = Get-Content -Raw -Encoding utf8 -LiteralPath $categoryIndexPath | ConvertFrom-Json
        $catalogSkills = @($categoryIndex.categories | ForEach-Object { $_.skills })
        if ([int]$categoryIndex.skill_count -ne $catalogSkills.Count) {
            $errors.Add("Skill category index count does not match entries: $($categoryIndex.skill_count) vs $($catalogSkills.Count)")
        }
        $catalogIds = @($catalogSkills | ForEach-Object { [string]$_.skill_id })
        if (($catalogIds | Sort-Object -Unique).Count -ne $catalogIds.Count) {
            $errors.Add('Skill category index contains duplicate skill_id values')
        }
    } catch {
        $errors.Add("Invalid Skill category index: $($_.Exception.Message)")
    }
}

$externalIndexPath = Join-Path $root 'integrations/external-agents/agency-agents/index.json'
if (Test-Path -LiteralPath $externalIndexPath) {
    try {
        $externalIndex = Get-Content -Raw -Encoding utf8 -LiteralPath $externalIndexPath | ConvertFrom-Json
        $externalAgents = @($externalIndex.agents)
        if ([int]$externalIndex.provider.agent_count -ne $externalAgents.Count) {
            $errors.Add("External Agent index count does not match entries: $($externalIndex.provider.agent_count) vs $($externalAgents.Count)")
        }
        $externalIds = @($externalAgents | ForEach-Object { [string]$_.agent_id })
        if (($externalIds | Sort-Object -Unique).Count -ne $externalIds.Count) {
            $errors.Add('External Agent index contains duplicate agent_id values')
        }
        foreach ($agent in $externalAgents) {
            if ([string]::IsNullOrWhiteSpace([string]$agent.source_url)) { $errors.Add("External Agent is missing source_url: $($agent.agent_id)") }
            if ([string]::IsNullOrWhiteSpace([string]$agent.prompt_path) -or -not (Test-Path -LiteralPath (Join-Path $root ([string]$agent.prompt_path)))) {
                $errors.Add("External Agent prompt cache is missing: $($agent.agent_id)")
            }
        }
    } catch {
        $errors.Add("Invalid External Agent index: $($_.Exception.Message)")
    }
}

foreach ($generatedSkill in @('skills/flowstate-skill-authoring')) {
    $generatedSkillPath = Join-Path $root $generatedSkill
    $generatedSkillFile = Join-Path $generatedSkillPath 'SKILL.md'
    if (Test-Path -LiteralPath $generatedSkillFile) {
        $generatedText = Get-Content -Raw -Encoding utf8 -LiteralPath $generatedSkillFile
        if ($generatedText -notmatch '(?ms)^---\s*\r?\nname:\s*[a-z0-9-]+\s*\r?\ndescription:\s*.+?\r?\n---') {
            $errors.Add("Generated Skill frontmatter is invalid: $generatedSkill")
        }
        foreach ($section in @('## Use when', '## Do not use when', '## Required inputs', '## Required outputs')) {
            if ($generatedText -notmatch [regex]::Escape($section)) {
                $errors.Add("Generated Skill is missing ${section}: $generatedSkill")
            }
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "FlowState validation passed: $root"
