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

		var TAG = "[dsh-ptc-cordis-preset]";
		var NS = "ptc-cordis";
		var DICT_NS = "ptcCordis";

		// ── locale dictionaries (zh/en MUST stay key-aligned; smoke-enforced) ──

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

		// ── styles (pc- prefixed; tokens mirror PluginCard.module.css) ──────────

		var STYLE_ID = "dsh-ptc-cordis-preset-style";

		var CSS = [
			".pc-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}",
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

		// ── settings card (module-level component) ───────────────────────────────

		/**
		 * The Settings → Plugins card. t arrives through the registration's
		 * locale field; the bound scope arrives as a PLAIN prop from the inject
		 * factory. The snapshot is read per render; each write bumps a local
		 * tick so the card re-reads without an external-store hook adapter.
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
				open ? E("div", { className: "pc-body" },
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
				) : null,
			);
		}

		// ── plugin ────────────────────────────────────────────────────────────

		exports.name = "dsh-ptc-cordis-preset/client";

		/** Required client services: locale runtime, settings scopes, slots. */
		exports.inject = ["locale", "settingsScope", "slots"];

		exports.apply = function (ctx) {
			var scope = ctx.settingsScope.bind({ namespace: NS });

			var disposers = [];

			ctx.effect(function () {
				disposers.push(ensureStyles());
				try {
					var disposeDict = ctx.locale.register(DICT_NS, { zh: zh, en: en });
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
					slots.inject("settings.plugin.item", function () {
						return slots.register({
							name: "settings.plugin.item",
							key: NS,
							locale: DICT_NS,
							// The inject factory's returned members become the
							// component's props: the bound scope rides here as a
							// PLAIN member (top-level options fields do NOT reach
							// the component).
							inject: function () {
								return { scope: scope };
							},
						}, function CardWithBoundary(props) {
							return E(QuietBoundary, null, E(WorkflowCard, props));
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
