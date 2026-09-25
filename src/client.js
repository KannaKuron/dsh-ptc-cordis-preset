/**
 * dsh-ptc-cordis-preset — browser half (hand-written ModuleLoader bundle).
 *
 * One job: the SETTINGS CARD — registers a settings.plugin.item card keyed by
 * the Host half's 'ptc-cordis' settings namespace (served by src/index.js).
 * The Plugins tab dispatches the intersection of Host-served namespaces and
 * registered cards. The card exposes ONE boolean knob: whether the
 * materialized ptc-cordis preset provides the workflow tool.
 *   - ON (default): Creation mode keeps workflow and this preset inherits the
 *     Creation-side capability (its behavior through v0.7.0);
 *   - OFF: matches the official ptc preset (run_code as the only
 *     model-authored orchestration surface; the engine row stays for ralph).
 * The Host half watches the same namespace and re-materializes LIVE on flip;
 * this bundle only renders and writes.
 *
 * SLOT REGISTRATION CONTRACT (the dsh-agent-lang / dsh-better-workspace
 * pattern, verified live): arbitrary objects do NOT reach the component
 * through top-level registration options — only the protocol fields do
 * (locale binds the t seat) and an inject FACTORY's returned members become
 * props. The bound settings scope rides through the inject factory as a
 * PLAIN member; the card reads it via getSnapshot() per render and refreshes
 * with a local tick after each write.
 *
 * Hand-written bundle rules (no build step in this repo):
 *   - ONE window.__ModuleLoader__.load({...}) call, id = package name;
 *   - require restricted to the client-module BASELINE whitelist:
 *     react and @deepseek-ai/dsh-client-ui-primitives only (smoke-enforced);
 *   - plain React.createElement, no JSX/TS; components defined at module
 *     level so parent re-renders never remount them;
 *   - dsh.client.inject in package.json lists the packages that must load
 *     first so locale / settingsScope / slots exist when this applies.
 */
window.__ModuleLoader__.load({
	id: "dsh-ptc-cordis-preset",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");
		var ui = require("@deepseek-ai/dsh-client-ui-primitives");

		var E = React.createElement;
		var useState = React.useState;
		var useEffect = React.useEffect;

		var TAG = "[dsh-ptc-cordis-preset]";
		var NS = "ptc-cordis";
		var DICT_NS = "ptcCordis";
		/* The dedupe switch lives on dsh-gitbash-shell's OWN profile entry
		   (v0.14.0): one state, two cards. Their card renders it from their row
		   Config, this card binds the same entry through configForms and writes
		   the same field, so the two are never two copies. */
		var PEER_NS = "gitbash-shell";
		var PEER_FIELD = "suppressPeerCordis";

		// ── locale dictionaries (key sets must stay aligned; smoke-enforced) ──
		// zh/en ship with DSH; every other language lives in LOCALES below, one entry
		// per language, each behind a marker comment naming its tag. EVERY dictionary
		// must carry the same key set as zh: a key missing from a dictionary falls
		// back to English at lookup time, so an omission shows up as a half-translated
		// card instead of failing loudly.

		var zh = {
			"title": "PTC 创造模式",
			"cardDesc": "控制物化的 ptc-cordis preset 是否提供 workflow 工具",
			"wf.label": "workflow 工具",
			"wf.on": "提供（默认）",
			"wf.off": "不提供",
			"error": "写入失败",
			"hint": "默认提供：创造模式保留 workflow，本 preset 继承该能力（与 0.7.0 及之前一致）。官方 PTC 模式自 dsh 0.1.2-alpha.4 起默认不提供（run_code 已是唯一模型编排面），想完全对齐官方选「不提供」。切换立即重物化，新会话即时生效；已打开的会话保持原样。开关需要 dsh ≥ 0.1.2。",
			"peer.label": "与 dsh-gitbash-shell 去重",
			"peer.on": "去重",
			"peer.off": "保留两个（默认）",
			"peer.hint": "dsh-gitbash-shell 同装时，它还会注册一个「创造模式 · Git Bash」，与本预设（联动后已是 Git Bash 版）指向同一件事。开启去重后它不再注册那一条；默认关闭，保持现状。此开关就是 dsh-gitbash-shell 设置卡上的同一个开关——两处共享同一份状态，任一侧改动另一侧立即同步。仅在已安装 dsh-gitbash-shell 时显示。",
			"python.label": "run_code 后端",
			"python.on": "Python（实验性）",
			"python.off": "Node / TypeScript（默认）",
			"python.hint": "关闭（默认）时 run_code 使用官方 Node/TypeScript 后端，与官方组合逐字节一致；开启后改用 dsh 实验性 CPython 后端，run_code 的语言、SDK 提示词与工具呈现随之切到 Python。要求 POSIX 平台与 CPython ≥ 3.10（Windows 不可用），且与 workflow 工具互斥——官方 Python 组合同样禁用 workflow，所以开启期间 workflow 侧强制关闭（你的 workflow 设置值保留，关掉后恢复）。需重启 dsh 生效；dsh-gitbash-shell 的卡片读写同一份状态，任一侧改动两侧同步。",
		};

		var en = {
			"title": "PTC Creation mode",
			"cardDesc": "Whether the materialized ptc-cordis preset provides the workflow tool",
			"wf.label": "workflow tool",
			"wf.on": "Provide (default)",
			"wf.off": "Omit",
			"error": "Write failed",
			"hint": "Default ON: Creation mode keeps workflow and this preset inherits the Creation-side capability (its behavior through v0.7.0). The official PTC mode omits it since dsh 0.1.2-alpha.4 (run_code is its only model-authored orchestration surface) — pick Omit to match the official shape. Flipping re-materializes immediately; NEW sessions pick it up at once, already-open sessions keep their composition. Requires dsh >= 0.1.2.",
			"peer.label": "Deduplicate with dsh-gitbash-shell",
			"peer.on": "Deduplicate",
			"peer.off": "Keep both (default)",
			"peer.hint": "With dsh-gitbash-shell installed it also registers a 「Creation Mode · Git Bash」 entry, which covers the same ground as this preset (a Git Bash build while the cooperation is active). Deduplication stops it registering that entry; the default keeps today's behaviour. This switch IS the one on dsh-gitbash-shell's settings card — both sides share a single state, so a change on either side updates both at once. Shown only while dsh-gitbash-shell is installed.",
			"python.label": "run_code backend",
			"python.on": "Python (experimental)",
			"python.off": "Node / TypeScript (default)",
			"python.hint": "While off (default) run_code uses the official Node/TypeScript backend, byte-identical to the shipped composition; turning it on switches to dsh's experimental CPython backend, which also moves run_code's language, generated SDK prompt and tool presentation to Python. It needs a POSIX platform with CPython ≥ 3.10 (unavailable on Windows) and is mutually exclusive with the workflow tool — the official Python composition disables workflow too, so the workflow side is forced off while this is on (your workflow setting is kept and restored when you turn it off). Takes effect after restarting dsh; dsh-gitbash-shell's card reads and writes the same state, so either side updates both.",
		};

		/* Third-language dictionaries, keyed by lowercase BCP-47 tag. Every entry
		   must carry the SAME key set as zh: a key missing from a dictionary falls
		   back to English at lookup time, and tests/smoke.mjs enforces the equality
		   so a new string cannot land in zh and en alone. Each entry sits behind a
		   marker comment naming its tag (the dsh-ide-git convention) so the guard
		   test can slice the blocks without parsing this file. Adding a language is
		   one entry here and nothing else — every dictionary also rides the DSH
		   locale registry below, so host-side consumers read the same copy the card
		   does. Machine-assisted translation: community corrections are welcome. */

		var LOCALES = {
			/* locale: zh-hk */
			"zh-hk": {
				"title": "PTC 創造模式",
				"cardDesc": "控制物化咗嘅 ptc-cordis preset 會唔會提供 workflow 工具",
				"wf.label": "workflow 工具",
				"wf.on": "提供（預設）",
				"wf.off": "唔提供",
				"error": "寫入失敗",
				"hint": "預設提供：創造模式保留 workflow，本 preset 繼承呢個能力（同 v0.7.0 及之前一樣）。官方 PTC 模式自 dsh 0.1.2-alpha.4 起預設唔提供（run_code 已經係唯一嘅模型編排面），想完全對齊官方就揀「唔提供」。一改就會即刻重新物化，新工作階段即時生效；已開啟嘅工作階段維持原狀。呢個開關需要 dsh ≥ 0.1.2。",
				"peer.label": "同 dsh-gitbash-shell 去重",
				"peer.on": "去重",
				"peer.off": "兩個都保留（預設）",
				"peer.hint": "同裝 dsh-gitbash-shell 嗰陣，佢仲會註冊一個「創造模式 · Git Bash」，同本 preset（聯動之後已經係 Git Bash 版）指向同一件事。開啟去重之後佢就唔會再註冊嗰一條；預設關閉，維持現狀。呢個開關就係 dsh-gitbash-shell 設定卡上嘅同一個開關——兩處共享同一份狀態，任一邊改動另一邊即刻同步。只會喺已安裝 dsh-gitbash-shell 嘅時候顯示。",
				"python.label": "run_code 後端",
				"python.on": "Python（實驗性）",
				"python.off": "Node / TypeScript（預設）",
				"python.hint": "預設關閉嗰陣 run_code 用官方 Node/TypeScript 後端，同官方組合逐位元組一致；開咗就轉用 dsh 實驗性 CPython 後端，run_code 嘅語言、SDK 提示詞同工具呈現都會跟住轉去 Python。需要 POSIX 平台同 CPython ≥ 3.10（Windows 用唔到），而且同 workflow 工具互斥——官方 Python 組合都一樣停用 workflow，所以開住嗰陣 workflow 側會強制關閉（你嘅 workflow 設定會保留，閂咗就復原）。要重啟 dsh 先生效；dsh-gitbash-shell 嘅卡片讀寫同一份狀態，任一邊改兩邊都會同步。",
			},
			/* locale: zh-tw */
			"zh-tw": {
				"title": "PTC 創造模式",
				"cardDesc": "控制物化後的 ptc-cordis preset 是否提供 workflow 工具",
				"wf.label": "workflow 工具",
				"wf.on": "提供（預設）",
				"wf.off": "不提供",
				"error": "寫入失敗",
				"hint": "預設提供：創造模式保留 workflow，本 preset 沿用該能力（與 v0.7.0 及之前一致）。官方 PTC 模式自 dsh 0.1.2-alpha.4 起預設不提供（run_code 已是唯一的模型編排面），想完全對齊官方請選「不提供」。切換後會立即重新物化，新工作階段即時生效；已開啟的工作階段維持原狀。此開關需要 dsh ≥ 0.1.2。",
				"peer.label": "與 dsh-gitbash-shell 去重",
				"peer.on": "去重",
				"peer.off": "保留兩者（預設）",
				"peer.hint": "同時安裝 dsh-gitbash-shell 時，它還會註冊一個「創造模式 · Git Bash」，與本 preset（聯動後已是 Git Bash 版）指向同一件事。開啟去重後它不再註冊該條目；預設關閉，保持現狀。此開關就是 dsh-gitbash-shell 設定卡上的同一個開關——兩處共享同一份狀態，任一側改動另一側立即同步。僅在已安裝 dsh-gitbash-shell 時顯示。",
				"python.label": "run_code 後端",
				"python.on": "Python（實驗性）",
				"python.off": "Node / TypeScript（預設）",
				"python.hint": "關閉（預設）時 run_code 使用官方 Node/TypeScript 後端，與官方組合逐位元組一致；開啟後改用 dsh 實驗性 CPython 後端，run_code 的語言、SDK 提示詞與工具呈現也一併切換為 Python。需要 POSIX 平台與 CPython ≥ 3.10（Windows 不支援），且與 workflow 工具互斥——官方 Python 組合同樣停用 workflow，因此開啟期間 workflow 側會強制關閉（你的 workflow 設定會保留，關閉後恢復）。需重新啟動 dsh 才生效；dsh-gitbash-shell 的卡片讀寫同一份狀態，任一側變更兩側同步。",
			},
			/* locale: zh-mo */
			"zh-mo": {
				"title": "PTC 創造模式",
				"cardDesc": "控制物化咗嘅 ptc-cordis preset 會唔會提供 workflow 工具",
				"wf.label": "workflow 工具",
				"wf.on": "提供（預設）",
				"wf.off": "唔提供",
				"error": "寫入失敗",
				"hint": "預設提供：創造模式保留 workflow，本 preset 繼承呢個能力（同 v0.7.0 及之前一樣）。官方 PTC 模式自 dsh 0.1.2-alpha.4 起預設唔提供（run_code 已經係唯一嘅模型編排面），想完全對齊官方就揀「唔提供」。一改就會即刻重新物化，新工作階段即時生效；已開啟嘅工作階段維持原狀。呢個開關需要 dsh ≥ 0.1.2。",
				"peer.label": "同 dsh-gitbash-shell 去重",
				"peer.on": "去重",
				"peer.off": "兩個都保留（預設）",
				"peer.hint": "同裝 dsh-gitbash-shell 嗰陣，佢仲會註冊一個「創造模式 · Git Bash」，同本 preset（聯動之後已經係 Git Bash 版）指向同一件事。開啟去重之後佢就唔會再註冊嗰一條；預設關閉，維持現狀。呢個開關就係 dsh-gitbash-shell 設定卡上嘅同一個開關——兩處共享同一份狀態，任一邊改動另一邊即刻同步。只會喺已安裝 dsh-gitbash-shell 嘅時候顯示。",
				"python.label": "run_code 後端",
				"python.on": "Python（實驗性）",
				"python.off": "Node / TypeScript（預設）",
				"python.hint": "預設關閉時 run_code 使用官方 Node/TypeScript 後端，與官方組合逐位元組一致；開啟後改用 dsh 實驗性 CPython 後端，run_code 的語言、SDK 提示詞與工具呈現亦會切換為 Python。需要 POSIX 平台與 CPython ≥ 3.10（Windows 不可用），並與 workflow 工具互斥——官方 Python 組合亦停用 workflow，故開啟期間 workflow 側強制關閉（你的 workflow 設定會保留，關閉後恢復）。需重新啟動 dsh 方生效；dsh-gitbash-shell 的卡片讀寫同一份狀態，任一側變更兩側即時同步。",
			},
			/* locale: ja */
			ja: {
				"title": "PTC 作成モード",
				"cardDesc": "実体化された ptc-cordis プリセットが workflow ツールを提供するかどうかを制御します",
				"wf.label": "workflow ツール",
				"wf.on": "提供する（既定）",
				"wf.off": "提供しない",
				"error": "書き込みに失敗しました",
				"hint": "既定では提供します。作成モードは workflow を保持しており、本プリセットはその能力を引き継ぎます（v0.7.0 以前と同じ挙動）。公式の PTC モードは dsh 0.1.2-alpha.4 以降これを提供しません（run_code がモデルの書く唯一のオーケストレーション面になったためです）。公式に完全に合わせるなら「提供しない」を選んでください。切り替えると即座に再実体化され、新しいセッションにはすぐ反映されます。すでに開いているセッションはそのままです。このスイッチには dsh ≥ 0.1.2 が必要です。",
				"peer.label": "dsh-gitbash-shell と重複を解消",
				"peer.on": "重複を解消",
				"peer.off": "両方を残す（既定）",
				"peer.hint": "dsh-gitbash-shell を併用していると、同プラグインは「作成モード · Git Bash」も登録します。これは本プリセット（連動後は Git Bash 版）と同じものを指します。重複を解消すると、その項目は登録されなくなります。既定では無効のまま、現状の挙動を維持します。このスイッチは dsh-gitbash-shell の設定カードにあるものと同一で、両者は一つの状態を共有するため、どちらかで変更すればもう一方にも即座に反映されます。dsh-gitbash-shell がインストールされているときだけ表示されます。",
				"python.label": "run_code バックエンド",
				"python.on": "Python（実験的）",
				"python.off": "Node / TypeScript（既定）",
				"python.hint": "既定のオフでは run_code は公式の Node/TypeScript バックエンドを使い、公式の構成とバイト単位で一致します。オンにすると dsh の実験的 CPython バックエンドに切り替わり、run_code の言語・生成される SDK プロンプト・ツール表示も Python に変わります。POSIX 環境と CPython ≥ 3.10 が必要で（Windows では利用不可）、workflow ツールとは排他です（公式の Python 構成も workflow を無効化しているため、オンの間は workflow 側が強制オフになります。workflow の設定値は保持され、オフに戻すと復元されます）。反映には dsh の再起動が必要です。dsh-gitbash-shell のカードは同じ状態を読み書きするため、どちらで変更しても両方に反映されます。",
			},
			/* locale: ko */
			ko: {
				"title": "PTC 크리에이션 모드",
				"cardDesc": "물질화된 ptc-cordis preset이 workflow 도구를 제공하는지 여부를 제어합니다",
				"wf.label": "workflow 도구",
				"wf.on": "제공(기본값)",
				"wf.off": "제공 안 함",
				"error": "쓰기 실패",
				"hint": "기본값은 제공입니다. 크리에이션 모드는 workflow를 유지하며 이 preset이 그 기능을 이어받습니다(v0.7.0 이전과 동일). 공식 PTC 모드는 dsh 0.1.2-alpha.4부터 이를 제공하지 않습니다(run_code가 이미 모델이 작성하는 유일한 오케스트레이션 표면이기 때문입니다). 공식 형태와 완전히 맞추려면 '제공 안 함'을 선택하세요. 전환하면 즉시 다시 물질화되어 새 세션에는 곧바로 반영되고, 이미 열려 있는 세션은 그대로 유지됩니다. 이 스위치에는 dsh ≥ 0.1.2가 필요합니다.",
				"peer.label": "dsh-gitbash-shell과 중복 제거",
				"peer.on": "중복 제거",
				"peer.off": "둘 다 유지(기본값)",
				"peer.hint": "dsh-gitbash-shell을 함께 설치하면 그 플러그인은 '크리에이션 모드 · Git Bash' 항목도 등록합니다. 이는 이 preset(연동 후에는 Git Bash 버전)과 같은 대상을 가리킵니다. 중복 제거를 켜면 그 항목을 더 이상 등록하지 않습니다. 기본값은 꺼짐이며 현재 동작을 그대로 유지합니다. 이 스위치는 dsh-gitbash-shell 설정 카드에 있는 것과 동일한 스위치로, 양쪽이 하나의 상태를 공유하므로 어느 쪽에서 바꾸든 다른 쪽에 즉시 반영됩니다. dsh-gitbash-shell이 설치되어 있을 때만 표시됩니다.",
				"python.label": "run_code 백엔드",
				"python.on": "Python(실험적)",
				"python.off": "Node / TypeScript(기본값)",
				"python.hint": "기본값인 꺼짐 상태에서 run_code는 공식 Node/TypeScript 백엔드를 사용하며 공식 구성과 바이트 단위로 동일합니다. 켜면 dsh의 실험적 CPython 백엔드로 바뀌고 run_code의 언어, 생성되는 SDK 프롬프트, 도구 표시도 Python으로 전환됩니다. POSIX 플랫폼과 CPython ≥ 3.10이 필요하며(Windows에서는 사용 불가), workflow 도구와 상호 배타적입니다(공식 Python 구성도 workflow를 비활성화하므로 켜져 있는 동안 workflow 쪽이 강제로 꺼집니다. workflow 설정값은 유지되고 끄면 복원됩니다). dsh를 재시작해야 적용됩니다. dsh-gitbash-shell의 카드는 같은 상태를 읽고 쓰므로 어느 쪽에서 바꾸든 양쪽에 반영됩니다.",
			},
			/* locale: de */
			de: {
				"title": "PTC-Kreativmodus",
				"cardDesc": "Steuert, ob das materialisierte ptc-cordis-Preset das workflow-Werkzeug bereitstellt",
				"wf.label": "workflow-Werkzeug",
				"wf.on": "Bereitstellen (Standard)",
				"wf.off": "Nicht bereitstellen",
				"error": "Schreiben fehlgeschlagen",
				"hint": "Standardmäßig aktiv: Der Kreativmodus behält workflow, und dieses Preset erbt diese Fähigkeit (Verhalten bis v0.7.0). Der offizielle PTC-Modus lässt es seit dsh 0.1.2-alpha.4 weg (run_code ist dort die einzige vom Modell verfasste Orchestrierungsfläche) – für die offizielle Form „Nicht bereitstellen“ wählen. Ein Umschalten materialisiert sofort neu; neue Sitzungen übernehmen es direkt, bereits geöffnete Sitzungen behalten ihre Zusammensetzung. Der Schalter erfordert dsh ≥ 0.1.2.",
				"peer.label": "Mit dsh-gitbash-shell deduplizieren",
				"peer.on": "Deduplizieren",
				"peer.off": "Beide behalten (Standard)",
				"peer.hint": "Ist dsh-gitbash-shell ebenfalls installiert, registriert es zusätzlich einen Eintrag „Kreativmodus · Git Bash“, der dasselbe abdeckt wie dieses Preset (in der Zusammenarbeit die Git-Bash-Fassung). Die Deduplizierung verhindert, dass dieser Eintrag registriert wird; standardmäßig ist sie aus, das heutige Verhalten bleibt also erhalten. Dieser Schalter ist derselbe wie auf der Einstellungskarte von dsh-gitbash-shell – beide Seiten teilen einen Zustand, eine Änderung auf einer Seite wirkt sofort auf der anderen. Er wird nur angezeigt, solange dsh-gitbash-shell installiert ist.",
				"python.label": "run_code-Backend",
				"python.on": "Python (experimentell)",
				"python.off": "Node / TypeScript (Standard)",
				"python.hint": "Im ausgeschalteten Standardzustand nutzt run_code das offizielle Node/TypeScript-Backend und entspricht byteweise der offiziellen Zusammensetzung; eingeschaltet wechselt es auf das experimentelle CPython-Backend von dsh, womit auch Sprache, generierter SDK-Prompt und Werkzeugdarstellung von run_code auf Python umstellen. Erforderlich sind eine POSIX-Plattform und CPython ≥ 3.10 (unter Windows nicht verfügbar); zudem ist der Schalter mit dem workflow-Werkzeug unvereinbar – die offizielle Python-Zusammensetzung deaktiviert workflow ebenfalls, daher bleibt die workflow-Seite währenddessen zwangsweise aus (der workflow-Wert bleibt erhalten und wird beim Ausschalten wiederhergestellt). Wirksam nach einem Neustart von dsh; die Karte von dsh-gitbash-shell liest und schreibt denselben Zustand, eine Änderung auf einer Seite wirkt auf beide.",
			},
			/* locale: fr */
			fr: {
				"title": "Mode Création PTC",
				"cardDesc": "Détermine si le preset ptc-cordis matérialisé fournit l'outil workflow",
				"wf.label": "outil workflow",
				"wf.on": "Fournir (par défaut)",
				"wf.off": "Ne pas fournir",
				"error": "Échec de l'écriture",
				"hint": "Fourni par défaut : le mode Création conserve workflow et ce preset hérite de cette capacité (comportement jusqu'à v0.7.0). Le mode PTC officiel l'omet depuis dsh 0.1.2-alpha.4 (run_code y est déjà la seule surface d'orchestration écrite par le modèle) — choisir « Ne pas fournir » pour coller à la forme officielle. Le basculement rematérialise immédiatement ; les nouvelles sessions en tiennent compte aussitôt, les sessions déjà ouvertes gardent leur composition. Ce réglage nécessite dsh ≥ 0.1.2.",
				"peer.label": "Dédoublonner avec dsh-gitbash-shell",
				"peer.on": "Dédoublonner",
				"peer.off": "Garder les deux (par défaut)",
				"peer.hint": "Lorsque dsh-gitbash-shell est installé, il enregistre aussi une entrée « mode Création · Git Bash », qui recouvre la même chose que ce preset (une version Git Bash une fois la coopération active). Le dédoublonnage l'empêche d'enregistrer cette entrée ; par défaut il est désactivé et le comportement actuel est conservé. Ce réglage est exactement le même que celui de la carte de réglages de dsh-gitbash-shell — les deux côtés partagent un seul état, donc une modification d'un côté se répercute immédiatement sur l'autre. Affiché uniquement lorsque dsh-gitbash-shell est installé.",
				"python.label": "backend run_code",
				"python.on": "Python (expérimental)",
				"python.off": "Node / TypeScript (par défaut)",
				"python.hint": "Désactivé (par défaut), run_code utilise le backend officiel Node/TypeScript, identique octet pour octet à la composition officielle ; activé, il passe au backend CPython expérimental de dsh, ce qui bascule aussi la langue, l'invite SDK générée et la présentation des outils de run_code vers Python. Il faut une plateforme POSIX et CPython ≥ 3.10 (indisponible sous Windows), et le réglage est incompatible avec l'outil workflow — la composition Python officielle désactive elle aussi workflow, donc le côté workflow est forcé à l'arrêt pendant ce temps (votre valeur workflow est conservée et restaurée à la désactivation). Prend effet après un redémarrage de dsh ; la carte de dsh-gitbash-shell lit et écrit le même état, toute modification d'un côté s'applique aux deux.",
			},
			/* locale: ru */
			ru: {
				"title": "Режим создания PTC",
				"cardDesc": "Управляет тем, предоставляет ли материализованный preset ptc-cordis инструмент workflow",
				"wf.label": "инструмент workflow",
				"wf.on": "Предоставлять (по умолчанию)",
				"wf.off": "Не предоставлять",
				"error": "Не удалось записать",
				"hint": "По умолчанию включено: режим создания сохраняет workflow, и этот preset наследует эту возможность (поведение вплоть до v0.7.0). Официальный режим PTC не предоставляет его начиная с dsh 0.1.2-alpha.4 (там run_code — единственная поверхность оркестрации, создаваемая моделью) — выберите «Не предоставлять», чтобы полностью совпасть с официальным вариантом. Переключение сразу запускает повторную материализацию: новые сессии получают изменение немедленно, а уже открытые сохраняют свою композицию. Переключатель требует dsh ≥ 0.1.2.",
				"peer.label": "Убрать дублирование с dsh-gitbash-shell",
				"peer.on": "Убрать дублирование",
				"peer.off": "Оставить оба (по умолчанию)",
				"peer.hint": "Если установлен dsh-gitbash-shell, он дополнительно регистрирует пункт «режим создания · Git Bash», который указывает на то же самое, что и этот preset (при активной связке — сборка на Git Bash). Устранение дублирования не даёт ему регистрировать этот пункт; по умолчанию оно выключено, и текущее поведение сохраняется. Этот переключатель — тот же самый, что и на карточке настроек dsh-gitbash-shell: обе стороны используют одно состояние, поэтому изменение с любой стороны сразу отражается на другой. Показывается только при установленном dsh-gitbash-shell.",
				"python.label": "бэкенд run_code",
				"python.on": "Python (экспериментальный)",
				"python.off": "Node / TypeScript (по умолчанию)",
				"python.hint": "В выключенном состоянии (по умолчанию) run_code использует официальный бэкенд Node/TypeScript и побайтно совпадает с официальной композицией; при включении выбирается экспериментальный бэкенд CPython от dsh, и язык, генерируемая подсказка SDK и представление инструментов run_code тоже переходят на Python. Требуются платформа POSIX и CPython ≥ 3.10 (в Windows недоступно), а также этот переключатель несовместим с инструментом workflow — официальная композиция Python тоже отключает workflow, поэтому на время его включения сторона workflow принудительно выключена (ваше значение workflow сохраняется и восстанавливается после выключения). Вступает в силу после перезапуска dsh; карточка dsh-gitbash-shell читает и записывает то же состояние, изменение с любой стороны применяется к обеим.",
			},
			/* locale: pt */
			pt: {
				"title": "Modo Criação PTC",
				"cardDesc": "Define se o preset ptc-cordis materializado fornece a ferramenta workflow",
				"wf.label": "ferramenta workflow",
				"wf.on": "Fornecer (padrão)",
				"wf.off": "Não fornecer",
				"error": "Falha ao gravar",
				"hint": "Padrão ativado: o modo Criação mantém o workflow e este preset herda esse recurso (comportamento até a v0.7.0). O modo PTC oficial omite isso desde o dsh 0.1.2-alpha.4 (run_code já é a única superfície de orquestração escrita pelo modelo) — escolha «Não fornecer» para acompanhar a forma oficial. A troca materializa de novo na hora; as novas sessões passam a valer imediatamente e as sessões já abertas mantêm sua composição. O interruptor exige dsh ≥ 0.1.2.",
				"peer.label": "Deduplicar com dsh-gitbash-shell",
				"peer.on": "Deduplicar",
				"peer.off": "Manter ambos (padrão)",
				"peer.hint": "Com o dsh-gitbash-shell instalado, ele também registra uma entrada «modo Criação · Git Bash», que cobre o mesmo terreno deste preset (uma versão Git Bash quando a cooperação está ativa). A deduplicação impede que ele registre essa entrada; por padrão ela fica desligada e o comportamento atual é mantido. Este interruptor é o mesmo da tela de configurações do dsh-gitbash-shell — os dois lados compartilham um único estado, então uma mudança em qualquer lado atualiza o outro na hora. Só aparece quando o dsh-gitbash-shell está instalado.",
				"python.label": "backend do run_code",
				"python.on": "Python (experimental)",
				"python.off": "Node / TypeScript (padrão)",
				"python.hint": "Desligado (padrão), o run_code usa o backend oficial Node/TypeScript, idêntico byte a byte à composição oficial; ligado, passa para o backend CPython experimental do dsh, o que também muda a linguagem, o prompt de SDK gerado e a apresentação de ferramentas do run_code para Python. Exige plataforma POSIX e CPython ≥ 3.10 (indisponível no Windows) e é incompatível com a ferramenta workflow — a composição Python oficial também desativa o workflow, então o lado workflow fica forçadamente desligado enquanto isto estiver ligado (o seu valor de workflow é mantido e restaurado ao desligar). Passa a valer após reiniciar o dsh; o cartão do dsh-gitbash-shell lê e grava o mesmo estado, alterações de qualquer lado aplicam-se aos dois.",
			},
			/* locale: it */
			it: {
				"title": "Modalità Creazione PTC",
				"cardDesc": "Stabilisce se il preset ptc-cordis materializzato fornisce lo strumento workflow",
				"wf.label": "strumento workflow",
				"wf.on": "Fornisci (predefinito)",
				"wf.off": "Non fornire",
				"error": "Scrittura non riuscita",
				"hint": "Predefinito attivo: la modalità Creazione mantiene workflow e questo preset ne eredita la capacità (comportamento fino alla v0.7.0). La modalità PTC ufficiale lo omette da dsh 0.1.2-alpha.4 (run_code è già l'unica superficie di orchestrazione scritta dal modello): per allinearsi alla forma ufficiale scegliere «Non fornire». Il cambio rimaterializza subito; le nuove sessioni lo recepiscono immediatamente, quelle già aperte mantengono la loro composizione. L'interruttore richiede dsh ≥ 0.1.2.",
				"peer.label": "Deduplica con dsh-gitbash-shell",
				"peer.on": "Deduplica",
				"peer.off": "Mantieni entrambi (predefinito)",
				"peer.hint": "Con dsh-gitbash-shell installato, anche quest'ultimo registra una voce «modalità Creazione · Git Bash», che copre lo stesso terreno di questo preset (una versione Git Bash quando la cooperazione è attiva). La deduplicazione gli impedisce di registrare quella voce; per impostazione predefinita è disattivata e il comportamento attuale resta invariato. Questo interruttore è lo stesso presente nella scheda delle impostazioni di dsh-gitbash-shell: i due lati condividono un unico stato, quindi una modifica su un lato si riflette subito sull'altro. Viene mostrato solo se dsh-gitbash-shell è installato.",
				"python.label": "backend run_code",
				"python.on": "Python (sperimentale)",
				"python.off": "Node / TypeScript (predefinito)",
				"python.hint": "Spento (predefinito), run_code usa il backend ufficiale Node/TypeScript, identico byte per byte alla composizione ufficiale; acceso passa al backend CPython sperimentale di dsh, che sposta in Python anche linguaggio, prompt SDK generato e presentazione degli strumenti di run_code. Richiede piattaforma POSIX e CPython ≥ 3.10 (non disponibile su Windows) ed è incompatibile con lo strumento workflow: la composizione Python ufficiale disattiva anch'essa workflow, quindi il lato workflow resta forzatamente spento finché è attivo (il valore di workflow viene conservato e ripristinato allo spegnimento). Ha effetto dopo il riavvio di dsh; la scheda di dsh-gitbash-shell legge e scrive lo stesso stato, una modifica su un lato vale per entrambi.",
			},
			/* locale: nl */
			nl: {
				"title": "PTC-creatiemodus",
				"cardDesc": "Bepaalt of de gematerialiseerde ptc-cordis-preset de workflow-tool aanbiedt",
				"wf.label": "workflow-tool",
				"wf.on": "Aanbieden (standaard)",
				"wf.off": "Niet aanbieden",
				"error": "Schrijven mislukt",
				"hint": "Standaard aan: de creatiemodus behoudt workflow en deze preset erft die mogelijkheid (gedrag tot en met v0.7.0). De officiële PTC-modus laat het sinds dsh 0.1.2-alpha.4 weg (run_code is daar het enige door het model geschreven orkestratieoppervlak) — kies 'Niet aanbieden' om de officiële vorm te volgen. Omschakelen materialiseert direct opnieuw; nieuwe sessies pakken het meteen op, al geopende sessies behouden hun samenstelling. De schakelaar vereist dsh ≥ 0.1.2.",
				"peer.label": "Dedupliceren met dsh-gitbash-shell",
				"peer.on": "Dedupliceren",
				"peer.off": "Beide behouden (standaard)",
				"peer.hint": "Als dsh-gitbash-shell ook is geïnstalleerd, registreert die ook een item 'creatiemodus · Git Bash', dat hetzelfde dekt als deze preset (na de samenwerking een Git Bash-variant). Deduplicatie voorkomt dat dat item wordt geregistreerd; standaard staat dit uit en blijft het huidige gedrag behouden. Deze schakelaar is dezelfde als op de instellingenkaart van dsh-gitbash-shell — beide kanten delen één status, dus een wijziging aan één kant werkt direct door aan de andere. Alleen zichtbaar zolang dsh-gitbash-shell is geïnstalleerd.",
				"python.label": "run_code-backend",
				"python.on": "Python (experimenteel)",
				"python.off": "Node / TypeScript (standaard)",
				"python.hint": "Uit (standaard) gebruikt run_code de officiële Node/TypeScript-backend, byte voor byte gelijk aan de officiële samenstelling; aan schakelt over op de experimentele CPython-backend van dsh, waardoor ook de taal, de gegenereerde SDK-prompt en de weergave van de hulpmiddelen van run_code naar Python gaan. Vereist een POSIX-platform en CPython ≥ 3.10 (niet beschikbaar op Windows) en is onverenigbaar met de workflow-tool — de officiële Python-samenstelling schakelt workflow eveneens uit, dus de workflow-kant staat geforceerd uit zolang dit aan staat (je workflow-waarde blijft bewaard en wordt hersteld als je het uitzet). Geldt na het herstarten van dsh; de kaart van dsh-gitbash-shell leest en schrijft dezelfde status, een wijziging aan één kant geldt voor beide.",
			},
			/* locale: pl */
			pl: {
				"title": "Tryb tworzenia PTC",
				"cardDesc": "Określa, czy zmaterializowany preset ptc-cordis udostępnia narzędzie workflow",
				"wf.label": "narzędzie workflow",
				"wf.on": "Udostępniaj (domyślnie)",
				"wf.off": "Nie udostępniaj",
				"error": "Zapis nie powiódł się",
				"hint": "Domyślnie włączone: tryb tworzenia zachowuje workflow, a ten preset dziedziczy tę możliwość (zachowanie do v0.7.0). Oficjalny tryb PTC pomija je od dsh 0.1.2-alpha.4 (run_code jest tam jedyną powierzchnią orkiestracji tworzoną przez model) — wybierz „Nie udostępniaj”, aby w pełni dopasować się do oficjalnego kształtu. Przełączenie natychmiast materializuje preset ponownie; nowe sesje działają od razu, a już otwarte sesje zachowują swój skład. Przełącznik wymaga dsh ≥ 0.1.2.",
				"peer.label": "Deduplikacja z dsh-gitbash-shell",
				"peer.on": "Deduplikuj",
				"peer.off": "Zachowaj oba (domyślnie)",
				"peer.hint": "Gdy dsh-gitbash-shell jest również zainstalowany, rejestruje on dodatkowo pozycję „tryb tworzenia · Git Bash”, która pokrywa się z tym presetem (po włączeniu współpracy w wersji Git Bash). Deduplikacja powstrzymuje go przed rejestrowaniem tej pozycji; domyślnie jest wyłączona i zachowuje obecne zachowanie. Ten przełącznik to ten sam przełącznik co na karcie ustawień dsh-gitbash-shell — obie strony współdzielą jeden stan, więc zmiana po jednej stronie natychmiast aktualizuje drugą. Widoczny tylko wtedy, gdy dsh-gitbash-shell jest zainstalowany.",
				"python.label": "backend run_code",
				"python.on": "Python (eksperymentalny)",
				"python.off": "Node / TypeScript (domyślnie)",
				"python.hint": "Wyłączone (domyślnie) oznacza, że run_code korzysta z oficjalnego backendu Node/TypeScript, zgodnego bajt w bajt z oficjalną kompozycją; włączenie przełącza na eksperymentalny backend CPython z dsh, co przenosi też język, generowany prompt SDK i prezentację narzędzi run_code na Pythona. Wymaga platformy POSIX i CPython ≥ 3.10 (niedostępne w Windows) i wyklucza się z narzędziem workflow — oficjalna kompozycja Pythona również wyłącza workflow, więc strona workflow jest wymuszenie wyłączona, dopóki to jest włączone (Twoje ustawienie workflow jest zachowane i przywracane po wyłączeniu). Działa po ponownym uruchomieniu dsh; karta dsh-gitbash-shell czyta i zapisuje ten sam stan, zmiana po dowolnej stronie obowiązuje obie.",
			},
			/* locale: sv */
			sv: {
				"title": "PTC-skaparläge",
				"cardDesc": "Styr om den materialiserade ptc-cordis-preseten tillhandahåller workflow-verktyget",
				"wf.label": "workflow-verktyget",
				"wf.on": "Tillhandahåll (standard)",
				"wf.off": "Tillhandahåll inte",
				"error": "Skrivning misslyckades",
				"hint": "På som standard: skaparläget behåller workflow och den här preseten ärver den förmågan (beteendet fram till v0.7.0). Det officiella PTC-läget utelämnar det sedan dsh 0.1.2-alpha.4 (där run_code är den enda orkestreringsyta som modellen skriver) — välj ”Tillhandahåll inte” för att matcha det officiella utförandet. En växling materialiserar omedelbart om; nya sessioner får det direkt, medan redan öppna sessioner behåller sin sammansättning. Växeln kräver dsh ≥ 0.1.2.",
				"peer.label": "Deduplicera mot dsh-gitbash-shell",
				"peer.on": "Deduplicera",
				"peer.off": "Behåll båda (standard)",
				"peer.hint": "Om dsh-gitbash-shell också är installerat registrerar det dessutom en post ”skaparläget · Git Bash”, som täcker samma sak som den här preseten (en Git Bash-variant när samverkan är aktiv). Dedupliceringen hindrar det från att registrera den posten; som standard är den av och dagens beteende behålls. Den här växeln är samma växel som på dsh-gitbash-shells inställningskort — båda sidor delar ett enda tillstånd, så en ändring på ena sidan slår igenom direkt på den andra. Visas bara när dsh-gitbash-shell är installerat.",
				"python.label": "run_code-backend",
				"python.on": "Python (experimentell)",
				"python.off": "Node / TypeScript (standard)",
				"python.hint": "Avstängt (standard) använder run_code den officiella Node/TypeScript-backenden, byte för byte identisk med den officiella kompositionen; på slår den om till dsh:s experimentella CPython-backend, vilket även flyttar run_codes språk, genererade SDK-prompt och verktygspresentation till Python. Kräver POSIX-plattform och CPython ≥ 3.10 (ej tillgängligt i Windows) och är oförenligt med workflow-verktyget — den officiella Python-kompositionen stänger också av workflow, så workflow-sidan hålls tvångsavstängd medan detta är på (ditt workflow-värde behålls och återställs när du stänger av). Gäller efter omstart av dsh; dsh-gitbash-shells kort läser och skriver samma tillstånd, en ändring på ena sidan gäller båda.",
			},
			/* locale: tr */
			tr: {
				"title": "PTC Oluşturma modu",
				"cardDesc": "Maddileştirilen ptc-cordis presetinin workflow aracını sağlayıp sağlamayacağını belirler",
				"wf.label": "workflow aracı",
				"wf.on": "Sağla (varsayılan)",
				"wf.off": "Sağlama",
				"error": "Yazma başarısız",
				"hint": "Varsayılan olarak açık: Oluşturma modu workflow'u korur ve bu preset söz konusu yeteneği devralır (v0.7.0 ve öncesindeki davranış). Resmî PTC modu bunu dsh 0.1.2-alpha.4 sürümünden beri sağlamaz (run_code artık model tarafından yazılan tek orkestrasyon yüzeyidir) — resmî yapıya tam olarak uymak için «Sağlama» seçeneğini seçin. Anahtar değiştirildiğinde preset anında yeniden maddileştirilir; yeni oturumlar bunu hemen alır, açık oturumlar mevcut bileşimini korur. Bu anahtar dsh ≥ 0.1.2 gerektirir.",
				"peer.label": "dsh-gitbash-shell ile yinelenenleri kaldırma",
				"peer.on": "Yinelenenleri kaldır",
				"peer.off": "İkisini de koru (varsayılan)",
				"peer.hint": "dsh-gitbash-shell de kuruluysa «Oluşturma modu · Git Bash» adlı bir kayıt daha ekler; bu kayıt bu preset ile aynı şeyi kapsar (işbirliği etkinken Git Bash sürümü). Yinelenenleri kaldırma, o kaydı eklemesini engeller; varsayılan olarak kapalıdır ve mevcut davranış korunur. Bu anahtar, dsh-gitbash-shell ayar kartındaki anahtarın aynısıdır — iki taraf tek bir durumu paylaşır, dolayısıyla bir taraftaki değişiklik diğerine anında yansır. Yalnızca dsh-gitbash-shell kurulu olduğunda gösterilir.",
				"python.label": "run_code arka ucu",
				"python.on": "Python (deneysel)",
				"python.off": "Node / TypeScript (varsayılan)",
				"python.hint": "Kapalıyken (varsayılan) run_code resmî Node/TypeScript arka ucunu kullanır ve resmî bileşimle bayt bayt aynıdır; açıldığında dsh'nin deneysel CPython arka ucuna geçer ve run_code'un dili, üretilen SDK istemi ve araç sunumu da Python'a döner. POSIX platformu ve CPython ≥ 3.10 gerektirir (Windows'ta kullanılamaz) ve workflow aracıyla birbirini dışlar — resmî Python bileşimi de workflow'u devre dışı bırakır, bu nedenle bu açıkken workflow tarafı zorunlu olarak kapalıdır (workflow ayarınız korunur ve kapatınca geri gelir). dsh yeniden başlatıldıktan sonra geçerli olur; dsh-gitbash-shell kartı aynı durumu okur ve yazar, bir taraftaki değişiklik ikisine de uygulanır.",
			},
			/* locale: id */
			id: {
				"title": "Mode Kreasi PTC",
				"cardDesc": "Menentukan apakah preset ptc-cordis yang dimaterialisasi menyediakan alat workflow",
				"wf.label": "alat workflow",
				"wf.on": "Sediakan (bawaan)",
				"wf.off": "Jangan sediakan",
				"error": "Gagal menulis",
				"hint": "Aktif secara bawaan: mode Kreasi mempertahankan workflow dan preset ini mewarisi kemampuan tersebut (perilaku hingga v0.7.0). Mode PTC resmi menghilangkannya sejak dsh 0.1.2-alpha.4 (run_code sudah menjadi satu-satunya permukaan orkestrasi yang ditulis model) — pilih «Jangan sediakan» untuk sepenuhnya mengikuti bentuk resmi. Mengubahnya langsung mematerialisasi ulang; sesi baru langsung menerapkannya, sesi yang sudah terbuka mempertahankan komposisinya. Tombol ini memerlukan dsh ≥ 0.1.2.",
				"peer.label": "Hilangkan duplikasi dengan dsh-gitbash-shell",
				"peer.on": "Hilangkan duplikasi",
				"peer.off": "Pertahankan keduanya (bawaan)",
				"peer.hint": "Jika dsh-gitbash-shell juga terpasang, plugin itu turut mendaftarkan entri «mode Kreasi · Git Bash» yang mencakup hal yang sama dengan preset ini (versi Git Bash saat kerja sama aktif). Menghilangkan duplikasi membuatnya tidak lagi mendaftarkan entri tersebut; secara bawaan opsi ini nonaktif dan perilaku saat ini dipertahankan. Tombol ini adalah tombol yang sama dengan yang ada di kartu pengaturan dsh-gitbash-shell — kedua sisi berbagi satu status, sehingga perubahan di salah satu sisi langsung tersinkron ke sisi lain. Hanya ditampilkan saat dsh-gitbash-shell terpasang.",
				"python.label": "backend run_code",
				"python.on": "Python (eksperimental)",
				"python.off": "Node / TypeScript (bawaan)",
				"python.hint": "Saat mati (bawaan), run_code memakai backend Node/TypeScript resmi, identik byte demi byte dengan komposisi resmi; saat dinyalakan, beralih ke backend CPython eksperimental dsh, yang juga memindahkan bahasa, prompt SDK yang dihasilkan, dan penyajian alat run_code ke Python. Memerlukan platform POSIX dan CPython ≥ 3.10 (tidak tersedia di Windows) serta saling eksklusif dengan alat workflow — komposisi Python resmi juga menonaktifkan workflow, jadi sisi workflow dipaksa mati selama ini menyala (nilai workflow Anda dipertahankan dan dipulihkan saat dimatikan). Berlaku setelah dsh dimulai ulang; kartu dsh-gitbash-shell membaca dan menulis status yang sama, perubahan di satu sisi berlaku untuk keduanya.",
			},
			/* locale: vi */
			vi: {
				"title": "Chế độ Sáng tạo PTC",
				"cardDesc": "Cho biết preset ptc-cordis được khởi tạo có cung cấp công cụ workflow hay không",
				"wf.label": "công cụ workflow",
				"wf.on": "Cung cấp (mặc định)",
				"wf.off": "Không cung cấp",
				"error": "Ghi thất bại",
				"hint": "Mặc định bật: chế độ Sáng tạo giữ workflow và preset này kế thừa khả năng đó (hành vi đến hết v0.7.0). Chế độ PTC chính thức bỏ nó kể từ dsh 0.1.2-alpha.4 (run_code đã là bề mặt điều phối duy nhất do mô hình viết) — chọn «Không cung cấp» để khớp hoàn toàn với hình dạng chính thức. Khi gạt công tắc, preset được khởi tạo lại ngay; phiên mới nhận hiệu lực tức thì, còn phiên đang mở giữ nguyên thành phần của chúng. Công tắc này cần dsh ≥ 0.1.2.",
				"peer.label": "Loại bỏ trùng lặp với dsh-gitbash-shell",
				"peer.on": "Loại bỏ trùng lặp",
				"peer.off": "Giữ cả hai (mặc định)",
				"peer.hint": "Khi cài kèm dsh-gitbash-shell, plugin này còn đăng ký thêm một mục «chế độ Sáng tạo · Git Bash», vốn bao trùm cùng nội dung với preset này (bản Git Bash khi đã bật phối hợp). Bật loại bỏ trùng lặp thì nó không đăng ký mục đó nữa; mặc định là tắt, giữ nguyên hành vi hiện tại. Công tắc này chính là công tắc trên thẻ cài đặt của dsh-gitbash-shell — hai bên dùng chung một trạng thái, nên thay đổi ở bên nào cũng đồng bộ ngay sang bên kia. Chỉ hiển thị khi đã cài dsh-gitbash-shell.",
				"python.label": "backend run_code",
				"python.on": "Python (thử nghiệm)",
				"python.off": "Node / TypeScript (mặc định)",
				"python.hint": "Khi tắt (mặc định), run_code dùng backend Node/TypeScript chính thức, giống từng byte với tổ hợp chính thức; khi bật, nó chuyển sang backend CPython thử nghiệm của dsh, đồng thời đưa ngôn ngữ, lời nhắc SDK được tạo và cách trình bày công cụ của run_code sang Python. Cần nền tảng POSIX và CPython ≥ 3.10 (không khả dụng trên Windows) và loại trừ lẫn nhau với công cụ workflow — tổ hợp Python chính thức cũng tắt workflow, nên phía workflow bị buộc tắt trong thời gian này (giá trị workflow của bạn được giữ lại và khôi phục khi tắt). Có hiệu lực sau khi khởi động lại dsh; thẻ của dsh-gitbash-shell đọc và ghi cùng một trạng thái, thay đổi ở một bên áp dụng cho cả hai.",
			},
			/* locale: ar */
			ar: {
				"title": "وضع الإنشاء PTC",
				"cardDesc": "يتحكم في ما إذا كان الإعداد المسبق ptc-cordis المُنشأ يوفّر أداة workflow",
				"wf.label": "أداة workflow",
				"wf.on": "توفير (افتراضي)",
				"wf.off": "عدم التوفير",
				"error": "فشل الكتابة",
				"hint": "مُفعّل افتراضيًا: يحتفظ وضع الإنشاء بـ workflow، ويرث هذا الإعداد المسبق تلك الإمكانية (السلوك حتى v0.7.0). أما وضع PTC الرسمي فيحذفه منذ dsh 0.1.2-alpha.4 (إذ أصبح run_code سطح التنسيق الوحيد الذي يكتبه النموذج) — اختر «عدم التوفير» لمطابقة الشكل الرسمي تمامًا. عند التبديل يُعاد إنشاء الإعداد المسبق فورًا؛ تلتقط الجلسات الجديدة التغيير مباشرة، بينما تحتفظ الجلسات المفتوحة بتركيبتها. يتطلب هذا المفتاح dsh ≥ 0.1.2.",
				"peer.label": "إزالة التكرار مع dsh-gitbash-shell",
				"peer.on": "إزالة التكرار",
				"peer.off": "الإبقاء على الاثنين (افتراضي)",
				"peer.hint": "عند تثبيت dsh-gitbash-shell معه، يسجّل هذا الأخير أيضًا مدخلًا «وضع الإنشاء · Git Bash» يغطي الشيء نفسه الذي يغطيه هذا الإعداد المسبق (نسخة Git Bash عند تفعيل التعاون). تفعيل إزالة التكرار يمنعه من تسجيل ذلك المدخل؛ وهو معطّل افتراضيًا للحفاظ على السلوك الحالي. هذا المفتاح هو نفسه الموجود في بطاقة إعدادات dsh-gitbash-shell — الجانبان يتشاركان الحالة نفسها، فأي تغيير في أحدهما ينعكس فورًا على الآخر. لا يظهر إلا عند تثبيت dsh-gitbash-shell.",
				"python.label": "خلفية run_code",
				"python.on": "Python (تجريبي)",
				"python.off": "Node / TypeScript (افتراضي)",
				"python.hint": "عند الإيقاف (الافتراضي) يستخدم run_code خلفية Node/TypeScript الرسمية، مطابقة بايت ببايت للتكوين الرسمي؛ وعند التشغيل ينتقل إلى خلفية CPython التجريبية من dsh، ما ينقل أيضًا لغة run_code ومطالبة SDK المولّدة وعرض الأدوات إلى Python. يتطلب منصة POSIX وCPython ≥ 3.10 (غير متاح على Windows)، وهو متعارض مع أداة workflow — فالتكوين الرسمي لـ Python يعطّل workflow أيضًا، لذا يبقى جانب workflow مُعطَّلًا قسرًا أثناء تشغيله (تُحفظ قيمة workflow لديك وتُستعاد عند الإيقاف). يسري بعد إعادة تشغيل dsh؛ بطاقة dsh-gitbash-shell تقرأ وتكتب الحالة نفسها، فأي تغيير من أي جانب يسري على الجانبين.",
			},
			/* locale: hi */
			hi: {
				"title": "PTC क्रिएशन मोड",
				"cardDesc": "नियंत्रित करता है कि मटीरियलाइज़ किया गया ptc-cordis preset workflow टूल देता है या नहीं",
				"wf.label": "workflow टूल",
				"wf.on": "दें (डिफ़ॉल्ट)",
				"wf.off": "न दें",
				"error": "लिखना विफल रहा",
				"hint": "डिफ़ॉल्ट रूप से चालू: क्रिएशन मोड workflow बनाए रखता है और यह preset वही क्षमता विरासत में लेता है (v0.7.0 तक का व्यवहार)। आधिकारिक PTC मोड इसे dsh 0.1.2-alpha.4 से छोड़ देता है (वहाँ run_code ही मॉडल द्वारा लिखी जाने वाली एकमात्र ऑर्केस्ट्रेशन सतह है) — आधिकारिक स्वरूप से पूरी तरह मेल खाने के लिए «न दें» चुनें। टॉगल करते ही preset फिर से मटीरियलाइज़ हो जाता है; नए सत्र इसे तुरंत ले लेते हैं, पहले से खुले सत्र अपनी संरचना बनाए रखते हैं। इस स्विच के लिए dsh ≥ 0.1.2 आवश्यक है।",
				"peer.label": "dsh-gitbash-shell के साथ डुप्लीकेट हटाएँ",
				"peer.on": "डुप्लीकेट हटाएँ",
				"peer.off": "दोनों रखें (डिफ़ॉल्ट)",
				"peer.hint": "dsh-gitbash-shell भी इंस्टॉल होने पर वह एक और प्रविष्टि «क्रिएशन मोड · Git Bash» रजिस्टर करता है, जो इस preset के समान ही चीज़ को कवर करती है (सहयोग सक्रिय होने पर Git Bash संस्करण)। डुप्लीकेट हटाने पर वह यह प्रविष्टि रजिस्टर नहीं करता; डिफ़ॉल्ट रूप से यह बंद रहता है और मौजूदा व्यवहार बना रहता है। यह स्विच dsh-gitbash-shell के सेटिंग कार्ड वाला ही स्विच है — दोनों तरफ़ एक ही स्थिति साझा होती है, इसलिए किसी एक तरफ़ बदलाव दूसरी तरफ़ तुरंत दिखता है। यह केवल तभी दिखता है जब dsh-gitbash-shell इंस्टॉल हो।",
				"python.label": "run_code बैकएंड",
				"python.on": "Python (प्रयोगात्मक)",
				"python.off": "Node / TypeScript (डिफ़ॉल्ट)",
				"python.hint": "बंद (डिफ़ॉल्ट) रहने पर run_code आधिकारिक Node/TypeScript बैकएंड इस्तेमाल करता है, जो आधिकारिक संरचना से बाइट-दर-बाइट मेल खाता है; चालू करने पर यह dsh के प्रयोगात्मक CPython बैकएंड पर चला जाता है, जिससे run_code की भाषा, बनाया गया SDK प्रॉम्प्ट और टूल प्रस्तुति भी Python पर चली जाती है। इसके लिए POSIX प्लेटफ़ॉर्म और CPython ≥ 3.10 चाहिए (Windows पर उपलब्ध नहीं) और यह workflow टूल के साथ परस्पर अनन्य है — आधिकारिक Python संरचना भी workflow को बंद कर देती है, इसलिए चालू रहने के दौरान workflow पक्ष ज़बरदस्ती बंद रहता है (आपकी workflow सेटिंग सुरक्षित रहती है और बंद करने पर बहाल हो जाती है)। dsh को फिर से शुरू करने पर लागू होता है; dsh-gitbash-shell का कार्ड वही स्थिति पढ़ता और लिखता है, किसी भी ओर का बदलाव दोनों पर लागू होता है।",
			},
			/* locale: th */
			th: {
				"title": "โหมดสร้างสรรค์ PTC",
				"cardDesc": "ควบคุมว่า preset ptc-cordis ที่สร้างขึ้นจะให้เครื่องมือ workflow หรือไม่",
				"wf.label": "เครื่องมือ workflow",
				"wf.on": "ให้ (ค่าเริ่มต้น)",
				"wf.off": "ไม่ให้",
				"error": "เขียนไม่สำเร็จ",
				"hint": "ค่าเริ่มต้นคือให้: โหมดสร้างสรรค์เก็บ workflow ไว้ และ preset นี้สืบทอดความสามารถนั้น (พฤติกรรมถึง v0.7.0) โหมด PTC อย่างเป็นทางการไม่ให้ตั้งแต่ dsh 0.1.2-alpha.4 (run_code เป็นพื้นผิวการจัดลำดับเดียวที่โมเดลเขียนแล้ว) — เลือก 'ไม่ให้' เพื่อให้ตรงกับรูปแบบทางการทั้งหมด การสลับจะสร้าง preset ใหม่ทันที เซสชันใหม่เห็นผลทันที ส่วนเซสชันที่เปิดอยู่จะคงองค์ประกอบเดิมไว้ สวิตช์นี้ต้องใช้ dsh ≥ 0.1.2",
				"peer.label": "ตัดรายการซ้ำกับ dsh-gitbash-shell",
				"peer.on": "ตัดรายการซ้ำ",
				"peer.off": "เก็บทั้งสองไว้ (ค่าเริ่มต้น)",
				"peer.hint": "เมื่อติดตั้ง dsh-gitbash-shell ไว้ด้วย ปลั๊กอินนั้นจะลงทะเบียนรายการ 'โหมดสร้างสรรค์ · Git Bash' เพิ่มอีกหนึ่งรายการ ซึ่งครอบคลุมสิ่งเดียวกันกับ preset นี้ (เวอร์ชัน Git Bash เมื่อเปิดการทำงานร่วมกัน) การตัดรายการซ้ำจะทำให้ไม่ลงทะเบียนรายการนั้น ส่วนค่าเริ่มต้นคือปิดไว้และคงพฤติกรรมเดิมไว้ สวิตช์นี้เป็นสวิตช์เดียวกันกับที่อยู่บนการ์ดตั้งค่าของ dsh-gitbash-shell — ทั้งสองฝั่งใช้สถานะร่วมกัน ดังนั้นการเปลี่ยนที่ฝั่งใดฝั่งหนึ่งจะซิงก์ไปอีกฝั่งทันที จะแสดงเฉพาะเมื่อติดตั้ง dsh-gitbash-shell แล้วเท่านั้น",
				"python.label": "แบ็กเอนด์ run_code",
				"python.on": "Python (ทดลอง)",
				"python.off": "Node / TypeScript (ค่าเริ่มต้น)",
				"python.hint": "เมื่อปิด (ค่าเริ่มต้น) run_code จะใช้แบ็กเอนด์ Node/TypeScript อย่างเป็นทางการ ซึ่งเหมือนกับการประกอบทางการทุกไบต์ เมื่อเปิดจะเปลี่ยนไปใช้แบ็กเอนด์ CPython ทดลองของ dsh ซึ่งย้ายภาษา พรอมป์ต์ SDK ที่สร้างขึ้น และการนำเสนอเครื่องมือของ run_code ไปเป็น Python ด้วย ต้องใช้แพลตฟอร์ม POSIX และ CPython ≥ 3.10 (ใช้ไม่ได้บน Windows) และขัดแย้งกับเครื่องมือ workflow — การประกอบ Python อย่างเป็นทางการก็ปิด workflow เช่นกัน ดังนั้นฝั่ง workflow จะถูกบังคับปิดขณะที่เปิดอยู่ (ค่าตั้ง workflow ของคุณยังคงอยู่และจะกลับมาเมื่อปิด) มีผลหลังรีสตาร์ต dsh การ์ดของ dsh-gitbash-shell อ่านและเขียนสถานะเดียวกัน การเปลี่ยนฝั่งใดมีผลทั้งสองฝั่ง",
			},
		};

		/** Own-property probe: a dictionary must never answer from Object.prototype. */
		function hasOwnKey(bag, key) {
			return Object.prototype.hasOwnProperty.call(bag, key);
		}

		/* Resolve one locale tag against what this plugin ships: the exact tag, then
		   the primary subtag, then English. Chinese is special-cased because the
		   traditional variants are shipped while a bare zh-hant-* is not spelled out. */
		function dictionaryFor(active) {
			var raw = active === undefined || active === null || active === "" ? "en" : String(active);
			var tag = raw.toLowerCase().replace(/_/g, "-");
			var primary = tag.split("-")[0];
			if (primary === "zh") {
				if (hasOwnKey(LOCALES, tag)) return LOCALES[tag];
				if (tag.indexOf("hant") >= 0 || tag === "zh-hk" || tag === "zh-mo" || tag === "zh-tw") {
					return hasOwnKey(LOCALES, "zh-hk") ? LOCALES["zh-hk"] : zh;
				}
				return zh;
			}
			if (hasOwnKey(LOCALES, primary)) return LOCALES[primary];
			return en;
		}

		/* The active locale tag, read fresh every time: DSH's language preference
		   switches live (the host-backed preference wins over the browser), so a value
		   captured once at activation would keep answering in the language that
		   happened to be active when this bundle loaded. */
		function activeLocaleOf(ctx) {
			var active = "";
			try {
				var locale = ctx.get("locale");
				if (locale !== undefined && typeof locale.getSnapshot === "function") {
					var snapshot = locale.getSnapshot();
					if (snapshot !== null && typeof snapshot === "object" && typeof snapshot.active === "string") active = snapshot.active;
				}
			} catch (error) { /* fall back to the browser language below */ }
			if (active === "" && typeof navigator === "object" && navigator !== null && typeof navigator.language === "string") active = navigator.language;
			return active;
		}

		/* A live lookup: the dictionary is picked per call and cached under the tag it
		   was picked for, so a language switch costs one string compare per string.
		   Falling back to en — kept key-complete on purpose — means an unsupported
		   language reads English, never a raw key. */
		function translatorOf(ctx) {
			var cachedTag = null;
			var cachedDict = null;
			return function (key) {
				var tag = activeLocaleOf(ctx);
				if (tag !== cachedTag) {
					cachedTag = tag;
					cachedDict = dictionaryFor(tag);
				}
				if (hasOwnKey(cachedDict, key)) return cachedDict[key];
				return hasOwnKey(en, key) ? en[key] : key;
			};
		}

		// ── styles (pc- prefixed; tokens mirror PluginCard.module.css) ──────────

		var STYLE_ID = "dsh-ptc-cordis-preset-style";

		var CSS = [
			".pc-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}",
			".pc-pageCard{max-width:640px}",
			".pc-headerFlat{cursor:default}",
			".pc-pageBody{display:flex;flex-direction:column;gap:12px;padding:0 0 8px}",
			".pc-card:hover{border-color:var(--dsw-alias-label-dimmed)}",
			".pc-card.pc-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}",
			".pc-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}",
			".pc-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
			".pc-headText{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}",
			".pc-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}",
			".pc-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
			".pc-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}",
			".pc-chevron.pc-chevronOpen{transform:rotate(180deg)}",
			".pc-body{display:flex;flex-direction:column;gap:12px;padding:4px 16px 16px;max-width:640px}",
			".pc-row{display:flex;align-items:baseline;gap:8px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}",
			".pc-rowLabel{flex:none;color:var(--dsw-alias-label-tertiary)}",
			".pc-seg{display:flex;gap:8px;flex-wrap:wrap}",
			".pc-segBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:6px 12px;cursor:pointer;transition:border-color .16s,color .16s}",
			".pc-segBtn:hover{border-color:var(--dsw-alias-label-dimmed)}",
			".pc-segBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
			".pc-segBtn.pc-segActive{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}",
			".pc-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}",
			".pc-error{margin:0;font-size:12px;color:var(--dsw-alias-status-danger, #e5484d)}",
		].join("\n");

		function ensureStyles() {
			try {
				if (typeof document === "undefined" || typeof document.getElementById !== "function") return function () {};
				if (document.getElementById(STYLE_ID)) return function () {};
				var style = document.createElement("style");
				style.id = STYLE_ID;
				style.textContent = CSS;
				document.head.appendChild(style);
				return function () {
					try {
						if (style.parentNode) style.parentNode.removeChild(style);
					} catch (error) { /* best effort */ }
				};
			} catch (error) {
				return function () {};
			}
		}

		/** Defensive primitives lookup: an unknown icon name degrades to a text chevron. */
		function icon(name) {
			try {
				var component = ui && ui[name];
				return typeof component === "function" ? component : null;
			} catch (error) {
				return null;
			}
		}

		// ── error boundary (the QuietBoundary pattern) ───────────────────────────

		/** A render failure degrades THIS card, never the settings page. */
		function QuietBoundary(props) {}
		QuietBoundary.prototype = Object.create(React.Component.prototype);
		QuietBoundary.prototype.constructor = QuietBoundary;
		QuietBoundary.state = { failed: false };
		QuietBoundary.getDerivedStateFromError = function () { return { failed: true } };
		QuietBoundary.prototype.componentDidCatch = function (error) {
			console.warn(TAG + " settings card render failed:", error && error.message ? error.message : error);
		};
		QuietBoundary.prototype.render = function () {
			if (this.state && this.state.failed) return null;
			return this.props.children;
		};

		// ── locale subscription ─────────────────────────────────────────────────

		/* DSH's locale service notifies on every snapshot change, and its own
		   components re-render on that. This card is not one of DSH's components, so
		   it subscribes for itself: a language switch then repaints the card instead
		   of waiting for the next page load. The t handed down is the live translator,
		   so that repaint already resolves the new dictionary. */
		function LocaleLive(props) {
			var tickState = useState(0);
			var setTick = tickState[1];
			void tickState[0];

			useEffect(function () {
				var locale;
				try {
					locale = props.ctx === undefined ? undefined : props.ctx.get("locale");
				} catch (error) { locale = undefined; }
				if (locale === undefined || typeof locale.subscribe !== "function") return undefined;
				var unsubscribe = locale.subscribe(function () { setTick(function (value) { return value + 1; }); });
				return typeof unsubscribe === "function" ? unsubscribe : undefined;
			}, []);

			return E(WorkflowCard, { t: props.t, scope: props.scope, ctx: props.ctx });
		}

		// ── settings card (module-level component) ───────────────────────────────

		/**
		 * The Settings → Plugins card. t is the LIVE translator: it arrives as a
		 * PLAIN prop from the inject factory (which also carries the bound scope),
		 * and every call resolves the dictionary of whatever locale is active at
		 * that moment. The registration's locale field still binds the seat for
		 * the kit. The snapshot is read per render; each write bumps a local tick
		 * so the card re-reads without an external-store hook adapter.
		 */
		function WorkflowCard(props) {
			var t = typeof props.t === "function" ? props.t : function (key) { return key; };

			var openState = useState(false);
			var open = openState[0];
			var setOpen = openState[1];

			var errorState = useState("");
			var error = errorState[0];
			var setError = errorState[1];

			var tickState = useState(0);
			var tick = tickState[0];
			var bumpTick = tickState[1];
			void tick;

			var scope = props.scope;

			/* The dedupe switch is dsh-gitbash-shell's OWN row setting (v0.14.0):
			   this card binds THAT entry through configForms and renders it here,
			   so the two cards share one state instead of mirroring two copies
			   (their card writes the same field, the shared mirror pushes it back
			   through subscribe). Absent — and therefore not drawn — on old hosts
			   (no configForms), while the peer is not installed, or before the
			   peer's row reaches the mirror. */
			var peerState = useState(null);
			var peer = peerState[0];
			var setPeer = peerState[1];

			useEffect(function () {
				var forms;
				try {
					forms = props.ctx === undefined ? undefined : props.ctx.get("configForms");
				} catch (error_) { forms = undefined; }
				if (forms === undefined || forms === null || typeof forms.get !== "function") return undefined;
				var form;
				try { form = forms.get(PEER_NS); } catch (error_) { return undefined; }
				if (form === undefined || form === null || typeof form.getSnapshot !== "function") return undefined;
				setPeer(form);
				if (typeof form.subscribe !== "function") return undefined;
				var unsubscribe = form.subscribe(function () { bumpTick(function (n) { return n + 1; }); });
				return typeof unsubscribe === "function" ? unsubscribe : undefined;
			}, []);

			var snap = { status: "unavailable" };
			try {
				if (scope && typeof scope.getSnapshot === "function") snap = scope.getSnapshot();
			} catch (error_) { /* keep unavailable */ }

			if (snap.status !== "ready") return null;

			var workflow = snap.value && snap.value.workflow === false ? false : true;
			/* The experimental Python backend switch (v0.15.0). The value lives on
			   THIS row's Config; the host half mirrors it into the boot snapshot the
			   bundle patch reads, so flipping it decides which PTC provider row dsh
			   mounts on the NEXT start. The peer card (dsh-gitbash-shell) reads and
			   writes the very same field, which is why one change moves both. */
			var pythonRuntime = !!(snap.value && snap.value.pythonRuntime === true);

			/* Peer row: rendered only while the peer's entry is actually served. */
			var peerSnap = { status: "unavailable" };
			try {
				if (peer && typeof peer.getSnapshot === "function") peerSnap = peer.getSnapshot();
			} catch (error_) { /* keep unavailable */ }
			var peerReady = peerSnap.status === "ready";
			var peerDedupe = !!(peerReady && peerSnap.value && peerSnap.value[PEER_FIELD] === true);

			function write(next) {
				setError("");
				scope.set("workflow", next).then(
					function () { bumpTick(function (n) { return n + 1; }); },
					function (err) {
						bumpTick(function (n) { return n + 1; });
						setError(t("error") + ": " + (err && err.message ? err.message : String(err)));
					},
				);
			}

			function writePeer(next) {
				if (!peer) return;
				setError("");
				peer.set(PEER_FIELD, next).then(
					function () { bumpTick(function (n) { return n + 1; }); },
					function (err) {
						bumpTick(function (n) { return n + 1; });
						setError(t("error") + ": " + (err && err.message ? err.message : String(err)));
					},
				);
			}

			function writePython(next) {
				setError("");
				scope.set("pythonRuntime", next).then(
					function () { bumpTick(function (n) { return n + 1; }); },
					function (err) {
						bumpTick(function (n) { return n + 1; });
						setError(t("error") + ": " + (err && err.message ? err.message : String(err)));
					},
				);
			}

			var Chevron = icon("IconChevronDownOutline14");

			var options = [
				{ id: "on", label: t("wf.on"), value: true },
				{ id: "off", label: t("wf.off"), value: false },
			];

			var peerOptions = [
				{ id: "on", label: t("peer.on"), value: true },
				{ id: "off", label: t("peer.off"), value: false },
			];

			var pythonOptions = [
				{ id: "on", label: t("python.on"), value: true },
				{ id: "off", label: t("python.off"), value: false },
			];

			var pageView = props.view === "page";

			var bodyContent = E("div", { className: "pc-body" },
				E("div", { className: "pc-row" },
					E("span", { className: "pc-rowLabel" }, t("wf.label") + ":"),
					E("div", { className: "pc-seg" },
						options.map(function (o) {
							return E("button", {
								key: o.id,
								type: "button",
								className: "pc-segBtn" + (workflow === o.value ? " pc-segActive" : ""),
								onClick: function () { write(o.value); },
							}, o.label);
						}),
					),
				),
				peerReady ? E("div", { className: "pc-row" },
					E("span", { className: "pc-rowLabel" }, t("peer.label") + ":"),
					E("div", { className: "pc-seg" },
						peerOptions.map(function (o) {
							return E("button", {
								key: o.id,
								type: "button",
								className: "pc-segBtn" + (peerDedupe === o.value ? " pc-segActive" : ""),
								onClick: function () { writePeer(o.value); },
							}, o.label);
						}),
					),
				) : null,
				E("div", { className: "pc-row" },
					E("span", { className: "pc-rowLabel" }, t("python.label") + ":"),
					E("div", { className: "pc-seg" },
						pythonOptions.map(function (o) {
							return E("button", {
								key: o.id,
								type: "button",
								className: "pc-segBtn" + (pythonRuntime === o.value ? " pc-segActive" : ""),
								onClick: function () { writePython(o.value); },
							}, o.label);
						}),
					),
				),
				error ? E("p", { className: "pc-error" }, error) : null,
				E("p", { className: "pc-hint" }, t("hint")),
				E("p", { className: "pc-hint" }, t("python.hint")),
				peerReady ? E("p", { className: "pc-hint" }, t("peer.hint")) : null,
			);

			if (pageView) return E("div", { className: "pc-card pc-pageCard" },
				E("div", { className: "pc-header pc-headerFlat" },
					E("span", { className: "pc-headText" },
						E("span", { className: "pc-name" }, t("title")),
						E("span", { className: "pc-desc" }, t("cardDesc")),
					),
				),
				bodyContent,
			);

			return E("li", { className: "pc-card" + (open ? " pc-open" : "") },
				E("button", {
					type: "button",
					className: "pc-header",
					onClick: function () { setOpen(function (v) { return !v; }); },
					"aria-expanded": open ? "true" : "false",
				},
					E("span", { className: "pc-headText" },
						E("span", { className: "pc-name" }, t("title")),
						E("span", { className: "pc-desc" }, t("cardDesc")),
					),
					Chevron
						? E(Chevron, { className: "pc-chevron" + (open ? " pc-chevronOpen" : "") })
						: E("span", { className: "pc-chevron" + (open ? " pc-chevronOpen" : ""), "aria-hidden": "true" }, "▾"),
				),
				open ? bodyContent : null,
			);
		}

		// ── plugin ────────────────────────────────────────────────────────────

		exports.name = "dsh-ptc-cordis-preset/client";

		/**
		 * Required client services: the locale runtime and slots exist on every
		 * host era; the settings face is acquired OPTIONALLY below (dsh 0.1.7
		 * removed the settingsScope service and a hard inject would leave this
		 * fiber PENDING forever, taking the card down with it).
		 */
		exports.inject = ["locale", "slots"];

		exports.apply = function (ctx) {
			// Era-split settings face (same contract both eras: getSnapshot/set/unset).
			var scope = null;
			var cardsRegistered = false;

			/* The card's translator: the dictionary is resolved per lookup against the
			   CURRENT locale, so a language switch needs no reload. */
			var t = translatorOf(ctx);

			var disposers = [];

			// OLD era (dsh <= 0.1.6): bound settings scope.
			try {
				ctx.inject(["settingsScope"], function (sctx) {
					try {
						var svc = sctx && sctx.settingsScope;
						if (svc && typeof svc.bind === "function") { scope = svc.bind({ namespace: NS }); registerCards(); }
					} catch (error) {
						console.warn(TAG + " settingsScope acquisition failed:", error && error.message ? error.message : error);
					}
				});
			} catch (error) {
				console.warn(TAG + " settingsScope wiring failed:", error && error.message ? error.message : error);
			}

			// NEW era (dsh >= 0.1.7): one ConfigForm per live profile entry; the form
			// key is the row id "ptc-cordis" (same string as the old namespace).
			try {
				ctx.inject(["configForms"], function (fctx) {
					try {
						var forms = fctx && fctx.configForms;
						if (forms && typeof forms.get === "function") { scope = forms.get(NS); registerCards(); }
					} catch (error) {
						console.warn(TAG + " configForms acquisition failed:", error && error.message ? error.message : error);
					}
				});
			} catch (error) {
				console.warn(TAG + " configForms wiring failed:", error && error.message ? error.message : error);
			}

			/** Card registration, deferred until a settings face exists (either era). */
			function registerCards() {
				if (cardsRegistered || !scope) return;
				cardsRegistered = true;
					// Guarded two-stage registration (0.10.3 lesson: settings.plugin.item
					// is slots.inject(hole, callback) whose body RETURNS slots.register).
					try {
						var slots = ctx.slots;
						if (!slots || typeof slots.register !== "function" || typeof slots.inject !== "function") {
							console.warn(TAG + " slots service unavailable; settings card skipped");
						} else {
						var injected = function () {
							// The inject factory's returned members become the
							// component's props: the bound scope, the live translator
							// and the ctx (used to bind the PEER row through
							// configForms) ride here as PLAIN members.
							return { scope: scope, t: t, ctx: ctx };
						};
						// Legacy seat (dsh <= 0.1.6-alpha.1): Settings → Plugins card.
						slots.inject("settings.plugin.item", function () {
							return slots.register({
								name: "settings.plugin.item",
								key: NS,
								locale: DICT_NS,
								inject: injected,
							}, function CardWithBoundary(props) {
								return E(QuietBoundary, null, E(LocaleLive, {
									ctx: ctx,
									t: typeof props.t === "function" ? props.t : t,
									scope: props.scope,
								}));
							});
						});
						// dsh 0.1.6-alpha.2+: the Plugins page bundle configuration seat,
						// keyed by the PACKAGE name; each inject waits for its own slot
						// declaration, so exactly one seat is live on any host version.
						slots.inject("plugins.bundle.config", function () {
							return slots.register({
								name: "plugins.bundle.config",
								key: "dsh-ptc-cordis-preset",
								locale: DICT_NS,
								inject: injected,
							}, function BundleConfigWithBoundary(props) {
								return E(QuietBoundary, null, E(LocaleLive, {
									ctx: ctx,
									t: typeof props.t === "function" ? props.t : t,
									scope: props.scope,
								}));
							});
						});
					}
				} catch (error) {
					console.warn(TAG + " settings card registration failed:", error && error.message ? error.message : error);
				}
			}

			ctx.effect(function () {
				disposers.push(ensureStyles());
				try {
					// every shipped dictionary rides one registration; the registry keys
					// locales case-insensitively, so a host-side reader of DICT_NS sees
					// exactly the copy the card does
					var disposeDict = ctx.locale.register(DICT_NS, Object.assign({ zh: zh, en: en }, LOCALES));
					if (typeof disposeDict === "function") disposers.push(disposeDict);
				} catch (error) {
					console.warn(TAG + " dictionary registration failed:", error && error.message ? error.message : error);
				}
				registerCards();

			return function () {
				for (var i = 0; i < disposers.length; i++) {
					try {
						if (typeof disposers[i] === "function") disposers[i]();
					} catch (error) { /* best effort */ }
				}
				disposers = [];
			};
		}, "dsh-ptc-cordis-preset: styles, dictionary, settings card");
		};

		return module.exports;
	},
});
