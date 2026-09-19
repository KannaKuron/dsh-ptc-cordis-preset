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
		};

		var en = {
			"title": "PTC Creation mode",
			"cardDesc": "Whether the materialized ptc-cordis preset provides the workflow tool",
			"wf.label": "workflow tool",
			"wf.on": "Provide (default)",
			"wf.off": "Omit",
			"error": "Write failed",
			"hint": "Default ON: Creation mode keeps workflow and this preset inherits the Creation-side capability (its behavior through v0.7.0). The official PTC mode omits it since dsh 0.1.2-alpha.4 (run_code is its only model-authored orchestration surface) — pick Omit to match the official shape. Flipping re-materializes immediately; NEW sessions pick it up at once, already-open sessions keep their composition. Requires dsh >= 0.1.2.",
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

			return E(WorkflowCard, { t: props.t, scope: props.scope });
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

			var snap = { status: "unavailable" };
			try {
				if (scope && typeof scope.getSnapshot === "function") snap = scope.getSnapshot();
			} catch (error_) { /* keep unavailable */ }

			if (snap.status !== "ready") return null;

			var workflow = snap.value && snap.value.workflow === false ? false : true;

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

			var Chevron = icon("IconChevronDownOutline14");

			var options = [
				{ id: "on", label: t("wf.on"), value: true },
				{ id: "off", label: t("wf.off"), value: false },
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
				error ? E("p", { className: "pc-error" }, error) : null,
				E("p", { className: "pc-hint" }, t("hint")),
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

		/** Required client services: locale runtime, settings scopes, slots. */
		exports.inject = ["locale", "settingsScope", "slots"];

		exports.apply = function (ctx) {
			var scope = ctx.settingsScope.bind({ namespace: NS });

			/* The card's translator: the dictionary is resolved per lookup against the
			   CURRENT locale, so a language switch needs no reload. */
			var t = translatorOf(ctx);

			var disposers = [];

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
				// Guarded two-stage registration (0.10.3 lesson: settings.plugin.item
				// is slots.inject(hole, callback) whose body RETURNS slots.register).
				try {
					var slots = ctx.slots;
					if (!slots || typeof slots.register !== "function" || typeof slots.inject !== "function") {
						console.warn(TAG + " slots service unavailable; settings card skipped");
					} else {
					var injected = function () {
						// The inject factory's returned members become the
						// component's props: the bound scope (and the live
						// translator) ride here as PLAIN members.
						return { scope: scope, t: t };
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
