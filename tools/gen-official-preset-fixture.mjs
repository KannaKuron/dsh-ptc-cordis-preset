/**
 * Regenerate tests/fixtures/official-preset-rows.json from a dsh checkout.
 *
 * The fixture is a capture of the shipped preset rows — `{cordis,ptc}.patch.yml`
 * parsed with the Loader's own dialect and with every `!!js` condition evaluated
 * the way the Loader evaluates it — so the smoke tests can lock this plugin's
 * declarative composition against the official text WITHOUT needing a dsh
 * checkout to run.
 *
 * Usage: node tools/gen-official-preset-fixture.mjs [out.json]
 *        DSH_CHECKOUT=/path/to/deepseek-harness (default: the local checkout)
 *
 * The YAML reader and the `entryListSchema` dialect come from the checkout's
 * built desktop app (apps/desktop/.desktop-build/targets/mac-arm64/dsh); when
 * that build is absent, point DESKTOP_BUILD at any installed dsh tree that
 * carries @deepseek-ai/cordis-plugin-include and js-yaml.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const HARNESS = process.env.DSH_CHECKOUT ?? '/Users/kanna/project/deepseek-harness'
const DESKTOP = process.env.DESKTOP_BUILD ?? join(HARNESS, 'apps/desktop/.desktop-build/targets/mac-arm64/dsh')
const req = createRequire(pathToFileURL(join(DESKTOP, 'index.js')).href)
const yaml = req('js-yaml')
const { entryListSchema } = await import(pathToFileURL(join(DESKTOP, 'node_modules/@deepseek-ai/cordis-plugin-include/lib/index.js')).href)
const PRESETS = join(HARNESS, 'packages/bundle/web-app/presets')

const isJsExpr = v => typeof v === 'object' && v !== null && Object.hasOwn(v, '__jsExpr')
const evalJs = (expr, ctx, baseUrl) => new Function('ctx', 'baseUrl', 'process', `return (${expr})`)(ctx, baseUrl, process)
function resolve(value, ctx, baseUrl) {
  if (isJsExpr(value)) return evalJs(value.__jsExpr, ctx, baseUrl)
  if (Array.isArray(value)) return value.map(v => resolve(v, ctx, baseUrl))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx, baseUrl)
    return out
  }
  return value
}
function official(preset) {
  const file = join(PRESETS, `${preset}.patch.yml`)
  const doc = yaml.load(readFileSync(file, 'utf8'), { schema: entryListSchema })
  const row = doc[0].insert.find(r => r.id === `preset-${preset}`)
  const ctx = { get: n => (n === 'profileContext' ? {} : undefined) }
  return { rows: resolve(row.config.plugins, ctx, pathToFileURL(file).href), conditional: conditionalDisabled(row.config.plugins) }
}

/**
 * Row ids whose `disabled` is a `!!js` condition that reads `process.platform`
 * (spelled the way the smoke tests flatten nested groups: `parent/child`). The
 * capture evaluates those conditions on THIS machine, so a test run on another
 * platform must not compare them (see evaluatedFor in the fixture). Conditions
 * that do not read the platform stay comparable everywhere.
 */
function conditionalDisabled(rows, prefix = '') {
  return rows.flatMap(row => [
    ...(isJsExpr(row.disabled) && /process\.platform/.test(row.disabled.__jsExpr) ? [`${prefix}${row.id}`] : []),
    ...(Array.isArray(row.config) ? conditionalDisabled(row.config, `${prefix}${row.id}/`) : []),
  ])
}
/** Drop the install-layout-specific skills dir; keep every other value verbatim. */
function portable(rows) {
  return rows.map(row => {
    if (Array.isArray(row.config)) return { ...row, config: portable(row.config) }
    if (row.id === 'skill-filesystem') { const copy = { ...row }; delete copy.config; return copy }
    return row
  })
}
const cordis = official('cordis')
const ptc = official('ptc')
const out = {
  $comment: 'Generated from a dsh checkout by tools/gen-official-preset-fixture.mjs; do not hand-edit.',
  source: 'packages/bundle/web-app/presets/{cordis,ptc}.patch.yml',
  runtime: JSON.parse(readFileSync(join(HARNESS, 'package.json'), 'utf8')).version,
  evaluatedFor: { platform: process.platform, profileContext: true },
  cordis: portable(cordis.rows),
  ptc: portable(ptc.rows),
  conditionalDisabled: { cordis: cordis.conditional, ptc: ptc.conditional },
}
const target = process.argv[2] ?? new URL('../tests/fixtures/official-preset-rows.json', import.meta.url).pathname
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log('wrote', target, '| cordis rows', out.cordis.length, '| ptc rows', out.ptc.length,
  '| conditional disabled', out.conditionalDisabled.cordis.length + out.conditionalDisabled.ptc.length)
