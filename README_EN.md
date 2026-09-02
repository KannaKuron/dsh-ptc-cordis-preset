# dsh-ptc-cordis-preset

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

> Creation mode on top of PTC mode — the missing fourth combination for [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh): **Code Mode tool composition × creation capabilities**.

DSH ships four presets: Standard (`standard`), PTC (`code` — **renamed to `ptc` in dsh 0.1.2** — Standard plus Code Mode SDK tool presentation, where multi-step operations compose into one TypeScript program), Minimal (`minimal`), and Creation (`cordis` — Standard plus the self-referential Cordis toolset and preset-authoring guidance).

The shipped Creation mode is built on **Standard**. This plugin supplies the missing cell: **PTC Creation mode** (`ptc-cordis`) — everything in PTC mode unchanged (including the `tool-presentation` row), plus every Creation-mode addition:

- **🧬 Self-referential Cordis toolset** — `cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`: read the live runtime, define/run/stop dynamic plugin packages
- **📐 Two-planes persona** — host-composition vs agent-preset ownership rules, plus how to compose under Code Mode (treat the cordis tools as SDK functions inside your `run_code` program)
- **📚 Composition-authoring skills travel with the preset** — `editing-cordis-compositions` / `cordis-plugin-development`
- **🎛️ Workflow knob (settings card, v0.8.0)** — the official PTC mode omits the workflow tool since dsh 0.1.2-alpha.4 (run_code is its only model-authored orchestration surface) while Creation mode keeps it; this preset **provides it by default** (the Creation-side capability, same as every earlier version). Settings → Plugins → the "PTC 创造模式" card toggles it: the flip re-materializes immediately and NEW sessions pick it up at once (already-open sessions keep their composition); requires dsh >= 0.1.2

In a PTC Creation session the model can **compose multi-step operations as a single Code Mode program while inspecting the live runtime, experimenting with dynamic plugins, and authoring new agent presets**.

## Install

```bash
dsh plugin --profile web add dsh-ptc-cordis-preset
# or the full URL
dsh plugin --profile web add https://github.com/KannaKuron/dsh-ptc-cordis-preset
```

Pure JS, zero build, zero dependencies — the install triggers no pnpm build scripts and needs no `allowBuilds` entries. Restart DSH after installing (host-half change), then pick **PTC 创造模式** in the mode picker when creating a session.

## How it works

The preset roster (`agentPresets`) re-scans its roots on every `list()`, so a preset directory that lands on disk while the process runs is visible immediately. At startup this plugin materializes the `ptc-cordis` preset into the **first user-trust root** (default `~/.dsh/.agent-presets/ptc-cordis/`):

- **Synthesized composition**: `assets/agent.cordis.yml` = the shipped `code` preset verbatim + the `cordis` preset's additions (persona / `tool-cordis` / `customSkillDirs`)
- **Skills track the deployment**: `skills/` is copied at materialize time from the **installed shipped `cordis` preset** on your machine — not a snapshot frozen in this repo — so DSH upgrades propagate on the next materialization
- **User ownership via hash marker**: `.plugin-managed.json` records the sha256 of every file written. Untouched → plugin updates refresh it in place; edited by you → the plugin never touches it again (no overwrite on startup, no delete on uninstall); a `ptc-cordis` directory without the marker is yours → the plugin leaves it entirely alone
- **Quiet startup** (since v0.2.1): untouched tree + unchanged plugin version + live skills source still hashing the same → startup writes nothing and prints nothing. The single materialization line appears only on first install, plugin upgrade, or skills-source drift (e.g. a DSH upgrade); the routine "up to date" notice is demoted to a debug-level line on the cordis logger (`ptc-cordis` namespace)
- **Dual-era compositions** (since v0.7.0): a committed composition text per built-in `code`/`ptc` era, picked per boot by probing your dsh (see below)

### Works with both dsh 0.1.1 and 0.1.2+

dsh 0.1.2 renamed the built-in `code` preset to `ptc` (`mode: code` → `mode: ptc`, explicitly no compatibility aliases), so the composition text is era-specific. This plugin **ships both committed era texts**, probes the roster for the built-in id at every boot, records the choice in `.plugin-managed.json` (`base`), and re-materializes automatically when the detection flips:

- **Plugin upgraded first, dsh second**: the plugin materializes the `code` era; after the dsh upgrade the next startup re-materializes as the `ptc` era — no manual steps;
- **dsh upgraded first, plugin second**: in the window, the old plugin's `code`-era text fails to mount on the new dsh (the new roster flags it broken); installing this version and restarting restores it;
- Standing rule unchanged: a preset you modified is never touched — delete the directory to re-materialize.

### Update & uninstall

- **Update**: market-page "update" or re-run the install command → restart DSH → an unmodified preset refreshes to the new version in place
- **Market-page uninstall**: removes the package then disposes → if the preset is unmodified, it is removed automatically; if you edited it, it is kept for you
- **CLI uninstall** (`dsh plugin --profile web remove dsh-ptc-cordis-preset`): runs in a separate process, disposal never runs, the preset stays — delete `ptc-cordis` on the settings page or `rm -rf ~/.dsh/.agent-presets/ptc-cordis`
- To build your own mode on top: copy this preset to a new id on the settings page and edit the copy, or edit it in place (once modified, this plugin yields)

## Usage

1. New session → pick **PTC 创造模式** in the mode picker
2. Use Code Mode as usual (`run_code` composes multi-step operations); the `cordis_*` tools sit in the SDK like any other function
3. Ask it to author presets or experiment with dynamic plugins — it loads the travelling authoring skills automatically

> ⚠️ Trust boundary matches the shipped Creation mode: `cordis_define`/`cordis_run` evaluate model-written JavaScript against the live runtime. Treat a PTC Creation session like shell access.

> ✅ **Coexists with the shipped Creation mode in one process** (since v0.4.0): the host-plane inspect registry throwing on a duplicate provider id was the single root of "one cordis-mode session per process" (v0.2.0 dodged it with an isolate realm, which severed the browser bridge — removed in v0.3.0). v0.4.0 ships a **compatibility shim**: registration tries the original path first, and only on an "already registered" collision replaces the stored entry (same-package manifests are equivalent; the identity-guarded disposer keeps teardown consistent) — both presets then share the one host runner, with approval cards, client providers, client activation, and dynamic tools fully working (verified live: dual-mode mount plus all 9 providers, including the 5 client-side ones, answering).
>
> ⚠️ **0.6.3 fixed the shim's install timing**: it used to sample `cordisInspect` once at plugin startup, but the host runner row activates later, so in a real boot the service was not yet provided and the shim silently never installed — any process that had (even once) mounted the shipped Creation mode kept hitting "Provider is already registered" on `ptc-cordis` until dsh restarted; closing/archiving sessions does NOT unmount a standing mount, so "no Creation session open right now" does not mean the collision is gone. The shim now installs via `ctx.inject(['cordisInspect'])` exactly when the service appears, regardless of row activation order. Still defensive: if the upstream shape ever changes it degrades back to v0.3.0's bare behavior (logged, never blocking startup); once upstream natively tolerates duplicates, the original path succeeds and the shim becomes a no-op. The structural fix remains per-session runner instances upstream.

## Build & test from source

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test, 11 smoke tests (offline, no build)
```

There is no build step: `src/index.js` and `assets/*` are the shipped artifacts.

## Cooperation with dsh-gitbash-shell

If [dsh-gitbash-shell](https://github.com/KannaKuron/dsh-gitbash-shell) (v0.2.0+) is installed alongside, this plugin detects its `gitBash` host capability service while materializing `PTC 创造模式`: with both installed it uses `assets/agent.cordis.gitbash.yml` (tool-bash enabled, tool-pwsh disabled — the Git Bash variant); without it, or on non-Windows hosts, it uses the default `assets/agent.cordis.yml`. A capability flip triggers one automatic refresh (only for the unmodified preset) — no extra mode, no manual file edits.

> If your `ptc-cordis` directory was materialized by an older version and is still unmodified, the first startup after upgrade refreshes it automatically; if you modified it, delete `~/.dsh/.agent-presets/ptc-cordis` and restart to re-materialize under the new logic.

## Acknowledgements & license

- The synthesized composition and skill contents derive from the shipped presets of [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) (MIT); skills are copied at runtime from the local installation under its license
- Engineering and distribution structure modeled on [dsh-deepseek-vision-bridge](https://github.com/KannaKuron/dsh-deepseek-vision-bridge)
- This repository: [MIT](./LICENSE)