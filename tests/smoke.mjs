// Smoke tests for dsh-ptc-cordis-preset — pure helper level, no Cordis
// runtime needed. Run: npm test (node --test tests/smoke.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal, name as pluginName, inject as pluginInject } from '../src/index.js'

const { PRESET_ID, MARKER_FILE, DEFAULT_WORKFLOW, classify, hashTree, installRegisterShim, workflowOf, valueOf } = _internal

const presetAsset = readFileSync(new URL('../assets/preset.yml', import.meta.url), 'utf8')

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ptc-cordis-test-'))
}

function fakeRegistry() {
  const providers = new Map()
  const reg = {
    providers,
    register(registration) {
      if (!registration || !registration.manifest || typeof registration.manifest.id !== 'string') {
        throw new TypeError('invalid manifest')
      }
      const { id } = registration.manifest
      if (providers.has(id)) throw new Error(`Host Cordis inspect provider "${id}" is already registered`)
      const stored = { ...registration }
      providers.set(id, stored)
      return () => { if (providers.get(id) === stored) providers.delete(id) }
    },
  }
  return reg
}
const manifest = (id) => ({ manifest: { id, methods: [] }, query: async () => ({}) })

test('plugin shape: namespace exports and agentPresets injection', () => {
  assert.equal(pluginName, 'dsh-ptc-cordis-preset')
  assert.ok(pluginInject.includes('agentPresets'))
})

test('preset metadata asset has display name and description', () => {
  assert.match(presetAsset, /name: PTC 创造模式/)
  assert.match(presetAsset, /description: \S/)
  assert.doesNotMatch(presetAsset, /order:/) // user presets never carry roster order
})

test('hashTree covers nested files but never the marker itself', () => {
  const root = tmp()
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'a.txt'), 'a')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'b.txt'), 'b')
    writeFileSync(join(root, MARKER_FILE), '{}')
    const hashes = hashTree(root)
    assert.deepEqual(Object.keys(hashes).sort(), ['a.txt', 'sub/b.txt'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('shim: without it, a duplicate same-id registration throws (baseline)', () => {
  const reg = fakeRegistry()
  reg.register(manifest('Service'))
  assert.throws(() => reg.register(manifest('Service')), /is already registered/)
})

test('shim: original-first — first registration and unrelated errors pass through untouched', () => {
  const reg = fakeRegistry()
  const { installed } = installRegisterShim(reg)
  assert.equal(installed, true)
  const dispose = reg.register(manifest('Service'))
  assert.ok(reg.providers.has('Service'))
  dispose()
  assert.ok(!reg.providers.has('Service'))
  reg.register(manifest('Service'))
  // a malformed registration must still throw (the original path's error)
  assert.throws(() => reg.register({ query: null }), /invalid manifest/)
})

test('shim: duplicate same-id registration replaces the entry instead of throwing', () => {
  const reg = fakeRegistry()
  installRegisterShim(reg)
  reg.register(manifest('Service'))
  const dispose2 = reg.register(manifest('Service')) // v0.3.0 died here
  assert.ok(reg.providers.has('Service'))
  dispose2()
  assert.ok(!reg.providers.has('Service')) // identity-guarded: removed its own entry
})

test('shim: identity-guarded disposers never delete a successor entry', () => {
  const reg = fakeRegistry()
  installRegisterShim(reg)
  const d1 = reg.register(manifest('Service'))
  const d2 = reg.register(manifest('Service'))
  d1() // first disposer must not touch the second entry
  assert.ok(reg.providers.has('Service'))
  d2()
  assert.ok(!reg.providers.has('Service'))
})

test('shim: install is idempotent, restore puts the original back', () => {
  const reg = fakeRegistry()
  const a = installRegisterShim(reg)
  assert.equal(a.installed, true)
  const b = installRegisterShim(reg)
  assert.equal(b.installed, false) // no double wrap
  a.restore()
  reg.register(manifest('Service'))
  assert.throws(() => reg.register(manifest('Service')), /is already registered/) // throw is back
})

test('shim: refuses unknown shapes without touching anything', () => {
  for (const bad of [undefined, null, {}, { register: () => {} }, { providers: new Map() }]) {
    const r = installRegisterShim(bad)
    assert.equal(r.installed, false)
    r.restore() // no-op, never throws
  }
})

// ── dsh-gitbash-shell cooperation ───────────────────────────────────────────

test('git bash metadata variant exists with a suffixed name', () => {
  const meta = readFileSync(new URL('../assets/preset.gitbash.yml', import.meta.url), 'utf8')
  assert.match(meta, /name: PTC 创造模式 · Git Bash/)
  assert.match(meta, /Shell 使用 Git Bash/)
  assert.doesNotMatch(meta, /order:/)
})

test('client half is a ModuleLoader bundle with baseline requires only', () => {
  const src = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  // one ModuleLoader load, id = package name
  assert.match(src, /window\.__ModuleLoader__\.load\(\{\s*id: "dsh-ptc-cordis-preset"/)
  // the factory MUST return module.exports (the 0.10.1 lesson, shared with
  // dsh-gitbash-shell / dsh-agent-lang: omitting it materializes undefined)
  assert.match(src, /return module\.exports;/)
  // require whitelist: react + ui-primitives only
  const requires = [...src.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
  for (const name of requires) {
    assert.ok(
      name === 'react' || name === '@deepseek-ai/dsh-client-ui-primitives',
      `unexpected require: ${name}`,
    )
  }
  assert.ok(requires.includes('react') && requires.includes('@deepseek-ai/dsh-client-ui-primitives'))
  // services: only era-guaranteed ones are hard-injected; the settings
  // face is acquired optionally (settingsScope on <=0.1.6, configForms on
  // >=0.1.7 — a hard inject would PENDING the fiber on the other era)
  assert.match(src, /exports\.inject = \["locale", "slots"\]/)
  // two-stage slot registration (the 0.10.3 lesson): slots.inject(hole, cb)
  // whose body RETURNS slots.register(...)
  assert.doesNotMatch(src, /settings\.plugin\.item/, 'the legacy settings-list seat must stay gone')
  // the card is keyed by the same namespace the host half serves
  assert.match(src, /var NS = "ptc-cordis"/)
  assert.match(src, /svc\.bind\(\{ namespace: NS \}\)/)
  // no import / JSX / TS syntax
  assert.doesNotMatch(src, /\bimport\s/)
  assert.doesNotMatch(src, /<[A-Z][A-Za-z]*\s*\/>/)
  assert.doesNotMatch(src, /:\s*(string|boolean|number)\b/)
})

test('client dictionaries stay key-aligned (zh/en)', () => {
  const src = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const grab = (name) => {
    const m = src.match(new RegExp('var ' + name + ' = \\{([\\s\\S]*?)\\n\\t\\t\\};'))
    assert.ok(m, 'dictionary ' + name + ' not found')
    return [...m[1].matchAll(/"([^"]+)":/g)].map((x) => x[1]).sort()
  }
  const zh = grab('zh')
  const en = grab('en')
  assert.deepEqual(zh, en)
  assert.ok(zh.length >= 6, 'expected at least the base card keys')
})

test('every shipped dictionary carries the same key set as zh', () => {
  // A third-language block is preceded by a marker comment naming its tag, so
  // the blocks can be sliced without parsing the file (the dsh-ide-git shape).
  // Equality matters because a key missing from a dictionary falls back to
  // English at lookup time — a silent half-translated card, which is exactly
  // what this catches.
  const src = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  // the value must be a quoted string, so the locale-entry line ("zh-hk": {)
  // is not mistaken for a key
  const keyLines = (segment) => [...segment.matchAll(/^\s+"([^"]+)": "/gm)].map((match) => match[1]).sort()
  const zhKeys = keyLines(src.slice(src.indexOf('var zh = {'), src.indexOf('var en = {')))
  assert.ok(zhKeys.length >= 6, 'the zh dictionary looks truncated: ' + zhKeys.length)

  const parts = src.split('/* locale: ')
  assert.ok(parts.length - 1 >= 19, 'expected the nineteen third-language dictionaries, saw ' + (parts.length - 1))
  const tags = []
  for (let index = 1; index < parts.length; index += 1) {
    const tag = parts[index].slice(0, parts[index].indexOf(' */'))
    tags.push(tag)
    assert.deepEqual(keyLines(parts[index]), zhKeys, 'dictionary ' + tag + ' does not match the zh key set')
  }
  // the shipped catalogue: zh/en plus these nineteen, in file order
  assert.deepEqual(tags, [
    'zh-hk', 'zh-tw', 'zh-mo', 'ja', 'ko', 'de', 'fr', 'ru', 'pt', 'it',
    'nl', 'pl', 'sv', 'tr', 'id', 'vi', 'ar', 'hi', 'th',
  ])
  // every shipped dictionary rides the one DSH registration
  assert.match(src, /ctx\.locale\.register\(DICT_NS, Object\.assign\(\{ zh: zh, en: en \}, LOCALES\)\)/)
  // the lookup stays LIVE: resolved per call (cached per tag), plus a locale
  // subscription so a language switch repaints the card instead of waiting for
  // the next page load
  assert.match(src, /function dictionaryFor\(active\)/)
  assert.match(src, /function activeLocaleOf\(ctx\)/)
  assert.match(src, /function translatorOf\(ctx\)/)
  assert.match(src, /locale\.subscribe\(/)
})

test('manifest and package versions stay in sync', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../dsh.plugin.json', import.meta.url), 'utf8'))
  assert.equal(pkg.version, manifest.version)
  // the client entry is declared for the loader and the files list ships it
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert.ok(pkg.files.includes('src'))
  assert.ok(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length >= 4)
  assert.equal(pkg.dsh?.client?.platform, 'web')
})

test('package manifest declares the dsh peer the 0.1.7+ compatibility gate reads', () => {
  // dsh 0.1.7-rc.1 enforces exactly one thing at install and boot
  // (packages/boot/app-boot/src/plugin-compatibility.ts): every
  // peerDependencies entry named `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*`,
  // compared with prereleases participating. A manifest with no such peer is
  // never validated at all, which is how this plugin used to be invisible to
  // the gate. The range mirrors engines.dsh and stays open-ended: the plugin
  // serves both eras by runtime probing, and an upper bound would only disable
  // it on the next dsh line before any real break was observed.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh'], '>=0.1.7-rc')
  // OPTIONAL keeps the gate intact while removing the install hazard: the gate
  // reads peerDependencies only, but a package manager with autoInstallPeers
  // (pnpm's default) would resolve the range against the registry, and every
  // published @deepseek-ai/dsh version is a prerelease that a plain range
  // excludes (ERR_PNPM_NO_MATCHING_VERSION).
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh']?.optional, true)
})
test('client registers the Plugins-page settings seat (single seat)', () => {
  const text = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(text, /settings\.plugin\.item/, 'the legacy settings-list seat must stay gone')
  assert.match(text, /slots\.inject\("plugins\.bundle\.config"/)
  assert.match(text, /key: "dsh-ptc-cordis-preset"/, 'the Plugins-page seat is keyed by the PACKAGE name')
})

// ── dsh 0.1.7 declarative era ────────────────────────────────────────────────

test('composition module: row set splits by workflow side and gitbash capability', async () => {
  const { pluginsFor, PRESET_META } = await import('../src/composition.js')
  assert.equal(PRESET_META.id, 'ptc-cordis')
  assert.equal(PRESET_META.name, 'PTC 创造模式')
  const row = (rows, id) => rows.find((r) => r.id === id)
  for (const workflowOn of [true, false]) {
    const rows = pluginsFor({ workflowOn, gitBashActive: false, skillsDir: '/x/skills' })
    // union rows both sides carry
    assert.equal(row(rows, 'tool-presentation').config.mode, 'ptc')
    assert.equal(row(rows, 'tool-cordis').name, '@deepseek-ai/dsh-tool-cordis')
    assert.equal(row(rows, 'present').name, '@deepseek-ai/dsh-tool-present')
    assert.equal(row(rows, 'skill-filesystem').config.customSkillDirs[0], '/x/skills')
    // workflow side split (the engine rows live inside the delegation group)
    const delegationRows = row(rows, 'delegation').config
    assert.equal(row(delegationRows, 'workflow-ptc').name, '@deepseek-ai/dsh-workflow-ptc')
    assert.equal(row(delegationRows, 'workflow-ptc').disabled === true, !workflowOn)
    assert.equal(row(delegationRows, 'tool-workflow').disabled === true, !workflowOn)
    assert.equal(row(rows, 'tool-plugin-manager').disabled === true, !workflowOn)
    // ralph mirrors the host default on both sides
    assert.equal(row(delegationRows, 'tool-ralph').disabled, true)
    // the official minimal persona (0.1.7 moved Creation guidance into skills)
    assert.equal(row(rows, 'persona').config.prefix, 'You are a coding agent powered by the {{model}} model.')
    assert.equal(row(rows, 'persona').config.suffix, 'Your working directory is {{cwd}}.')
  }
  const win = process.platform === 'win32'
  const plain = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: undefined })
  // Without the gitbash cooperation the shell rows are the SHIPPED preset's:
  // `disabled: !!js process.platform === 'win32'` for bash and
  // `disabled: !!js process.platform !== 'win32'` for pwsh — i.e. pwsh off
  // everywhere but Windows, in official ptc/cordis/standard alike. The
  // fixture-backed alignment tests below hold that against the real capture.
  assert.equal(row(plain, 'tool-bash').disabled === true, win)
  assert.equal(row(plain, 'tool-pwsh').disabled === true, !win)
  // without a resolved skills dir the row carries NO config key at all —
  // the official 0.1.7 standard/ptc shape (an empty array would be a lie:
  // the row would advertise a root list nothing resolved)
  assert.equal(row(plain, 'skill-filesystem').config, undefined)
  const gb = pluginsFor({ workflowOn: true, gitBashActive: true, skillsDir: undefined })
  // gitbash cooperation (an active Git Bash stack, which dsh-gitbash-shell
  // reports on Windows only): bash on, pwsh replaced —
  // assets/agent.cordis*.gitbash.yml ships exactly `disabled: false` / `true`.
  assert.notEqual(row(gb, 'tool-bash').disabled, true)
  assert.equal(row(gb, 'tool-pwsh').disabled, true)
  // groups keep the official isolate shape
  const delegation = plain.find((r) => r.id === 'delegation')
  assert.equal(delegation.group, true)
  assert.equal(delegation.isolate.workflowEngine, true)
  assert.ok(Array.isArray(delegation.config))
})

// ── declarative metadata follows the Git Bash side (issue #1) ────────────────

test('declarative roster metadata follows the git bash side and mirrors the committed twin', async () => {
  const { PRESET_META, presetMetaFor } = await import('../src/composition.js')
  const plain = presetMetaFor(false)
  const gitbash = presetMetaFor(true)
  // the plain side is unchanged (the roster entry keeps its long-standing name)
  assert.equal(plain.name, PRESET_META.name)
  assert.equal(plain.description, PRESET_META.description)
  // the Git Bash side says so, in the same style as dsh-gitbash-shell's variants
  assert.equal(gitbash.name, 'PTC 创造模式 · Git Bash')
  assert.match(gitbash.description, /Shell 使用 Git Bash/)
  // SINGLE SOURCE for the NAME: the live roster's Git Bash string IS the
  // committed twin's (assets/preset.gitbash.yml still feeds the legacy
  // materializer, so a drift here would hand the two host eras different
  // names for the same preset).
  const asset = readFileSync(new URL('../assets/preset.gitbash.yml', import.meta.url), 'utf8')
  const assetLine = (key) => {
    const match = new RegExp(`^${key}: (.*)$`, 'm').exec(asset)
    assert.ok(match, `assets/preset.gitbash.yml carries ${key}`)
    return match[1].trim()
  }
  assert.equal(gitbash.name, assetLine('name'))
  // The DESCRIPTION keeps the declarative era's wording (v0.13.0 wrote its own
  // roster copy; the assets keep the materialization-era text for old hosts)
  // and only gains the capability marker the asset twin also carries.
  assert.equal(gitbash.description, `${PRESET_META.description}(Shell 使用 Git Bash)`)
  assert.ok(assetLine('description').endsWith('(Shell 使用 Git Bash)'))
  // and the declarative registration is the caller that consumes it
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(source, /const meta = presetMetaFor\(gitBashActive\)/)
})

test('coverage capability answers dsh-gitbash-shell on both host eras', async () => {
  const { COVERAGE_CAPABILITY, publishPresetCoverage, PRESET_ID: id } = _internal
  assert.equal(COVERAGE_CAPABILITY, 'ptcCordisPreset')
  const provided = []
  const effects = []
  await publishPresetCoverage({
    get: (name) => (name === 'gitBash' ? { active: true, bashPath: 'C:/Program Files/Git/bin/bash.exe' } : undefined),
    provide: (name, value) => { provided.push([name, value]); return () => {} },
    effect: (fn) => { effects.push(fn) },
  })
  assert.deepEqual(provided, [[COVERAGE_CAPABILITY, { id: 'ptc-cordis', gitBashActive: true, pythonRuntime: false, pythonBackend: 'node' }]])
  assert.equal(id, 'ptc-cordis')
  // the disposer rides the plugin fiber
  assert.equal(effects.length, 1)
  // the same capability object carries the Python backend side (v0.15.0): the
  // peer reads ONE signal for both the Git Bash side and the runtime switch
  const pythonOn = []
  const capability = await publishPresetCoverage({
    get: (name) => (name === 'gitBash' ? { active: true } : undefined),
    provide: (name, value) => { pythonOn.push([name, value]); return () => {} },
    effect: () => {},
  }, true)
  assert.deepEqual(pythonOn, [[COVERAGE_CAPABILITY, { id: 'ptc-cordis', gitBashActive: true, pythonRuntime: true, pythonBackend: 'node' }]])
  // mutable by reference: a flip after publication reaches the peer without a
  // second copy of the state existing anywhere
  assert.equal(capability.pythonRuntime, true)
  capability.pythonRuntime = false
  assert.equal(pythonOn[0][1].pythonRuntime, false)
  // a host without dsh-gitbash-shell still gets the service, reported inactive —
  // the peer must never read "absent" as "nothing to dedupe" by accident
  const inactive = []
  await publishPresetCoverage({ get: () => undefined, provide: (name, value) => { inactive.push([name, value]); return () => {} }, effect: () => {} })
  assert.deepEqual(inactive, [[COVERAGE_CAPABILITY, { id: 'ptc-cordis', gitBashActive: false, pythonRuntime: false, pythonBackend: 'node' }]])
})

test('host half: lazy Config with volatile probing and era branch', async () => {
  const mod = await import('../src/index.js')
  assert.equal(typeof mod.Config, 'function')
  assert.equal(typeof mod.valueOf, 'function')
  const hostSource = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  // Lazy peer import: a static one makes an unresolvable schemastery kill the
  // whole row silently (Loader skips a failed plugin import non-fatally), and
  // for this plugin that means the preset is never registered at all.
  assert.match(hostSource, /await import\('@deepseek-ai\/schemastery'\)/)
  assert.doesNotMatch(hostSource, /^import Schema from '@deepseek-ai\/schemastery'/m)
  assert.match(hostSource, /export const Config = Schema === null \? undefined : Schema\.object\(/)
  assert.match(hostSource, /typeof schema\.volatile === 'function' \? schema\.volatile\(\) : schema/)
  // the era branch probes register() and serves the declarative path first
  assert.match(hostSource, /typeof ctx\.agentPresets\.register === 'function'/)
  assert.match(hostSource, /await runDeclarativeEra\(ctx, config, await coveragePromise\)/)
  // workflow flip re-registers through the volatile event
  assert.match(hostSource, /loader\/volatile-update/)
})

test('client half: era-split settings acquisition, no hard settingsScope inject', () => {
  const clientSource = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(clientSource, /exports\.inject = \["locale", "settingsScope"/)
  assert.match(clientSource, /ctx\.inject\(\["settingsScope"\]/)
  assert.match(clientSource, /ctx\.inject\(\["configForms"\]/)
  assert.match(clientSource, /forms\.get\(NS\)/)
})

test('package meta: dsh 0.1.7 display assets and the renamed patch row', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.icon, './icon.svg')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.ok(pkg.files.includes('locale'))
  assert.ok(pkg.files.includes('icon.svg'))
  readFileSync(new URL('../icon.svg', import.meta.url), 'utf8')
  for (const tag of ['en', 'zh']) {
    const meta = JSON.parse(readFileSync(new URL(`../locale/${tag}.json`, import.meta.url), 'utf8'))
    assert.equal(typeof meta.meta?.title, 'string')
    assert.equal(typeof meta.meta?.description, 'string')
  }
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /id: ptc-cordis$/m)
  assert.doesNotMatch(patch, /id: ptc-cordis-preset/)
})

// ── declarative rows vs the shipped presets (the cell-by-cell lock) ─────────
// tests/fixtures/official-preset-rows.json is a capture of the shipped
// 0.1.7 preset patches (parsed with the loader's own YAML dialect, `!!js`
// evaluated for a profile host) — see the header of that file. It exists
// because the drift that matters is always "our rows × the shipped rows",
// never our own diff: v0.13.1 reviewed the ptc-era assets cell by cell while
// composition.js quietly turned the shipped `disabled: !!js platform !==
// 'win32'` pwsh row into a literal and dropped the tool off Windows.

const officialRows = JSON.parse(readFileSync(new URL('./fixtures/official-preset-rows.json', import.meta.url), 'utf8'))
// The dsh 0.2.1 capture: the full-tool presets gained `time-context` +
// `tool-schedule` rows and a schedule_* deny on the subagent configs. The
// composition adds those only when the packages resolve on the host
// (hostExtras below), so BOTH captures must keep mirroring: {} ↔ 0.1.7,
// { timeContext, toolSchedule } ↔ 0.2.1.
const officialRows021 = JSON.parse(readFileSync(new URL('./fixtures/official-preset-rows.0.2.1.json', import.meta.url), 'utf8'))

/** Row ids whose captured `disabled` came from a platform condition (see the generator). */
function platformConditionalsOf(capture) {
  return new Set([
    ...(capture.conditionalDisabled?.cordis ?? []),
    ...(capture.conditionalDisabled?.ptc ?? []),
  ])
}

/** Shape used for comparison: the fields the Loader reads.
 * A platform condition captured on another OS is not a contract this run can
 * judge, so its `disabled` cell drops out of BOTH sides instead of failing.
 * @param row - declared row from either side.
 * @param id - flattened identity (`parent/child`) used for the platform lookup.
 * @param capture - the fixture the row came from (platform context).
 */
function rowShape(row, id = row.id, capture = officialRows) {
  const platformLocked = capture.evaluatedFor?.platform !== process.platform && platformConditionalsOf(capture).has(id)
  return {
    id: row.id,
    name: row.name,
    ...(platformLocked ? {} : { disabled: row.disabled === true }),
    group: row.group === true,
    ...(row.isolate === undefined ? {} : { isolate: row.isolate }),
    ...(row.config === undefined ? {} : { config: row.config }),
  }
}

/** Key-order-insensitive clone: YAML key order is an artefact, not a contract. */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])]))
  }
  return value
}

test('declarative rows mirror the shipped cordis preset cell by cell', async () => {
  const { pluginsFor } = await import('../src/composition.js')
  // {} mirrors the 0.1.7 capture (dsh <= 0.2.0 hosts), the full probe mirrors
  // the 0.2.1 capture — both eras stay byte-aligned, neither drifts.
  for (const [label, capture, hostExtras] of [
    ['0.1.7', officialRows, {}],
    ['0.2.1', officialRows021, { timeContext: true, toolSchedule: true }],
  ]) {
    const ours = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: '/x/skills', hostExtras })
    // the union's defining row: PTC presentation on top of the Creation set
    const union = new Set(['tool-presentation'])
    const flat = (rows, prefix = '') => rows.flatMap((r) => [
      [`${prefix}${r.id}`, canon(rowShape(r, `${prefix}${r.id}`, capture))],
      ...(Array.isArray(r.config) ? flat(r.config, `${prefix}${r.id}/`) : []),
    ])
    const shipped = flat(capture.cordis).filter(([id]) => !union.has(id))
    const mine = flat(ours).filter(([id]) => !union.has(id))
    assert.deepEqual(mine.map(([id]) => id), shipped.map(([id]) => id), `row order must match the shipped ${label} preset`)
    for (const [id, expected] of shipped) {
      const actual = mine.find(([key]) => key === id)[1]
      // skill-filesystem resolves its skills dir per install layout; the shipped
      // capture drops the config and our row adds exactly that one key.
      if (id === 'skill-filesystem') {
        assert.deepEqual(canon({ ...actual, config: undefined }), canon({ ...expected, config: undefined }))
        assert.ok(Array.isArray(actual.config.customSkillDirs), 'skills dir contribution missing')
        continue
      }
      // persona config key ORDER is a YAML artefact, not a contract: compare content.
      assert.deepEqual(actual, expected, `row ${id} drifted from the shipped ${label} preset`)
    }
  }
})

test('declarative rows keep every shipped ptc row identical on the mirror side', async () => {
  const { pluginsFor } = await import('../src/composition.js')
  for (const [label, capture, hostExtras] of [
    ['0.1.7', officialRows, {}],
    ['0.2.1', officialRows021, { timeContext: true, toolSchedule: true }],
  ]) {
    const ours = pluginsFor({ workflowOn: false, gitBashActive: false, skillsDir: '/x/skills', hostExtras })
    const unionOnly = new Set(['tool-cordis', 'skill-filesystem', 'present', 'tool-presentation'])
    const flat = (rows, prefix = '') => rows.flatMap((r) => [
      [`${prefix}${r.id}`, canon(rowShape(r, `${prefix}${r.id}`, capture))],
      ...(Array.isArray(r.config) ? flat(r.config, `${prefix}${r.id}/`) : []),
    ])
    const mine = new Map(flat(ours))
    for (const [id, expected] of flat(capture.ptc)) {
      if (unionOnly.has(id)) continue
      assert.deepEqual(mine.get(id), expected, `ptc row ${id} drifted from the shipped ${label} preset`)
    }
    // the ptc mirror keeps the union's extra capability rows out of the way
    assert.equal(mine.get('tool-cordis').disabled === true, false)
    assert.equal(mine.get('present').name, '@deepseek-ai/dsh-tool-present')
  }
})

test('the fixtures are real captures of the shipped 0.1.7 and 0.2.1 presets', () => {
  assert.match(officialRows.runtime, /^0\.1\.7/)
  assert.ok(officialRows.cordis.length >= 20 && officialRows.ptc.length >= 20)
  const ids = officialRows.cordis.map(r => r.id)
  for (const id of ['persona', 'tool-bash', 'tool-pwsh', 'tool-cordis', 'skill-filesystem', 'present', 'tool-plugin-manager']) {
    assert.ok(ids.includes(id), `shipped cordis capture lost row ${id}`)
  }
  const pwsh = officialRows.cordis.find(r => r.id === 'tool-pwsh')
  assert.equal(typeof pwsh.disabled, 'boolean', 'the capture must carry EVALUATED conditions, not !!js objects')
  assert.equal(officialRows.cordis.find(r => r.id === 'tool-plugin-manager').disabled, false)
  assert.equal(officialRows.ptc.find(r => r.id === 'tool-plugin-manager').disabled, true)
  // the 0.2.1 capture carries the era's additions, or the hostExtras mirror above is vacuous
  assert.match(officialRows021.runtime, /^0\.2\.1/)
  const ids021 = officialRows021.cordis.map(r => r.id)
  assert.ok(ids021.includes('time-context') && ids021.includes('tool-schedule'), '0.2.1 capture lost the era additions')
  assert.equal(ids021.indexOf('time-context'), ids021.indexOf('agent-instructions') + 1, 'time-context drifted from its official slot')
  assert.equal(ids021.indexOf('tool-schedule'), ids021.indexOf('tool-jobs') + 1, 'tool-schedule drifted from its official slot')
  const subagent = officialRows021.cordis.find(r => r.id === 'delegation').config.find(r => r.id === 'tool-subagent')
  assert.deepEqual(subagent.config.toolFilter, { deny: ['schedule_create', 'schedule_delete', 'schedule_list', 'schedule_update'] })
})

test('v0.17.0: dsh 0.2.1 host additions ride the probe, never the default', async () => {
  const { pluginsFor } = await import('../src/composition.js')
  const row = (rows, id) => rows.find((r) => r.id === id)
  const ids = (rows) => rows.map((r) => r.id)
  const deny = { deny: ['schedule_create', 'schedule_delete', 'schedule_list', 'schedule_update'] }
  // default (dsh <= 0.2.0): no era rows, no toolFilter — byte-identical 0.1.7 set
  for (const workflowOn of [true, false]) {
    const rows = pluginsFor({ workflowOn, gitBashActive: false, skillsDir: '/x/skills' })
    assert.ok(!ids(rows).includes('time-context') && !ids(rows).includes('tool-schedule'))
    const delegation = row(rows, 'delegation').config
    assert.equal(row(delegation, 'tool-subagent').config.toolFilter, undefined)
    assert.equal(row(delegation, 'tool-subagent-fork').config.toolFilter, undefined)
  }
  // probe on: rows in their official slots, deny on both subagent configs
  const on = pluginsFor({ workflowOn: true, gitBashActive: true, skillsDir: undefined, hostExtras: { timeContext: true, toolSchedule: true } })
  assert.equal(ids(on).indexOf('time-context'), ids(on).indexOf('agent-instructions') + 1)
  assert.equal(ids(on).indexOf('tool-schedule'), ids(on).indexOf('tool-jobs') + 1)
  const delegation = row(on, 'delegation').config
  assert.deepEqual(row(delegation, 'tool-subagent').config.toolFilter, deny)
  assert.deepEqual(row(delegation, 'tool-subagent-fork').config.toolFilter, deny)
  // half-probe (a host that ships time-context without tool-schedule): the
  // toolFilter follows toolSchedule alone — denying absent tools is noise
  const half = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: undefined, hostExtras: { timeContext: true } })
  assert.ok(ids(half).includes('time-context') && !ids(half).includes('tool-schedule'))
  assert.equal(row(row(half, 'delegation').config, 'tool-subagent').config.toolFilter, undefined)
})

test('v0.17.0: probeHostExtras resolves from the host base and degrades to false', async () => {
  const { probeHostExtras } = await import('../src/index.js')
  assert.deepEqual(await probeHostExtras(undefined, () => true), { timeContext: true, toolSchedule: true })
  assert.deepEqual(await probeHostExtras(undefined, (spec) => spec === '@deepseek-ai/dsh-time-context'), { timeContext: true, toolSchedule: false })
  // a resolver that throws (not merely resolves-false) must read as absent, never reject the boot
  assert.deepEqual(await probeHostExtras(undefined, (spec) => { if (spec === '@deepseek-ai/dsh-tool-schedule') throw new Error('boom'); return false }), { timeContext: false, toolSchedule: false })
  // default resolver path: no baseUrl, from this test file — official host packages absent → both false
  assert.deepEqual(await probeHostExtras({}), { timeContext: false, toolSchedule: false })
})

// ── v0.15.0: experimental Python PTC runtime switch ─────────────────────────
//
// The switch cannot ride the preset composition: preset rows mount into their
// own EntryTree and a root-service provider there is rejected
// (agent-preset-registry/src/mount.ts:267), while the run_code presentation row
// reads `ctx.ptcRuntime` from the ROOT realm. It is therefore a bundle-patch
// swap guarded by a boot-time snapshot, and these tests pin the parts that
// could silently take a profile's PTC runtime away.

const pythonProbe = await import('../src/python-probe.js')
const runtimeModule = await import('../src/runtime.js')
const { pluginsFor } = await import('../src/composition.js')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const patchText = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const runtimeSource = readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8')

test('pythonRuntimeOf reads both settings shapes and defaults to OFF', () => {
  const { pythonRuntimeOf, DEFAULT_PYTHON_RUNTIME } = _internal
  assert.equal(DEFAULT_PYTHON_RUNTIME, false)
  assert.equal(pythonRuntimeOf(undefined), false)
  assert.equal(pythonRuntimeOf(false), false)
  assert.equal(pythonRuntimeOf(true), true)
  // the registered settings namespace hands the object shape; only explicit
  // true is ON, mirroring the workflow knob's v0.13.2 lesson
  assert.equal(pythonRuntimeOf({ pythonRuntime: true }), true)
  assert.equal(pythonRuntimeOf({ pythonRuntime: false }), false)
  assert.equal(pythonRuntimeOf({ workflow: false }), false)
  assert.equal(pythonRuntimeOf('yes'), false)
})

test('pythonCandidates follow the contracted interpreter priority order', () => {
  const candidates = pythonProbe.pythonCandidates({
    explicit: '/explicit/python3',
    platform: 'linux',
    env: { DSH_PYTHON: '/env/python3', DSH_HOME: '/home/u/.dsh' },
  })
  // explicit -> DSH_PYTHON -> the dsh runtime's own interpreter -> homebrew /
  // /usr/local -> versioned PATH names -> bare python3 -> the 3.9 system build
  assert.deepEqual(candidates.slice(0, 5), [
    '/explicit/python3',
    '/env/python3',
    '/home/u/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
  ])
  assert.deepEqual(candidates.slice(5, 10), ['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10'])
  assert.equal(candidates[10], 'python3')
  assert.equal(candidates[candidates.length - 1], '/usr/bin/python3')
  assert.equal(new Set(candidates).size, candidates.length, 'candidates must be de-duplicated')
  // win32 keeps the POSIX absolute paths out of the list
  const win = pythonProbe.pythonCandidates({ platform: 'win32', env: {} })
  assert.ok(!win.some(candidate => candidate.startsWith('/')))
})

test('probeInterpreter accepts CPython >= 3.10 only', () => {
  const report = (stdout, status = 0, stderr = '') => ({ run: () => ({ status, stdout, stderr }) })
  assert.equal(pythonProbe.probeInterpreter('/x', report('cpython 3.12.14\n')).ok, true)
  assert.equal(pythonProbe.probeInterpreter('/x', report('cpython 3.10.0\n')).ok, true)
  const old = pythonProbe.probeInterpreter('/x', report('cpython 3.9.6\n'))
  assert.equal(old.ok, false)
  assert.match(old.detail, /3\.9\.6/)
  assert.equal(pythonProbe.probeInterpreter('/x', report('pypy 3.10.0\n')).ok, false)
  assert.equal(pythonProbe.probeInterpreter('/x', report('', 127, 'not found')).ok, false)
  assert.equal(pythonProbe.probeInterpreter('/x', { run: () => ({ error: new Error('ENOENT') }) }).ok, false)
})

test('discoverPython skips unusable candidates and reports every attempt', () => {
  const tried = []
  const found = pythonProbe.discoverPython({
    platform: 'linux',
    env: {},
    home: '/h',
    probe: (bin) => {
      tried.push(bin)
      return bin === 'python3.12'
        ? { ok: true, bin, version: [3, 12, 1], detail: 'CPython 3.12.1' }
        : { ok: false, bin, detail: 'not usable' }
    },
  })
  assert.equal(found.ok, true)
  assert.equal(found.bin, 'python3.12')
  assert.deepEqual(tried.slice(0, 3), [
    '/h/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
  ])
  const none = pythonProbe.discoverPython({ platform: 'linux', env: {}, home: '/h', probe: (bin) => ({ ok: false, bin, detail: 'no' }) })
  assert.equal(none.ok, false)
  assert.equal(none.attempts.length, none.candidates.length)
})

test('runtime snapshot round-trips and absence means OFF', () => {
  const dir = tmp()
  const file = join(dir, 'ptc-cordis-runtime.json')
  assert.deepEqual(_internal.readRuntimeSnapshot(file), { pythonRuntime: false, ready: false, reason: 'snapshot absent' })
  assert.equal(_internal.writeRuntimeSnapshot(file, { pythonRuntime: true, ready: true, reason: 'preflight passed', pythonBin: '/opt/homebrew/bin/python3', version: '3.12.14' }), true)
  const read = _internal.readRuntimeSnapshot(file)
  assert.equal(read.pythonRuntime, true)
  assert.equal(read.ready, true)
  assert.equal(read.pythonBin, '/opt/homebrew/bin/python3')
  assert.equal(read.version, '3.12.14')
  rmSync(dir, { recursive: true, force: true })
})

test('syncRuntimeSnapshot never enables an unusable backend', async () => {
  const dir = tmp()
  const ctx = { get: (name) => (name === 'dshHomePath' ? (rel) => join(dir, rel) : undefined) }
  const file = join(dir, 'ptc-cordis-runtime.json')

  const off = await _internal.syncRuntimeSnapshot(ctx, { config: {}, pythonRuntimeOn: false })
  assert.equal(off.applied, false)
  assert.equal(_internal.readRuntimeSnapshot(file).ready, false)

  const refused = await _internal.syncRuntimeSnapshot(ctx, {
    config: {},
    pythonRuntimeOn: true,
    probe: async () => ({ ok: false, problems: ['no CPython >= 3.10 interpreter found (tried python3: too old)'] }),
  })
  assert.equal(refused.applied, false)
  const refusedSnapshot = _internal.readRuntimeSnapshot(file)
  assert.equal(refusedSnapshot.pythonRuntime, false, 'a refused ON must leave the Node row in charge')
  assert.equal(refusedSnapshot.ready, false)
  assert.match(refusedSnapshot.reason, /no CPython/)

  const applied = await _internal.syncRuntimeSnapshot(ctx, {
    config: {},
    pythonRuntimeOn: true,
    probe: async () => ({ ok: true, problems: [], interpreter: { bin: '/opt/homebrew/bin/python3', version: [3, 12, 14] } }),
  })
  // a freshly written snapshot is NOT in effect in this boot (the boot guard
  // ignores it): the backend switches on the next start
  assert.equal(applied.applied, false)
  assert.match(applied.reason, /next start/)
  const snapshot = _internal.readRuntimeSnapshot(file)
  assert.equal(snapshot.pythonRuntime, true)
  assert.equal(snapshot.ready, true)
  assert.equal(snapshot.pythonBin, '/opt/homebrew/bin/python3', 'the proven interpreter is frozen into the snapshot')
  assert.equal(snapshot.version, '3.12.14')
  // second pass over the same snapshot: already current -> in effect NOW
  const again = await _internal.syncRuntimeSnapshot(ctx, {
    config: {},
    pythonRuntimeOn: true,
    probe: async () => ({ ok: true, problems: [], interpreter: { bin: '/opt/homebrew/bin/python3', version: [3, 12, 14] } }),
  })
  assert.equal(again.applied, true)
  assert.match(again.reason, /already current/)

  // flipping back OFF clears the ON flags so the next boot restores the Node row
  await _internal.syncRuntimeSnapshot(ctx, { config: {}, pythonRuntimeOn: false })
  const cleared = _internal.readRuntimeSnapshot(file)
  assert.equal(cleared.pythonRuntime, false)
  assert.equal(cleared.ready, false)
  rmSync(dir, { recursive: true, force: true })
})

test('probePythonRuntime collects every blocker and refuses win32', async () => {
  const windows = await _internal.probePythonRuntime({
    platform: 'win32',
    resolve: async () => ({ ok: true }),
    discover: () => ({ ok: true, attempts: [] }),
  })
  assert.equal(windows.ok, false)
  assert.match(windows.problems.join(' '), /POSIX-only/)

  const broken = await _internal.probePythonRuntime({
    platform: 'linux',
    resolve: async () => ({ ok: false, failures: ['package tree: MODULE_NOT_FOUND'] }),
    discover: () => ({ ok: false, attempts: [{ bin: 'python3', detail: 'not runnable: ENOENT' }] }),
  })
  assert.equal(broken.ok, false)
  assert.equal(broken.problems.length, 2, 'every blocker is reported, not just the first')
  assert.match(broken.problems.join(' '), /MODULE_NOT_FOUND/)
  assert.match(broken.problems.join(' '), /CPython >= 3\.10/)
})

test('composition turns the workflow rows off under the Python backend', () => {
  const on = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: undefined, pythonRuntime: true })
  // workflow rows live inside the `delegation` group, so the lookup recurses
  const byId = (rows, id) => {
    for (const row of rows) {
      if (row.id === id) return row
      if (Array.isArray(row.config)) {
        const nested = byId(row.config, id)
        if (nested) return nested
      }
    }
    return undefined
  }
  assert.equal(byId(on, 'workflow-ptc').disabled, true)
  assert.equal(byId(on, 'tool-workflow').disabled, true)
  // the plugin-manager row follows the USER's workflow setting, not Python
  assert.equal(byId(on, 'tool-plugin-manager').disabled, undefined)

  const withoutPython = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: undefined })
  assert.equal(byId(withoutPython, 'workflow-ptc').disabled, undefined)
  assert.equal(byId(withoutPython, 'tool-workflow').disabled, undefined)
  // pythonRuntime=false is the default, so an untouched caller is unchanged
  const explicitOff = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: undefined, pythonRuntime: false })
  assert.deepEqual(explicitOff, withoutPython)
})

test('bundle patch guards the runtime swap with the whole conjunction', () => {
  // one anchor for the ON conjunction, shared by every guarded row: a
  // divergence between them is the failure mode this pins
  assert.match(patchText, /- id: ptc-runtime\n  disabled: &pythonRuntimeOn !!js/)
  assert.match(patchText, /- id: workflow-ptc\n  disabled: \*pythonRuntimeOn/)
  assert.match(patchText, /- id: tool-workflow\n  disabled: \*pythonRuntimeOn/)
  assert.match(patchText, /- id: ptc-cordis-runtime\n      name: 'dsh-ptc-cordis-preset\/runtime'\n      disabled: &pythonRuntimeOff !!js/)
  for (const guard of [
    /process\.platform === 'win32'/,
    /ptc-cordis-runtime\.json/,
    /v\.pythonRuntime === true && v\.ready === true/,
    /fs\.existsSync\(v\.pythonBin\)/,
    /createRequire\(.*\)\.resolve\('@deepseek-ai\/dsh-experimental-ptc-runtime-python'\)/,
  ]) assert.match(patchText, guard)
  // the OFF side of the inserted row is the exact negation: no path enables it
  // without the conjunction holding
  const onBody = /&pythonRuntimeOn !!js "([^"]+)"/.exec(patchText)
  const offBody = /&pythonRuntimeOff !!js "([^"]+)"/.exec(patchText)
  assert.ok(onBody && offBody)
  assert.match(onBody[1], /return true \} catch \{ return false \}/)
  assert.match(offBody[1], /return false \} catch \{ return true \}/)
})

test('runtime row is a package self-specifier with a Node fail-safe', () => {
  assert.equal(runtimeModule.name, 'dsh-ptc-cordis-preset/runtime')
  assert.deepEqual(runtimeModule.inject, [])
  // no static peer import: a failed import is a non-fatal skip, which in this
  // row would remove ctx.ptcRuntime from a profile whose Node row the patch
  // already disabled
  assert.doesNotMatch(runtimeSource, /^import [^\n]*@deepseek-ai\//m)
  assert.match(runtimeSource, /fallbackToNode/)
  assert.match(runtimeSource, /NODE_RUNTIME_PACKAGE/)
  assert.match(runtimeSource, /discoverPython/)
  const AnonymousPlugin = class {}
  assert.equal(runtimeModule._internal.providerOf({ default: AnonymousPlugin }), AnonymousPlugin)
  assert.equal(runtimeModule._internal.providerOf({ default: 42 }), undefined)
})

test('the experimental backend is an exact optionalDependency', () => {
  // exact version: `@next` resolved to rc.1 on this machine's npmmirror and was
  // refused by the compatibility gate (lead's measurement)
  assert.equal(packageJson.optionalDependencies['@deepseek-ai/dsh-experimental-ptc-runtime-python'], '0.1.7-rc.2')
  assert.equal(packageJson.dependencies?.['@deepseek-ai/dsh-experimental-ptc-runtime-python'], undefined)
  assert.equal(packageJson.exports['./runtime'], './src/runtime.js')
  assert.ok(packageJson.files.includes('src'))
})

test('the new switch is exported for the smoke surface', () => {
  for (const key of ['pythonRuntimeOf', 'runtimeSnapshotPath', 'readRuntimeSnapshot', 'writeRuntimeSnapshot', 'probePythonRuntime', 'syncRuntimeSnapshot']) {
    assert.equal(typeof _internal[key], 'function', `_internal.${key} must be exported`)
  }
  assert.equal(_internal.PYTHON_RUNTIME_PACKAGE, '@deepseek-ai/dsh-experimental-ptc-runtime-python')
  assert.equal(_internal.RUNTIME_SNAPSHOT_FILE, 'ptc-cordis-runtime.json')
})

// ── v0.15.1: fixes from the independent rc.2 verification ───────────────────

test('v0.15.1: the boot guard ignores a snapshot written during THIS boot', () => {
  // `disabled` is re-evaluated on every access (vendor/loader/src/config/
  // entry.ts:74) while the host half writes the snapshot during boot, so one
  // cold start used to keep the Node row AND enable the Python row.
  assert.match(patchText, /Date\.parse\(v\.updatedAt \?\? 0\) >= Date\.now\(\) - process\.uptime\(\) \* 1000/)
  assert.equal((patchText.match(/process\.uptime\(\)/g) || []).length, 2, 'both the ON and the OFF expression carry the guard')
})

test('v0.15.1: pythonBin is a first-class row Config field', () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(host, /pythonBin: live\(Schema\.string\(\)\.default\(""\)\)/)
})

test('v0.15.1: preflight resolves the package from the profile base the guard uses', () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(host, /createRequire\(`\$\{profileDir\}\/`\)\.resolve\(PYTHON_RUNTIME_PACKAGE\)/)
})

test('v0.15.1: an unchanged snapshot is never rewritten (no mid-boot guard flip)', () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(host, /if \(current\.pythonRuntime && current\.ready && current\.pythonBin === next\.pythonBin\)/)
  assert.match(host, /snapshot already current/)
})

test('v0.15.1: capability reports the EFFECTIVE backend additively', () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(host, /pythonBackend: 'node' \}/)
  assert.match(host, /coverage\.pythonBackend = pythonEffective \? 'python' : 'node'/)
  // intent stays user-owned; the effective side rides pythonBackend
  assert.match(host, /coverage\.pythonRuntime = pythonRuntimeOn/)
  assert.match(host, /coverage\.pythonIssue = /)
})

// ── v0.15.2: an explicit pythonBin fails loud, never falls back ──────────────

test('v0.15.2: an unusable explicit pythonBin short-circuits the candidate chain', () => {
  const tried = []
  const result = pythonProbe.discoverPython({
    explicit: '/usr/bin/python3',
    platform: 'linux',
    env: {},
    home: '/h',
    probe: (bin) => { tried.push(bin); return { ok: false, bin, detail: 'CPython 3.9.6 is older than the required 3.10' } },
  })
  assert.equal(result.ok, false)
  assert.equal(result.explicit, true)
  assert.deepEqual(tried, ['/usr/bin/python3'], 'nothing else is tried once an explicit choice fails')
  assert.match(result.detail, /3\.9\.6/)
  const missing = pythonProbe.discoverPython({ explicit: '/nope/python3', platform: 'linux', env: {}, home: '/h', probe: (bin) => ({ ok: false, bin, detail: 'not runnable: ENOENT' }) })
  assert.equal(missing.ok, false)
  assert.match(missing.detail, /ENOENT/)
})

test('v0.15.2: a working explicit choice is used verbatim; empty still discovers', () => {
  const chosen = pythonProbe.discoverPython({ explicit: '/opt/homebrew/bin/python3', platform: 'linux', env: {}, home: '/h', probe: (bin) => ({ ok: true, bin, version: [3, 14, 7], detail: 'CPython 3.14.7' }) })
  assert.equal(chosen.ok, true)
  assert.equal(chosen.bin, '/opt/homebrew/bin/python3')
  const empty = pythonProbe.discoverPython({ explicit: '', platform: 'linux', env: {}, home: '/h', probe: (bin) => (bin === 'python3.12' ? { ok: true, bin, version: [3, 12, 1], detail: 'cp' } : { ok: false, bin, detail: 'no' }) })
  assert.equal(empty.ok, true)
  assert.equal(empty.bin, 'python3.12', 'an empty override keeps the discovery chain')
})

test('v0.15.2: the preflight refuses an unusable explicit interpreter and names it', async () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const probe = await _internal.probePythonRuntime({
    config: { pythonBin: '/usr/bin/python3' },
    platform: 'linux',
    resolve: async () => ({ ok: true }),
    discover: pythonProbe.discoverPython,
  })
  assert.equal(probe.ok, false)
  assert.match(probe.problems.join(' '), /usr\/bin\/python3/)
  assert.match(probe.problems.join(' '), /CPython >= 3\.10/)
})

test('v0.15.2: a Volatile-wrapped pythonBin is unwrapped (v0.15.1 regression)', () => {
  const host = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(host, /const interpreter = \(discover \?\? discoverPython\)\(\{ explicit: valueOf\(config\?\.pythonBin\) \}\)/)
  const runtime = readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8')
  assert.match(runtime, /discoverPython\(\{ explicit: frozen \?\? configured \}\)/)
  // and the unwrapping helper really unwraps
  const wrapper = { get: () => '/opt/homebrew/bin/python3' }
  assert.equal(_internal.valueOf(wrapper), '/opt/homebrew/bin/python3')
  assert.equal(_internal.valueOf('/usr/bin/python3'), '/usr/bin/python3')
})

test('v0.15.3: runtimeConfig is declared before every use (v0.15.2 boot regression)', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const decl = src.indexOf('const runtimeConfig =')
  assert.ok(decl > 0, 'the legacy branch still declares it')
  for (const match of src.matchAll(/config: runtimeConfig/g)) {
    assert.ok(match.index > decl, 'runtimeConfig referenced before its declaration -> ReferenceError at boot')
  }
  // the declarative path hands the row Config straight to the preflight, which
  // unwraps the Volatile field itself
  assert.match(src, /await syncRuntimeSnapshot\(ctx, \{ config, pythonRuntimeOn \}\)/)
})

test('v0.15.3: the preflight unwraps a Volatile pythonBin', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(src, /explicit: valueOf\(config\?\.pythonBin\)/)
})

test('v0.16.0: a workflow/python flip retires the live preset BEFORE remounting (duplicate-id guard)', () => {
  // The registry throws on a duplicate id (agent-preset-registry), so mounting
  // the new composition while the old one is still live fails every flip with
  // "Duplicate agent preset: ptc-cordis" and silently keeps the old rows
  // (真机 0.1.7-rc.2, 2026-09-28). The flip must `await previous()` — then
  // remount, with a rollback re-registering the previous composition on error.
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const retire = src.indexOf('await previous()')
  const remount = src.indexOf('unregister = await registerPreset(ctx, { workflowOn: nextWorkflow')
  assert.ok(retire > 0, 'the flip handler still retires the live registration')
  assert.ok(remount > retire, 'flip must retire before remounting, or every flip dies with a duplicate id')
  // rollback: a failed remount must restore the previous composition
  assert.match(src, /unregister = await registerPreset\(ctx, \{ workflowOn: prev\.workflowOn/)
})

test('v0.15.3: apply() actually reaches the declarative registration (boot path)', async () => {
  // The v0.15.2 regression (ReferenceError inside apply) passed 83 green smoke
  // tests because NONE of them executed apply(): they are helper-level. This one
  // runs the real boot path against a mock context, so a missing binding, a
  // throwing registration, or a snapshot that is never written turns it red.
  const dir = tmp()
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  try {
    const mod = await import('../src/index.js')
    const provided = []
    let registered
    const ctx = {
      logger: () => ({ debug() {}, info() {}, warn() {} }),
      get: (name) => (name === 'dshHomePath' ? (rel) => join(dir, rel) : undefined),
      inject: (names, fn) => { try { fn(ctx) } catch { /* optional services */ } },
      effect: () => () => {},
      on: () => {},
      provide: (name, value) => { provided.push([name, value]); return () => {} },
      agentPresets: { register: async (definition) => { registered = definition; return async () => {} }, list: async () => [], roots: [] },
    }
    const config = { pythonRuntime: { get: () => true }, workflow: { get: () => true }, pythonBin: { get: () => '' } }
    await mod.apply(ctx, config)
    assert.ok(registered, 'apply() must register the preset — a ReferenceError here means the plugin never mounts')
    assert.ok(registered.plugins.length > 20, 'the registered composition is the real row set')
    const capability = provided.find(([name]) => name === 'ptcCordisPreset')
    assert.ok(capability, 'the peer capability is published')
    assert.equal(typeof capability[1].pythonBackend, 'string')
    assert.equal(capability[1].pythonRuntime, true, 'intent is preserved')
    assert.ok(existsSync(join(dir, 'ptc-cordis-runtime.json')), 'an ON config writes the boot snapshot (ok or refused)')
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(dir, { recursive: true, force: true })
  }
})
