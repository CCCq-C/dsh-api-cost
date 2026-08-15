window.__ModuleLoader__.load({
	id: "dsh-api-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const e = React.createElement;

		//#region CostMeter.module.css
		const css = ".Cm_dock{box-sizing:border-box;width:100%;margin:0 auto}.Cm_bar{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;align-items:center;gap:10px;height:36px;margin:0 auto;padding:4px 5px 4px 12px;display:flex}.Cm_label{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;font-weight:500;line-height:24px}.Cm_cost{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:600;line-height:24px;font-variant-numeric:tabular-nums}.Cm_meta{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;line-height:20px;overflow:hidden;text-align:right;font-variant-numeric:tabular-nums}";
		const cssTagId = "dsh-api-cost/CostMeter.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-api-cost";
			tag.dataset.pluginCss = cssTagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const cx = { dock: "Cm_dock", bar: "Cm_bar", label: "Cm_label", cost: "Cm_cost", meta: "Cm_meta" };
		//#endregion

		/** Dictionary namespace owned by this plugin. */
		const NS = "cost";
		const zh = {
			"label": "API 开销",
			"total": "合计",
			"input": "输入",
			"cacheRead": "缓存命中",
			"cacheWrite": "缓存写入",
			"output": "输出"
		};
		const en = {
			"label": "API cost",
			"total": "Total",
			"input": "Input",
			"cacheRead": "Cache hit",
			"cacheWrite": "Cache write",
			"output": "Output"
		};

		/** Compact token count: 517 / 12.2K / 1.2M. */
		function formatTokens(n) {
			if (!Number.isFinite(n)) return "0";
			if (n < 1e3) return String(Math.round(n));
			const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
			if (n < 1e6) return `${scaled(n / 1e3)}K`;
			return `${scaled(n / 1e6)}M`;
		}

		/** Currency symbol for the projection's currency code. */
		function currencySymbol(code) {
			switch (code) {
				case "USD": return "$";
				case "CNY": return "¥";
				case "EUR": return "€";
				case "GBP": return "£";
				case "JPY": return "¥";
				default: return code === "" ? "" : `${code} `;
			}
		}

		/** Compact cost with enough precision for sub-cent totals. */
		function formatCost(v) {
			if (!Number.isFinite(v)) return "0";
			if (v === 0) return "0";
			const abs = Math.abs(v);
			if (abs >= 1) return v.toFixed(3);
			if (abs >= 0.01) return v.toFixed(4);
			return v.toFixed(6);
		}

		/**
		 * Dock entry: reads the host-computed `apiCost` projection and renders a
		 * live cost chip. Undefined (capability absent / loading) or a session
		 * with no billed tokens renders nothing.
		 */
		function CostDock({ useProjection, t }) {
			const value = useProjection("apiCost");
			if (value === void 0) return null;
			const promptTokens = value.inputTokens + value.cacheReadTokens + value.cacheWriteTokens;
			if (promptTokens <= 0 && value.outputTokens <= 0) return null;
			const sym = currencySymbol(value.currency);
			const lines = [
				`${t("total")}: ${sym}${formatCost(value.cost)}`
			];
			if (value.inputTokens > 0) lines.push(`${t("input")}: ${sym}${formatCost(value.inputCost)} · ${formatTokens(value.inputTokens)} tok`);
			if (value.cacheReadTokens > 0) lines.push(`${t("cacheRead")}: ${sym}${formatCost(value.cacheReadCost)} · ${formatTokens(value.cacheReadTokens)} tok`);
			if (value.cacheWriteTokens > 0) lines.push(`${t("cacheWrite")}: ${sym}${formatCost(value.cacheWriteCost)} · ${formatTokens(value.cacheWriteTokens)} tok`);
			if (value.outputTokens > 0) lines.push(`${t("output")}: ${sym}${formatCost(value.outputCost)} · ${formatTokens(value.outputTokens)} tok`);
			if (value.model) lines.push(`model: ${value.model}`);
			return e("div", { className: cx.dock, "data-cost-meter": true },
				e("div", { className: cx.bar, title: lines.join("\n") },
					e("span", { className: cx.label }, t("label")),
					e("span", { className: cx.cost }, sym + formatCost(value.cost)),
					e("span", { className: cx.meta }, `${formatTokens(promptTokens)} + ${formatTokens(value.outputTokens)} tok`)
				)
			);
		}

		/** Required client services. */
		const inject = ["slots", "locale"];

		/**
		 * Client plugin body: register the cost dictionaries, then the composer
		 * dock entry over the `apiCost` projection.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "api-cost: dictionaries");
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "dsh-api-cost",
				order: 5,
				locale: NS
			}, CostDock));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
