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

// Plan-mode section, shared body with an era-specific FIRST SENTENCE (each
// byte-exact from its era's official patch.yml): dsh 0.1.7..0.2.1-alpha.1
// say "until exit_plan_mode succeeds", 0.2.1-alpha.2 rephrased to "until the
// user approves your plan through exit_plan_mode". The hostExtras probe
// already splits the eras for the row set, so the wording rides the same
// signal — no new probe, and each generation mirrors its own official text.
const PLAN_SECTION_TAIL = `Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.
`

const planSectionFor = (hostEra021) => hostEra021
  ? `You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. ${PLAN_SECTION_TAIL}`
  : `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds or the user switches the session mode. ${PLAN_SECTION_TAIL}`

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
 * @param {object} [input.hostExtras] - dsh 0.2.1 adds two rows to every
 *   full-tool preset — `time-context` (durable clock readings) and
 *   `tool-schedule` (the reminder tools) — plus a `toolFilter` deny of the
 *   four schedule_* tools on the subagent/subagent_fork configs. A preset row
 *   whose package is absent rejects the WHOLE mount, so these ride a probe:
 *   each flag is true only when `@deepseek-ai/dsh-time-context` /
 *   `@deepseek-ai/dsh-tool-schedule` resolve from the HOST's module base
 *   (`ctx.baseUrl` — the same base `prepareProfileEntries` mounts rows from).
 *   On dsh <= 0.2.0 hosts both stay false and the row set is byte-identical
 *   to the 0.1.7 capture; on 0.2.1+ it matches the 0.2.1 capture. The
 *   toolFilter deny follows toolSchedule for the same reason: it exists to
 *   keep reminders out of subagents, which only matters where the tools are.
 * @returns {object[]} the declarative plugins list.
 */
export function pluginsFor({ workflowOn, gitBashActive, skillsDir, pythonRuntime = false, hostExtras = {} }) {
  const win = typeof process !== 'undefined' && process.platform === 'win32'
  const bashDisabled = gitBashActive ? false : win
  const pwshDisabled = gitBashActive ? true : !win
  const workflowRowsOn = workflowOn && pythonRuntime !== true
  const { timeContext = false, toolSchedule = false } = hostExtras
  // The official 0.2.1 deny list, verbatim (schedule tools never reach a
  // subagent; the config key is inert on hosts that predate toolFilter).
  const subagentDeny = toolSchedule
    ? { toolFilter: { deny: ['schedule_create', 'schedule_delete', 'schedule_list', 'schedule_update'] } }
    : {}
  return [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: {
        prefix: 'You are a coding agent powered by the {{model}} model.',
        // NO suffix: re-aligned with the official 0.2.1-alpha.2 presets
        // (upstream 2eb058d887 removed the retired directory persona clause;
        // the `cwd` prompt variable itself was dropped 2026-09-13, upstream
        // 79bd3d8da7). An unregistered variable reference throws BEFORE any
        // model request and kills the whole turn (see dsh-gitbash-shell#16).
        // The host's working-directory runtime context supplies the directory.
      },
    },
    {
      id: 'agent-instructions',
      name: '@deepseek-ai/dsh-agent-instructions',
      config: { maxBytes: 65536 },
    },
    ...(timeContext ? [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }] : []),
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', ...off(bashDisabled) },
    { id: 'tool-pwsh', name: '@deepseek-ai/dsh-tool-pwsh', ...off(pwshDisabled) },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    {
      id: 'tool-fs-search',
      name: '@deepseek-ai/dsh-tool-fs-search',
      config: { sampleOverCapGlobResults: false },
    },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    ...(toolSchedule ? [{ id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' }] : []),
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
            // Byte-exact per era: the hostExtras probe (timeContext) splits
            // dsh 0.1.7..0.2.1-alpha.1 from 0.2.1-alpha.2, whose official
            // patch.yml rephrased the first sentence.
            section: planSectionFor(timeContext),
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
          config: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true, ...(timeContext ? {} : { backgroundMode: 'continuable' }), ...subagentDeny },
        },
        {
          id: 'tool-subagent-fork',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'fork', toolName: 'subagent_fork', ...(timeContext ? {} : { backgroundMode: 'continuable' }), ...subagentDeny },
        },
        {
          id: 'workflow-ptc',
          name: '@deepseek-ai/dsh-workflow-ptc',
          ...off(!workflowRowsOn),
          config: { provider: 'spawn' },
        },
        { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', ...off(!workflowRowsOn) },
        // NO tool-subagent-codex / tool-subagent-claude-code / tool-ralph:
        // the official presets retired these three disabled placeholder rows
        // in 0.2.1-alpha.2 (upstream 8ed0b530ed — the codex/claude-code
        // provider rows moved to on-demand official plugin bundles). They
        // were `disabled: true` on every host generation, so dropping them
        // loses nothing and re-aligns with the shipped 0.2.1 row split.
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
