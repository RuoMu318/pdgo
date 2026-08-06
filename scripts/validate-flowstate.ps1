[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$errors = [System.Collections.Generic.List[string]]::new()

function Require-Path([string]$relativePath) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) { $errors.Add("Missing required path: $relativePath") }
}

function Require-JsonManifest([string]$relativePath, [string]$expectedName) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path)) { return }
    try {
        $manifest = Get-Content -Raw -Encoding utf8 -LiteralPath $path | ConvertFrom-Json
        if ([string]$manifest.name -ne $expectedName) { $errors.Add("Manifest $relativePath has name '$($manifest.name)', expected '$expectedName'") }
    } catch { $errors.Add("Invalid JSON manifest: $relativePath ($($_.Exception.Message))") }
}

@(
    'README.md',
    'README.zh-CN.md',
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
    'skills/skill-index.json',
    'skills/skill-index.md',
    'skills/category-index.json',
    'skills/category-index.md',
    'profiles/external-agent-sources.json',
    'profiles/pdgo-agent-routing.json',
    'integrations/external-agents/agency-agents/index.json',
    'integrations/external-agents/agency-agents/metadata-index.json',
    'integrations/external-agents/agency-agents/provider.json',
    'integrations/external-agents/agency-agents/LICENSE',
    'integrations/external-skills/superpowers/source-lock.json',
    'integrations/external-skills/superpowers/integration-map.json',
    'integrations/external-skills/superpowers/manifest.json',
    'integrations/external-skills/superpowers/upstream/skills/using-superpowers/SKILL.md'
) | ForEach-Object { Require-Path $_ }

Require-JsonManifest '.codex-plugin/plugin.json' 'pdgo'
Require-JsonManifest '.claude-plugin/plugin.json' 'pdgo'
Require-JsonManifest '.cursor-plugin/plugin.json' 'pdgo'
Require-JsonManifest '.kimi-plugin/plugin.json' 'pdgo'
Require-JsonManifest '.opencode/plugin.json' 'pdgo'
Require-JsonManifest 'gemini-extension.json' 'pdgo'

$skillsRoot = Join-Path $root 'skills'
$activeSkillDirs = @(Get-ChildItem -LiteralPath $skillsRoot -Directory | Where-Object { $_.Name -like 'pdgo-*' })
$legacySkillDirs = @(Get-ChildItem -LiteralPath $skillsRoot -Directory | Where-Object { $_.Name -like 'flowstate-*' })
if ($activeSkillDirs.Count -ne 10) { $errors.Add("Expected 10 active PDGO Skills, found $($activeSkillDirs.Count)") }
if ($legacySkillDirs.Count -ne 0) { $errors.Add("Legacy shell Skills remain: $($legacySkillDirs.Name -join ', ')") }
foreach ($skillDir in $activeSkillDirs) {
    foreach ($requiredSkillFile in @('SKILL.md', 'skill-manifest.yaml', 'agents/openai.yaml')) {
        if (-not (Test-Path -LiteralPath (Join-Path $skillDir.FullName $requiredSkillFile))) { $errors.Add("Active Skill is missing $requiredSkillFile`: $($skillDir.Name)") }
    }
    $skillText = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $skillDir.FullName 'SKILL.md')
    if ($skillText -notmatch '(?ms)^---\s*\r?\nname:\s*pdgo-[a-z0-9-]+\s*\r?\ndescription:\s*.+?\r?\n---') { $errors.Add("Active Skill frontmatter is invalid: $($skillDir.Name)") }
    if ($skillText -match '\[TODO:') { $errors.Add("Active Skill contains an unresolved TODO: $($skillDir.Name)") }
}

$indexPath = Join-Path $root 'skills/skill-index.json'
if (Test-Path -LiteralPath $indexPath) {
    try {
        $index = Get-Content -Raw -Encoding utf8 -LiteralPath $indexPath | ConvertFrom-Json
        $entries = @($index.skills)
        $ids = @($entries | ForEach-Object { [string]$_.skill_id })
        if (($ids | Sort-Object -Unique).Count -ne $ids.Count) { $errors.Add('Skill index contains duplicate skill_id values') }
        if ($ids.Count -ne 10 -or @($ids | Where-Object { $_ -notlike 'pdgo-*' }).Count -gt 0) { $errors.Add('Skill index must contain exactly the ten pdgo-* Skills') }
        foreach ($entry in $entries) {
            if ([string]::IsNullOrWhiteSpace([string]$entry.path)) { $errors.Add('Skill index entry is missing path'); continue }
            $entryRoot = Join-Path $root ([string]$entry.path)
            if (-not (Test-Path -LiteralPath $entryRoot)) { $errors.Add("Skill index path does not exist: $($entry.path)"); continue }
            foreach ($requiredSkillFile in @('SKILL.md', 'skill-manifest.yaml', 'agents/openai.yaml')) {
                if (-not (Test-Path -LiteralPath (Join-Path $entryRoot $requiredSkillFile))) { $errors.Add("Skill index entry is missing $requiredSkillFile`: $($entry.skill_id)") }
            }
        }
    } catch { $errors.Add("Invalid Skill index: $($_.Exception.Message)") }
}

$categoryIndexPath = Join-Path $root 'skills/category-index.json'
if (Test-Path -LiteralPath $categoryIndexPath) {
    try {
        $categoryIndex = Get-Content -Raw -Encoding utf8 -LiteralPath $categoryIndexPath | ConvertFrom-Json
        $catalogSkills = @($categoryIndex.categories | ForEach-Object { $_.skills })
        if ([int]$categoryIndex.skill_count -ne $catalogSkills.Count) { $errors.Add("Skill category index count does not match entries: $($categoryIndex.skill_count) vs $($catalogSkills.Count)") }
        $catalogIds = @($catalogSkills | ForEach-Object { [string]$_.skill_id })
        if (($catalogIds | Sort-Object -Unique).Count -ne $catalogIds.Count) { $errors.Add('Skill category index contains duplicate skill_id values') }
        if ($catalogIds.Count -ne 10 -or @($catalogIds | Where-Object { $_ -notlike 'pdgo-*' }).Count -gt 0) { $errors.Add('Skill category index must contain exactly the ten pdgo-* Skills') }
    } catch { $errors.Add("Invalid Skill category index: $($_.Exception.Message)") }
}

$lockPath = Join-Path $root 'integrations/external-skills/superpowers/source-lock.json'
if (Test-Path -LiteralPath $lockPath) {
    try {
        $lock = Get-Content -Raw -Encoding utf8 -LiteralPath $lockPath | ConvertFrom-Json
        if ([string]$lock.commit -ne '44c9b2d6e889982ac18c27d05a19fefe335194e1') { $errors.Add('Superpowers source lock commit is incorrect') }
        if (@($lock.sources).Count -ne 14) { $errors.Add("Superpowers source lock must list 14 Skills, found $(@($lock.sources).Count)") }
        foreach ($source in @($lock.sources)) {
            $sourcePath = Join-Path $root ([string]$source.path)
            if (-not (Test-Path -LiteralPath $sourcePath)) { $errors.Add("Missing locked upstream Skill: $($source.path)"); continue }
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash.ToLowerInvariant()
            if ($actual -ne ([string]$source.sha256).ToLowerInvariant()) { $errors.Add("Upstream SHA mismatch: $($source.skill_id)") }
        }
    } catch { $errors.Add("Invalid Superpowers source lock: $($_.Exception.Message)") }
}

$externalIndexPath = Join-Path $root 'integrations/external-agents/agency-agents/index.json'
if (Test-Path -LiteralPath $externalIndexPath) {
    try {
        $externalIndex = Get-Content -Raw -Encoding utf8 -LiteralPath $externalIndexPath | ConvertFrom-Json
        $externalAgents = @($externalIndex.agents)
        if ([int]$externalIndex.provider.agent_count -ne $externalAgents.Count) { $errors.Add("External Agent index count does not match entries: $($externalIndex.provider.agent_count) vs $($externalAgents.Count)") }
        if ($externalAgents.Count -ne 271) { $errors.Add("External Agent index must contain 271 entries, found $($externalAgents.Count)") }
        $externalIds = @($externalAgents | ForEach-Object { [string]$_.agent_id })
        if (($externalIds | Sort-Object -Unique).Count -ne $externalIds.Count) { $errors.Add('External Agent index contains duplicate agent_id values') }
        foreach ($agent in $externalAgents) {
            if ([string]::IsNullOrWhiteSpace([string]$agent.source_url)) { $errors.Add("External Agent is missing source_url: $($agent.agent_id)") }
            if ([string]::IsNullOrWhiteSpace([string]$agent.prompt_path) -or -not (Test-Path -LiteralPath (Join-Path $root ([string]$agent.prompt_path)))) { $errors.Add("External Agent prompt cache is missing: $($agent.agent_id)") }
        }
        $metadataPath = Join-Path $root 'integrations/external-agents/agency-agents/metadata-index.json'
        if (Test-Path -LiteralPath $metadataPath) {
            $metadata = Get-Content -Raw -Encoding utf8 -LiteralPath $metadataPath | ConvertFrom-Json
            if ([int]$metadata.agent_count -ne 271 -or @($metadata.agents).Count -ne 271) { $errors.Add('Agency Agent metadata index must contain exactly 271 entries') }
            foreach ($entry in @($metadata.agents)) {
                if ([string]$entry.routing_mode -notin @('eligible-with-explicit-task-selector', 'manual-only')) { $errors.Add("Invalid Agent routing mode: $($entry.agent_id)") }
                if (-not (Test-Path -LiteralPath (Join-Path $root ([string]$entry.metadata_path)))) { $errors.Add("Agent metadata file is missing: $($entry.agent_id)") }
            }
        } else { $errors.Add('Agency Agent metadata index is missing') }
    } catch { $errors.Add("Invalid External Agent index: $($_.Exception.Message)") }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "PDGO validation passed: $root"
