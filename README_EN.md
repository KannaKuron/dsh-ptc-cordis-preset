# dsh-ptc-cordis-preset

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[简体中文](README.md) | English

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

### dsh 0.1.6: the workflow-engine row was renamed

dsh 0.1.6-alpha.1 renamed the built-in presets' workflow-engine row from
`workflow-worker-thread` to `workflow-ptc` and **deleted** the old package. One row that
fails to import rejects the **whole preset mount**, so a composition pinning the old name
simply stops working on the new host. This plugin pins neither spelling: at materialization it
copies that row — id, package and `disabled` state — straight out of the host's own built-in
`ptc` preset (`rowFormsOf` / `alignEngineRow`), and aligns `tool-ralph` with the new
`disabled: true` default. The two workflow twins differ on purpose: the ON twin forces the
engine live (it really runs), while the OFF twin copies the host — mirroring the shipped ptc
preset's disabled engine. The rewrite is plain string surgery (no YAML round-trip, so `!!js`
stays safe) and idempotent; a failed probe (old host, no roster) leaves the assets byte-for-byte
untouched — one set of assets serves both eras, in either upgrade order.

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

### Languages

The settings card follows DSH's locale setting (`ctx.locale`) and switches live. **21 dictionaries** ship with the plugin: Simplified and Traditional Chinese (including `zh-HK` / `zh-MO` / `zh-TW`), English, Japanese, Korean, German, French, Italian, Portuguese, Russian, Dutch, Polish, Swedish, Turkish, Indonesian, Vietnamese, Thai, Hindi and Arabic. One entry per language lives in the `LOCALES` table in `src/client.js` (each behind a `/* locale: <tag> */` marker), and all of them ride one `ctx.locale.register` call into DSH's locale registry.

Resolution is "exact tag → primary subtag → English", with `zh-Hant-*` landing on the Hong Kong dictionary; **English is always the key-complete one**, so an uncovered language falls back to it instead of showing raw keys. A lookup resolves the current locale on every call (cached per tag), and the card also subscribes to `ctx.locale.subscribe` — a language switch repaints it on the spot, no page reload.

> A smoke test requires every dictionary to carry exactly the same key set as Chinese: a missing key falls back to English silently and leaves the card half-translated, which is what that test exists to catch. The third-language dictionaries are machine-assisted translations — corrections via issue or PR are welcome.

## Build & test from source

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test, 62 smoke tests (offline, no build; the count tracks npm test's own output)
```

There is no build step: `src/index.js` and `assets/*` are the shipped artifacts.

## Cooperation with dsh-gitbash-shell

With [dsh-gitbash-shell](https://github.com/KannaKuron/dsh-gitbash-shell) (v0.2.0+) installed alongside, the two plugins cooperate on three fronts (see CHANGELOG v0.14.0; this repository's issue [#1](https://github.com/KannaKuron/dsh-ptc-cordis-preset/issues/1) and their issue [#7](https://github.com/KannaKuron/dsh-gitbash-shell/issues/7)).

### Composition and roster name follow the Git Bash side

This plugin detects the peer's `gitBash` host capability service while materializing `PTC 创造模式`: with both installed it uses `assets/agent.cordis.gitbash.yml` (tool-bash enabled, tool-pwsh disabled — the Git Bash variant); without it, or on non-Windows hosts, it uses the default `assets/agent.cordis.yml`. A capability flip triggers one automatic refresh (only for the unmodified preset) — no extra mode, no manual file edits.

**The display name and description in the roster follow that same side**: while Git Bash is active the entry reads **`PTC 创造模式 · Git Bash`** with `(Shell 使用 Git Bash)` appended to the description, matching the naming style of the peer's four `* · Git Bash` variants; otherwise it stays `PTC 创造模式`. The materialization path has behaved this way since v0.6.0; the v0.13.0 declarative rewrite hard-coded the display name, so only new hosts (dsh >= 0.1.7) lost the suffix. Fixed in v0.14.0: `assets/preset.gitbash.yml`'s `name:` is the **single source of truth** for the name, and a smoke test locks the two together so they cannot drift apart again.

### The published `ptcCordisPreset` capability

At startup (on both host eras, before the era split) this plugin publishes a capability service to the runtime:

```js
{ id: 'ptc-cordis', gitBashActive: true /* false on the non-Git-Bash side */ }
```

The peer uses it to decide that this preset already covers Creation mode on Git Bash, and therefore stops registering its own `创造模式 · Git Bash` while the user's dedupe switch is on. Because the peer reacts to **the service appearing**, this plugin runs its bounded (1 s) `gitBash` capability probe **before** publishing: the published value is final, so the peer can never miss a value that flipped from `false` to `true` afterwards. The service is published on hosts without the peer too (`gitBashActive: false`), so "service absent" only ever means this plugin is not mounted.

### The shared dedupe switch on the settings card

The peer's `创造模式 · Git Bash` and this preset (a Git Bash build once the cooperation is active) describe the same thing, so both entries show up in the mode picker when the two plugins are installed together. Since v0.14.0 this plugin's settings card carries a second row, **「与 dsh-gitbash-shell 去重」** (deduplicate with dsh-gitbash-shell):

- **Off by default** (shown as "keep both"), changing no existing behaviour;
- **One single state**: the row stores no value of its own — it binds the **peer's own row** through `ctx.configForms.get('gitbash-shell')`, reads and writes its `suppressPeerCordis` field and `subscribe`s to the peer's changes, so both cards show the same switch and a change on either side updates the other at once;
- **Not rendered while the peer's row is absent** (peer not installed), in which case this card falls back to its original single-row shape;
- **Version requirements**: deduplication actually takes effect only with dsh-gitbash-shell **>= 0.25.0** (the switch itself) and this plugin **>= 0.14.0** (the capability) — the roster entry disappears only when both hold;
- **Old-host boundary**: only on dsh **>= 0.1.7** can both sides edit it (new hosts are the ones with `configForms`); on older hosts (<= 0.1.6) the row does not appear on this card, the switch can only be changed on the peer's own settings surface, and it takes effect per the peer's startup-time semantics.

> If your `ptc-cordis` directory was materialized by an older version and is still unmodified, the first startup after upgrade refreshes it automatically; if you modified it, delete `~/.dsh/.agent-presets/ptc-cordis` and restart to re-materialize under the new logic.

## Acknowledgements & license

- The synthesized composition and skill contents derive from the shipped presets of [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) (MIT); skills are copied at runtime from the local installation under its license
- Engineering and distribution structure modeled on [dsh-deepseek-vision-bridge](https://github.com/KannaKuron/dsh-deepseek-vision-bridge)
- This repository: [MIT](./LICENSE)
