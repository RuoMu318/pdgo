const ACTIVE_SKILL_TEXT_REPLACEMENTS = Object.freeze([
  ["superpowers:finishing-a-development-branch", "pdgo-completion-work"],
  ["superpowers:verification-before-completion", "pdgo-completion-work"],
  ["superpowers:subagent-driven-development", "pdgo-execute-work"],
  ["superpowers:dispatching-parallel-agents", "pdgo-execute-work"],
  ["superpowers:using-git-worktrees", "pdgo-execute-work"],
  ["superpowers:requesting-code-review", "pdgo-review-request"],
  ["superpowers:receiving-code-review", "pdgo-review-receive"],
  ["superpowers:systematic-debugging", "pdgo-debug-work"],
  ["superpowers:test-driven-development", "pdgo-tdd-work"],
  ["superpowers:executing-plans", "pdgo-execute-work"],
  ["superpowers:brainstorming", "pdgo-plan-work"],
  ["superpowers:writing-plans", "pdgo-plan-work"],
  ["superpowers:writing-skills", "pdgo-skill-authoring"],
  ["../using-superpowers/references/", "../pdgo-route-work/references/"],
  ["superpowers/references/", "pdgo-route-work/references/"],
  ["docs/superpowers/", "docs/pdgo/"],
  [".config/superpowers/", ".config/pdgo/"],
  [".superpowers/", ".pdgo/"],
  ["using-superpowers", "pdgo-route-work"],
  ["Superpowers", "PDGO"],
  ["superpowers", "pdgo"],
]);

export function normalizePdgoActiveSkillText(value) {
  return ACTIVE_SKILL_TEXT_REPLACEMENTS.reduce(
    (result, [source, destination]) => result.replaceAll(source, destination),
    String(value ?? ""),
  );
}
