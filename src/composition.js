/**
 * dsh-ptc-cordis-preset — declarative composition rows (dsh >= 0.1.7).
 *
 * On dsh 0.1.7 the directory-preset mechanism was removed and presets are
 * DECLARED: a definition registered through agentPresets.register(). This
 * module is the committed, reviewable composition DATA for that registration
 * — the new-era counterpart of the committed agent.cordis*.yml assets the
 * materializer writes on older hosts.
 *
 * It mirrors the official 0.1.7 'cordis' preset (packages/bundle/web-app/
 * presets/cordis.patch.yml) with this preset's union deltas:
 *
 *   - tool-presentation with mode: ptc (the shipped 'ptc' preset's row) —
 *     this preset is PTC mode PLUS the Creation-mode additions;
 *   - the workflow side follows the 'workflow' card setting: ON mirrors the
 *     official 'cordis' preset (engine + tool-workflow enabled, the
 *     Creation-side capability this preset exists for), OFF mirrors the
 *     official 'ptc' preset exactly (both disabled);
 *   - tool-plugin-manager rides the same side split: enabled on the
 *     Creation side, disabled on the ptc-mirror side;
 *   - the persona is the official minimal one: since 0.1.7 the long
 *     Creation guidance lives in the progressive skills beside the
 *     @deepseek-ai/dsh-agent-preset package, which customSkillDirs points
 *     at — keeping the long 0.1.6 text would re-teach a removed mechanism
 *     (.agent-presets directories are no longer read).
 *
 * Everything else is byte-for-byte the official row set: capability rows
 * that a register()-capable host always ships (present, plugin-manager,
 * workflow-ptc, subagent-control) need no era probes here.
 */

/** True when the row is disabled for this assembly (pure). */
function off(value) {
  return value === true ? { disabled: true } : {}
}

/**
 * The plugins rows for one registration.
 * @param {object} input
 * @param {boolean} input.workflowOn - Creation side (true) or ptc mirror (false).
 * @param {boolean} input.gitBashActive - dsh-gitbash-shell stack active (bash
 *   rows swap; the capability shape is that plugin's contract).
 * @param {string|undefined} input.skillsDir - resolved progressive-skills
 *   directory (beside @deepseek-ai/dsh-agent-preset); empty contribution when
 *   unresolvable — the preset still mounts, without the authoring skills.
 * @param {boolean} [input.pythonRuntime] - the experimental CPython PTC
 *   backend is selected. The workflow engine hard-requires the TypeScript
 *   runtime (`packages/workflow/workflow-ptc/src/index.ts:117` throws when
 *   `ctx.ptcRuntime.language !== 'typescript'`), and a failing row rejects the
 *   WHOLE preset mount (`agent-preset-registry/src/mount.ts:257`), so this side
 *   disables both workflow rows exactly like the official Python composition
 *   (`snapshots/session/ptc-python-turn/cordis.yml:25-36`). The user's own
 *   workflow setting is preserved and applies again once Python is off;
 *   `tool-plugin-manager` keeps following that setting, not this one.
 * @returns {object[]} the declarative plugins list.
 */
export function pluginsFor({ workflowOn, gitBashActive, skillsDir, pythonRuntime = false }) {
  const win = typeof process !== 'undefined' && process.platform === 'win32'
  const bashDisabled = gitBashActive ? false : win
  const pwshDisabled = gitBashActive ? true : !win
  const workflowRowsOn = workflowOn && pythonRuntime !== true
  return [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: {
        prefix: 'You are a coding agent powered by the {{model}} model.',
        suffix: 'Your working directory is {{cwd}}.',
      },
    },
    {
      id: 'agent-instructions',
      name: '@deepseek-ai/dsh-agent-instructions',
      config: { maxBytes: 65536 },
    },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', ...off(bashDisabled) },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', ...off(pwshDisabled) },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    {
      id: 'tool-fs-search',
      name: '@deepseek-ai/dsh-tool-fs-search',
      config: { sampleOverCapGlobResults: false },
    },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    {
      id: 'planning',
      name: 'cordis:group',
      group: true,
      isolate: { planMode: true },
      config: [
        {
          id: 'plan-mode',
          name: '@deepseek-ai/dsh-plan-mode',
          config: {
            // Transcribed byte-exact from the official 0.1.7 plan-mode section
            section: `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.
`,
          },
        },
      ],
    },
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
        {
          id: 'tool-result-pruner',
          name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
          config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
        },
      ],
    },
    {
      id: 'delegation',
      name: 'cordis:group',
      group: true,
      isolate: { workflowEngine: true },
      config: [
        { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
        { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
        {
          id: 'tool-subagent',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true, backgroundMode: 'continuable' },
        },
        {
          id: 'tool-subagent-fork',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable' },
        },
        {
          id: 'tool-subagent-codex',
          name: '@deepseek-ai/dsh-tool-subagent',
          disabled: true,
          config: { provider: 'codex', toolName: 'subagent_codex', backgroundMode: 'one-shot', maxDepth: 'provider-managed' },
        },
        {
          id: 'tool-subagent-claude-code',
          name: '@deepseek-ai/dsh-tool-subagent',
          disabled: true,
          config: { provider: 'claude-code', toolName: 'subagent_claude_code', backgroundMode: 'one-shot', maxDepth: 'provider-managed' },
        },
        {
          id: 'workflow-ptc',
          name: '@deepseek-ai/dsh-workflow-ptc',
          ...off(!workflowRowsOn),
          config: { provider: 'spawn' },
        },
        { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', ...off(!workflowRowsOn) },
        {
          id: 'tool-ralph',
          name: '@deepseek-ai/dsh-tool-ralph',
          disabled: true,
          config: { subagentProvider: 'spawn', maxRounds: 64 },
        },
      ],
    },
    { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
    {
      id: 'tool-todo',
      name: '@deepseek-ai/dsh-tool-todo',
      config: { allowParallelInProgress: true },
    },
    {
      id: 'tool-web',
      name: '@deepseek-ai/dsh-tool-web',
      config: { fetch: true, searchTimeoutMs: 60000 },
    },
    // PTC mode for this agent alone — the union's defining row.
    {
      id: 'tool-presentation',
      name: '@deepseek-ai/dsh-agent-tool-presentation',
      config: { mode: 'ptc' },
    },
    // The self-referential Cordis toolset, bare like the shipped 'cordis'
    // preset (host-plane runner; coexistence via the inspect-registry shim
    // wired in index.js — dsh 0.1.7 also moved provider registration to a
    // host-plane row, so the shim is a belt-and-braces no-op there).
    { id: 'tool-cordis', name: '@deepseek-ai/dsh-tool-cordis' },
    {
      id: 'skill-filesystem',
      name: '@deepseek-ai/dsh-skill-filesystem',
      ...(skillsDir ? { config: { customSkillDirs: [skillsDir] } } : {}),
    },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
    // Creation side keeps plugin management on; the ptc-mirror side matches
    // the official 'ptc' preset (disabled).
    {
      id: 'tool-plugin-manager',
      name: '@deepseek-ai/dsh-plugin-manager/tools',
      ...off(!workflowOn),
    },
  ]
}

/** Display metadata for the registration (mirrors the committed preset.yml). */
export const PRESET_META = {
  id: 'ptc-cordis',
  name: 'PTC 创造模式',
  description: 'PTC 模式 + 创造模式:在 run_code 编排之上提供运行时读写与组合编写能力(workflow 侧由设置卡决定)。',
  order: 5,
  /**
   * The Git Bash twin's display metadata, mirroring the committed
   * `assets/preset.gitbash.yml` (issue #1: the declarative registration used to
   * hand the roster the plain name, so a Git Bash-materialized preset still
   * showed as「PTC 创造模式」while dsh-gitbash-shell's four variants all end in
   * 「· Git Bash」). The smoke test asserts both strings against that asset, so
   * the committed twin and the live roster cannot drift apart.
   */
  gitBash: {
    name: 'PTC 创造模式 · Git Bash',
    description: 'PTC 模式 + 创造模式:在 run_code 编排之上提供运行时读写与组合编写能力(workflow 侧由设置卡决定)。(Shell 使用 Git Bash)',
  },
}

/**
 * The roster metadata for one Git Bash side: the `.gitbash` twin while
 * dsh-gitbash-shell's stack is active, the plain one otherwise. Named fields
 * only — the caller owns which keys reach `agentPresets.register`.
 * @param {boolean} gitBashActive - the peer capability's `active` flag.
 * @returns {{ name: string, description: string }} display fields for the registration.
 */
export function presetMetaFor(gitBashActive) {
  return gitBashActive === true
    ? { name: PRESET_META.gitBash.name, description: PRESET_META.gitBash.description }
    : { name: PRESET_META.name, description: PRESET_META.description }
}
