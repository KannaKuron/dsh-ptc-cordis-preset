/**
 * Interpreter + package discovery for the experimental Python PTC backend.
 *
 * WHY THIS IS AN EXPLICIT CONTRACT (lead's live measurement, 2026-09-25):
 * the experimental backend requires CPython >= 3.10 and refuses to load
 * otherwise (`packages/experimental/ptc-runtime-python/src/index.ts`, load-time
 * version probe). On this device `/usr/bin/python3` is 3.9.6 — which is
 * exactly what a GUI-launched desktop profile sees, because its PATH carries
 * neither homebrew nor the harness runtime. Relying on the provider's
 * `pythonBin: 'python3'` default would therefore reject the backend on a
 * machine that HAS a usable interpreter, and the failure would surface as
 * "no PTC runtime" rather than "wrong interpreter". So every path that turns
 * the switch on discovers an interpreter first, proves it is CPython >= 3.10,
 * and hands the winning absolute path to the provider's `pythonBin`.
 *
 * Shared by the host half (preflight before the snapshot says `ready`) and the
 * runtime row (which mounts the provider), so both agree on one answer. Pure
 * helpers with injectable probes: the smoke test runs them without spawning.
 *
 * @module dsh-ptc-cordis-preset/python-probe
 */

import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The experimental backend this plugin can select. */
export const PYTHON_RUNTIME_PACKAGE = '@deepseek-ai/dsh-experimental-ptc-runtime-python'

/** The shipped Node backend, used as the fail-safe fallback. */
export const NODE_RUNTIME_PACKAGE = '@deepseek-ai/dsh-ptc-runtime-node'

/** Minimum CPython the experimental backend accepts. */
export const PYTHON_MIN_VERSION = Object.freeze([3, 10])

/** Interpreter names probed when nothing explicit is configured, newest first. */
const VERSIONED_BINS = Object.freeze(['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10'])

/**
 * Absolute locations worth trying even when PATH is the GUI's bare one.
 * `/usr/bin/python3` is deliberately last: on macOS it is the 3.9 system
 * build, so it is only useful as a "no candidate worked" diagnostic.
 */
const ABSOLUTE_BINS = Object.freeze(['/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'])

/** Parse `"cpython 3.12.14"` (the probe's own output) into `[3, 12, 14]`. */
export function parseInterpreterReport(text) {
  const match = /^\s*([A-Za-z]+)\s+(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(text ?? ''))
  if (!match) return undefined
  return { implementation: match[1].toLowerCase(), version: [Number(match[2]), Number(match[3]), Number(match[4] ?? 0)] }
}

/** Lexicographic-ish version comparison over the numeric triples we produce. */
export function versionAtLeast(version, minimum = PYTHON_MIN_VERSION) {
  if (!Array.isArray(version)) return false
  for (let index = 0; index < minimum.length; index += 1) {
    const left = Number(version[index] ?? 0)
    const right = Number(minimum[index] ?? 0)
    if (left > right) return true
    if (left < right) return false
  }
  return true
}

/**
 * Candidate interpreters, in the order the contract fixes:
 *   1. the configured `pythonBin` (settings card) — an explicit choice wins;
 *   2. `DSH_PYTHON`, then `DSH_PTC_PYTHON_BIN` (deployment overrides);
 *   3. the interpreter a dsh runtime ships
 *      (`<DSH_HOME>/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3`,
 *      measured 3.12.14 here) — present on web AND desktop because both share
 *      DSH_HOME, which is exactly the environment a GUI launch hides;
 *   4. `/opt/homebrew/bin/python3`, `/usr/local/bin/python3` — a GUI PATH
 *      carries neither, yet one of them is usually the only >= 3.10;
 *   5. versioned names (`python3.14` … `python3.10`) then bare `python3` on PATH;
 *   6. `/usr/bin/python3` last: on macOS it is the 3.9 system build, kept only
 *      so the refusal message can name it.
 * @param {object} [input]
 * @param {string} [input.explicit] - configured `pythonBin`, if any.
 * @param {string} [input.platform] - process.platform override for tests.
 * @param {object} [input.env] - environment override for tests.
 * @param {string} [input.home] - DSH_HOME override for tests.
 * @returns {string[]} de-duplicated candidates.
 */
export function pythonCandidates({ explicit, platform = process.platform, env = process.env, home } = {}) {
  const candidates = []
  if (typeof explicit === 'string' && explicit.trim() !== '') candidates.push(explicit.trim())
  for (const name of ['DSH_PYTHON', 'DSH_PTC_PYTHON_BIN']) {
    const value = env?.[name]
    if (typeof value === 'string' && value.trim() !== '') candidates.push(value.trim())
  }
  if (platform !== 'win32') {
    const dshHome = (typeof home === 'string' && home.trim() !== '') ? home.trim() : (env?.DSH_HOME?.trim() || join(homedir(), '.dsh'))
    candidates.push(join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'bin', 'python3'))
    candidates.push('/opt/homebrew/bin/python3', '/usr/local/bin/python3')
  }
  candidates.push(...VERSIONED_BINS)
  candidates.push('python3')
  candidates.push(platform !== 'win32' ? '/usr/bin/python3' : 'py')
  const seen = new Set()
  return candidates.filter((candidate) => (seen.has(candidate) ? false : (seen.add(candidate), true)))
}

/**
 * Run one candidate and report what it is. `python -I` keeps the user's
 * site-packages and environment out of the probe, and `sys.implementation`
 * distinguishes CPython from a PyPy/venv shim that would fail later anyway.
 * @param {string} bin - interpreter to run.
 * @param {object} [deps] - injectable spawn for tests.
 * @returns {{ok: boolean, bin: string, implementation?: string, version?: number[], detail: string}}
 */
export function probeInterpreter(bin, deps = {}) {
  const runner = deps.run
    ?? ((command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 5000 }))
  let result
  try {
    result = runner(bin, ['-I', '-c', 'import sys; print("%s %d.%d.%d" % (sys.implementation.name, *sys.version_info[:3]))'])
  } catch (error) {
    return { ok: false, bin, detail: `probe failed: ${error && error.message ? error.message : String(error)}` }
  }
  if (!result || result.error) {
    return { ok: false, bin, detail: `not runnable: ${result?.error?.message ?? 'spawn error'}` }
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split('\n')[0]
    return { ok: false, bin, detail: `exit ${String(result.status)}${stderr ? `: ${stderr}` : ''}` }
  }
  const report = parseInterpreterReport(result.stdout)
  if (!report) return { ok: false, bin, detail: `unreadable version report: ${String(result.stdout ?? '').trim()}` }
  if (report.implementation !== 'cpython') {
    return { ok: false, bin, detail: `not CPython (${report.implementation}); the experimental backend needs CPython`, ...report }
  }
  const version = report.version
  if (!versionAtLeast(version, PYTHON_MIN_VERSION)) {
    return { ok: false, bin, implementation: report.implementation, version, detail: `CPython ${version.join('.')} is older than the required ${PYTHON_MIN_VERSION.join('.')}` }
  }
  return { ok: true, bin, implementation: report.implementation, version, detail: `CPython ${version.join('.')}` }
}

/**
 * First usable interpreter, with every attempt recorded for the diagnostics a
 * rejected switch has to print (an unexplained "unavailable" is useless when
 * the machine has three interpreters and the wrong one is first on PATH).
 * @param {object} [input]
 * @param {string} [input.explicit] - configured `pythonBin`.
 * @param {string} [input.platform] - platform override.
 * @param {object} [input.env] - environment override.
 * @param {string} [input.home] - DSH_HOME override.
 * @param {Function} [input.probe] - probe override for tests.
 * @returns {{ok: boolean, bin?: string, version?: number[], attempts: object[], candidates: string[]}}
 */
export function discoverPython({ explicit, platform, env, home, probe } = {}) {
  const candidates = pythonCandidates({ explicit, platform, env, home })
  const attempts = []
  const run = probe ?? ((bin) => probeInterpreter(bin))
  // An explicit pythonBin is a USER DECISION (v0.15.2): when it does not work
  // the switch must fail loud with that interpreter named, never silently swap
  // in a different one — the user would otherwise believe their choice runs.
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const chosen = explicit.trim()
    const attempt = run(chosen)
    attempts.push({ bin: chosen, ok: attempt.ok === true, detail: attempt.detail })
    return attempt.ok
      ? { ok: true, bin: chosen, version: attempt.version, attempts, candidates: [chosen] }
      : { ok: false, explicit: true, bin: chosen, detail: attempt.detail, attempts, candidates: [chosen] }
  }
  for (const bin of candidates) {
    const attempt = run(bin)
    attempts.push({ bin, ok: attempt.ok === true, detail: attempt.detail })
    if (attempt.ok) return { ok: true, bin, version: attempt.version, attempts, candidates }
  }
  return { ok: false, attempts, candidates }
}

/**
 * Resolve the experimental backend package from a module's own tree, then
 * through the host loader (the fallback path for a plugin installed by a
 * package manager that pruned optional dependencies it could not fetch).
 * @param {object} input
 * @param {string} input.fromUrl - `import.meta.url` of the caller.
 * @param {object} [input.ctx] - cordis context, for the loader resolver.
 * @returns {Promise<{ok: boolean, url?: string, via?: string, failures: string[]}>}
 */
export async function resolvePythonPackage({ fromUrl, ctx } = {}) {
  const failures = []
  try {
    const [{ createRequire }, { pathToFileURL }] = await Promise.all([import('node:module'), import('node:url')])
    const resolved = createRequire(fromUrl).resolve(PYTHON_RUNTIME_PACKAGE)
    return { ok: true, url: pathToFileURL(resolved).href, via: 'package tree', failures }
  } catch (error) {
    failures.push(`package tree: ${error && error.message ? error.message : String(error)}`)
  }
  try {
    const internal = ctx?.loader?.internal
    if (internal && typeof internal.import === 'function') {
      return { ok: true, via: 'loader resolver', failures, load: () => internal.import(PYTHON_RUNTIME_PACKAGE, ctx?.baseUrl, {}) }
    }
    failures.push('loader resolver unavailable')
  } catch (error) {
    failures.push(`loader resolver: ${error && error.message ? error.message : String(error)}`)
  }
  return { ok: false, failures }
}

/** The one-line guidance a rejected switch prints (kept next to the probe). */
export const PYTHON_GUIDANCE = `need CPython >= ${PYTHON_MIN_VERSION.join('.')} on PATH or an explicit pythonBin (on macOS: brew install python@3.12, or set the interpreter path on the PTC 创造模式 settings card); the backend package ${PYTHON_RUNTIME_PACKAGE} is declared as this plugin's optionalDependency — reinstall the plugin if a package manager pruned it`

/** Test surface. */
export const _internal = { VERSIONED_BINS, ABSOLUTE_BINS }
