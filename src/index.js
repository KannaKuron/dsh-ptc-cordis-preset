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
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PRESET_META, pluginsFor } from './composition.js'

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
})

/** Read one Config value across eras: Volatile ref (>= 0.1.7) or plain value. */
export function valueOf(value) {
  return value && typeof value.get === 'function' ? value.get() : value
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

// ── persona-form detection (dsh 0.1.3-alpha.2 split the persona row) ──────

/**
 * Which persona config shape does one composition text use? 0.1.3-alpha.2
 * (40792330c0) split dsh-persona's single `text` key into `prefix:` +
 * `suffix:` with no compatibility alias, so compositions carrying a persona
 * row are persona-form-specific. Pure companion of `detectPersonaEra`.
 */
function personaEraForText(text) {
  return /- id:\s*persona[\s\S]{0,600}?\bprefix:/.test(text) ? 'split' : 'text'
}

/**
 * Async probe of a SHIPPED preset's composition through the live roster;
 * never throws. Built-in ids only — this plugin's own materialized preset is
 * on the roster too and would echo whichever form it was written with. The
 * roster entry path is the preset file (or its directory); either way we
 * read agent.cordis.yml. A missing probe conservatively maps to 'text'.
 */
async function detectPersonaEra(agentPresets) {
  try {
    const list = await agentPresets.list()
    const entries = Array.isArray(list) ? list : []
    const entry = ['ptc', 'standard', 'cordis', 'minimal']
      .map((id) => entries.find((p) => p && p.id === id && typeof p.path === 'string'))
      .find(Boolean)
    if (!entry) return 'text'
    const file = /\.yml$/.test(entry.path) ? entry.path : join(entry.path, 'agent.cordis.yml')
    return personaEraForText(readFileSync(file, 'utf8'))
  } catch (error) {
    console.log(`${TAG} persona-form probe failed (${error?.message ?? error}) — assuming the pre-split 'text' form`)
    return 'text'
  }
}

/**
 * Does the SHIPPED composition already carry the official `present` row? The
 * row (`@deepseek-ai/dsh-tool-present`, immutable file-delivery download
 * cards) first shipped with dsh 0.1.5-alpha.2, and a composition row that
 * cannot be imported rejects the WHOLE preset mount — so the row is injected
 * only on hosts whose own shipped presets have it. The live roster is the
 * authority: package resolution alone would lie on CLI installs (first-party
 * packages live outside the profile) and on linked development trees.
 * `minimal` never gains the row (single-tool preset), so it is not probed.
 * Never throws; a missing probe conservatively maps to `false`.
 */
async function detectPresentSupport(agentPresets) {
  try {
    const list = await agentPresets.list()
    const entries = Array.isArray(list) ? list : []
    const entry = ['ptc', 'standard', 'cordis']
      .map((id) => entries.find((p) => p && p.id === id && typeof p.path === 'string'))
      .find(Boolean)
    if (!entry) return false
    const file = /\.yml$/.test(entry.path) ? entry.path : join(entry.path, 'agent.cordis.yml')
    return readFileSync(file, 'utf8').includes("'@deepseek-ai/dsh-tool-present'")
  } catch (error) {
    console.log(`${TAG} present-row probe failed (${error?.message ?? error}) — not injecting the row`)
    return false
  }
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
/** Row ids the shipped workflow-engine row has answered to (dsh 0.1.6 renamed it). */
const ENGINE_ROW_IDS = ['workflow-worker-thread', 'workflow-ptc']

/** This preset mirrors the built-in ptc composition, so that is its row-form source. */
const ROW_SOURCE_ID = 'ptc'

/** Leading whitespace of one line (pure). */
function indentOf(line) {
  return line.slice(0, line.length - line.trimStart().length)
}

/** The unquoted value of a name line, or undefined when the line is not one (pure). */
function quotedName(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('name: ')) return undefined
  const raw = trimmed.slice(6).trim()
  if (raw.length > 1 && raw.charAt(0) === "'" && raw.charAt(raw.length - 1) === "'") return raw.slice(1, -1)
  return raw
}

/**
 * Read ONE row's spelling out of a composition text (pure): the name value
 * that follows its id line and whether the row's own block turns it off before
 * the next row starts. Returns undefined when the row is absent, and never
 * throws, so a composition that legitimately lacks the row is left alone.
 * @param text - composition text.
 * @param rowId - exact id value to locate.
 * @returns the row's spelling, or undefined.
 */
export function rowFormOf(text, rowId) {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== '- id: ' + rowId) continue
    const nameLine = i + 1 < lines.length ? lines[i + 1] : ''
    const name = quotedName(nameLine)
    if (name === undefined) continue
    let disabled = false
    let disabledIndent = indentOf(nameLine)
    for (let j = i + 2; j < lines.length; j += 1) {
      if (lines[j].trim().startsWith('- id: ')) break
      if (lines[j].trim() === 'disabled: true') {
        disabled = true
        disabledIndent = indentOf(lines[j])
        break
      }
    }
    return { id: rowId, name, indent: indentOf(lines[i]), nameIndent: indentOf(nameLine), disabled, disabledIndent }
  }
  return undefined
}

/**
 * Read the two rows this plugin's committed compositions must track out of a
 * SHIPPED composition text (pure). The built-in preset is the authority: it
 * mounts on this host by construction, so whatever it spells is mountable
 * here, on every era, without shipping one asset variant per rename.
 * @param text - a shipped agent.cordis.yml.
 * @returns an object with the engine row and the tool-ralph row; either may be undefined.
 */
export function rowFormsOf(text) {
  let engine
  for (const id of ENGINE_ROW_IDS) {
    engine = rowFormOf(text, id)
    if (engine !== undefined) break
  }
  return { engine, ralph: rowFormOf(text, 'tool-ralph') }
}

/**
 * Align the workflow-engine row with the host's own spelling (pure,
 * idempotent, plain string surgery — never a YAML round-trip, so !!js literals
 * survive).
 *
 * dsh 0.1.6-alpha.1 renamed this row workflow-worker-thread to workflow-ptc
 * AND deleted the old package. A composition row whose module fails to import
 * rejects the WHOLE preset mount (agent-presets mount.ts), so a committed old
 * spelling breaks this preset on the new host while the new spelling breaks it
 * on hosts that still ship only the old package. The materializer copies the
 * row out of the host's own built-in preset instead of pinning either.
 * @param text - composition text.
 * @param form - the host's engine row from rowFormsOf, or undefined to leave the text alone.
 * @param options - engineEnabled forces the row on; this plugin's workflow-ON twins need a live engine, while the OFF twins mirror the shipped ptc preset exactly.
 * @returns the aligned text.
 */
export function alignEngineRow(text, form, options) {
  if (!form) return text
  const engineEnabled = Boolean(options && options.engineEnabled)
  let current
  for (const id of ENGINE_ROW_IDS) {
    current = rowFormOf(text, id)
    if (current !== undefined) break
  }
  if (current === undefined) return text
  const head = '- id: ' + current.id + '\n' + current.nameIndent + "name: '" + current.name + "'"
  const wanted = '- id: ' + form.id + '\n' + current.nameIndent + "name: '" + form.name + "'"
  const wantOff = engineEnabled ? false : form.disabled
  let out = text.replace(head, wanted)
  if (wantOff && !current.disabled) {
    out = out.replace(wanted + '\n', wanted + '\n' + current.nameIndent + 'disabled: true\n')
  } else if (!wantOff && current.disabled) {
    out = out.replace(wanted + '\n' + current.disabledIndent + 'disabled: true\n', wanted + '\n')
  }
  return out
}

/**
 * Align the tool-ralph row with the host's own default (pure, idempotent).
 * dsh 0.1.6-alpha.1 ships ralph disabled in every built-in preset: its tool
 * description restricts it to runs the human explicitly asked for. The row
 * still imports on older hosts, so this is a semantics alignment rather than a
 * mount fix — but a composition claiming to mirror the built-in preset should
 * not silently re-enable a tool the deployment turned off.
 * @param text - composition text.
 * @param form - the host's tool-ralph row from rowFormsOf, or undefined.
 * @returns the aligned text.
 */
export function alignRalphRow(text, form) {
  if (!form) return text
  const current = rowFormOf(text, 'tool-ralph')
  if (current === undefined) return text
  const head = '- id: tool-ralph\n' + current.nameIndent + "name: '" + current.name + "'"
  if (form.disabled && !current.disabled) {
    return text.replace(head + '\n', head + '\n' + current.nameIndent + 'disabled: true\n')
  }
  if (!form.disabled && current.disabled) {
    return text.replace(head + '\n' + current.disabledIndent + 'disabled: true\n', head + '\n')
  }
  return text
}

/**
 * Probe the built-in preset this one mirrors for those row spellings (never
 * throws). The live roster is the authority — package resolution alone would
 * lie on linked development trees and on CLI installs whose first-party
 * packages live outside the profile.
 * @param agentPresets - the roster service.
 * @returns a map of row forms per available built-in id, or undefined.
 */
async function detectRowForms(agentPresets) {
  try {
    const list = await agentPresets.list()
    const entries = Array.isArray(list) ? list : []
    const out = {}
    for (const id of [ROW_SOURCE_ID, 'standard', 'cordis']) {
      const entry = entries.find((p) => p && p.id === id && typeof p.path === 'string')
      if (!entry) continue
      const file = /\.yml$/.test(entry.path) ? entry.path : join(entry.path, 'agent.cordis.yml')
      out[id] = rowFormsOf(readFileSync(file, 'utf8'))
    }
    return Object.keys(out).length > 0 ? out : undefined
  } catch (error) {
    console.log(TAG + ' row-form probe failed (' + (error && error.message ? error.message : error) + ') — keeping the committed spellings')
    return undefined
  }
}

/**
 * Marker fingerprint of the row spellings this preset is aligned to, so a host
 * that renames (or re-defaults) them re-materializes on the next boot. The
 * workflow side is already its own marker dimension, so it is not repeated.
 * @param rows - detectRowForms result.
 * @returns a short stable string, '' when nothing was probed.
 */
function rowFingerprint(rows) {
  const form = rows ? rows[ROW_SOURCE_ID] : undefined
  if (!form || !form.engine) return ''
  const ralph = form.ralph === undefined ? 'na' : (form.ralph.disabled ? 'off' : 'on')
  return form.engine.id + ':' + (form.engine.disabled ? 'off' : 'on') + ':' + ralph
}

function pickComposition(base, gitBashActive, workflowOn, persona, available) {
  const era = eraSuffix(base)
  const gb = gitBashActive ? '.gitbash' : ''
  const ps = persona === 'split' ? '.ps' : ''
  const candidates = []
  if (workflowOn) {
    candidates.push(
      `agent.cordis${era}${gb}.workflow${ps}.yml`,
      `agent.cordis${era}${gb}.workflow.yml`,
      `agent.cordis${era}.workflow${ps}.yml`,
      `agent.cordis${era}.workflow.yml`,
      `agent.cordis${gb}.workflow.yml`,
      'agent.cordis.workflow.yml',
    )
  }
  candidates.push(
    `agent.cordis${era}${gb}${ps}.yml`,
    `agent.cordis${era}${gb}.yml`,
    `agent.cordis${era}${ps}.yml`,
    `agent.cordis${era}.yml`,
    `agent.cordis${gb}.yml`,
    'agent.cordis.yml',
  )
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
function syncDecision({ state, marker, version, sourceHashes, gitBashActive = false, workflowOn = true, base = 'code', persona = 'text', present = false, pluginManager = false, rows = '' }) {
  if (state !== 'unmodified' || !marker) return 'refresh'
  if (marker.version !== version) return 'refresh'
  if (marker.gitBash !== gitBashActive) return 'refresh'
  if (marker.base !== base) return 'refresh'
  if ((marker.workflow ?? true) !== workflowOn) return 'refresh'
  if ((marker.persona ?? 'text') !== persona) return 'refresh'
  // Host-capability flip (v0.9.1): @deepseek-ai/dsh-tool-present first shipped
  // with dsh 0.1.5-alpha.2, and a composition row that cannot be imported
  // rejects the whole preset mount — so the official `present` row is injected
  // at materialization only when the host resolves the package, and a host
  // upgrade past that point must re-materialize to gain it.
  if ((marker.present ?? false) !== present) return 'refresh'
  // Host-capability flip: @deepseek-ai/dsh-plugin-manager/tools first shipped
  // with dsh 0.1.6-alpha.2 — same mount-rejection stakes, same marker pattern.
  if ((marker.pluginManager ?? false) !== pluginManager) return 'refresh'
  // Host row-form flip: dsh 0.1.6-alpha.1 renamed the workflow-engine row and
  // deleted the package behind the old spelling. A composition row that cannot
  // be imported rejects the WHOLE preset mount, so a host reporting a
  // different spelling must re-materialize (same marker-dimension pattern as
  // base / persona / present).
  if ((marker.rows ?? '') !== rows) return 'refresh'
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
/*
 * Conditional present-row injection (v0.9.1, dsh 0.1.5-alpha.2 sync). The
 * official ptc composition appends `- id: present / name:
 * '@deepseek-ai/dsh-tool-present'` (immutable file-delivery download cards),
 * but the package only exists from 0.1.5-alpha.2 on, and a composition row
 * that fails to import rejects the WHOLE preset mount. So the row is spliced
 * in as PLAIN TEXT at materialization time (anchor string surgery, never a
 * YAML round-trip — `!!js` literals must survive) and only into ptc-era
 * files, behind a host-capability probe. Placement mirrors the official
 * composition: right after the tool-presentation block.
 */
const PRESENT_ROW = "\n- id: present\n  name: '@deepseek-ai/dsh-tool-present'\n"
const PRESENT_ANCHOR = "  name: '@deepseek-ai/dsh-agent-tool-presentation'\n  config:\n    mode: ptc\n"

function injectPresentRow(text) {
  if (text.includes("'@deepseek-ai/dsh-tool-present'")) return text
  const at = text.indexOf(PRESENT_ANCHOR)
  if (at === -1) return text.endsWith('\n') ? text + PRESENT_ROW : text + '\n' + PRESENT_ROW
  return text.slice(0, at + PRESENT_ANCHOR.length) + PRESENT_ROW + text.slice(at + PRESENT_ANCHOR.length)
}

/*
 * Conditional plugin-manager-row injection (v0.11.0, dsh 0.1.6-alpha.2 sync).
 * Official ptc/standard/cordis gained `- id: tool-plugin-manager / name:
 * '@deepseek-ai/dsh-plugin-manager/tools'` (persistent plugin management;
 * the official ptc preset carries it DISABLED, Creation keeps it on). The
 * package only exists from 0.1.6-alpha.2 on — a row that fails to import
 * rejects the WHOLE mount — so the row is injected as plain text behind a
 * host resolve probe, never committed into the assets, anchored after the
 * present row when there is one, else at the tail. The two workflow sides
 * mirror their official bases: workflow-ON materializes the row ENABLED
 * (the Creation-side capability), workflow-OFF mirrors the official ptc
 * preset exactly, including its disabled state.
 */
const PLUGIN_MANAGER_ROW_ON = "- id: tool-plugin-manager\n  name: '@deepseek-ai/dsh-plugin-manager/tools'\n"
const PLUGIN_MANAGER_ROW_OFF = "- id: tool-plugin-manager\n  name: '@deepseek-ai/dsh-plugin-manager/tools'\n  disabled: true\n"
const PRESENT_ROW_FULL = "\n- id: present\n  name: '@deepseek-ai/dsh-tool-present'\n"

function injectPluginManagerRow(text, { enabled }) {
  if (text.includes("'@deepseek-ai/dsh-plugin-manager/tools'")) return text
  const body = enabled ? PLUGIN_MANAGER_ROW_ON : PLUGIN_MANAGER_ROW_OFF
  const at = text.indexOf(PRESENT_ROW_FULL)
  if (at !== -1) return text.slice(0, at + PRESENT_ROW_FULL.length) + body + text.slice(at + PRESENT_ROW_FULL.length)
  return text.endsWith('\n') ? text + body : text + '\n' + body
}

let pluginManagerToolsCache
/** Probe whether THIS host can resolve the plugin-manager tools package (cached per boot). */
async function hostHasPluginManagerTools() {
  if (pluginManagerToolsCache !== undefined) return pluginManagerToolsCache
  try {
    const { createRequire } = await import('node:module')
    createRequire(import.meta.url).resolve('@deepseek-ai/dsh-plugin-manager/tools')
    pluginManagerToolsCache = true
  } catch {
    pluginManagerToolsCache = false
  }
  return pluginManagerToolsCache
}

let toolPresentCache
/** Probe whether THIS host can resolve the present package (cached per boot). */
async function hostHasToolPresent() {
  if (toolPresentCache !== undefined) return toolPresentCache
  try {
    const { createRequire } = await import('node:module')
    createRequire(import.meta.url).resolve('@deepseek-ai/dsh-tool-present')
    toolPresentCache = true
  } catch {
    toolPresentCache = false
  }
  return toolPresentCache
}

function materialize({ target, skillsSource, version, gitBashActive = false, workflowOn = true, base = 'code', persona = 'text', present = false, pluginManager = false, rows }) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  // Committed variants keep the composition text reviewable (AGENTS.md):
  // the era probe, the capability, and the workflow setting only PICK the
  // file; no runtime synthesis.
  const available = readdirSync(join(pkgDir, 'assets')).filter((f) => f.endsWith('.yml'))
  const compositionFile = pickComposition(base, gitBashActive, workflowOn, persona, available)
  const metadataFile = gitBashActive ? 'preset.gitbash.yml' : 'preset.yml'
  let composition = readFileSync(join(pkgDir, 'assets', compositionFile), 'utf8')
  if (present && compositionFile.includes('.ptc.')) composition = injectPresentRow(composition)
  // v0.11.0: ptc-era files only; workflow-ON materializes the row ENABLED
  // (Creation-side capability), workflow-OFF mirrors the official ptc preset
  // exactly (disabled). Code-era files stay frozen history.
  if (pluginManager && compositionFile.includes('.ptc.')) {
    composition = injectPluginManagerRow(composition, { enabled: workflowOn })
  }
  // Row-form alignment (v0.10.0): the committed assets pin one spelling of the
  // workflow-engine row, but a host renames it out from under them (dsh
  // 0.1.6-alpha.1) and a row whose module fails to import rejects the whole
  // mount. Copy the host's own spelling rather than shipping a third asset
  // variant per era. Absent probe = leave the committed text untouched.
  const rowForm = rows ? rows[ROW_SOURCE_ID] : undefined
  if (rowForm) {
    // Workflow-ON needs a live engine; the OFF twins mirror the shipped ptc
    // preset exactly, including its own disabled state.
    composition = alignEngineRow(composition, rowForm.engine, { engineEnabled: workflowOn })
    composition = alignRalphRow(composition, rowForm.ralph)
  }
  writeFileSync(join(target, 'agent.cordis.yml'), composition)
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

  const marker = { managedBy: MANAGED_BY, version, presetId: PRESET_ID, base, gitBash: gitBashActive, workflow: workflowOn, persona, present, pluginManager, rows: rowFingerprint(rows), files: hashTree(target) }
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
  const persona = await detectPersonaEra(ctx.agentPresets)
  // Two independent signals, either of which is sufficient: the shipped
  // composition text (authoritative, works on every install layout) and the
  // package resolving from this plugin's own tree (covers hosts where the
  // roster probe is unavailable). Both false → the row stays out.
  const present = (await detectPresentSupport(ctx.agentPresets)) || (await hostHasToolPresent())
  // v0.11.0 (dsh 0.1.6-alpha.2): official ptc/standard/cordis gained the
  // tool-plugin-manager row; inject behind the same host-package probe as
  // present (resolve-only suffices — the package cannot exist on older hosts).
  const pluginManager = await hostHasPluginManagerTools()
  // Row spellings of the built-in preset this one mirrors: the workflow-engine
  // row was renamed and its old package deleted in dsh 0.1.6-alpha.1, so the
  // materializer copies whatever the host itself ships.
  const rows = await detectRowForms(ctx.agentPresets)
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
  if (state === 'unmodified' && syncDecision({ state, marker: readMarker(target), version, sourceHashes, gitBashActive, workflowOn, base, persona, present, pluginManager, rows: rowFingerprint(rows) }) === 'idle') {
    ctx.logger?.('ptc-cordis')?.debug?.(`preset '${PRESET_ID}' up to date (v${version}, ${base}-era, workflow ${workflowOn ? 'ON' : 'OFF'}${persona === 'split' ? ', persona-split' : ''}) — idle`)
    return
  }

  const skills = materialize({ target, skillsSource, version, gitBashActive, workflowOn, base, persona, present, pluginManager, rows })
  const verb = state === 'absent' ? 'materialized' : 'refreshed'
  console.log(
    `${TAG} ${verb} preset '${PRESET_ID}' ("PTC 创造模式") into ${userRoot.path} (v${version}, ${base}-era composition${persona === 'split' ? ', persona-split' : ''}, workflow ${workflowOn ? 'ON — Creation-side capability' : 'OFF — matches the official ptc preset'})` +
      (skills === 'copied' ? ` (skills copied from the installed '${SKILLS_SOURCE_PRESET}' preset)` : ' (WARNING: shipped cordis preset not found — skills/ left empty)'),
  )
}

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
 * The declarative era's registration core: compose the definition for the
 * current workflow side and register it, returning the unregister function.
 * New sessions pick the roster entry up immediately; sessions pinned to the
 * preset keep their revision until recomposed.
 */
async function registerPreset(ctx, { workflowOn, gitBashActive, skillsDir }) {
  const definition = {
    id: PRESET_META.id,
    name: PRESET_META.name,
    description: PRESET_META.description,
    order: PRESET_META.order,
    plugins: pluginsFor({ workflowOn, gitBashActive, skillsDir }),
  }
  return ctx.agentPresets.register(definition)
}

/**
 * Declarative-era wiring: register once at startup, re-register when the
 * workflow knob flips (a volatile Config edit on this row — the profile
 * patch write lands as a loader/volatile-update event on this fiber), and
 * keep exactly one registration alive for the plugin's lifetime.
 */
async function runDeclarativeEra(ctx, config) {
  cleanupLegacyTree()

  const gitBashActive = await detectGitBash(ctx)
  const skillsDir = await resolveSkillsDir()
  let workflowOn = workflowOf(config ? valueOf(config.workflow) : undefined)
  let unregister = await registerPreset(ctx, { workflowOn, gitBashActive, skillsDir })
  console.log(TAG + " preset '" + PRESET_ID + "' registered declaratively (workflow " + (workflowOn ? 'ON — Creation-side capability' : 'OFF — matches the official ptc preset') + (gitBashActive ? ', Git Bash rows)' : ')'))
  ctx.effect(() => () => { void unregister() }, 'dsh-ptc-cordis-preset: declarative preset registration')

  try {
    ctx.on('loader/volatile-update', async (paths) => {
      try {
        const touched = Array.isArray(paths) && paths.some((p) => Array.isArray(p) && p[0] === 'workflow')
        if (!touched) return
        const want = workflowOf(valueOf(config.workflow))
        if (want === workflowOn) return
        workflowOn = want
        const previous = unregister
        unregister = await registerPreset(ctx, { workflowOn, gitBashActive, skillsDir })
        await previous()
        console.log(TAG + ' workflow setting flipped — preset re-registered (workflow ' + (workflowOn ? 'ON' : 'OFF') + '), new sessions pick it up immediately')
      } catch (error) {
        console.log(TAG + ' workflow re-registration failed: ' + (error && error.message ? error.message : error))
      }
    })
  } catch (error) {
    console.log(TAG + ' volatile-update wiring failed: ' + (error && error.message ? error.message : error))
  }
}

export async function apply(ctx, config) {
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

  // ── era split: declarative registration on dsh >= 0.1.7 ──────────────────
  // The register method IS the era signal: the 0.1.7 registry exposes it,
  // the 0.1.6 roster does not. On the new host the whole materialization
  // path below is dead code (nothing reads the directory any more), so this
  // branch serves the preset and returns.
  if (ctx.agentPresets && typeof ctx.agentPresets.register === 'function') {
    try {
      await runDeclarativeEra(ctx, config)
    } catch (error) {
      console.log(TAG + ' declarative registration failed: ' + (error && error.message ? error.message : error))
    }
    return
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
export const _internal = { PRESET_ID, MARKER_FILE, SETTINGS_NAMESPACE, DEFAULT_WORKFLOW, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree, skillsHashes, syncDecision, installRegisterShim, baseForRoster, detectBase, pickComposition, workflowOf, valueOf, personaEraForText, detectPersonaEra, injectPresentRow, hostHasToolPresent, detectPresentSupport, injectPluginManagerRow, hostHasPluginManagerTools, rowFormOf, rowFormsOf, alignEngineRow, alignRalphRow, ROW_SOURCE_ID }
