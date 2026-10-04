/**
 * dsh-ptc-cordis-preset — host half.
 *
 * A Creation mode built on top of PTC mode. DSH ships four presets:
 * `standard`, `ptc` (PTC mode — the standard agent with its tools presented
 * through the Code Mode SDK), `minimal`, and `cordis` (Creation mode — the
 * standard agent plus the self-referential Cordis toolset and preset-authoring
 * guidance). Creation mode is based on standard; this plugin contributes the
 * missing fourth combination: PTC mode PLUS the Creation-mode additions.
 *
 * HOW (declarative, dsh >= 0.1.7): directory presets are gone — the preset is
 * a definition registered through `ctx.agentPresets.register()` whose rows
 * come from src/composition.js (the committed, reviewable data: the shipped
 * `ptc` preset rows plus the `cordis` persona / `tool-cordis` row / skill
 * config). Progressive skills resolve live beside @deepseek-ai/dsh-agent-preset,
 * so preset-authoring guidance tracks the deployment instead of a frozen
 * snapshot. The registration re-runs whenever the workflow or pythonRuntime
 * knob flips (loader/volatile-update on this row); new sessions pick it up
 * immediately, sessions pinned to the preset keep their revision until
 * recomposed.
 *
 * On startup the plugin also cleans up the directory tree OLD versions of
 * this plugin materialized under ~/.dsh/.agent-presets/ptc-cordis — only
 * when the marker proves it untouched (user-modified / foreign trees are
 * left alone and reported; this host ignores them).
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
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PRESET_META, pluginsFor, presetMetaFor } from './composition.js'
import { PYTHON_GUIDANCE, PYTHON_MIN_VERSION, PYTHON_RUNTIME_PACKAGE, discoverPython, resolvePythonPackage } from './python-probe.js'

/**
 * The schemastery module, resolved LAZILY (v0.13.2): `@deepseek-ai/schemastery`
 * is a PEER — plain Node cannot resolve it from this package, only the host's
 * own resolution (the profile shared fallback) supplies it. A deployment whose
 * fallback lacks it used to fail the *static* import at the top of this file,
 * and the Loader treats a failed plugin import as a non-fatal skip
 * (`vendor/loader/src/config/entry.ts` `_init()`: logger.error + return, no
 * fiber) — the row then silently never mounted, which for THIS plugin means
 * the preset is never registered at all (no host half, no `dsh.client` scan,
 * no client bundle) while every host log stays green. Same all-green failure
 * class as dsh-better-workspace issue #9; verified with a fixture plugin whose
 * only difference was the static peer import. Deferring the import hides the
 * schema where the module is absent instead of killing the row.
 */
let Schema = null
try {
  Schema = (await import('@deepseek-ai/schemastery')).default
} catch (error) {
  Schema = null
  console.warn(
    '[ptc-cordis] @deepseek-ai/schemastery is not resolvable here; the row Config surface is absent'
    + ' (the preset registration and the browser card do not depend on it): '
    + (error && error.message || String(error)),
  )
}

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-ptc-cordis-preset'

/** The preset roster is a hard dependency: without it there is nothing to do. */
export const inject = ['agentPresets']

const TAG = '[ptc-cordis]'
const PRESET_ID = 'ptc-cordis'
const MANAGED_BY = 'dsh-ptc-cordis-preset'
const MARKER_FILE = '.plugin-managed.json'

/**
 * Cooperation service this plugin publishes for dsh-gitbash-shell (v0.14.0,
 * their issue #7): the peer registers its own `创造模式 · Git Bash` variant by
 * default, which duplicates THIS preset once this one is materialized against
 * Git Bash. The peer's `suppressPeerCordis` switch (default OFF) drops that
 * variant while this service reports `gitBashActive: true`; the service is the
 * only place that answer exists, and it lands independent of row order.
 */
export const COVERAGE_CAPABILITY = 'ptcCordisPreset'

/**
 * Settings namespace served by the host half; the Settings → Plugins card
 * (client half) pairs with it under the same key. One boolean knob.
 */
/**
 * The default workflow side (v0.8.0): ON — Creation mode keeps the workflow
 * tool and this preset has shipped it enabled through 0.7.0, so upgrades
 * keep the capability. Only an explicit `workflow: false` in settings
 * switches to the official `ptc` shape (run_code as the only model-authored
 * orchestration surface, engine row kept for `ralph`).
 */
const DEFAULT_WORKFLOW = true

/**
 * Experimental Python PTC backend (v0.15.0), DEFAULT OFF. The authoritative
 * value is this row's Config field `pythonRuntime`; the host half mirrors it
 * into a JSON snapshot the bundle patch reads at boot (`cordis.patch.yml`),
 * because a loader `!!js` expression cannot see a Config value — see the
 * long note in that file for why the swap cannot happen inside a preset
 * composition at all.
 */
const DEFAULT_PYTHON_RUNTIME = false
/** Boot-time snapshot the patch's `!!js` expressions read (dshHomePath-relative). */
const RUNTIME_SNAPSHOT_FILE = 'ptc-cordis-runtime.json'

/**
 * dsh >= 0.1.7 marks a Config field live-editable without remount; a
 * 0.1.6-era schemastery predates the method and the guard keeps the module
 * loadable there (the knob then behaves as ordinary config, read through
 * the registered settings namespace instead).
 */
function live(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema
}

/**
 * Row Config = the settings surface on dsh >= 0.1.7 (values persist under the
 * row id; the patch row id is 'ptc-cordis', the same string as the old
 * settings namespace, so the one-shot legacy settings.yaml import maps old
 * user values onto the new home). Inert metadata on older hosts, and absent
 * (undefined) when schemastery is unresolvable: cordis then passes the row
 * config through unvalidated instead of the whole row disappearing.
 */
export const Config = Schema === null ? undefined : Schema.object({
  workflow: live(Schema.boolean().default(DEFAULT_WORKFLOW)),
  pythonRuntime: live(Schema.boolean().default(DEFAULT_PYTHON_RUNTIME)),
  // Explicit interpreter override (v0.15.1): the field the probe chain reads
  // first, and the only way to point a GUI-launched profile at a >= 3.10 python
  // when PATH hides every candidate. Empty = discovery only.
  pythonBin: live(Schema.string().default("")),
})

/** Read one Config value across eras: Volatile ref (>= 0.1.7) or plain value. */
export function valueOf(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}

// ── experimental Python PTC runtime switch (v0.15.0) ────────────────────────
//
// The switch cannot be applied by this plugin's own row: the base bundle owns
// the `ptc-runtime` row and a preset composition cannot reach it (see
// cordis.patch.yml for the three code citations). The bundle patch therefore
// decides at BOOT, from a JSON snapshot, whether to drop the Node row and
// insert `dsh-ptc-cordis-preset/runtime`. This section is the authoritative
// side of that snapshot: the row Config value is the truth, the snapshot is
// its one-way projection, and an unusable backend is refused here — before it
// can cost a profile its PTC runtime.

/**
 * Resolve one pythonRuntime value to a side: only explicit true is ON. The two
 * shapes are the same the workflow knob takes — the registered settings
 * namespace hands the OBJECT `{ pythonRuntime }`, the dsh >= 0.1.7 row Config
 * hands the plain BOOLEAN (the v0.13.2 lesson: reading one shape pinned the
 * other path to its default).
 */
export function pythonRuntimeOf(value) {
  if (value === true || value === false) return value
  return value?.pythonRuntime === true ? true : DEFAULT_PYTHON_RUNTIME
}

/**
 * Where the patch's `!!js` expressions look for the snapshot. `dshHomePath` is
 * provided by app-boot before the tree mounts, so both halves agree on the
 * path; DSH_HOME / ~/.dsh is the fallback for a host without that service.
 */
export function runtimeSnapshotPath(ctx) {
  try {
    const homePath = ctx?.get?.('dshHomePath')
    if (typeof homePath === 'function') return homePath(RUNTIME_SNAPSHOT_FILE)
  } catch {
    /* fall through to the environment */
  }
  const env = process.env.DSH_HOME
  return join(env && env.trim() !== '' ? env : join(homedir(), '.dsh'), RUNTIME_SNAPSHOT_FILE)
}

/** Read the snapshot; absent or unreadable means "off" (the patch's own default). */
export function readRuntimeSnapshot(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return {
      pythonRuntime: parsed?.pythonRuntime === true,
      ready: parsed?.ready === true,
      reason: parsed?.reason ?? undefined,
      pythonBin: parsed?.pythonBin ?? undefined,
      version: parsed?.version ?? undefined,
      updatedAt: parsed?.updatedAt ?? undefined,
    }
  } catch {
    return { pythonRuntime: false, ready: false, reason: 'snapshot absent' }
  }
}

/** Project the switch into the snapshot the boot patch reads; best effort. */
export function writeRuntimeSnapshot(file, value) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({
      pythonRuntime: value.pythonRuntime === true,
      ready: value.ready === true,
      reason: value.reason ?? null,
      pythonBin: value.pythonBin ?? null,
      version: value.version ?? null,
      updatedAt: new Date().toISOString(),
      managedBy: MANAGED_BY,
    }, null, 2)}\n`, { mode: 0o600 })
    return true
  } catch (error) {
    console.log(`${TAG} runtime snapshot write failed (${error?.message ?? error}) — the Python switch stays at the official Node backend until the path is writable`)
    return false
  }
}

/**
 * Preflight for the switch: POSIX platform, the backend package resolvable
 * from this plugin's tree, and a CPython >= 3.10 interpreter that the probe
 * can name. Every failure is collected (not short-circuited) so the refusal
 * message lists everything the user would have to fix.
 * @param {object} input
 * @param {object} [input.config] - row Config, for an explicit `pythonBin`.
 * @param {object} [input.ctx] - cordis context (loader-resolver fallback).
 * @param {string} [input.platform] - platform override for tests.
 * @param {Function} [input.discover] - interpreter discovery override for tests.
 * @param {Function} [input.resolve] - package resolution override for tests.
 * @returns {Promise<{ok: boolean, problems: string[], interpreter: object, resolve: object}>}
 */
export async function probePythonRuntime({ config, ctx, platform = process.platform, discover, resolve } = {}) {
  const problems = []
  if (platform === 'win32') problems.push('the experimental CPython backend is POSIX-only (its constructor throws at load on Windows)')
  const resolution = await (resolve ?? resolvePythonPackage)({ fromUrl: import.meta.url, ctx })
  if (!resolution.ok) problems.push(`${PYTHON_RUNTIME_PACKAGE} is not resolvable (${resolution.failures.join(' | ')})`)
  // Same resolution base the patch's `!!js` guard uses (the PROFILE directory,
  // not this package): a package manager that pruned the optional dependency
  // leaves the plugin tree resolvable through the loader but the boot guard
  // false, so reporting ready here would claim an ON that never takes effect.
  let profileDir
  try {
    profileDir = ctx?.get?.("profileContext")?.dir
  } catch {
    profileDir = undefined
  }
  if (typeof profileDir === "string" && profileDir !== "") {
    try {
      const { createRequire } = await import("node:module")
      createRequire(`${profileDir}/`).resolve(PYTHON_RUNTIME_PACKAGE)
    } catch (error) {
      problems.push(`${PYTHON_RUNTIME_PACKAGE} is not resolvable from the profile directory (${error?.message ?? error}) — the boot-time guard would keep the official Node row, so this ON cannot take effect`)
    }
  }
  const interpreter = (discover ?? discoverPython)({ explicit: valueOf(config?.pythonBin) })
  if (!interpreter.ok) {
    problems.push(`no CPython >= ${PYTHON_MIN_VERSION.join('.')} interpreter found (tried ${interpreter.attempts.map((attempt) => `${attempt.bin}: ${attempt.detail}`).join(' | ')})`)
  }
  return { ok: problems.length === 0, problems, interpreter, resolve: resolution }
}

/**
 * Reconcile the boot snapshot with the authoritative switch value. Runs on
 * every startup and on every flip: an ON whose preflight fails writes OFF, so
 * the Node row keeps its place and the profile never loses `ptcRuntime`; an ON
 * that passes records the interpreter it proved, which the runtime row reuses.
 * @param {object} ctx - cordis context.
 * @param {object} input
 * @param {object} [input.config] - row Config (explicit `pythonBin`).
 * @param {boolean} input.pythonRuntimeOn - authoritative switch value.
 * @param {Function} [input.probe] - preflight override for tests.
 * @returns {Promise<{file: string, applied: boolean, reason: string}>}
 */
export async function syncRuntimeSnapshot(ctx, { config, pythonRuntimeOn, probe } = {}) {
  const file = runtimeSnapshotPath(ctx)
  if (!pythonRuntimeOn) {
    const previous = readRuntimeSnapshot(file)
    if (previous.pythonRuntime || previous.ready) writeRuntimeSnapshot(file, { pythonRuntime: false, ready: false, reason: 'switch off' })
    return { file, applied: false, reason: 'switch off' }
  }
  const result = await (probe ?? probePythonRuntime)({ config, ctx })
  if (!result.ok) {
    const reason = result.problems.join('; ')
    writeRuntimeSnapshot(file, { pythonRuntime: false, ready: false, reason })
    console.log(`${TAG} Python runtime switch is ON but the backend is not usable — keeping the official Node provider (run_code stays TypeScript). ${reason}. ${PYTHON_GUIDANCE}`)
    return { file, applied: false, reason }
  }
  const interpreter = result.interpreter ?? {}
  const next = {
    pythonRuntime: true,
    ready: true,
    reason: 'preflight passed',
    pythonBin: interpreter.bin,
    version: Array.isArray(interpreter.version) ? interpreter.version.join('.') : undefined,
  }
  // Do NOT rewrite an equivalent snapshot (v0.15.1): `disabled` is re-evaluated
  // on every access (vendor/loader/src/config/entry.ts:74) and the boot guard
  // treats a snapshot written during THIS boot as not yet in effect, so bumping
  // updatedAt on every start would flip the guard mid-boot and leave rows that
  // already activated disagreeing with rows evaluated later — the exact
  // inconsistency the guard exists to prevent. Only a real change rewrites it.
  const current = readRuntimeSnapshot(file)
  if (current.pythonRuntime && current.ready && current.pythonBin === next.pythonBin) {
    return { file, applied: true, reason: 'ready (snapshot already current)' }
  }
  writeRuntimeSnapshot(file, next)
  // Freshly written: the boot guard treats it as not yet in effect (the rows of
  // THIS boot were evaluated before it existed), so the backend switches on the
  // next start — the same contract the settings card states.
  return { file, applied: false, reason: 'ready (takes effect on the next start)' }
}

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

/**
 * Publish the cooperation capability dsh-gitbash-shell reads before serving
 * its own `cordis · Git Bash` variant (their issue #7). The Git Bash probe
 * runs FIRST so the published answer is final: the peer reacts to the service
 * appearing, so a value that flipped afterwards would be missed. Fire and
 * forget — a host without the peer pays one bounded probe at boot, never a
 * delayed plugin row.
 * @param {object} ctx - the plugin's mounting context.
 * @returns {Promise<void>} resolves once the service is provided (or failed).
 */
async function publishPresetCoverage(ctx, pythonRuntimeOn = DEFAULT_PYTHON_RUNTIME) {
  try {
    const gitBashActive = await detectGitBash(ctx)
    // One mutable object: the peer (dsh-gitbash-shell) reads this capability as
    // the signal for both the Git Bash side and the Python backend, and the
    // switch can flip after publication — the same reference then carries the
    // new value instead of a second, drifting copy somewhere else.
    const capability = { id: PRESET_ID, gitBashActive, pythonRuntime: pythonRuntimeOn === true, pythonBackend: 'node' }
    const dispose = ctx.provide(COVERAGE_CAPABILITY, capability)
    ctx.effect(() => dispose, 'dsh-ptc-cordis-preset: preset coverage capability')
    if (gitBashActive) console.log(`${TAG} coverage capability published (${COVERAGE_CAPABILITY}: Git Bash side active — dsh-gitbash-shell may suppress its duplicate variant)`)
    return capability
  } catch (error) {
    console.log(`${TAG} coverage capability publish failed: ${error?.message ?? error}`)
    return undefined
  }
}

// ── workflow card setting (v0.8.0) ───────────────────────────────────────────

/**
 * Resolve one workflow value to a side: only explicit false is OFF. Two callers
 * hand this two shapes — the registered settings namespace returns the OBJECT
 * `{ workflow }`, while the dsh >= 0.1.7 row Config hands the plain BOOLEAN
 * (Config lives under the row id and holds one field). Reading only the object
 * shape silently pinned the row-Config path to ON: the switched-off preset was
 * still registered with workflow ON (found live on 0.1.7-rc.1, see CHANGELOG
 * v0.13.2). Boolean first, explicit false only; anything else keeps the default.
 */
export function workflowOf(value) {
  if (value === true || value === false) return value
  return value?.workflow === false ? false : DEFAULT_WORKFLOW
}

/** Read a registered SettingsScope value; never throws. */
// ── declarative registration (dsh >= 0.1.7) ──────────────────────────────────
//
// dsh 0.1.7 removed directory presets: nothing reads ~/.dsh/.agent-presets
// any more, and a preset is a definition registered through
// agentPresets.register(). The era probe is the register method itself, so
// one build serves both hosts: register() here, the materializer below.

/** Resolve the progressive-skills dir beside @deepseek-ai/dsh-agent-preset. */
async function resolveSkillsDir() {
  try {
    const { createRequire } = await import('node:module')
    const here = createRequire(import.meta.url)
    const pkg = here.resolve('@deepseek-ai/dsh-agent-preset/package.json')
    return join(dirname(pkg), 'skills')
  } catch {
    return undefined
  }
}

/**
 * The legacy preset root on a register()-capable host, best effort: the
 * roster no longer exposes roots, so this resolves DSH_HOME the way the
 * shipped home-paths helper does and falls back to ~/.dsh. Only used to
 * clean up the directory tree THIS plugin materialized on older hosts.
 */
function legacyPresetRoot() {
  try {
    const env = process.env.DSH_HOME
    if (env && env.trim() !== '') return join(env, '.agent-presets')
    return join(homedir(), '.dsh', '.agent-presets')
  } catch {
    return undefined
  }
}

/**
 * Remove the stale materialized tree a previous (pre-0.1.7-host) version of
 * this plugin left behind, when it is still byte-identical to what we wrote
 * (the marker is the judge). User-modified and foreign trees stay untouched,
 * exactly like the materializer's own ownership rules.
 */
function cleanupLegacyTree() {
  const root = legacyPresetRoot()
  if (!root) return
  const target = join(root, PRESET_ID)
  const state = classify(target)
  if (state === 'unmodified') {
    try {
      rmSync(target, { recursive: true, force: true })
      console.log(TAG + ' removed the stale materialized preset at ' + target + ' (directory presets are no longer read on this host; the declarative registration replaces it)')
    } catch (error) {
      console.log(TAG + ' stale preset cleanup failed: ' + (error && error.message ? error.message : error))
    }
    return
  }
  if (state === 'user-modified') console.log(TAG + ' a user-modified preset tree remains at ' + target + ' — left untouched (this host ignores it; delete it manually if unwanted)')
}

/**
 * Probe the dsh 0.2.1 host additions for the preset composition: every
 * full-tool official preset gained a `time-context` row (durable clock
 * readings) and a `tool-schedule` row (the reminder tools). A preset row
 * whose package is absent rejects the WHOLE mount, so the rows ride this
 * probe: each is added only when its package resolves from the HOST's module
 * base — `ctx.baseUrl`, the exact base `prepareProfileEntries` mounts preset
 * rows from (agent-preset-registry/src/mount.ts), so the probe can never
 * disagree with the mounter. On dsh <= 0.2.0 both stay false and the row set
 * is byte-identical to the 0.1.7 capture. Probed once per boot; the profile's
 * package set does not change under a running host.
 * @param {object} ctx - cordis context (any fiber of the running host).
 * @param {Function} [resolve] - predicate override for tests; receives a
 *   package specifier, resolves like `require.resolve`, returns boolean.
 * @returns {Promise<{timeContext: boolean, toolSchedule: boolean}>}
 */
export async function probeHostExtras(ctx, resolve) {
  let ok = resolve
  if (ok === undefined) {
    try {
      const { createRequire } = await import('node:module')
      const req = createRequire(ctx?.baseUrl ?? import.meta.url)
      ok = (specifier) => {
        try { req.resolve(specifier); return true } catch { return false }
      }
    } catch {
      ok = () => false
    }
  }
  const [timeContext, toolSchedule] = await Promise.all([
    Promise.resolve(safe(ok, '@deepseek-ai/dsh-time-context')).then(Boolean),
    Promise.resolve(safe(ok, '@deepseek-ai/dsh-tool-schedule')).then(Boolean),
  ])
  return { timeContext, toolSchedule }
}

/** Run one probe predicate; ANY failure reads as "absent" (a throwing
 * resolver must degrade the row away, never reject the boot). */
function safe(ok, specifier) {
  try {
    return ok(specifier)
  } catch {
    return false
  }
}

/**
 * The declarative era's registration core: compose the definition for the
 * current workflow side and register it, returning the unregister function.
 * New sessions pick the roster entry up immediately; sessions pinned to the
 * preset keep their revision until recomposed.
 *
 * The display fields follow the Git Bash side (v0.14.0, issue #1): a
 * Git Bash-materialized preset says so in the roster, exactly like the
 * materialized twin on older hosts and like dsh-gitbash-shell's own
 * 「· Git Bash」 variants.
 */
async function registerPreset(ctx, { workflowOn, gitBashActive, skillsDir, pythonRuntimeOn = DEFAULT_PYTHON_RUNTIME, hostExtras = {} }) {
  const meta = presetMetaFor(gitBashActive)
  const definition = {
    id: PRESET_META.id,
    name: meta.name,
    description: meta.description,
    order: PRESET_META.order,
    plugins: pluginsFor({ workflowOn, gitBashActive, skillsDir, pythonRuntime: pythonRuntimeOn, hostExtras }),
  }
  return ctx.agentPresets.register(definition)
}

/**
 * Declarative-era wiring: register once at startup, re-register when either
 * knob flips (a volatile Config edit on this row — the profile patch write
 * lands as a loader/volatile-update event on this fiber), and keep exactly one
 * registration alive for the plugin's lifetime.
 *
 * BOTH knobs are handled here because they interact: the experimental Python
 * backend forces the workflow rows off (the engine requires the TypeScript
 * runtime), so a Python flip changes the composition even when the workflow
 * setting itself did not move. The authoritative Python value still only takes
 * effect after a restart (the bundle patch is evaluated at boot), so this pass
 * rewrites the snapshot for the next boot and reports what it did.
 */
async function runDeclarativeEra(ctx, config, coverage) {
  cleanupLegacyTree()

  const gitBashActive = await detectGitBash(ctx)
  const skillsDir = await resolveSkillsDir()
  const hostExtras = await probeHostExtras(ctx)
  let workflowOn = workflowOf(config ? valueOf(config.workflow) : undefined)
  let pythonRuntimeOn = pythonRuntimeOf(config ? valueOf(config.pythonRuntime) : undefined)
  const pythonSync = await syncRuntimeSnapshot(ctx, { config, pythonRuntimeOn })
  let pythonEffective = pythonRuntimeOn && pythonSync.applied
  // pythonRuntime = USER INTENT (unchanged since v0.15.0; gitbash v0.26.0
  // already consumes it). pythonBackend = what actually runs NOW, which the
  // peer v0.26.1 gates its workflow mutex on; pythonIssue is a read-only reason.
  if (coverage) coverage.pythonRuntime = pythonRuntimeOn
  if (coverage) coverage.pythonIssue = pythonSync.reason ?? ''
  // pythonRuntime = user intent, pythonBackend = what actually runs now; the
  // peer gates its workflow mutex on the latter so an unusable ON does not cost
  // it the workflow capability for nothing.
  if (coverage) coverage.pythonBackend = pythonEffective ? 'python' : 'node'
  let unregister = await registerPreset(ctx, { workflowOn, gitBashActive, skillsDir, pythonRuntimeOn: pythonEffective, hostExtras })
  console.log(TAG + " preset '" + PRESET_ID + "' registered declaratively (workflow " + (workflowOn ? 'ON — Creation-side capability' : 'OFF — matches the official ptc preset') + (pythonEffective ? ', experimental Python backend pending restart' : '') + (gitBashActive ? ', Git Bash rows' : '') + (hostExtras.timeContext || hostExtras.toolSchedule
    ? `, dsh 0.2.1 additions: ${hostExtras.timeContext ? 'time-context' : ''}${hostExtras.timeContext && hostExtras.toolSchedule ? ' + ' : ''}${hostExtras.toolSchedule ? 'tool-schedule (subagents denied)' : ''})`
    : ')'))
  ctx.effect(() => () => { void unregister() }, 'dsh-ptc-cordis-preset: declarative preset registration')

  try {
    ctx.on('loader/volatile-update', async (paths) => {
      try {
        const rows = Array.isArray(paths) ? paths : []
        const touchedWorkflow = rows.some((p) => Array.isArray(p) && p[0] === 'workflow')
        const touchedPython = rows.some((p) => Array.isArray(p) && p[0] === 'pythonRuntime')
        if (!touchedWorkflow && !touchedPython) return

        let changed = false
        let nextWorkflow = workflowOn
        let nextPythonEffective = pythonEffective
        if (touchedPython) {
          const want = pythonRuntimeOf(valueOf(config.pythonRuntime))
          if (want !== pythonRuntimeOn) {
            pythonRuntimeOn = want
            // Refused ONs never reach the snapshot, so the patch keeps the
            // official Node row next boot; the composition follows suit.
            const sync = await syncRuntimeSnapshot(ctx, { config, pythonRuntimeOn })
            nextPythonEffective = pythonRuntimeOn && sync.applied
            if (coverage) coverage.pythonRuntime = pythonRuntimeOn
            if (coverage) coverage.pythonIssue = sync.reason ?? ''
            console.log(sync.applied
              ? `${TAG} experimental Python backend switched ON — the PTC runtime is replaced on the next dsh start (the bundle patch is evaluated at boot)`
              : `${TAG} experimental Python backend switch is ON but not applied (${sync.reason}) — run_code keeps the official Node backend. ${PYTHON_GUIDANCE}`)
            changed = true
          }
        }
        if (touchedWorkflow) {
          const want = workflowOf(valueOf(config.workflow))
          if (want !== nextWorkflow) {
            nextWorkflow = want
            changed = true
          }
        }
        if (!changed) return
        // The registry rejects a duplicate id (agent-preset-registry throws on
        // any definition already present), so the live generation must be
        // retired BEFORE the new composition mounts. v0.15.x mounted first and
        // retired second: every flip threw "Duplicate agent preset: ptc-cordis"
        // and silently kept the old composition (真机 0.1.7-rc.2 实证,2026-09-28).
        // If the new mount fails, re-register the previous composition so the
        // roster never loses the preset and the knob states stay truthful.
        const prev = { workflowOn, pythonEffective }
        const previous = unregister
        await previous()
        try {
          unregister = await registerPreset(ctx, { workflowOn: nextWorkflow, gitBashActive, skillsDir, pythonRuntimeOn: nextPythonEffective, hostExtras })
          workflowOn = nextWorkflow
          pythonEffective = nextPythonEffective
        } catch (error) {
          unregister = await registerPreset(ctx, { workflowOn: prev.workflowOn, gitBashActive, skillsDir, pythonRuntimeOn: prev.pythonEffective, hostExtras })
          throw error
        }
        if (coverage) coverage.pythonBackend = pythonEffective ? 'python' : 'node'
        console.log(TAG + ' setting flipped — preset re-registered (workflow ' + (workflowOn ? 'ON' : 'OFF') + (pythonEffective ? ', workflow rows held off by the experimental Python backend' : '') + '), new sessions pick it up immediately')
      } catch (error) {
        console.log(TAG + ' setting re-registration failed: ' + (error && error.message ? error.message : error))
      }
    })
  } catch (error) {
    console.log(TAG + ' volatile-update wiring failed: ' + (error && error.message ? error.message : error))
  }
}

export async function apply(ctx, config) {
  // One runtime config for BOTH eras, built before either branch: the row Config
  // with the Volatile pythonBin unwrapped. v0.15.2 declared this inside the
  // legacy branch while the declarative path referenced it, so every boot died
  // with `ReferenceError: runtimeConfig is not defined` and the plugin never
  // registered at all (see CHANGELOG v0.15.3).
  const runtimeConfig = { ...(config ?? {}), pythonBin: valueOf(config?.pythonBin) || '' }
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

  // ── cooperation capability for dsh-gitbash-shell (v0.14.0, their #7) ─────
  // Published on BOTH host eras and before either branch below, so the peer's
  // dedupe decision never depends on row activation order. The probe is
  // bounded (1s); the promise is awaited only where the mutable capability
  // object is needed to carry a later pythonRuntime flip.
  const coveragePromise = publishPresetCoverage(ctx, pythonRuntimeOf(config ? valueOf(config.pythonRuntime) : undefined))

  // ── era split: declarative registration on dsh >= 0.1.7 ──────────────────
  // The register method IS the era signal: the 0.1.7 registry exposes it,
  // the 0.1.6 roster does not. On the new host the whole materialization
  // path below is dead code (nothing reads the directory any more), so this
  // branch serves the preset and returns.
  if (ctx.agentPresets && typeof ctx.agentPresets.register === 'function') {
    try {
      await runDeclarativeEra(ctx, config, await coveragePromise)
    } catch (error) {
      console.log(TAG + ' declarative registration failed: ' + (error && error.message ? error.message : error))
    }
    return
  }
}

// Test surface: pure helpers, no Cordis context required.
export const _internal = { PRESET_ID, COVERAGE_CAPABILITY, MARKER_FILE, DEFAULT_WORKFLOW, DEFAULT_PYTHON_RUNTIME, PYTHON_RUNTIME_PACKAGE, RUNTIME_SNAPSHOT_FILE, classify, hashTree, installRegisterShim, workflowOf, valueOf, pythonRuntimeOf, runtimeSnapshotPath, readRuntimeSnapshot, writeRuntimeSnapshot, probePythonRuntime, syncRuntimeSnapshot, detectGitBash, publishPresetCoverage, probeHostExtras }
