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

/**
 * Startup decision for an existing unmodified tree (pure):
 *   'refresh' — the plugin version changed, or the live skills source drifted
 *              from what we recorded (e.g. a DSH upgrade shipped new skill
 *              files) → re-materialize so skills keep tracking the deployment
 *              exactly as they always did;
 *   'idle'    — same plugin version AND skills in sync → nothing on disk would
 *              change, so write nothing and log nothing (quiet startup).
 */
function syncDecision({ state, marker, version, sourceHashes }) {
  if (state !== 'unmodified' || !marker) return 'refresh'
  if (marker.version !== version) return 'refresh'
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
function materialize({ target, skillsSource, version }) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  writeFileSync(join(target, 'agent.cordis.yml'), readFileSync(join(pkgDir, 'assets', 'agent.cordis.yml')))
  writeFileSync(join(target, 'preset.yml'), readFileSync(join(pkgDir, 'assets', 'preset.yml')))

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

  const marker = { managedBy: MANAGED_BY, version, presetId: PRESET_ID, files: hashTree(target) }
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

export async function apply(ctx) {
  const roots = ctx.agentPresets?.roots ?? []
  const userRoot = firstUserRoot(roots)
  if (!userRoot) {
    console.log(`${TAG} no user-trust preset root configured — nothing to materialize (preset stays absent)`)
    return
  }

  let version = '0.0.0'
  try {
    version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version ?? version
  } catch {
    /* fall back to the placeholder */
  }

  const skillsSource = await findSkillsSource(ctx.agentPresets)
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

  // Reversible side effect, registered BEFORE the idle check so a quiet
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

  // Quiet-startup short-circuit: same plugin version AND the live skills
  // source still hashes to what we recorded → nothing on disk would change,
  // so write nothing and print nothing (one debug line through the cordis
  // logger for anyone troubleshooting with debug logging enabled).
  const sourceHashes = skillsHashes(skillsSource)
  if (state === 'unmodified' && syncDecision({ state, marker: readMarker(target), version, sourceHashes }) === 'idle') {
    ctx.logger?.('ptc-cordis')?.debug?.(`preset '${PRESET_ID}' up to date (v${version}) — idle`)
    return
  }

  const skills = materialize({ target, skillsSource, version })
  const verb = state === 'absent' ? 'materialized' : 'refreshed'
  console.log(
    `${TAG} ${verb} preset '${PRESET_ID}' ("PTC 创造模式") into ${userRoot.path} (v${version})` +
      (skills === 'copied' ? ` (skills copied from the installed '${SKILLS_SOURCE_PRESET}' preset)` : ' (WARNING: shipped cordis preset not found — skills/ left empty)'),
  )
}

// Test surface: pure helpers, no Cordis context required.
export const _internal = { PRESET_ID, MARKER_FILE, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree, skillsHashes, syncDecision }
