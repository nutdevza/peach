(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "a7e053b8-e185-412a-a970-94b927d6a177", e._sentryDebugIdIdentifier = "sentry-dbid-a7e053b8-e185-412a-a970-94b927d6a177");
	} catch {}
})();
import { Button as e, LinkButton as t, Note as n, Progress as r, REPAIRS_KEY as i, RESULT_PANEL as a, RESULT_SECTION as o, SectionHeading as s, StatusLabel as c, apiSend as l, confirmModal as u, fetchRepairs as d, fmtSize as f, i2 as p, queryClient as m, repairCenterPanelSkeleton as h, require_jsx_runtime as g, useAction as _, useQuery as v } from "./peach-app.js";
import { Page as y } from "./peach-app.page-QAncjzM1.js";
// src/react/settings/repair-center.tsx
var b = g(), x = {
	done: ["Completed", "success"],
	succeeded: ["Completed", "success"],
	complete: ["Completed", "success"],
	running: ["In progress", "progress"],
	pending: ["Waiting to run", "neutral"],
	waiting: ["Waiting for you", "warning"],
	failed: ["Needs retry", "error"],
	none: ["Nothing to do", "neutral"]
}, S = (e = 0) => e.toLocaleString(), C = (e) => (/* @__PURE__ */ new Date(e * 1e3)).toLocaleString("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit"
}), w = (e) => `${S(e.files)} files · ${f(e.bytes || 0)}`, T = (e) => e.state === "running" && !!e.total, E = (e) => !!e.estimating || e.state === "running";
function D(e) {
	return e.estimating ? "Measuring" : e.state === "failed" && e.error ? e.error : e.files ? `Reclaimable ${f(e.bytes || 0)}` : e.state === "waiting" ? e.pending ? `${S(e.pending)} videos pending recheck` : "" : T(e) ? "" : e.total ? `${S(e.done)} / ${S(e.total)}` : e.mode === "confirm" ? "" : e.changed ? `${S(e.changed)} changes` : "";
}
function O({ title: e, description: t, progress: n, children: r }) {
	return /* @__PURE__ */ (0, b.jsxs)("div", {
		className: `${o} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`,
		children: [/* @__PURE__ */ (0, b.jsxs)("div", {
			className: "flex min-w-0 flex-1 flex-col gap-0.5",
			children: [
				/* @__PURE__ */ (0, b.jsx)("span", {
					className: "text-body-medium text-text-primary",
					children: e
				}),
				/* @__PURE__ */ (0, b.jsx)("span", {
					className: "text-body-2-regular text-text-secondary",
					children: t
				}),
				n ? /* @__PURE__ */ (0, b.jsx)("div", {
					className: "pt-2",
					children: n
				}) : null
			]
		}), /* @__PURE__ */ (0, b.jsx)("div", {
			className: "flex shrink-0 items-center gap-3",
			children: r
		})]
	});
}
function k({ item: e }) {
	return /* @__PURE__ */ (0, b.jsxs)("div", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, b.jsx)("div", {
			className: "min-w-0 flex-1",
			children: /* @__PURE__ */ (0, b.jsx)(r, {
				label: `${e.title} progress`,
				value: e.done || 0,
				max: e.total
			})
		}), /* @__PURE__ */ (0, b.jsxs)("span", {
			className: "shrink-0 text-caption-1-regular text-text-secondary tabular-nums",
			children: [
				S(e.done),
				" / ",
				S(e.total)
			]
		})]
	});
}
function A() {
	let r = v({
		queryKey: i,
		queryFn: ({ signal: e }) => d(e),
		refetchInterval: ({ state: e }) => e.data?.items.some(E) ? 2e3 : !1
	}), o = r.data, f = _(), g = (e) => m.setQueryData(i, e), A = (e, t) => l(`/api/configuration/repairs/${e.id}`, {}, "POST", t), j = (e) => e.files === void 0 ? void f.run(e.id, (t) => A(e, t), g) : void u({
		title: `Delete ${e.title}`,
		body: `Will delete ${w(e)}; deletion cannot be undone. The latest 3 snapshots per followed source and snapshots referenced by entries are kept.`,
		confirmLabel: "Delete snapshots",
		danger: !0,
		onConfirm: async () => g(await A(e))
	}), M = (e) => e.backups.length ? e.backups.some((e) => e.exists) ? /* @__PURE__ */ (0, b.jsx)(t, {
		href: "/settings/maintenance#ledgerBackups",
		size: "small",
		trailingIcon: p,
		children: "The pre-repair ledger backup"
	}) : /* @__PURE__ */ (0, b.jsx)("span", {
		className: "text-body-2-regular text-text-tertiary",
		children: "The pre-repair backup was cleared"
	}) : null, N = f.error || (r.error ? r.error.message : "");
	return /* @__PURE__ */ (0, b.jsxs)(y, { children: [
		N ? /* @__PURE__ */ (0, b.jsx)(n, {
			tone: "error",
			children: N
		}) : null,
		/* @__PURE__ */ (0, b.jsxs)("section", {
			"aria-labelledby": "repair-items",
			className: "flex flex-col gap-4",
			children: [/* @__PURE__ */ (0, b.jsx)(s, {
				id: "repair-items",
				children: "Repair items"
			}), o ? o.items.length ? /* @__PURE__ */ (0, b.jsx)("div", {
				className: a,
				children: o.items.map((t) => {
					let [n, r] = x[t.state] || x.none, i = D(t);
					return /* @__PURE__ */ (0, b.jsxs)(O, {
						title: t.title,
						description: t.summary,
						progress: T(t) ? /* @__PURE__ */ (0, b.jsx)(k, { item: t }) : null,
						children: [i ? /* @__PURE__ */ (0, b.jsx)("span", {
							className: "text-body-2-regular text-text-secondary",
							children: i
						}) : null, t.mode === "confirm" && t.state === "waiting" ? /* @__PURE__ */ (0, b.jsx)(e, {
							size: "small",
							disabled: !o.available || !!f.busy || t.estimating,
							onClick: () => j(t),
							children: "开始"
						}) : /* @__PURE__ */ (0, b.jsx)(c, {
							tone: r,
							children: n
						})]
					}, t.id);
				})
			}) : /* @__PURE__ */ (0, b.jsx)("p", {
				className: "text-body-2-regular text-text-secondary",
				children: "Nothing on this machine needs repairing or migrating."
			}) : /* @__PURE__ */ (0, b.jsx)("div", {
				className: "contents",
				"data-skeleton": "",
				"aria-busy": "true",
				"aria-label": "Reading repair items",
				dangerouslySetInnerHTML: { __html: h() }
			})]
		}),
		o?.history.length ? /* @__PURE__ */ (0, b.jsxs)("section", {
			"aria-labelledby": "repair-history",
			className: "flex flex-col gap-4",
			children: [/* @__PURE__ */ (0, b.jsx)(s, {
				id: "repair-history",
				children: "历史记录"
			}), /* @__PURE__ */ (0, b.jsx)("div", {
				className: a,
				children: o.history.map((e) => /* @__PURE__ */ (0, b.jsx)(O, {
					title: e.title,
					description: `${C(e.at)} · ${e.changed ? `${S(e.changed)} changes` : "No changes"}`,
					children: M(e)
				}, e.id))
			})]
		}) : null
	] });
}
export { A as RepairCenterPage };

//# debugId=a7e053b8-e185-412a-a970-94b927d6a177