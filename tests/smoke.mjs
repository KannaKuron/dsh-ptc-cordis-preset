// Smoke tests for dsh-ptc-cordis-preset — pure helper level, no Cordis
// runtime needed. Run: npm test (node --test tests/smoke.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal, name as pluginName, inject as pluginInject } from '../src/index.js'

const { PRESET_ID, MARKER_FILE, classify, materialize, cleanupOnDispose, firstUserRoot, hashTree } = _internal

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
  // Creation side — the toolset and its private runner live in one isolate realm
  assert.match(compositionAsset, /id: cordis-tools/)
  assert.match(compositionAsset, /dynamicCordisRunner: true/)
  assert.match(compositionAsset, /cordisInspect: true/)
  assert.match(compositionAsset, /@deepseek-ai\/dsh-cordis-host-runner/)
  assert.match(compositionAsset, /id: tool-cordis/)
  assert.match(compositionAsset, /@deepseek-ai\/dsh-tool-cordis/)
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
