/**
 * dsh-ptc-cordis-preset — host half.
 *
 * A Creation mode built on top of PTC mode. DSH ships four presets:
 * `standard`, `code` (PTC mode — the standard agent with its tools presented
 * through the Code Mode SDK), `minimal`, and `cordis` (Creation mode — the
 * standard agent plus the self-referential Cordis toolset and preset-authoring
 * guidance). Creation mode is based on standard; this plugin contributes the
 * missing fourth combination: PTC mode PLUS the Creation-mode additions.
 *
 * HOW: the agent-preset roster (`ctx.agentPresets`) re-scans its roots on
 * every list(), so a preset directory that appears under the user root while
 * the process runs is visible immediately. On startup this plugin materializes
 * a `ptc-cordis` preset directory into the FIRST user-trust root:
 *
 *   agent.cordis.yml  — the union composition: the shipped `code` preset
 *                       unchanged (including the `tool-presentation` row)
 *                       plus the `cordis` preset's persona, `tool-cordis`
 *                       row, and skill-carrying `skill-filesystem` config.
 *   preset.yml        — display metadata ("PTC 创造模式").
 *   skills/           — copied from the INSTALLED shipped `cordis` preset, so
 *                       the composition-authoring guidance tracks the
 *                       deployment instead of a snapshot frozen in this repo.
 *   .plugin-managed.json — marker recording every file hash this plugin wrote.
 *
 * ERA SPLIT (v0.7.0): dsh renamed the built-in `code` preset to `ptc` in
 * 0.1.2 with no compatibility alias (the tool-presentation `mode` value and
 * several built-in rows differ), so this plugin ships BOTH committed era
 * texts and picks per boot by probing the roster for the built-in id
 * (`ptc` → dsh >= 0.1.2, else `code` → dsh <= 0.1.1). The marker records the
 * era (`base`), and a flipped detection re-materializes on the next startup
 * — either upgrade order (plugin first, dsh first) converges on the correct
 * text without ever touching user-modified trees.
 *
 * The marker is what keeps user ownership honest:
 *   - untouched tree → an updated plugin version re-materializes in place;
 *   - untouched AND current (same version, live skills source unchanged) →
 *     idle: no writes, no startup output;
 *   - user-edited tree (any hash mismatch) → the plugin never touches it
 *     again, on startup or on uninstall;
 *   - a `ptc-cordis` directory without the marker was authored by someone
 *     else → the plugin leaves it alone entirely.
 *
 * Uninstall hygiene mirrors dsh-deepseek-vision-bridge: on disposal, a package
 * directory that still exists means reload/update/restart — keep the preset;
 * a vanished package.json means uninstall — remove the preset, but only if the
 * user never modified it. CLI uninstall (a separate dsh process) never runs
 * disposal, so the preset can survive it; delete it from the settings page.
 */
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-ptc-cordis-preset'

/** The preset roster is a hard dependency: without it there is nothing to do. */
export const inject = ['agentPresets']

const TAG = '[ptc-cordis]'
const PRESET_ID = 'ptc-cordis'
const MANAGED_BY = 'dsh-ptc-cordis-preset'
const MARKER_FILE = '.plugin-managed.json'
const SKILLS_SOURCE_PRESET = 'cordis'

/**
 * Settings namespace served by the host half; the Settings → Plugins card
 * (client half) pairs with it under the same key. One boolean knob.
 */
const SETTINGS_NAMESPACE = 'ptc-cordis'
/**
 * The default workflow side (v0.8.0): ON — Creation mode keeps the workflow
 * tool and this preset has shipped it enabled through 0.7.0, so upgrades
 * keep the capability. Only an explicit `workflow: false` in settings
 * switches to the official `ptc` shape (run_code as the only model-authored
 * orchestration surface, engine row kept for `ralph`).
 */
const DEFAULT_WORKFLOW = true

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, '..')

// ── tree hashing ────────────────────────────────────────────────────────────

/** Every file under `root`, as sorted relative POSIX-style paths. */
function walkFiles(root, rel = '') {
  const out = []
  let entries
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walkFiles(root, r))
    else if (e.isFile()) out.push(r)
  }
  return out.sort()
}

/**
 * Map of relative path → sha256 for every file under `root`. The marker file
 * itself is always excluded: it is written after hashing and cannot contain
 * its own digest, so every comparison below is over managed content only.
 */
function hashTree(root) {
  const files = {}
  for (const rel of walkFiles(root)) {
    if (rel === MARKER_FILE) continue
    files[rel] = createHash('sha256').update(readFileSync(join(root, rel))).digest('hex')
  }
  return files
}

/** The parsed marker, or null when the tree is not ours. */
function readMarker(target) {
  try {
    const m = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    if (m && m.managedBy === MANAGED_BY && m.files && typeof m.files === 'object') return m
  } catch {
    /* absent or unreadable → not ours */
  }
  return null
}

/**
 * Classify a preset directory against this plugin:
 *   'absent'          — nothing there yet
 *   'foreign'         — exists, but no marker we recognize: never touch it
 *   'user-modified'   — ours, but at least one file changed since we wrote it
 *   'unmodified'      — exactly what we last wrote
 */
function classify(target) {
  if (!existsSync(target)) return 'absent'
  const marker = readMarker(target)
  if (!marker) return 'foreign'
  const current = hashTree(target)
  const recorded = marker.files
  const keys = Object.keys(recorded)
  if (keys.length !== Object.keys(current).length) return 'user-modified'
  for (const k of keys) if (current[k] !== recorded[k]) return 'user-modified'
  return 'unmodified'
}

/** 'skills/<rel>' → sha256 map of a skills source tree, or null when absent. */
function skillsHashes(source) {
  if (!source || !existsSync(source)) return null
  const out = {}
  for (const rel of walkFiles(source)) {
    out[`skills/${rel}`] = createHash('sha256').update(readFileSync(join(source, rel))).digest('hex')
  }
  return out
}

// ── built-in era detection (dsh 0.1.2 renamed the `code` preset to `ptc`) ──

/**
 * Which built-in PTC preset does the installed dsh ship? dsh 0.1.2 renamed
 * the preset id `code` to `ptc` with no compatibility alias, and the
 * tool-presentation `mode` value renamed with it, so the composition TEXT is
 * era-specific. The roster probe is the version-agnostic signal. Pure
 * companion of `detectBase` (which fetches the roster); 'ptc' wins if both
 * ids somehow exist, and an unknown roster conservatively maps to 'code' —
 * the era text the stable release accepted.
 */
function baseForRoster(ids) {
  const set = new Set(ids)
  if (set.has('ptc')) return 'ptc'
  return 'code'
}

/** Async probe against the live roster; never throws. */
async function detectBase(agentPresets) {
  try {
    const list = await agentPresets.list()
    return baseForRoster((Array.isArray(list) ? list : []).map((p) => p && p.id))
  } catch (error) {
    console.log(`${TAG} built-in preset probe failed (${error?.message ?? error}) — assuming the 'code' era`)
    return 'code'
  }
}

/** Era suffix for committed composition assets: ptc-era files carry `.ptc`. */
function eraSuffix(base) {
  return base === 'ptc' ? '.ptc' : ''
}

/**
 * Pick the committed composition asset for one materialization (pure).
 * Candidates go from most specific (era × capability × workflow) to the
 * plain base file, so an era without a variant twin still resolves. The
 * workflow-ON dimension (.workflow twins, v0.8.0) only exists for the ptc
 * era — the official `ptc` preset disabled `tool-workflow` in 0.1.2-alpha.4
 * while Creation mode keeps it, so this plugin ships both sides and the
 * card setting picks; a workflow-ON request on the code era falls through
 * to the base chain, whose 0.1.1 text already carries the row ENABLED
 * (0.1.1 shipped no disable), which is the correct semantics there.
 * Every candidate is a committed file — no runtime text synthesis.
 */
function pickComposition(base, gitBashActive, workflowOn, available) {
  const era = eraSuffix(base)
  const gb = gitBashActive ? '.gitbash' : ''
  const candidates = []
  if (workflowOn) {
    candidates.push(
      `agent.cordis${era}${gb}.workflow.yml`,
      `agent.cordis${era}.workflow.yml`,
      `agent.cordis${gb}.workflow.yml`,
      'agent.cordis.workflow.yml',
    )
  }
  candidates.push(`agent.cordis${era}${gb}.yml`, `agent.cordis${gb}.yml`, `agent.cordis${era}.yml`, 'agent.cordis.yml')
  for (const file of candidates) if (available.includes(file)) return file
  return 'agent.cordis.yml'
}

/**
 * Startup decision for an existing unmodified tree (pure):
 *   'refresh' — the plugin version changed, the detected built-in era
 *              (`base`) flipped (dsh crossed the 0.1.2 code→ptc rename), the
 *              `workflow` card setting flipped (v0.8.0: marker records which
 *              side was materialized), or the live skills source drifted from
 *              what we recorded (e.g. a DSH upgrade shipped new skill files)
 *              → re-materialize so the composition and skills keep tracking
 *              the deployment and the user's choice;
 *   'idle'    — same plugin version, same era, same workflow side, skills in
 *              sync → nothing on disk would change, so write nothing and log
 *              nothing.
 */
function syncDecision({ state, marker, version, sourceHashes, gitBashActive = false, workflowOn = true, base = 'code' }) {
  if (state !== 'unmodified' || !marker) return 'refresh'
  if (marker.version !== version) return 'refresh'
  if (marker.gitBash !== gitBashActive) return 'refresh'
  if (marker.base !== base) return 'refresh'
  if ((marker.workflow ?? true) !== workflowOn) return 'refresh'
  const recorded = {}
  for (const k of Object.keys(marker.files)) if (k.startsWith('skills/')) recorded[k] = marker.files[k]
  if (sourceHashes === null) return Object.keys(recorded).length === 0 ? 'idle' : 'refresh'
  const live = Object.keys(sourceHashes)
  const seen = Object.keys(recorded)
  if (live.length !== seen.length) return 'refresh'
  for (const k of live) if (recorded[k] !== sourceHashes[k]) return 'refresh'
  return 'idle'
}

// ── materialization ─────────────────────────────────────────────────────────

/**
 * Write the preset directory from scratch. The caller has already decided the
 * previous tree (if any) may be replaced. Returns 'ok' or 'no-skills-source'.
 */
function materialize({ target, skillsSource, version, gitBashActive = false, workflowOn = true, base = 'code' }) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  // Committed variants keep the composition text reviewable (AGENTS.md):
  // the era probe, the capability, and the workflow setting only PICK the
  // file; no runtime synthesis.
  const available = readdirSync(join(pkgDir, 'assets')).filter((f) => f.endsWith('.yml'))
  const compositionFile = pickComposition(base, gitBashActive, workflowOn, available)
  const metadataFile = gitBashActive ? 'preset.gitbash.yml' : 'preset.yml'
  writeFileSync(join(target, 'agent.cordis.yml'), readFileSync(join(pkgDir, 'assets', compositionFile)))
  writeFileSync(join(target, 'preset.yml'), readFileSync(join(pkgDir, 'assets', metadataFile)))

  let skills = 'copied'
  if (skillsSource && existsSync(skillsSource)) {
    // dereference, so the copy is self-contained (same policy as the roster's copy())
    cpSync(skillsSource, join(target, 'skills'), { recursive: true, force: true, dereference: true })
  } else {
    // The composition's customSkillDirs points at skills/ regardless; an empty
    // dir simply contributes no extra skills. The preset still mounts.
    mkdirSync(join(target, 'skills'), { recursive: true })
    skills = 'missing-source'
  }

  const marker = { managedBy: MANAGED_BY, version, presetId: PRESET_ID, base, gitBash: gitBashActive, workflow: workflowOn, files: hashTree(target) }
  writeFileSync(join(target, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n')
  return skills
}

/**
 * Disposal-time cleanup. `packageJsonExists` distinguishes uninstall (the
 * package directory is gone — market-page uninstall removes it before
 * disposal) from reload/update/restart (package intact, preset should stay).
 * Removes only a tree the user never modified.
 */
function cleanupOnDispose({ target, packageJsonExists }) {
  if (packageJsonExists) return 'kept-package-intact'
  const state = classify(target)
  if (state === 'unmodified') {
    rmSync(target, { recursive: true, force: true })
    return 'removed'
  }
  return `kept-${state}`
}

// ── plugin ──────────────────────────────────────────────────────────────────

/** First user-trust root: the roster's authoring target (`copy()` lands there). */
function firstUserRoot(roots) {
  for (const r of roots) if (r && r.trust === 'user' && typeof r.path === 'string') return r
  return undefined
}

/** Directory of skills inside the installed shipped `cordis` preset, if any. */
async function findSkillsSource(agentPresets) {
  try {
    const list = await agentPresets.list()
    const cordis = Array.isArray(list) ? list.find((p) => p && p.id === SKILLS_SOURCE_PRESET && typeof p.path === 'string') : undefined
    if (!cordis) return undefined
    return join(dirname(cordis.path), 'skills')
  } catch {
    return undefined
  }
}

// ── inspect-registry compatibility shim ─────────────────────────────────────
//
// The host-plane runner's inspect registry is a process-global singleton and
// its `register` THROWS on a duplicate provider id. `dsh-tool-cordis`
// registers the same provider ids from every preset that mounts it, so a
// process hosting both the built-in Creation mode and ptc-cordis failed the
// SECOND mount ("Host Cordis inspect provider "Service" is already
// registered") — and the only alternative shape (a realm-private runner,
// v0.2.0) severed the browser bridge, because the browser half injects
// `remote.dynamicCordisRunner`, which resolves solely the host-plane
// instance. Two registrants of the SAME package produce identical manifests,
// so replacing the stored entry instead of throwing is behaviorally a no-op
// for consumers, and the identity-guarded disposer keeps teardown consistent.
// With this, both presets share the one host runner — exactly its designed
// multi-session usage — and approvals, client providers, client activation,
// and dynamic tools all stay on the real bridge (verified live, 2026-08).

const SHIM_FLAG = '__ptcCordisRegisterShim'

/**
 * Wrap one inspect registry's `register` to tolerate duplicate same-shape
 * registrations by REPLACING the stored entry (original-first: a native
 * upstream fix makes this wrapper an inert no-op). Pure apart from the wrap.
 *
 * @param {object|null|undefined} reg - the `cordisInspect` service instance.
 * @returns {{installed: boolean, restore: () => void}} restore puts the
 *   original method back (entries already written are left as they lie).
 */
export function installRegisterShim(reg) {
  const restore = () => {}
  if (!reg || typeof reg.register !== 'function' || !(reg.providers instanceof Map)) {
    return { installed: false, restore }
  }
  if (reg.register[SHIM_FLAG] === true) return { installed: false, restore } // already wrapped
  const original = reg.register
  try {
    const wrapped = function register(registration) {
      try {
        return original.call(this, registration)
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        if (!message.includes('is already registered')) throw error
        const manifest = registration && registration.manifest
        if (!manifest || typeof manifest.id !== 'string') throw error
        const stored = { ...registration, manifest }
        this.providers.set(manifest.id, stored)
        const self = this
        return () => {
          if (self.providers.get(manifest.id) === stored) self.providers.delete(manifest.id)
        }
      }
    }
    try { Object.defineProperty(wrapped, SHIM_FLAG, { value: true }) } catch { /* cosmetic */ }
    reg.register = wrapped
    return {
      installed: true,
      restore: () => {
        try { if (reg.register === wrapped) reg.register = original } catch { /* never block */ }
      },
    }
  } catch {
    return { installed: false, restore }
  }
}

/**
 * Detect the dsh-gitbash-shell capability. That bundle's host row publishes
 * the `gitBash` service ({ active, bashPath }) when the executor stack is
 * Git Bash; rows mount concurrently, so poll briefly when it is not there
 * yet. A short absence means the cooperative plugin is not installed (or
 * the capability is inactive by design).
 * @returns Promise<boolean> — true when the Git Bash stack is active.
 */
async function detectGitBash(ctx, timeoutMs = 1000, intervalMs = 25) {
  try {
    const probe = () => {
      const cap = ctx.get('gitBash')
      return cap === null || cap === undefined ? undefined : cap
    }
    let cap = probe()
    if (cap === undefined) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        cap = probe()
        if (cap !== undefined) break
      }
    }
    return cap?.active === true
  } catch {
    return false
  }
}

// ── workflow card setting (v0.8.0) ───────────────────────────────────────────

/** Resolve one settings value to a workflow side: only explicit false is OFF. */
export function workflowOf(value) {
  return value?.workflow === false ? false : DEFAULT_WORKFLOW
}

/** Read the current workflow side from a registered SettingsScope; never throws. */
function readWorkflowSetting(scope) {
  try {
    return workflowOf(scope?.get?.())
  } catch {
    return DEFAULT_WORKFLOW
  }
}

/**
 * Serve the `ptc-cordis` settings namespace (one boolean). Dynamic imports
 * keep this module importable by the zero-dependency smoke test; resolution
 * at plugin runtime walks the profile's shared fallback (the
 * dsh-agent-lang / dsh-better-workspace pattern). Returns the registered
 * SettingsScope, or null when anything about the shape is off — callers then
 * simply run with DEFAULT_WORKFLOW.
 */
async function registerWorkflowSetting(sctx) {
  try {
    const [ds, sm] = await Promise.all([import('@deepseek-ai/dsh-settings'), import('@deepseek-ai/schemastery')])
    const settings = sctx && sctx.settings
    if (!settings || typeof settings.register !== 'function') return null
    const Schema = sm.default
    // Era probe: dsh >= 0.1.2-alpha.2 removed settingsNamespace(); register()
    // takes a plain string there, and the older register() accepted the
    // branded helper — one call satisfies both eras.
    const ns = typeof ds.settingsNamespace === 'function' ? ds.settingsNamespace(SETTINGS_NAMESPACE) : SETTINGS_NAMESPACE
    const schema = Schema.object({
      workflow: Schema.boolean().default(DEFAULT_WORKFLOW),
    })
    const scope = settings.register(ns, schema)
    if (!scope || typeof scope.get !== 'function') return null
    console.log(`${TAG} settings namespace '${SETTINGS_NAMESPACE}' registered (workflow knob for the Settings card)`)
    return scope
  } catch (error) {
    console.log(`${TAG} settings namespace registration failed (${error?.message ?? error}) — the workflow knob stays at its default`)
    return null
  }
}

/**
 * The materialization core, run once at startup and again whenever the
 * workflow setting flips (see the scope.watch in apply). Re-probes era and
 * Git Bash capability each time — both are cheap roster reads — and honors
 * the foreign / user-modified ownership rules on every pass.
 */
async function materializeCore(ctx, userRoot, workflowOn) {
  let version = '0.0.0'
  try {
    version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version ?? version
  } catch {
    /* fall back to the placeholder */
  }

  const skillsSource = await findSkillsSource(ctx.agentPresets)
  const gitBashActive = await detectGitBash(ctx)
  if (gitBashActive) console.log(`${TAG} dsh-gitbash-shell detected — materializing with Git Bash shell rows`)
  const base = await detectBase(ctx.agentPresets)
  const target = join(userRoot.path, PRESET_ID)
  const state = classify(target)

  if (state === 'foreign') {
    console.log(`${TAG} a preset not written by this plugin already exists at ${target} — leaving it alone`)
    return
  }
  if (state === 'user-modified') {
    console.log(`${TAG} preset at ${target} was modified after materialization — keeping the user's version (delete the directory to re-materialize)`)
    return
  }

  // Quiet-startup short-circuit: same plugin version, same era, same
  // workflow side, AND the live skills source still hashes to what we
  // recorded → nothing on disk would change, so write nothing and print
  // nothing (one debug line through the cordis logger).
  const sourceHashes = skillsHashes(skillsSource)
  if (state === 'unmodified' && syncDecision({ state, marker: readMarker(target), version, sourceHashes, gitBashActive, workflowOn, base }) === 'idle') {
    ctx.logger?.('ptc-cordis')?.debug?.(`preset '${PRESET_ID}' up to date (v${version}, ${base}-era, workflow ${workflowOn ? 'ON' : 'OFF'}) — idle`)
    return
  }

  const skills = materialize({ target, skillsSource, version, gitBashActive, workflowOn, base })
  const verb = state === 'absent' ? 'materialized' : 'refreshed'
  console.log(
    `${TAG} ${verb} preset '${PRESET_ID}' ("PTC 创造模式") into ${userRoot.path} (v${version}, ${base}-era composition, workflow ${workflowOn ? 'ON — Creation-side capability' : 'OFF — matches the official ptc preset'})` +
      (skills === 'copied' ? ` (skills copied from the installed '${SKILLS_SOURCE_PRESET}' preset)` : ' (WARNING: shipped cordis preset not found — skills/ left empty)'),
  )
}

export async function apply(ctx) {
  // The shim rides along every mount of this plugin — including the quiet
  // startup path — and degrades silently to v0.3.0's bare behavior when the
  // upstream shape is anything other than what we verified.
  //
  // INSTALL TIMING (0.6.3 fix): the host runner row activates AFTER this
  // plugin's row, so the old one-shot `installRegisterShim(ctx.get('cordisInspect'))`
  // sampled a service that was not provided yet, silently installed nothing,
  // and every later mount of a second cordis-mode preset kept dying with
  // `Host Cordis inspect provider "Service" is already registered` for the
  // rest of the process (observed 2026-08: shim never wrapped in a real boot,
  // collision still live even with no Creation session open). `ctx.inject`
  // schedules the install for the moment the service actually appears —
  // independent of row activation order, and still a no-op in a runner-less
  // deployment.
  try {
    ctx.inject(['cordisInspect'], (inspectCtx) => {
      const shim = installRegisterShim(inspectCtx.get('cordisInspect'))
      if (!shim.installed) return
      inspectCtx.effect(() => () => shim.restore(), 'dsh-ptc-cordis-preset: inspect-registry shim')
      console.log(`${TAG} inspect-registry compatibility shim active (dual cordis-mode sessions supported)`)
    })
  } catch (error) {
    console.log(`${TAG} inspect-registry shim wiring failed: ${error?.message ?? error}`)
  }

  const roots = ctx.agentPresets?.roots ?? []
  const userRoot = firstUserRoot(roots)
  if (!userRoot) {
    console.log(`${TAG} no user-trust preset root configured — nothing to materialize (preset stays absent)`)
    return
  }
  const target = join(userRoot.path, PRESET_ID)

  // Reversible side effect, registered BEFORE any materialization so a quiet
  // startup keeps uninstall hygiene: uninstall removes an unmodified preset;
  // every other stop (reload, update, DSH restart) keeps it.
  ctx.effect(() => () => {
    try {
      const result = cleanupOnDispose({ target, packageJsonExists: existsSync(join(pkgDir, 'package.json')) })
      if (result === 'removed') console.log(`${TAG} package uninstalled — removed the unmodified '${PRESET_ID}' preset`)
      else if (result !== 'kept-package-intact' && result !== 'kept-absent') console.log(`${TAG} preset ${result} on disposal — kept`)
    } catch (error) {
      console.log(`${TAG} cleanup skipped: ${error?.message ?? error}`)
    }
  }, 'dsh-ptc-cordis-preset: preset materialization')

  // The materialization runs inside the settings injection (v0.8.0): the
  // workflow side must be read from the served namespace — registering it
  // needs dynamic imports, so the first run waits for the registration — and
  // a SettingsScope.watch then re-materializes LIVE when the card flips the
  // knob (the roster rescans on every list(), so the new composition reaches
  // NEW sessions immediately; already-mounted sessions keep their snapshot
  // until recomposed). `settings` rides the base bundle, so the injection is
  // guaranteed on every dsh profile that can host plugins at all.
  try {
    ctx.inject(['settings'], async (sctx) => {
      try {
        const scope = await registerWorkflowSetting(sctx)
        const workflowOn = scope ? readWorkflowSetting(scope) : DEFAULT_WORKFLOW
        await materializeCore(ctx, userRoot, workflowOn)
        if (scope && typeof scope.watch === 'function') {
          // Intent tracking in memory, NOT the on-disk marker: a rapid double
          // flip (ON→OFF→ON) would otherwise race the first re-materialization
          // (the marker is only rewritten when it finishes) and the second flip
          // would misread the stale marker as already-in-sync, leaving disk on
          // the wrong side. The watcher contract runs async callbacks one at a
          // time in commit order, so awaiting the re-materialization here keeps
          // consecutive flips strictly serialized on top of the guard.
          let wanted = workflowOn
          const disposer = scope.watch(async (next) => {
            try {
              const want = workflowOf(next)
              if (want === wanted) return
              wanted = want
              if (classify(target) !== 'unmodified') {
                console.log(`${TAG} workflow setting flipped but the preset at ${target} is user-modified — keeping the user's version`)
                return
              }
              console.log(`${TAG} workflow setting flipped → re-materializing (workflow ${want ? 'ON' : 'OFF'}), new sessions pick it up immediately`)
              await materializeCore(ctx, userRoot, want)
            } catch (error) {
              console.log(`${TAG} re-materialization failed: ${error?.message ?? error}`)
            }
          })
          sctx.effect(() => () => disposer(), 'dsh-ptc-cordis-preset: workflow setting watch')
        }
      } catch (error) {
        console.log(`${TAG} materialization pass failed: ${error?.message ?? error}`)
      }
    })
  } catch (error) {
    console.log(`${TAG} settings inject wiring failed (${error?.message ?? error}) — running materialization with the default workflow side`)
    await materializeCore(ctx, userRoot, DEFAULT_WORKFLOW)
  }
}

// Test surface: pure helpers, no Cordis context required.
export const _internal = { PRESET_ID, MARKER_FILE, SETTINGS_NAMESPACE, DEFAULT_WORKFLOW, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree, skillsHashes, syncDecision, installRegisterShim, baseForRoster, detectBase, pickComposition, workflowOf }
