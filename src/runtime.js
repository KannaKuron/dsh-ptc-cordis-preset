/**
 * dsh-ptc-cordis-preset/runtime — the host-plane PTC runtime row (v0.15.0).
 *
 * WHY THIS MODULE EXISTS. The experimental CPython PTC backend cannot be
 * swapped in from an agent-preset composition: preset rows mount into their
 * own EntryTree (`vendor/loader/src/config/tree.ts:13` — every tree owns its
 * `store`), and a preset row publishing a root service is rejected outright
 * (`packages/preset/agent-preset-registry/src/mount.ts:267`, "Preset services
 * require isolate realms"), while the consumer that matters —
 * `packages/core/agent-tool-presentation/src/index.ts:69`, the run_code
 * presentation row — reads `ctx.ptcRuntime` from the host plane. The base
 * bundle owns that row (`packages/bundle/base/cordis.patch.yml:389`), so the
 * only composer that can replace it is this plugin's own bundle patch layer
 * (`cordis.patch.yml`), which disables `ptc-runtime` and inserts THIS row
 * under the id `ptc-cordis-runtime`.
 *
 * WHAT IT DOES. It is the provider row for the experimental backend: it
 * resolves `@deepseek-ai/dsh-experimental-ptc-runtime-python` from this
 * package's own dependency tree (declared as an optionalDependency, so a
 * profile that installs this plugin carries it with no second install step),
 * DISCOVERS a CPython >= 3.10 interpreter, and mounts the backend with that
 * absolute path in `pythonBin` — the provider's own `'python3'` default is
 * 3.9.6 on this machine's `/usr/bin` and would be rejected at load, so the
 * discovery result must be handed over explicitly (`src/python-probe.js`
 * documents the measurement).
 *
 * FAIL-SAFE CONTRACT (the whole point of this row being conditional):
 *   * the patch only enables this row when the host half wrote a snapshot
 *     proving `pythonRuntime === true` AND its preflight passed (`ready`),
 *     and only on a POSIX platform;
 *   * if this module still cannot deliver a provider — package pruned by a
 *     package manager, interpreter removed since the snapshot, a future host
 *     changing inline rules — it must NOT leave the profile without a PTC
 *     runtime. It falls back to the official Node provider, best effort, and
 *     reports the reason loudly enough to act on.
 *
 * No top-level peer import: the only static imports are a Node builtin and a
 * sibling module with no dependencies. A peer that cannot resolve must
 * degrade, never take the row's import down (the loader treats an import
 * failure as a non-fatal skip, which would silently remove `ctx.ptcRuntime`
 * from a profile whose Node row the patch already disabled).
 *
 * @module dsh-ptc-cordis-preset/runtime
 */

import {
  NODE_RUNTIME_PACKAGE,
  PYTHON_GUIDANCE,
  PYTHON_RUNTIME_PACKAGE,
  discoverPython,
  resolvePythonPackage,
} from './python-probe.js'

const TAG = '[ptc-cordis]'

/** Cordis plugin name for diagnostics. */
export const name = 'dsh-ptc-cordis-preset/runtime'

/** Nothing is required before the row can publish `ptcRuntime`. */
export const inject = []

/**
 * The interpreter the host half's preflight proved and froze into the boot
 * snapshot, if any. The row is only enabled when that snapshot said the
 * backend is ready, so this is normally the exact path to reuse; a missing or
 * unreadable snapshot degrades to discovery.
 */
function frozenPythonBin() {
  try {
    const { readFileSync } = process.getBuiltinModule('node:fs')
    const { homedir } = process.getBuiltinModule('node:os')
    const { join } = process.getBuiltinModule('node:path')
    const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
    const parsed = JSON.parse(readFileSync(join(home, 'ptc-cordis-runtime.json'), 'utf8'))
    return typeof parsed?.pythonBin === 'string' && parsed.pythonBin !== '' ? parsed.pythonBin : undefined
  } catch {
    return undefined
  }
}

/** A defensive logger: the row must work on hosts whose ctx.logger shape changed. */
function warn(ctx, message) {
  try {
    const logger = typeof ctx?.logger === 'function' ? ctx.logger('ptc-cordis') : ctx?.logger
    if (logger && typeof logger.warn === 'function') {
      logger.warn(message)
      return
    }
  } catch {
    /* fall through to console */
  }
  console.warn(`${TAG} ${message}`)
}

/** Pick the plugin class out of a resolved module across default/interop shapes. */
function providerOf(mod) {
  const candidate = mod?.default ?? mod
  return typeof candidate === 'function' ? candidate : undefined
}

/** Load the shipped Node backend from the package tree, then the host loader. */
async function loadNodeProvider(ctx) {
  const failures = []
  try {
    const [{ createRequire }, { pathToFileURL }] = await Promise.all([import('node:module'), import('node:url')])
    const resolved = createRequire(import.meta.url).resolve(NODE_RUNTIME_PACKAGE)
    const provider = providerOf(await import(pathToFileURL(resolved).href))
    if (provider !== undefined) return { provider, via: `package tree (${resolved})` }
    failures.push('package tree export is not a plugin')
  } catch (error) {
    failures.push(`package tree: ${error && error.message ? error.message : String(error)}`)
  }
  try {
    const internal = ctx?.loader?.internal
    if (internal && typeof internal.import === 'function') {
      const provider = providerOf(await internal.import(NODE_RUNTIME_PACKAGE, ctx?.baseUrl, {}))
      if (provider !== undefined) return { provider, via: 'loader resolver' }
      failures.push('loader resolver export is not a plugin')
    } else {
      failures.push('loader resolver unavailable')
    }
  } catch (error) {
    failures.push(`loader resolver: ${error && error.message ? error.message : String(error)}`)
  }
  return { provider: undefined, failures }
}

/** Best-effort: keep a PTC runtime available when the Python row cannot be. */
async function fallbackToNode(ctx, because) {
  if (ctx?.get?.('ptcRuntime') !== undefined) {
    console.log(`${TAG} a PTC runtime is already provided — the Node fallback is not needed (${because})`)
    return
  }
  const node = await loadNodeProvider(ctx)
  if (node.provider === undefined) {
    warn(ctx, `${because}; the Node fallback could not be loaded either (${node.failures.join(' | ')}) — no PTC runtime is published, so PTC presentations report a missing runtime. ${PYTHON_GUIDANCE}`)
    return
  }
  try {
    ctx.plugin(node.provider, {})
    console.log(`${TAG} ${because}; shipped Node PTC runtime restored as the fallback (${NODE_RUNTIME_PACKAGE} via ${node.via}) — run_code stays on TypeScript`)
  } catch (error) {
    warn(ctx, `${because}; the Node fallback failed to mount (${error && error.message ? error.message : String(error)}) — no PTC runtime is published. ${PYTHON_GUIDANCE}`)
  }
}

/**
 * Publish the experimental backend, or fall back to the shipped one.
 * @param ctx - the row's cordis context.
 * @param config - the row's config (usually empty), forwarded to the provider
 *   with the discovered interpreter path overriding `pythonBin`.
 */
export async function apply(ctx, config) {
  if (process.platform === 'win32') {
    await fallbackToNode(ctx, 'the experimental Python PTC runtime row was activated on win32 and refused (POSIX-only backend)')
    return
  }

  const python = await resolvePythonPackage({ fromUrl: import.meta.url, ctx })
  if (!python.ok) {
    await fallbackToNode(ctx, `could not resolve ${PYTHON_RUNTIME_PACKAGE} (${python.failures.join(' | ')})`)
    return
  }

  const frozen = frozenPythonBin()
  const configured = typeof config?.pythonBin === 'string' && config.pythonBin !== '' ? config.pythonBin : undefined
  const interpreter = discoverPython({ explicit: frozen ?? configured })
  if (!interpreter.ok) {
    const tried = interpreter.attempts.map((attempt) => `${attempt.bin}: ${attempt.detail}`).join(' | ')
    await fallbackToNode(ctx, `no CPython >= 3.10 interpreter found (tried ${tried})`)
    return
  }

  const providerConfig = { ...(config ?? {}), pythonBin: interpreter.bin }
  delete providerConfig.workflow
  delete providerConfig.pythonRuntime
  try {
    const module = python.load ? await python.load() : await import(python.url)
    const Provider = providerOf(module)
    if (Provider === undefined) {
      await fallbackToNode(ctx, `${PYTHON_RUNTIME_PACKAGE} (via ${python.via}) exports no plugin class`)
      return
    }
    ctx.plugin(Provider, providerConfig)
    console.log(`${TAG} experimental Python PTC runtime active (${PYTHON_RUNTIME_PACKAGE} via ${python.via}, ${interpreter.bin}) — run_code presents Python`)
  } catch (error) {
    await fallbackToNode(ctx, `mounting ${PYTHON_RUNTIME_PACKAGE} failed (${error && error.message ? error.message : String(error)})`)
  }
}

/** Test surface: pure helpers, no Cordis context required. */
export const _internal = { providerOf, PYTHON_RUNTIME_PACKAGE, NODE_RUNTIME_PACKAGE }
