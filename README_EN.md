# dsh-ptc-cordis-preset

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[简体中文](README.md) | English

> Creation mode on top of PTC mode — the missing fourth combination for [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh): **Code Mode tool composition × creation capabilities**.

DSH ships four presets: Standard (`standard`), PTC (`ptc` — Standard plus Code Mode SDK tool presentation, where multi-step operations compose into one program), Minimal (`minimal`), and Creation (`cordis` — Standard plus the self-referential Cordis toolset and preset-authoring guidance).

The shipped Creation mode is built on **Standard**. This plugin supplies the missing cell: **PTC Creation mode** (`ptc-cordis`) — everything in PTC mode unchanged, plus every Creation-mode addition:

- **🧬 Self-referential Cordis toolset** — `cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`: read the live runtime, define/run/stop dynamic plugin packages
- **📐 Two-planes persona** — host-composition vs agent-preset ownership rules, plus how to compose under Code Mode
- **📚 Composition-authoring skills travel with the preset** — `editing-cordis-compositions` / `cordis-plugin-development`
- **⏰🔔 Official rows ride along** — `time-context`, `tool-schedule` and `tool-plugin-market` join only when their packages resolve from the host; manager/market follow the live `profileContext` service
- **🚫 The workflow tool is never offered** — matching the official PTC mode. The `workflow-ptc` / `tool-workflow` rows stay in the composition but permanently disabled, so alignment diffs remain row-for-row. Sub-agent orchestration and parallel calls stay available inside `run_code`

## Install

```bash
dsh plugin --profile web add dsh-ptc-cordis-preset
# source and Releases: https://github.com/KannaKuron/dsh-ptc-cordis-preset
```

Requires **dsh >= 0.2.2-rc.1** and Node >= 24.9. Pure JS, zero build — the install triggers no pnpm build scripts and needs no `allowBuilds` entries. Restart DSH after installing, then pick **PTC 创造模式** in the mode picker when creating a session.

## How it works

Since dsh 0.2.2-rc.1 presets are **declarative**: the plugin registers the definition straight onto the roster via `ctx.agentPresets.register()` and materializes no directory. At startup it registers `ptc-cordis` (the composition data lives in `src/composition.js`); the Python-backend knob retire-then-remounts on every flip:

- **Composition mirror**: the row set aligns with the official `packages/bundle/web-app/presets/{cordis,ptc}.patch.yml` cell by cell, locked from both directions by `tests/fixtures/official-preset-rows.0.2.2.json` — an upstream row add or default change turns `npm test` red immediately
- **Skills track the deployment**: `customSkillDirs` points at the `skills/` directory beside the **installed** `@deepseek-ai/dsh-agent-preset` — no snapshot in this repo
- **Optional rows ride a probe**: `time-context` / `tool-schedule` / `tool-plugin-market` join only when their packages resolve from the host's module base (`probeHostExtras`, the same base rows mount from); any resolution failure degrades to "absent", never rejects the preset mount
- **Legacy-tree cleanup**: versions before v0.16.0 materialized `~/.dsh/.agent-presets/ptc-cordis/`; startup removes that tree only when `.plugin-managed.json` proves it untouched, and only logs when you edited it

### Update & uninstall

- **Update**: market-page "update" or re-run the install command → restart DSH → the roster entry is the new version
- **Uninstall**: market-page uninstall → the roster entry disappears, no directory left behind
- To build your own mode on top: copy this preset to a new id in the mode picker and edit the copy

## Usage

1. New session → pick **PTC 创造模式** in the mode picker
2. Use Code Mode as usual (`run_code` composes multi-step operations); the `cordis_*` tools sit in the SDK like any other function
3. Ask it to author presets or experiment with dynamic plugins — it loads the travelling authoring skills automatically

> ⚠️ Trust boundary matches the shipped Creation mode: `cordis_define`/`cordis_run` evaluate model-written JavaScript against the live runtime. Treat a PTC Creation session like shell access.

> ✅ **Coexists with the shipped Creation mode in one process**: the host-plane inspect registry throws on a duplicate provider id. This plugin's compatibility shim tries the original path first and only on an "already registered" collision replaces the stored entry (same-package manifests are equivalent; the identity-guarded disposer keeps teardown consistent). It installs via `ctx.inject(['cordisInspect'])` exactly when the service appears, regardless of row activation order. Once upstream natively tolerates duplicates, the original path succeeds and the shim becomes a no-op.

### Languages

The settings card follows DSH's locale setting (`ctx.locale`) and switches live. **21 dictionaries** ship with the plugin: Simplified and Traditional Chinese (including `zh-HK` / `zh-MO` / `zh-TW`), English, Japanese, Korean, German, French, Italian, Portuguese, Russian, Dutch, Polish, Swedish, Turkish, Indonesian, Vietnamese, Thai, Hindi and Arabic.

One entry per language lives in the `LOCALES` table in `src/client.js` (each behind a `/* locale: <tag> */` marker). Resolution is "exact tag → primary subtag → English"; lookups resolve the current locale on every call (cached per tag), and the card subscribes to `ctx.locale.subscribe` so a language switch repaints it on the spot.

> A smoke test requires every dictionary to carry exactly the same key set as Chinese: a missing key falls back to English silently and leaves the card half-translated.

## Build & test from source

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test, 56 smoke tests (offline, no build; the count tracks npm test's own output)
```

There is no build step: `src/index.js`, `src/composition.js` and `src/client.js` are the shipped artifacts.

`tests/fixtures/official-preset-rows.0.2.2.json` holds the official dsh 0.2.2-rc.1 preset rows as a **capture** (parsed with the loader's YAML dialect, `!!js` evaluated for a profile host); it locks the declarative composition onto the official text from both sides. Regenerate after a dsh version change with `node tools/gen-official-preset-fixture.mjs` (`DSH_CHECKOUT` / `DESKTOP_BUILD` override the paths).

## Cooperation with dsh-gitbash-shell

With [dsh-gitbash-shell](https://github.com/KannaKuron/dsh-gitbash-shell) installed alongside, the two plugins cooperate on three fronts.

### Composition and roster name follow the Git Bash side

This plugin detects the peer's `gitBash` host capability service: with both installed it uses the Git Bash shape (`tool-bash` enabled, `tool-pwsh` disabled by default); without it, or on non-Windows hosts, it uses the default shape. The probe is bounded (1 s) at startup.

**The tool-pwsh disablement yields to dsh-ops on its legacy row set**: with [dsh-ops](https://github.com/T-Auto/dsh-ops) ≤ 0.4.2 installed, the official presets keep their `tool-pwsh` row anyway, so this composition probes for the `dsh-ops-shell`/`dsh-ops-file` rows and restores the official pwsh shape when present. dsh-ops 0.4.3+ replaced the component rows with preset-id-gated mode switches and `ptc-cordis` matches none of them, so the dedup disablement stands; legacy rows keep the v0.20.0/v0.20.1 behaviour.

**Roster display name**: while Git Bash is active the entry reads **`PTC 创造模式 · Git Bash`** with `(Shell 使用 Git Bash)` appended to the description; otherwise it stays `PTC 创造模式`. `assets/preset.gitbash.yml`'s `name:` is the **single source of truth** for the name, and a smoke test locks the two together.

### The published `ptcCordisPreset` capability

At startup this plugin publishes:

```js
{ id: 'ptc-cordis', gitBashActive: true /* false on the non-Git-Bash side */ }
```

The peer uses it to decide that this preset already covers Creation mode on Git Bash, and therefore stops registering its own `创造模式 · Git Bash` while the user's dedupe switch is on. The value is final when published (the probe finishes first), and the service is published on hosts without the peer too (`gitBashActive: false`).

### The shared dedupe switch on the settings card

Since v0.14.0 this plugin's settings card carries **「与 dsh-gitbash-shell 去重」**:

- **Off by default** ("keep both"), changing no existing behaviour;
- **One single state**: it binds the **peer's own row** through `ctx.configForms.get('gitbash-shell')`, reading and writing `suppressPeerCordis`;
- **Not rendered while the peer's row is absent**;
- Deduplication takes effect with dsh-gitbash-shell **>= 0.25.0** and this plugin **>= 0.14.0**.

> If your `ptc-cordis` directory was materialized by an older version and is still unmodified, the first startup after upgrade refreshes it automatically; if you modified it, delete `~/.dsh/.agent-presets/ptc-cordis` and restart.

## run_code backend switch (default OFF)

Settings → Plugins → the "PTC 创造模式" card gains a **run_code backend** row:

- **Node / TypeScript (default)**: run_code uses dsh's official Node PTC backend, byte-identical to the shipped `ptc` composition.
- **Python (experimental)**: switches to dsh's experimental CPython backend `@deepseek-ai/dsh-experimental-ptc-runtime-python` (installed with this plugin). run_code's language, generated Python SDK prompt and tool presentation follow the provider automatically.

Requirements and boundaries:

- **Platform**: POSIX (macOS / Linux) only. Windows keeps the official Node backend and logs guidance.
- **Interpreter**: CPython ≥ 3.10. The plugin probes, in order, an explicit `pythonBin` → `DSH_PYTHON` → the dsh runtime's own interpreter → common Homebrew paths → PATH → `/usr/bin/python3`, and freezes the winning absolute path for the provider.
- **When it takes effect**: after restarting dsh — the swap happens in the profile patch layer and is evaluated at boot. The card shares one value with dsh-gitbash-shell's card.
- **When it cannot run**: the plugin does NOT swap — it keeps the official Node backend and prints actionable guidance in the host log.

## The persistent-in-memory execution mode (opt-in)

The official PTC runtime supports two execution modes, selected via the `executionMode` Config field on the `ptc-runtime` row: `'per-call'` (default) | `'persistent-in-memory'`. This plugin's composition mirrors the official row set, so both modes are available; see the official reference profile `experimental/cua-macos/examples/persistent-ptc.cordis.yml` in the dsh repository.

- **per-call (default)**: every `run_code` call gets a **fresh scratch pad** — the program is torn up as soon as it finishes.
- **persistent-in-memory**: the runtime switches to a REPL channel (`programFormat: 'repl'`) and state lives on a **shared whiteboard** — the next call picks up where the last one left off.

Boundaries (official `InMemoryExecution` semantics): variables and modules **persist across calls**; **re-declaring** the same `let` / `const` / `class` name fails; when the session's sandbox is upgraded, in-memory state goes away with the temporary environment. Enable via the `ptc-runtime` row's Config (or `executionMode` in a profile patch); it is independent of this plugin's run_code backend switch.

## Acknowledgements & license

- The synthesized composition and skill contents derive from the shipped presets of [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) (MIT); skills are copied at runtime from the local installation
- This repository: [MIT](./LICENSE)
