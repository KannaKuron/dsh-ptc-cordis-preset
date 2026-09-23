// Smoke tests for dsh-ptc-cordis-preset — pure helper level, no Cordis
// runtime needed. Run: npm test (node --test tests/smoke.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal, name as pluginName, inject as pluginInject } from '../src/index.js'

const { PRESET_ID, MARKER_FILE, DEFAULT_WORKFLOW, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree, skillsHashes, syncDecision, installRegisterShim, baseForRoster, pickComposition, detectBase, workflowOf, valueOf, personaEraForText, detectPersonaEra } = _internal

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
    ptcEraWf: read('agent.cordis.ptc.workflow.yml'),
    ptcEraGitbashWf: read('agent.cordis.ptc.gitbash.workflow.yml'),
    ptcEraPs: read('agent.cordis.ptc.ps.yml'),
    ptcEraGitbashPs: read('agent.cordis.ptc.gitbash.ps.yml'),
    ptcEraWfPs: read('agent.cordis.ptc.workflow.ps.yml'),
    ptcEraGitbashWfPs: read('agent.cordis.ptc.gitbash.workflow.ps.yml'),
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
  // dsh 0.1.2-alpha.4 disabled `workflow` in the built-in `ptc` preset (run_code
  // stays the only model-authored orchestration surface; the engine row keeps
  // `ralph` alive): ptc-era texts carry the disabled row, code-era (<= 0.1.1)
  // texts keep the 0.1.1 shape with the row enabled.
  const workflowRow = /- id: tool-workflow\n\s+name: '@deepseek-ai\/dsh-tool-workflow'\n(?:\s+#[^\n]*\n)*\s+disabled: true/
  assert.match(files.ptcEra, workflowRow, 'ptcEra lost the alpha.4 workflow disable')
  assert.match(files.ptcEraGitbash, workflowRow, 'ptcEraGitbash lost the alpha.4 workflow disable')
  assert.doesNotMatch(files.base, workflowRow, 'code era must keep workflow enabled (0.1.1 text)')
  assert.doesNotMatch(files.gitbash, workflowRow, 'code era must keep workflow enabled (0.1.1 text)')
  // v0.8.0 workflow-ON twins: the ptc era with the row ENABLED (Creation-side
  // capability); every era carries both halves of the merge too
  for (const [k, text] of Object.entries({ ptcEraWf: files.ptcEraWf, ptcEraGitbashWf: files.ptcEraGitbashWf })) {
    assert.doesNotMatch(text, workflowRow, k + ' must keep workflow enabled')
    assert.match(text, /- id: tool-workflow\n\s+name: '@deepseek-ai\/dsh-tool-workflow'/, k + ' lost the workflow row')
    assert.match(text, /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'/m, k + ' lost tool-cordis')
    assert.match(text, /customSkillDirs:/, k + ' lost customSkillDirs')
    assert.match(text, /id: tool-presentation/, k + ' lost tool-presentation')
    assert.match(text, /mode: ptc/, k + ' lost the ptc-era mode')
  }
  // v0.9.0 persona-split twins: the split keys in the .ps files (0.1.3-alpha.2
  // split dsh-persona's single text key with no alias), the retired text key
  // everywhere else
  const personaRow = (text) => {
    const m = text.match(/- id: persona[\s\S]*?(?=\n- id: )/)
    assert.ok(m, 'persona row present')
    return m[0]
  }
  for (const [k, text] of Object.entries({ ptcEraPs: files.ptcEraPs, ptcEraGitbashPs: files.ptcEraGitbashPs, ptcEraWfPs: files.ptcEraWfPs, ptcEraGitbashWfPs: files.ptcEraGitbashWfPs })) {
    const row = personaRow(text)
    assert.match(row, /prefix:/, k + ' ps twin carries the split prefix key')
    assert.match(row, /suffix: Your working directory is /, k + ' ps twin carries the cwd suffix')
    assert.doesNotMatch(row, /\btext:/, k + ' ps twin drops the retired text key')
  }
  for (const [k, text] of Object.entries({ base: files.base, gitbash: files.gitbash, ptcEra: files.ptcEra, ptcEraGitbash: files.ptcEraGitbash, ptcEraWf: files.ptcEraWf, ptcEraGitbashWf: files.ptcEraGitbashWf })) {
    assert.doesNotMatch(personaRow(text), /prefix:/, k + ' pre-split text keeps the text key')
  }
  // every era carries both halves of the merge
  for (const [k, text] of Object.entries(files)) {
    assert.match(text, /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'/m, `${k} lost tool-cordis`)
    assert.match(text, /customSkillDirs:/, `${k} lost customSkillDirs`)
    assert.match(text, /id: tool-presentation/, `${k} lost tool-presentation`)
  }
  // the workflow × gitbash twin keeps the full Git Bash shell swap (the
  // dsh-gitbash-shell cooperation rows are identical across workflow sides)
  assert.match(files.ptcEraGitbashWf, /- id: tool-bash\n\s+name: '@deepseek-ai\/dsh-tool-bash'\n(?:\s+#[^\n]*\n)*\s+disabled: false/)
  assert.match(files.ptcEraGitbashWf, /- id: tool-pwsh\n\s+name: '@deepseek-ai\/dsh-tool-pwsh'\n\s+disabled: true/)
  assert.doesNotMatch(files.ptcEraGitbashWf, /disabled: !!js process\.platform === 'win32'/)
  // capability split: gitbash variants flip the shell rows, non-gitbash keep the gates
  assert.match(files.gitbash, /disabled: false/)
  assert.doesNotMatch(files.gitbash, /disabled: !!js process\.platform === 'win32'/)
  assert.match(files.ptcEraGitbash, /disabled: false/)
  assert.match(files.base, /disabled: !!js process\.platform === 'win32'/)
  assert.match(files.ptcEra, /disabled: !!js process\.platform === 'win32'/)
})

test('pickComposition drops suffixes from most specific to the plain base file', () => {
  const all = [
    'agent.cordis.yml', 'agent.cordis.gitbash.yml',
    'agent.cordis.ptc.yml', 'agent.cordis.ptc.gitbash.yml',
    'agent.cordis.ptc.workflow.yml', 'agent.cordis.ptc.gitbash.workflow.yml',
  ]
  // workflow OFF (or code-era requests, where the base text is already ON)
  assert.equal(pickComposition('ptc', true, false, 'text', all), 'agent.cordis.ptc.gitbash.yml')
  assert.equal(pickComposition('ptc', false, false, 'text', all), 'agent.cordis.ptc.yml')
  assert.equal(pickComposition('code', true, false, 'text', all), 'agent.cordis.gitbash.yml')
  assert.equal(pickComposition('code', false, false, 'text', all), 'agent.cordis.yml')
  // workflow ON (default): the .workflow twins win on the ptc era
  assert.equal(pickComposition('ptc', true, true, 'text', all), 'agent.cordis.ptc.gitbash.workflow.yml')
  assert.equal(pickComposition('ptc', false, true, 'text', all), 'agent.cordis.ptc.workflow.yml')
  // workflow ON on the code era: no .workflow twins exist there, and the
  // 0.1.1 base text already carries the row ENABLED — the standard chain is
  // the correct semantics, not a degraded fallback
  assert.equal(pickComposition('code', true, true, 'text', all), 'agent.cordis.gitbash.yml')
  assert.equal(pickComposition('code', false, true, 'text', all), 'agent.cordis.yml')
  // an era without a twin falls back to the capability variant, then the base
  assert.equal(pickComposition('ptc', true, false, 'text', ['agent.cordis.gitbash.yml', 'agent.cordis.yml']), 'agent.cordis.gitbash.yml')
  assert.equal(pickComposition('ptc', false, false, 'text', ['agent.cordis.yml']), 'agent.cordis.yml')
  assert.equal(pickComposition('ptc', false, false, 'text', []), 'agent.cordis.yml')
  // a deployment missing the workflow twins degrades to the OFF-side files
  assert.equal(pickComposition('ptc', true, true, 'text', ['agent.cordis.ptc.gitbash.yml']), 'agent.cordis.ptc.gitbash.yml')
  // persona-split (v0.9.0): the .ps twins win on the ptc era…
  const allPs = [...all, 'agent.cordis.ptc.ps.yml', 'agent.cordis.ptc.gitbash.ps.yml', 'agent.cordis.ptc.workflow.ps.yml', 'agent.cordis.ptc.gitbash.workflow.ps.yml']
  assert.equal(pickComposition('ptc', false, true, 'split', allPs), 'agent.cordis.ptc.workflow.ps.yml')
  assert.equal(pickComposition('ptc', true, true, 'split', allPs), 'agent.cordis.ptc.gitbash.workflow.ps.yml')
  assert.equal(pickComposition('ptc', false, false, 'split', allPs), 'agent.cordis.ptc.ps.yml')
  assert.equal(pickComposition('ptc', true, false, 'split', allPs), 'agent.cordis.ptc.gitbash.ps.yml')
  // …a deployment without the .ps twins degrades to the pre-split files…
  assert.equal(pickComposition('ptc', false, true, 'split', all), 'agent.cordis.ptc.workflow.yml')
  // …and the code era never splits (its hosts predate the persona split)
  assert.equal(pickComposition('code', false, true, 'split', all), 'agent.cordis.yml')
})

test('materialize writes the ptc-era composition when the roster says ptc', () => {
  const root = tmp()
  const skills = fakeSkillsSource()
  const target = join(root, PRESET_ID)
  try {
    // default workflowOn: true → the workflow-ON twin
    materialize({ target, skillsSource: skills, version: '0.8.0', base: 'ptc' })
    const written = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.match(written, /mode: ptc/)
    assert.doesNotMatch(written, /mode: code/)
    const onAsset = readFileSync(new URL('../assets/agent.cordis.ptc.workflow.yml', import.meta.url), 'utf8')
    assert.equal(written, onAsset)
    const marker = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker.base, 'ptc')
    assert.equal(marker.workflow, true)
    assert.equal(classify(target), 'unmodified')
    // and the gitbash × workflow-ON combination of the same era
    materialize({ target, skillsSource: skills, version: '0.8.0', base: 'ptc', gitBashActive: true })
    const written2 = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.match(written2, /mode: ptc/)
    assert.match(written2, /disabled: false/)
    assert.equal(written2, readFileSync(new URL('../assets/agent.cordis.ptc.gitbash.workflow.yml', import.meta.url), 'utf8'))
    const marker2 = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker2.base, 'ptc')
    assert.equal(marker2.gitBash, true)
    assert.equal(marker2.workflow, true)
    // explicit workflowOn: false → the OFF twins (the official ptc shape)
    materialize({ target, skillsSource: skills, version: '0.8.0', base: 'ptc', gitBashActive: true, workflowOn: false })
    const written3 = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.equal(written3, readFileSync(new URL('../assets/agent.cordis.ptc.gitbash.yml', import.meta.url), 'utf8'))
    const marker3 = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker3.workflow, false)
    // the persona-split twin (v0.9.0) writes the split-form composition byte-for-byte
    materialize({ target, skillsSource: skills, version: '0.9.0', base: 'ptc', gitBashActive: true, persona: 'split' })
    const written4 = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
    assert.equal(written4, readFileSync(new URL('../assets/agent.cordis.ptc.gitbash.workflow.ps.yml', import.meta.url), 'utf8'))
    const marker4 = JSON.parse(readFileSync(join(target, MARKER_FILE), 'utf8'))
    assert.equal(marker4.persona, 'split')
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

test('syncDecision refreshes when the persona form flips (0.1.3-alpha.2 split)', () => {
  const same = { state: 'unmodified', version: '0.9.0', sourceHashes: null, base: 'ptc', gitBash: false, workflowOn: true }
  const base = { version: '0.9.0', base: 'ptc', gitBash: false, workflow: true, files: {} }
  assert.equal(syncDecision({ ...same, marker: { ...base, persona: 'split' }, persona: 'split' }), 'idle')
  assert.equal(syncDecision({ ...same, marker: { ...base, persona: 'text' }, persona: 'split' }), 'refresh')
  assert.equal(syncDecision({ ...same, marker: { ...base, persona: 'split' }, persona: 'text' }), 'refresh')
  // a pre-0.9.0 marker has no persona field → treated as 'text': idle on a
  // pre-split host, one-time refresh after the host crosses the split
  assert.equal(syncDecision({ ...same, marker: base, persona: 'text' }), 'idle')
  assert.equal(syncDecision({ ...same, marker: base, persona: 'split' }), 'refresh')
})

test('persona era detection reads the shipped persona form, built-ins only', async () => {
  const newText = "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    suffix: Your working directory is {{cwd}}.\n    prefix: >-\n      You are a coding agent.\n"
  const oldText = "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: >-\n      You are a coding agent.\n"
  assert.equal(personaEraForText(newText), 'split')
  assert.equal(personaEraForText(oldText), 'text')
  assert.equal(personaEraForText('no persona row at all'), 'text')
  const split = tmp()
  const preSplit = tmp()
  try {
    writeFileSync(join(split, 'agent.cordis.yml'), newText)
    writeFileSync(join(preSplit, 'agent.cordis.yml'), oldText)
    // the materialized ptc-cordis itself sits on the roster — only built-in
    // ids are probed, never our own preset (it would echo its own form)
    const roster = { list: async () => [
      { id: PRESET_ID, path: join(preSplit, 'agent.cordis.yml') },
      { id: 'standard', path: join(split, 'agent.cordis.yml') },
    ] }
    assert.equal(await detectPersonaEra(roster), 'split')
    // a directory-shaped path resolves to its agent.cordis.yml
    assert.equal(await detectPersonaEra({ list: async () => [{ id: 'ptc', path: split }] }), 'split')
    // failures degrade conservatively to the pre-split form
    assert.equal(await detectPersonaEra({ list: async () => { throw new Error('boom') } }), 'text')
    assert.equal(await detectPersonaEra({ list: async () => [] }), 'text')
  } finally {
    rmSync(split, { recursive: true, force: true })
    rmSync(preSplit, { recursive: true, force: true })
  }
})

test('syncDecision refreshes when the workflow setting flips; workflowOf resolves one boolean', () => {
  const marker = { version: '0.8.0', base: 'ptc', gitBash: false, workflow: true, files: {} }
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.8.0', sourceHashes: null, base: 'ptc', workflowOn: true }), 'idle')
  assert.equal(syncDecision({ state: 'unmodified', marker, version: '0.8.0', sourceHashes: null, base: 'ptc', workflowOn: false }), 'refresh')
  // a marker without the field (pre-0.8.0 trees) is treated as ON — in
  // practice the version check already forces a refresh across an upgrade
  assert.equal(syncDecision({ state: 'unmodified', marker: { version: '0.8.0', base: 'ptc', gitBash: false, files: {} }, version: '0.8.0', sourceHashes: null, base: 'ptc', workflowOn: true }), 'idle')
  assert.equal(syncDecision({ state: 'unmodified', marker: { version: '0.8.0', base: 'ptc', gitBash: false, files: {} }, version: '0.8.0', sourceHashes: null, base: 'ptc', workflowOn: false }), 'refresh')
  // workflowOf: only an explicit false is OFF — in BOTH shapes it is handed.
  assert.equal(DEFAULT_WORKFLOW, true)
  assert.equal(workflowOf({}), true)
  assert.equal(workflowOf(undefined), true)
  assert.equal(workflowOf({ workflow: true }), true)
  assert.equal(workflowOf({ workflow: false }), false)
  // The dsh >= 0.1.7 row Config holds the field itself, so the declarative path
  // passes the plain boolean (valueOf(config.workflow) on a Volatile ref).
  // Reading only the object shape pinned that path to ON (v0.13.2 fix).
  assert.equal(workflowOf(true), true)
  assert.equal(workflowOf(false), false)
  assert.equal(valueOf(false), false)
  assert.equal(valueOf(true), true)
  assert.equal(workflowOf(valueOf({ get: () => false })), false)
  assert.equal(workflowOf(valueOf({ get: () => true })), true)
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
  assert.match(src, /slots\.inject\("settings\.plugin\.item", function \(\) \{\s*return slots\.register\(/)
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
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh'], '>=0.1.0')
  // OPTIONAL keeps the gate intact while removing the install hazard: the gate
  // reads peerDependencies only, but a package manager with autoInstallPeers
  // (pnpm's default) would resolve the range against the registry, and every
  // published @deepseek-ai/dsh version is a prerelease that a plain range
  // excludes (ERR_PNPM_NO_MATCHING_VERSION).
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh']?.optional, true)
})
test('injectPresentRow: anchor splice, tail append, idempotent (dsh 0.1.5-alpha.2 sync)', () => {
  const inject = _internal.injectPresentRow
  const anchorText = [
    "- id: tool-presentation",
    "  name: '@deepseek-ai/dsh-agent-tool-presentation'",
    '  config:',
    '    mode: ptc',
    '',
    '# self-modification section',
    "- id: tool-cordis",
    "  name: '@deepseek-ai/dsh-tool-cordis'",
  ].join('\n')
  const spliced = inject(anchorText)
  const at = spliced.indexOf("  name: '@deepseek-ai/dsh-tool-present'")
  assert.ok(at !== -1, 'row is injected')
  assert.ok(at > spliced.indexOf('tool-presentation') && at < spliced.indexOf('tool-cordis'), 'row lands right after the presentation block')
  assert.equal(inject(spliced), spliced, 'idempotent')
  const tailed = inject('- id: x\n')
  assert.ok(tailed.includes("\n- id: present\n"), 'anchor-less text appends at the tail')
})

test('syncDecision refreshes when the host gains the present package (capability flip)', () => {
  const marker = { managedBy: 'dsh-ptc-cordis-preset', version: '0.9.1', base: 'ptc', gitBash: false, workflow: true, persona: 'split', present: false, files: {} }
  const base = { state: 'unmodified', marker, version: '0.9.1', sourceHashes: null, gitBashActive: false, workflowOn: true, base: 'ptc', persona: 'split' }
  assert.equal(syncDecision({ ...base, present: false }), 'idle')
  assert.equal(syncDecision({ ...base, present: true }), 'refresh', 'host upgrade must re-materialize')
  delete marker.present
  assert.equal(syncDecision({ ...base, present: false }), 'idle', 'legacy markers default to no-present')
})

test('materialize injects present into ptc-era twins only, and only when the host resolves it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ptc-cordis-present-'))
  try {
    materialize({ target: join(dir, 'a'), skillsSource: null, version: '0.9.1', base: 'ptc', persona: 'split', present: true })
    const text = readFileSync(join(dir, 'a', 'agent.cordis.yml'), 'utf8')
    assert.ok(text.includes("name: '@deepseek-ai/dsh-tool-present'"), 'ptc-era composition gains the row')
    assert.ok(text.indexOf('dsh-tool-present') > text.indexOf('tool-presentation'), 'row follows presentation')
    const marker = JSON.parse(readFileSync(join(dir, 'a', MARKER_FILE), 'utf8'))
    assert.equal(marker.present, true, 'marker records the capability')
    materialize({ target: join(dir, 'b'), skillsSource: null, version: '0.9.1', base: 'ptc', persona: 'split', present: false })
    assert.ok(!readFileSync(join(dir, 'b', 'agent.cordis.yml'), 'utf8').includes('dsh-tool-present'), 'capability-less host gets no row')
    materialize({ target: join(dir, 'c'), skillsSource: null, version: '0.9.1', base: 'code', persona: 'text', present: true })
    assert.ok(!readFileSync(join(dir, 'c', 'agent.cordis.yml'), 'utf8').includes('dsh-tool-present'), 'code-era snapshots are frozen history')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('ptc-era assets stay present-row free (injection is a materialization concern)', () => {
  const dir = new URL('../assets/', import.meta.url)
  let seen = 0
  for (const file of readdirSync(dir)) {
    if (!file.includes('.ptc.')) continue
    seen += 1
    const text = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(!text.includes('dsh-tool-present'), file + ': the row must never be committed into an asset')
    assert.ok(text.includes("'@deepseek-ai/dsh-agent-tool-presentation'"), file + ': every ptc-era twin carries the injection anchor')
  }
  assert.equal(seen, 8, 'eight ptc-era files (workflow x gitbash x persona twins)')
})
test('detectPresentSupport reads the shipped composition text, never throws', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'present-probe-'))
  try {
    const file = join(dir, 'agent.cordis.yml')
    const probe = (path) => _internal.detectPresentSupport({ list: async () => [{ id: 'ptc', path }] })
    writeFileSync(file, "  name: '@deepseek-ai/dsh-tool-present'\n")
    assert.equal(await probe(dir), true, 'directory path is resolved to agent.cordis.yml')
    assert.equal(await probe(file), true, 'a direct .yml path is read as-is')
    writeFileSync(file, "  name: '@deepseek-ai/dsh-tool-cordis'\n")
    assert.equal(await probe(dir), false, 'shipped composition without the row → no injection')
    assert.equal(await _internal.detectPresentSupport({ list: async () => [{ id: 'minimal', path: dir }] }), false, 'minimal is never probed')
    assert.equal(await _internal.detectPresentSupport({ list: async () => { throw new Error('boom') } }), false, 'probe failure degrades to false')
    assert.equal(await _internal.detectPresentSupport({ list: async () => null }), false, 'non-array roster degrades to false')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('present support is the OR of the shipped-composition probe and package resolution', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  assert.match(src, /await detectPresentSupport\(ctx\.agentPresets\)\) \|\| \(await hostHasToolPresent\(\)\)/,
    'both signals must be wired; the roster text is authoritative on CLI installs')
})

test('row forms: host spelling is read, aligned to, and idempotent (0.1.6 rename)', () => {
  const { rowFormOf, rowFormsOf, alignEngineRow, alignRalphRow } = _internal
  const OLD = "    - id: workflow-worker-thread\n      name: '@deepseek-ai/dsh-workflow-worker-thread'\n      config:\n        provider: spawn\n"
  const NEW = "    - id: workflow-ptc\n      name: '@deepseek-ai/dsh-workflow-ptc'\n      disabled: true\n      config:\n        provider: spawn\n"
  const RALPH_OFF = "    - id: tool-ralph\n      name: '@deepseek-ai/dsh-tool-ralph'\n      disabled: true\n      config:\n        maxRounds: 64\n"
  const RALPH_ON = "    - id: tool-ralph\n      name: '@deepseek-ai/dsh-tool-ralph'\n      config:\n        maxRounds: 64\n"

  assert.equal(rowFormOf(OLD, 'workflow-worker-thread').disabled, false)
  assert.equal(rowFormOf(NEW, 'workflow-ptc').disabled, true)
  assert.equal(rowFormOf(OLD, 'workflow-ptc'), undefined, 'an absent row reads as undefined')
  assert.equal(rowFormOf(OLD + RALPH_OFF, 'workflow-worker-thread').disabled, false, 'a later row disabled must not leak upward')
  assert.equal(rowFormsOf(OLD + RALPH_OFF).ralph.disabled, true)
  assert.equal(rowFormsOf(RALPH_ON).engine, undefined, 'no engine row at all')

  const host = { engine: rowFormOf(NEW, 'workflow-ptc'), ralph: rowFormOf(RALPH_OFF, 'tool-ralph') }
  const on = alignRalphRow(alignEngineRow(OLD + RALPH_ON, host.engine, { engineEnabled: true }), host.ralph)
  assert.ok(on.includes('- id: workflow-ptc'), 'engine id takes the host spelling')
  assert.ok(!on.includes('workflow-worker-thread'), 'the deleted package name is gone')
  assert.equal(rowFormOf(on, 'workflow-ptc').disabled, false, 'workflow-ON keeps the engine live')
  assert.equal(rowFormOf(on, 'tool-ralph').disabled, true, 'ralph follows the host default')
  const off = alignRalphRow(alignEngineRow(OLD + RALPH_ON, host.engine), host.ralph)
  assert.equal(rowFormOf(off, 'workflow-ptc').disabled, true, 'workflow-OFF mirrors the shipped disabled engine')
  assert.equal(alignRalphRow(alignEngineRow(on, host.engine, { engineEnabled: true }), host.ralph), on, 'idempotent (ON)')
  assert.equal(alignRalphRow(alignEngineRow(off, host.engine), host.ralph), off, 'idempotent (OFF)')

  const oldHost = { engine: rowFormOf(OLD, 'workflow-worker-thread'), ralph: rowFormOf(RALPH_ON, 'tool-ralph') }
  assert.equal(alignRalphRow(alignEngineRow(OLD + RALPH_ON, oldHost.engine), oldHost.ralph), OLD + RALPH_ON, 'old host is a no-op')
  const back = alignRalphRow(alignEngineRow(NEW + RALPH_OFF, oldHost.engine), oldHost.ralph)
  assert.ok(back.includes('- id: workflow-worker-thread'), 'a new-spelling asset is rewritten back for an old host')
  assert.ok(!back.includes('- id: workflow-ptc'))
})

test('materialize aligns the engine row per workflow side and records it in the marker', () => {
  const { rowFormOf } = _internal
  const dir = mkdtempSync(join(tmpdir(), 'ptc-cordis-rows-'))
  try {
    const rows = { ptc: { engine: { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', disabled: true }, ralph: { disabled: true } } }
    _internal.materialize({ target: join(dir, 'on'), skillsSource: null, version: '0.10.0', base: 'ptc', persona: 'split', workflowOn: true, rows })
    const on = readFileSync(join(dir, 'on', 'agent.cordis.yml'), 'utf8')
    assert.ok(on.includes('- id: workflow-ptc'), 'the engine row takes the host spelling')
    assert.ok(!on.includes('workflow-worker-thread'), 'no trace of the deleted package')
    assert.equal(rowFormOf(on, 'workflow-ptc').disabled, false, 'the workflow-ON twin keeps a live engine')
    assert.equal(rowFormOf(on, 'tool-ralph').disabled, true, 'ralph follows the host default')
    assert.equal(JSON.parse(readFileSync(join(dir, 'on', '.plugin-managed.json'), 'utf8')).rows, 'workflow-ptc:off:off', 'the marker records the probed host form')

    _internal.materialize({ target: join(dir, 'off'), skillsSource: null, version: '0.10.0', base: 'ptc', persona: 'split', workflowOn: false, rows })
    assert.equal(rowFormOf(readFileSync(join(dir, 'off', 'agent.cordis.yml'), 'utf8'), 'workflow-ptc').disabled, true, 'the workflow-OFF twin mirrors the shipped ptc preset')

    _internal.materialize({ target: join(dir, 'bare'), skillsSource: null, version: '0.10.0', base: 'ptc', persona: 'split', workflowOn: true })
    assert.ok(readFileSync(join(dir, 'bare', 'agent.cordis.yml'), 'utf8').includes('- id: workflow-worker-thread'), 'no probe leaves the frozen text alone')
    assert.equal(JSON.parse(readFileSync(join(dir, 'bare', '.plugin-managed.json'), 'utf8')).rows, '', 'no probe records an empty form')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('syncDecision refreshes when the host row form flips (0.1.6 rename)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ptc-cordis-rowsync-'))
  try {
    const target = join(dir, 'a')
    _internal.materialize({ target, skillsSource: null, version: '0.10.0', base: 'ptc', persona: 'split', workflowOn: true })
    const marker = JSON.parse(readFileSync(join(target, '.plugin-managed.json'), 'utf8'))
    const state = _internal.classify(target)
    assert.equal(state, 'unmodified')
    const base = { state, marker, version: '0.10.0', sourceHashes: null, gitBashActive: false, workflowOn: true, base: 'ptc', persona: 'split', present: false }
    assert.equal(_internal.syncDecision({ ...base, rows: '' }), 'idle')
    assert.equal(_internal.syncDecision({ ...base, rows: 'workflow-ptc:off:off' }), 'refresh', 'a host rename re-materializes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('assets keep the pre-rename engine spelling; alignment is a materialization concern', () => {
  const dir = new URL('../assets/', import.meta.url)
  let seen = 0
  for (const file of readdirSync(dir)) {
    if (!file.startsWith('agent.cordis') || !file.endsWith('.yml')) continue
    const text = readFileSync(new URL(file, dir), 'utf8')
    assert.ok(!text.includes("'@deepseek-ai/dsh-workflow-ptc'"), file + ': the new package name must never be committed (hosts before 0.1.6 ship only the old one)')
    assert.ok(text.includes("'@deepseek-ai/dsh-workflow-worker-thread'"), file + ': the engine row keeps the era-neutral committed spelling')
    seen += 1
  }
  assert.equal(seen, 10, 'two code-era plus eight ptc-era compositions')
})

test('plugin-manager row injection mirrors the official per-side shape (0.1.6-alpha.2)', async () => {
  const { _internal } = await import('../src/index.js')
  const base = "\n- id: present\n  name: '@deepseek-ai/dsh-tool-present'\n- id: tool-cordis\n"
  const on = _internal.injectPluginManagerRow(base, { enabled: true })
  assert.match(on, /tool-plugin-manager\n  name: '@deepseek-ai\/dsh-plugin-manager\/tools'\n/)
  assert.ok(!on.includes('disabled: true'), 'enabled form carries no disabled flag')
  assert.ok(on.indexOf('tool-plugin-manager') > on.indexOf('- id: present'), 'anchored after the present row')
  const off = _internal.injectPluginManagerRow(base, { enabled: false })
  assert.match(off, /tool-plugin-manager\n  name: '@deepseek-ai\/dsh-plugin-manager\/tools'\n  disabled: true\n/)
  assert.equal(_internal.injectPluginManagerRow(on, { enabled: false }), on, 'idempotent')
  const tail = _internal.injectPluginManagerRow("\n- id: tool-cordis\n", { enabled: true })
  assert.match(tail, /tool-cordis\n- id: tool-plugin-manager/, 'tail fallback')
})

test('plugin-manager row never committed into assets; ps twins carry the alpha.2 persona', () => {
  const files = readdirSync(new URL('../assets', import.meta.url)).filter((f) => f.endsWith('.yml'))
  for (const file of files) {
    const text = readFileSync(new URL('../assets/' + file, import.meta.url), 'utf8')
    assert.ok(!text.includes("'@deepseek-ai/dsh-plugin-manager/tools'"), file + ' must not hard-code the plugin-manager row')
  }
  for (const file of ['agent.cordis.ptc.ps.yml', 'agent.cordis.ptc.workflow.ps.yml', 'agent.cordis.ptc.gitbash.ps.yml', 'agent.cordis.ptc.gitbash.workflow.ps.yml']) {
    const text = readFileSync(new URL('../assets/' + file, import.meta.url), 'utf8')
    assert.match(text, /Use plugin_manager for persistent bundle installation/, file + ' carries the alpha.2 persona')
  }
  const text = readFileSync(new URL('../assets/agent.cordis.ptc.yml', import.meta.url), 'utf8')
  assert.ok(!text.includes('Use plugin_manager for persistent bundle installation'), 'text-era twin keeps the old persona')
})

test('syncDecision refreshes when the pluginManager capability flips', async () => {
  const { _internal } = await import('../src/index.js')
  const marker = { version: '1', base: 'ptc', gitBash: false, workflow: true, persona: 'split', present: true, pluginManager: true, rows: 'x', files: {} }
  assert.equal(_internal.syncDecision({ state: 'unmodified', marker, version: '1', sourceHashes: null, base: 'ptc', gitBashActive: false, workflowOn: true, persona: 'split', present: true, pluginManager: true, rows: 'x' }), 'idle')
  assert.equal(_internal.syncDecision({ state: 'unmodified', marker, version: '1', sourceHashes: null, base: 'ptc', gitBashActive: false, workflowOn: true, persona: 'split', present: true, pluginManager: false, rows: 'x' }), 'refresh')
})

test('client registers both settings seats across dsh generations', () => {
  const text = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  assert.match(text, /slots\.inject\("settings\.plugin\.item"/)
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
  assert.match(hostSource, /await runDeclarativeEra\(ctx, config\)/)
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

/** The capture evaluated `!!js process.platform` conditions on its own platform. */
const capturedOnThisPlatform = officialRows.evaluatedFor?.platform === process.platform
/** Row ids whose captured `disabled` came from a platform condition (see the generator). */
const platformConditionalRows = new Set([
  ...(officialRows.conditionalDisabled?.cordis ?? []),
  ...(officialRows.conditionalDisabled?.ptc ?? []),
])

/** Shape used for comparison: the fields the Loader reads.
 * A platform condition captured on another OS is not a contract this run can
 * judge, so its `disabled` cell drops out of BOTH sides instead of failing.
 * @param row - declared row from either side.
 * @param id - flattened identity (`parent/child`) used for the platform lookup.
 */
function rowShape(row, id = row.id) {
  const platformLocked = !capturedOnThisPlatform && platformConditionalRows.has(id)
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
  const ours = pluginsFor({ workflowOn: true, gitBashActive: false, skillsDir: '/x/skills' })
  // the union's defining row: PTC presentation on top of the Creation set
  const union = new Set(['tool-presentation'])
  const flat = (rows, prefix = '') => rows.flatMap((r) => [
    [`${prefix}${r.id}`, canon(rowShape(r, `${prefix}${r.id}`))],
    ...(Array.isArray(r.config) ? flat(r.config, `${prefix}${r.id}/`) : []),
  ])
  const shipped = flat(officialRows.cordis).filter(([id]) => !union.has(id))
  const mine = flat(ours).filter(([id]) => !union.has(id))
  assert.deepEqual(mine.map(([id]) => id), shipped.map(([id]) => id), 'row order must match the shipped preset')
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
    assert.deepEqual(actual, expected, `row ${id} drifted from the shipped preset`)
  }
})

test('declarative rows keep every shipped ptc row identical on the mirror side', async () => {
  const { pluginsFor } = await import('../src/composition.js')
  const ours = pluginsFor({ workflowOn: false, gitBashActive: false, skillsDir: '/x/skills' })
  const unionOnly = new Set(['tool-cordis', 'skill-filesystem', 'present', 'tool-presentation'])
  const flat = (rows, prefix = '') => rows.flatMap((r) => [
    [`${prefix}${r.id}`, canon(rowShape(r, `${prefix}${r.id}`))],
    ...(Array.isArray(r.config) ? flat(r.config, `${prefix}${r.id}/`) : []),
  ])
  const mine = new Map(flat(ours))
  for (const [id, expected] of flat(officialRows.ptc)) {
    if (unionOnly.has(id)) continue
    assert.deepEqual(mine.get(id), expected, `ptc row ${id} drifted from the shipped preset`)
  }
  // the ptc mirror keeps the union's extra capability rows out of the way
  assert.equal(mine.get('tool-cordis').disabled === true, false)
  assert.equal(mine.get('present').name, '@deepseek-ai/dsh-tool-present')
})

test('the fixture is a real capture of the shipped 0.1.7 presets', () => {
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
})
