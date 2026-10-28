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
 *   - since v0.20.0 both workflow rows are PERMANENTLY disabled — the
 *     official 'ptc' patch's exact shape. run_code is this preset's only
 *     model-authored orchestration surface (the engine itself runs through
 *     the shared PTC runtime), so the retired 'workflow' card setting is
 *     gone and tool-plugin-manager stays fixed on the Creation side;
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
 * @param {boolean} input.gitBashActive - dsh-gitbash-shell stack active (bash
 *   rows swap; the capability shape is that plugin's contract).
 * @param {string|undefined} input.skillsDir - resolved progressive-skills
 *   directory (beside @deepseek-ai/dsh-agent-preset); empty contribution when
 *   unresolvable — the preset still mounts, without the authoring skills.
 * @param {object} [input.hostExtras] - the dsh 0.2.1 preset deltas, probed:
 *   `time-context` (durable clock readings, added alpha.1) and
 *   `tool-schedule` (the reminder tools, added alpha.1) join every full-tool
 *   preset; alpha.3 then REMOVED the subagent `toolFilter.deny` of the four
 *   schedule_* tools and alpha.4 added `tool-plugin-market` after
 *   `tool-plugin-manager` (enabled under a profile context on the cordis
 *   side, disabled on the ptc side — mirrored here by following the creation
 *   switch like the manager row). A preset row whose package is absent
 *   rejects the WHOLE mount, so these ride a probe: each flag is true only
 *   when `@deepseek-ai/dsh-time-context` / `@deepseek-ai/dsh-tool-schedule`
 *   / `@deepseek-ai/dsh-plugin-market/tools` resolve from the HOST's module
 *   base (`ctx.baseUrl` — the same base `prepareProfileEntries` mounts rows
 *   from). On dsh <= 0.2.0 hosts all stay false and the row set is
 *   byte-identical to the 0.1.7 capture; on 0.2.1+ it matches the 0.2.1
 *   capture.
 * @param {boolean} [input.inlinePatched] - v0.21.2: the peer capability's
 *   `inlinePatched` flag (dsh-gitbash-shell v0.35.1+) — its inline route-B
 *   patch serves a private Git Bash tool to every agent whose face has a pwsh
 *   tool but no bash tool. Under such a peer the v0.13.0 shape (official
 *   tool-bash row ON, pwsh row OFF while unmasked) is exactly backwards: the
 *   official row executes through the root PowerShell executor (a fake bash),
 *   and removing the pwsh row removes the very trigger the route keys on.
 *   When the flag is set, assemble the OFFICIAL win32 shape instead — bash
 *   off, pwsh on — and let the peer's inline route do its work. Older peers
 *   omit the field and keep the legacy shape, which matched them while they
 *   still swapped `ctx.shell` (the official row then really ran Git Bash).
 * @param {boolean} [input.opsPresent] - a LEGACY dsh-ops stack (its
 *   `dsh-ops-shell` or `dsh-ops-file` row, dsh-ops <= 0.4.2) is mounted and
 *   enabled in this profile. dsh-ops 0.4.3+ replaced those rows with
 *   preset-mode switches (`dsh-ops-mode-*`) that gate on the agent's preset
 *   id: this preset's id matches no mode, so dsh-ops publishes and hides
 *   nothing here and the v0.25.0 disablement stands — `detectOpsPresence`
 *   reports that era separately (`modeRows`, log only) and never sets this
 *   flag for it. The
 *   v0.25.0 issue #7 rule disabled `tool-pwsh` whenever the Git Bash side was
 *   active: the official row then ran `pwsh -Command` through the bash seam
 *   as an unprotected fake pwsh. That hazard is gone on a modern stack —
 *   dsh-gitbash-shell's translation layer guards the seam, and its own
 *   masking hands off entirely when dsh-ops is present
 *   (`hidePwsh && !opsPresent`), so the official presets DO keep the row.
 *   When dsh-ops is present this side follows suit instead of remaining the
 *   one preset that can never see pwsh; without dsh-ops the v0.25.0 behavior
 *   stands unchanged.
 * @param {boolean} [input.peerPwshTool] - v0.20.1: the peer's
 *   `gitBash.pwshToolEnabled` (dsh-gitbash-shell v0.40.3+) — the masking
 *   layer's exact verdict, i.e. the user turned the official pwsh row ON by
 *   hand. Same "the row is worth keeping" signal as `opsPresent`; releases
 *   the disablement the same way. Older peers omit the field (undefined ->
 *   false) and keep v0.20.0.
 * @returns {object[]} the declarative plugins list.
 */
export function pluginsFor({ gitBashActive, inlinePatched = false, skillsDir, hostExtras = {}, opsPresent = false, peerPwshTool = false }) {
  const win = typeof process !== 'undefined' && process.platform === 'win32'
  // v0.21.2: route-B peers (dsh-gitbash-shell v0.39.0+) patch their own bash
  // tool into every agent that has a pwsh tool but no bash tool. Serve them
  // the official win32 shape so the route can fire; keep the v0.13.0 shape
  // for legacy peers that still swap ctx.shell.
  const routeB = gitBashActive && inlinePatched === true
  const bashDisabled = routeB ? win : (gitBashActive ? false : win)
  // v0.20.1: the peer's `gitBash.pwshToolEnabled` (dsh-gitbash-shell v0.40.3+)
  // is the masking layer's exact verdict — the user turned the official pwsh
  // row ON by hand. That is the same "the row is worth keeping" signal as
  // dsh-ops presence, so it releases the disablement the same way; older
  // peers never publish the field (undefined -> false) and keep v0.20.0.
  const pwshDisabled = routeB ? !win : (gitBashActive && !opsPresent && !peerPwshTool ? true : !win)
  // dsh 0.2.2-alpha.2 reworked the tool execution architecture
  // (`executorPlugin`): PTC mounts the explicit tool-executor-ptc row instead
  // of the deprecated presentation selector, the subagent config renamed
  // `modelSelectionSettings` to `modelSelection` + opt-in `modelDiscovery`,
  // list-agents folded into the control row itself, and the manager/market
  // rows gate on the live profile context instead of a fixed side.
  const { timeContext = false, toolSchedule = false, pluginMarket = false, executorPlugin = false, profileContext = false } = hostExtras
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
        // 0.2.2-alpha.2 folded list_agents into the control row itself; the
        // separate child row is gone, so alpha.2+ hosts must not mount it.
        ...(executorPlugin ? [] : [{ id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' }]),
        {
          id: 'tool-subagent',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: executorPlugin
            ? { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true, ...(timeContext ? {} : { backgroundMode: 'continuable' }) }
            : { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true, ...(timeContext ? {} : { backgroundMode: 'continuable' }) },
        },
        {
          id: 'tool-subagent-fork',
          name: '@deepseek-ai/dsh-tool-subagent',
          config: { provider: 'fork', toolName: 'subagent_fork', ...(timeContext ? {} : { backgroundMode: 'continuable' }) },
        },
        // v0.20.0: both rows permanently disabled, byte-for-byte the official
        // 'ptc' patch's shape (run_code is the only model-authored
        // orchestration surface here; the engine itself runs on the shared
        // PTC runtime). The rows stay so re-alignment diffs stay row-for-row.
        {
          id: 'workflow-ptc',
          name: '@deepseek-ai/dsh-workflow-ptc',
          disabled: true,
          config: { provider: 'spawn' },
        },
        { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', disabled: true },
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
    // PTC mode for this agent alone — the union's defining row. From
    // 0.2.2-alpha.2 on that is the explicit executor row (the base deployment
    // keeps tool-executor-native; a scoped row overrides it for this agent).
    ...(executorPlugin
      ? [{ id: 'tool-executor-ptc', name: '@deepseek-ai/dsh-tool-executor-ptc' }]
      : [{ id: 'tool-presentation', name: '@deepseek-ai/dsh-agent-tool-presentation', config: { mode: 'ptc' } }]),
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
    // Creation side: before 0.2.2-alpha.2 plugin management stays on here
    // (fixed since v0.20.0); alpha.2 gates it on the live profile context, so
    // the probe decides.
    {
      id: 'tool-plugin-manager',
      name: '@deepseek-ai/dsh-plugin-manager/tools',
      ...(executorPlugin ? off(!profileContext) : {}),
    },
    // dsh 0.2.1-alpha.4 appended the plugin market right after the manager,
    // mirroring the official Creation presets (enabled under a profile
    // context on cordis). Rides the pluginMarket probe.
    ...(pluginMarket ? [{ id: 'tool-plugin-market', name: '@deepseek-ai/dsh-plugin-market/tools', ...(executorPlugin ? off(!profileContext) : {}) }] : []),
  ]
}

/** Display metadata for the registration (mirrors the committed preset.yml). */
export const PRESET_META = {
  id: 'ptc-cordis',
  name: 'PTC 创造模式',
  description: 'PTC 模式 + 创造模式:在 run_code 编排之上提供运行时读写与组合编写能力(workflow 工具恒不提供,与官方 PTC 模式一致)。',
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
    description: 'PTC 模式 + 创造模式:在 run_code 编排之上提供运行时读写与组合编写能力(workflow 工具恒不提供,与官方 PTC 模式一致)。(Shell 使用 Git Bash)',
  },
}

/**
 * The roster metadata for one Git Bash side: the `.gitbash` twin while
 * dsh-gitbash-shell's stack is active, the plain one otherwise. Named fields
 * only — the caller owns which keys reach `agentPresets.register`.
 *
 * v0.17.3 adds the second parameter: when the peer reports `inlinePatched`
 * (dsh-gitbash-shell v0.35.1+), its inline tool patch gives EVERY official
 * preset Git Bash — the suffix no longer distinguishes anything and the plain
 * name is correct. The flag wins over `gitBashActive`; without it (older
 * peer) the v0.14.0 wording stands. `presetMetaFor(true)` alone keeps
 * returning the committed `assets/preset.gitbash.yml` strings — that asset
 * stays the single source of truth for the twin's name.
 * @param {boolean} gitBashActive - the peer capability's `active` flag.
 * @param {boolean} [inlinePatched] - the peer capability's `inlinePatched` flag.
 * @returns {{ name: string, description: string }} display fields for the registration.
 */
export function presetMetaFor(gitBashActive, inlinePatched) {
  if (inlinePatched === true) {
    return { name: PRESET_META.name, description: PRESET_META.description }
  }
  return gitBashActive === true
    ? { name: PRESET_META.gitBash.name, description: PRESET_META.gitBash.description }
    : { name: PRESET_META.name, description: PRESET_META.description }
}
