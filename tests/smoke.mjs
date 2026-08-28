// Smoke tests for dsh-ptc-cordis-preset — pure helper level, no Cordis
// runtime needed. Run: npm test (node --test tests/smoke.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal, name as pluginName, inject as pluginInject } from '../src/index.js'

const { PRESET_ID, MARKER_FILE, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree, skillsHashes, syncDecision, installRegisterShim, baseForRoster, pickComposition, detectBase } = _internal

const compositionAsset = readFileSync(new URL('../assets/agent.cordis.yml', import.meta.url), 'utf8')
const presetAsset = readFileSync(new URL('../assets/preset.yml', import.meta.url), 'utf8')

function tmp() {
  return mkdtempSync(join(tmpdir(), 'ptc-cordis-test-'))
}

function fakeSkillsSource() {
  const dir = tmp()
  mkdirSync(join(dir, 'editing-cordis-compositions'), { recursive: true })
  writeFileSync(join(dir, 'editing-cordis-compositions', 'SKILL.md'), '# editing skill\n')
  mkdirSync(join(dir, 'cordis-plugin-development'), { recursive: true })
  writeFileSync(join(dir, 'cordis-plugin-development', 'SKILL.md'), '# plugin dev skill\n')
  return dir
}

test('plugin shape: namespace exports and agentPresets injection', () => {
  assert.equal(pluginName, 'dsh-ptc-cordis-preset')
  assert.ok(pluginInject.includes('agentPresets'))
})

test('composition asset carries both halves of the merge', () => {
  // PTC side
  assert.match(compositionAsset, /id: tool-presentation/)
  assert.match(compositionAsset, /mode: code/)
  assert.match(compositionAsset, /@deepseek-ai\/dsh-agent-tool-presentation/)
  // Creation side — bare toolset row consuming the host-plane runner (a realm
  // around it severs the browser bridge: remote.dynamicCordisRunner resolves
  // only the host-plane instance; see composition comments)
  assert.match(compositionAsset, /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'\n?$/m)
  assert.doesNotMatch(compositionAsset, /^group: true\s*$/m)
  assert.doesNotMatch(compositionAsset, /^\s*- id: cordis-host-runner/m)
  assert.doesNotMatch(compositionAsset, /^\s*- id: cordis-tools/m)
  assert.match(compositionAsset, /customSkillDirs:/)
  assert.match(compositionAsset, /editing-cordis-compositions/)
  // base rows survived
  for (const row of ['tool-bash', 'tool-fs', 'tool-jobs', 'tool-goal', 'tool-skill', 'tool-web', 'tool-workflow', 'compaction-basic', 'plan-mode']) {
    assert.match(compositionAsset, new RegExp(`id: ${row}($|\\n)`), `row ${row} missing`)
  }
  // the !!js expressions survived as literal text
  assert.match(compositionAsset, /!!js process\.platform === 'win32'/)
  assert.match(compositionAsset, /!!js "process\.getBuiltinModule\('node:url'\)\.fileURLToPath\(new URL\('skills\/', baseUrl\)\)"/)
})

test('preset metadata asset has display name and description', () => {
  assert.match(presetAsset, /name: PTC 创造模式/)
  assert.match(presetAsset, /description: \S/)
  assert.doesNotMatch(presetAsset, /order:/) // user presets never carry roster order
})

test('materialize writes composition, metadata, skills, and a hash marker', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    const result = materialize({ target, skillsSource: skills, version: '0.1.0' })
    assert.equal(result, 'copied')
    assert.ok(existsSync(join(target, 'agent.cordis.yml')))
    assert.ok(existsSync(join(target, 'preset.yml')))
    assert.equal(readFileSync(join(target, 'agent.cordis.yml'), 'utf8'), compositionAsset)
    assert.ok(existsSync(join(target, 'skills', 'editing-cordis-compositions', 'SKILL.md')))
    assert.ok(existsSync(join(target, 'skills', 'cordis-plugin-development', 'SKILL.md')))
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.managedBy, 'dsh-ptc-cordis-preset')
    assert.equal(marker.version, '0.1.0')
    assert.ok(marker.files['agent.cordis.yml'])
    assert.ok(marker.files['skills/editing-cordis-compositions/SKILL.md'])
    assert.equal(classify(target), 'unmodified')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('re-materialize over an unmodified tree refreshes it in place', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.1.0' })
    materialize({ target, skillsSource: skills, version: '0.2.0' })
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.version, '0.2.0')
    assert.equal(classify(target), 'unmodified')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('missing skills source still materializes, with an empty skills dir', () => {
  const root = tmp()
  const target = join(root, PRESET_ID)
  try {
    const result = materialize({ target, skillsSource: join(root, 'does-not-exist'), version: '0.1.0' })
    assert.equal(result, 'missing-source')
    assert.ok(existsSync(join(target, 'skills')))
    assert.equal(classify(target), 'unmodified')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a user-modified tree is detected and never overwritten or removed', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.1.0' })
    writeFileSync(join(target, 'agent.cordis.yml'), '# my edits\n')
    assert.equal(classify(target), 'user-modified')
    // uninstall path still refuses to delete the user's work
    assert.equal(cleanupOnDispose({ target, packageJsonExists: false }), 'kept-user-modified')
    assert.ok(existsSync(join(target, 'agent.cordis.yml')))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('a foreign ptc-cordis directory (no marker) is classified, not owned', () => {
  const root = tmp()
  const target = join(root, PRESET_ID)
  try {
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'agent.cordis.yml'), "- id: mine\n  name: '@deepseek-ai/dsh-persona'\n")
    assert.equal(classify(target), 'foreign')
    assert.equal(cleanupOnDispose({ target, packageJsonExists: false }), 'kept-foreign')
    assert.ok(existsSync(target))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('uninstall removes an unmodified tree; reload keeps it', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.1.0' })
    // reload / update / restart: package intact
    assert.equal(cleanupOnDispose({ target, packageJsonExists: true }), 'kept-package-intact')
    assert.ok(existsSync(target))
    // uninstall: package gone
    assert.equal(cleanupOnDispose({ target, packageJsonExists: false }), 'removed')
    assert.ok(!existsSync(target))
    assert.equal(classify(target), 'absent')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('firstUserRoot picks the first user-trust root in order', () => {
  const roots = [
    { path: '/opt/shipped', trust: 'system' },
    { path: '/custom/user', trust: 'user' },
    { path: '/home/user', trust: 'user' },
  ]
  assert.equal(firstUserRoot(roots)?.path, '/custom/user')
  assert.equal(firstUserRoot([{ path: '/only/system', trust: 'system' }]), undefined)
  assert.equal(firstUserRoot([]), undefined)
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

test('skillsHashes: null for an absent source, skills/-prefixed map otherwise', () => {
  const skills = fakeSkillsSource()
  try {
    assert.equal(skillsHashes(join(skills, 'nope')), null)
    const map = skillsHashes(skills)
    assert.equal(Object.keys(map).length, 2)
    assert.ok(map['skills/editing-cordis-compositions/SKILL.md'])
    assert.ok(map['skills/cordis-plugin-development/SKILL.md'])
  } finally {
    rmSync(skills, { recursive: true, force: true })
  }
})

test('syncDecision idles only when version and skills source both match', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.2.0' })
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    // same version, live skills unchanged → quiet idle
    assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.2.0', sourceHashes: skillsHashes(skills) }), 'idle')
    // plugin upgrade → refresh
    assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.3.0', sourceHashes: skillsHashes(skills) }), 'refresh')
    // DSH upgrade drifted the live skills source → refresh (skills keep tracking the deployment)
    writeFileSync(join(skills, 'editing-cordis-compositions', 'SKILL.md'), '# edited upstream\n')
    assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.2.0', sourceHashes: skillsHashes(skills) }), 'refresh')
    // shipped skills source disappeared after skills were recorded → refresh (surfaces the missing-source warning)
    assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.2.0', sourceHashes: null }), 'refresh')
    // non-unmodified states always refresh
    assert.equal(syncDecision({ state: 'user-modified', marker, version: '0.2.0', sourceHashes: null }), 'refresh')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('a missing skills source at first materialize stays idle on later startups', () => {
  const root = tmp()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: join(root, 'does-not-exist'), version: '0.2.0' })
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    // already in the degraded empty-skills state → no rewrite (and no warning spam) on every startup
    assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.2.0', sourceHashes: null }), 'idle')
    // the source coming back later still triggers a refresh
    const skills = fakeSkillsSource()
    try {
      assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.2.0', sourceHashes: skillsHashes(skills) }), 'refresh')
    } finally {
      rmSync(skills, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── inspect-registry compatibility shim ─────────────────────────────────────

/** Registry mock reproducing the runner's throw-on-duplicate register()
 * (validateManifest first, then identity-guarded stored entry + disposer). */
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

test('git bash variant asset exists with flipped shell rows, assets stay reviewable', () => {
  const gitbashAsset = readFileSync(new URL('../assets/agent.cordis.gitbash.yml', import.meta.url), 'utf8')
  assert.match(gitbashAsset, /- id: tool-bash\n  name: '@deepseek-ai\/dsh-tool-bash'/)
  assert.match(gitbashAsset, /disabled: false/)
  assert.match(gitbashAsset, /- id: tool-pwsh\n  name: '@deepseek-ai\/dsh-tool-pwsh'\n  disabled: true/)
  assert.doesNotMatch(gitbashAsset, /disabled: !!js process\.platform === 'win32'/)
  // both variants stay complete compositions (no runtime synthesis)
  assert.match(gitbashAsset, /id: tool-presentation/)
  assert.match(gitbashAsset, /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'\n?$/m)
})

test('materialize writes the git bash variant when the capability is active', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    const result = materialize({ target, skillsSource: skills, version: '0.5.0', gitBashActive: true })
    assert.equal(result, 'copied')
    const written = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.ok(written.includes('disabled: false'))
    assert.ok(!written.includes("disabled: !!js process.platform === 'win32'"))
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.gitBash, true)
    assert.equal(classify(target), 'unmodified')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('syncDecision refreshes when the git bash capability flips', () => {
  const marker = { version: '0.5.0', base: 'code', gitBash: false, files: {} }
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.5.0', sourceHashes: null, gitBashActive: true }), 'refresh')
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.5.0', sourceHashes: null, gitBashActive: false }), 'idle')
})

// ── git bash metadata variant ───────────────────────────────────────────────

test('git bash metadata variant exists with a suffixed name', () => {
  const meta = readFileSync(new URL('../assets/preset.gitbash.yml', import.meta.url), 'utf8')
  assert.match(meta, /name: PTC 创造模式 · Git Bash/)
  assert.match(meta, /Shell 使用 Git Bash/)
  assert.doesNotMatch(meta, /order:/)
})

test('materialize writes the git bash metadata when the capability is active', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.6.0', gitBashActive: true })
    const meta = readFileSync(join(target, 'preset.yml'), 'utf8')
    assert.match(meta, /name: PTC 创造模式 · Git Bash/)
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.gitBash, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})


// ── built-in era split (dsh 0.1.2 renamed `code` → `ptc`, no alias) ────────

test('baseForRoster maps the built-in roster to the composition era', () => {
  assert.equal(baseForRoster(['standard', 'minimal', 'code', 'cordis']), 'code')
  assert.equal(baseForRoster(['standard', 'minimal', 'ptc', 'cordis']), 'ptc')
  assert.equal(baseForRoster(['code', 'ptc']), 'ptc') // newer wins if both exist
  assert.equal(baseForRoster(['standard']), 'code') // unknown roster → conservative
  assert.equal(baseForRoster([]), 'code')
})

test('era assets: four committed compositions split cleanly by era and capability', () => {
  const read = (f) => readFileSync(new URL(`../assets/${f}`, import.meta.url), 'utf8')
  const files = {
    base: read('agent.cordis.yml'),
    gitbash: read('agent.cordis.gitbash.yml'),
    ptcEra: read('agent.cordis.ptc.yml'),
    ptcEraGitbash: read('agent.cordis.ptc.gitbash.yml'),
  }
  // era markers: the mode value and the era-only built-in rows
  assert.match(files.base, /mode: code/)
  assert.doesNotMatch(files.base, /mode: ptc/)
  assert.match(files.base, /fetch: false/)
  assert.doesNotMatch(files.base, /command-goal/)
  assert.match(files.ptcEra, /mode: ptc/)
  assert.doesNotMatch(files.ptcEra, /mode: code/)
  assert.match(files.ptcEra, /fetch: true/)
  assert.match(files.ptcEra, /- id: command-goal\n  name: '@deepseek-ai\/dsh-command-goal'/)
  assert.match(files.ptcEraGitbash, /mode: ptc/)
  assert.doesNotMatch(files.ptcEraGitbash, /mode: code/)
  assert.match(files.ptcEraGitbash, /command-goal/)
  // every era carries both halves of the merge
  for (const [k, text] of Object.entries(files)) {
    assert.match(text, /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'/m, `${k} lost tool-cordis`)
    assert.match(text, /customSkillDirs:/, `${k} lost customSkillDirs`)
    assert.match(text, /id: tool-presentation/, `${k} lost tool-presentation`)
  }
  // capability split: gitbash variants flip the shell rows, non-gitbash keep the gates
  assert.match(files.gitbash, /disabled: false/)
  assert.doesNotMatch(files.gitbash, /disabled: !!js process\.platform === 'win32'/)
  assert.match(files.ptcEraGitbash, /disabled: false/)
  assert.match(files.base, /disabled: !!js process\.platform === 'win32'/)
  assert.match(files.ptcEra, /disabled: !!js process\.platform === 'win32'/)
})

test('pickComposition drops suffixes from most specific to the plain base file', () => {
  const all = ['agent.cordis.yml', 'agent.cordis.gitbash.yml', 'agent.cordis.ptc.yml', 'agent.cordis.ptc.gitbash.yml']
  assert.equal(pickComposition('ptc', true, all), 'agent.cordis.ptc.gitbash.yml')
  assert.equal(pickComposition('ptc', false, all), 'agent.cordis.ptc.yml')
  assert.equal(pickComposition('code', true, all), 'agent.cordis.gitbash.yml')
  assert.equal(pickComposition('code', false, all), 'agent.cordis.yml')
  // an era without a twin falls back to the capability variant, then the base
  assert.equal(pickComposition('ptc', true, ['agent.cordis.gitbash.yml', 'agent.cordis.yml']), 'agent.cordis.gitbash.yml')
  assert.equal(pickComposition('ptc', false, ['agent.cordis.yml']), 'agent.cordis.yml')
  assert.equal(pickComposition('ptc', false, []), 'agent.cordis.yml')
})

test('materialize writes the ptc-era composition when the roster says ptc', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    materialize({ target, skillsSource: skills, version: '0.7.0', base: 'ptc' })
    const written = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.match(written, /mode: ptc/)
    assert.doesNotMatch(written, /mode: code/)
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.base, 'ptc')
    assert.equal(classify(target), 'unmodified')
    // and the gitbash combination of the same era
    materialize({ target, skillsSource: skills, version: '0.7.0', base: 'ptc', gitBashActive: true })
    const written2 = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.match(written2, /mode: ptc/)
    assert.match(written2, /disabled: false/)
    const marker2 = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker2.base, 'ptc')
    assert.equal(marker2.gitBash, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(skills, { recursive: true, force: true })
  }
})

test('detectBase reads the roster; a failing roster falls back to the code era', async () => {
  assert.equal(await detectBase({ list: async () => [{ id: 'standard' }, { id: 'ptc' }, { id: 'cordis' }] }), 'ptc')
  assert.equal(await detectBase({ list: async () => [{ id: 'standard' }, { id: 'code' }] }), 'code')
  assert.equal(await detectBase({ list: async () => { throw new Error('boom') } }), 'code')
})

test('syncDecision refreshes when the detected built-in era flips', () => {
  const marker = { version: '0.7.0', base: 'code', gitBash: false, files: {} }
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.7.0', sourceHashes: null, base: 'ptc' }), 'refresh')
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.7.0', sourceHashes: null, base: 'code' }), 'idle')
  // a pre-0.7.0 marker has no base at all → refresh (one-time re-materialization)
  assert.equal(syncDecision({ state: 'unmodified', marker: { version: '0.7.0', files: {} }, version: '0.7.0', sourceHashes: null, base: 'code' }), 'refresh')
})

