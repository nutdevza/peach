(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "5febd80e-9fb8-42f5-8ea3-e46ad00ef8f1", e._sentryDebugIdIdentifier = "sentry-dbid-5febd80e-9fb8-42f5-8ea3-e46ad00ef8f1");
	} catch {}
})();
import { ApiError as e, Button as t, ButtonLink as n, Chip as r, DIAGNOSTICS_KEY as i, Disclosure as a, EmptyState as o, Fact as s, FactList as c, Fieldset as l, FieldsetTitle as u, Input as d, LOC as f, LinkButton as p, Note as m, Section as h, SettingsCard as g, SettingsSectionLabel as _, Stack as v, TaskProgress as y, __toESM as b, apiGet as ee, apiSend as x, busyProps as S, configurationSection as C, cx as w, diagnosticHeaders as T, diagnosticsSkeleton as E, errorMessage as D, fetchDiagnostics as O, fmtDur as k, fmtSize as A, queryClient as j, require_jsx_runtime as M, require_react as N, settingsPath as P, tl as F, useAction as I, useQuery as L } from "./peach-app.js";
import { ErrorExcerpt as R } from "./peach-app.error-excerpt-CigKESNN.js";
import { SiteMark as z } from "./peach-app.site-mark-D_VlIyJz.js";
import { DataTable as B } from "./peach-app.data-table-CH2mTppz.js";
// src/react/diagnostics/health-list.tsx
var V = /* @__PURE__ */ b(N(), 1), H = M(), U = (e) => e.title || e.name || e.code || `Video #${e.id}`, W = (e) => [[
	"Videos",
	"Code",
	"File name",
	"Media library",
	"Path",
	"Duration (sec)",
	"Size (bytes)"
], ...e.map((e) => [
	U(e),
	e.code ?? "",
	e.name,
	f[e.location] || e.location,
	e.path,
	e.duration ?? "",
	e.size ?? ""
])].map((e) => e.map((e) => String(e ?? "").replace(/[\t\r\n]+/g, " ")).join("	")).join("\n");
function G({ group: e, openItem: n, receipt: r }) {
	let i = I(), [s, c] = (0, V.useState)([]), l = (e) => void i.run("copy", () => navigator.clipboard.writeText(W(e)), () => r("List copied")), u = [
		{
			id: "title",
			label: "Videos",
			value: U,
			render: (e) => /* @__PURE__ */ (0, H.jsxs)("span", {
				className: "flex min-w-0 flex-col gap-1",
				children: [/* @__PURE__ */ (0, H.jsx)(p, {
					variant: "primary",
					className: "justify-start whitespace-normal text-left",
					onClick: () => n(e.id),
					children: U(e)
				}), e.name && e.name !== U(e) ? /* @__PURE__ */ (0, H.jsx)("span", {
					"data-middle-truncate": !0,
					title: e.name,
					className: "block min-w-0 text-caption-1-regular text-text-secondary",
					children: e.name
				}) : null]
			})
		},
		{
			id: "code",
			label: "Code",
			width: 144,
			value: (e) => e.code || "",
			render: (e) => /* @__PURE__ */ (0, H.jsx)("span", {
				className: "whitespace-nowrap",
				children: e.code || "Unrecognized"
			})
		},
		{
			id: "location",
			label: "Media library",
			width: 128,
			value: (e) => f[e.location] || e.location,
			render: (e) => f[e.location] || e.location || "Not fetched"
		},
		{
			id: "path",
			label: "File path",
			width: 320,
			min: 180,
			value: (e) => e.path,
			render: (e) => /* @__PURE__ */ (0, H.jsx)("span", {
				"data-middle-truncate": !0,
				title: e.path,
				className: "block min-w-0 w-full text-body-2-regular text-text-secondary",
				children: e.path || "Not fetched"
			})
		},
		{
			id: "duration",
			label: "Duration",
			width: 112,
			value: (e) => e.duration ?? 0,
			render: (e) => e.duration && e.duration > 0 ? k(e.duration) : "Not fetched"
		},
		{
			id: "size",
			label: "Size",
			width: 112,
			value: (e) => e.size ?? 0,
			render: (e) => e.size === null ? "Not fetched" : A(e.size)
		}
	];
	return /* @__PURE__ */ (0, H.jsx)(a, {
		summary: `${e.label} - ${e.count === null ? "not fetched" : `${e.count.toLocaleString()} items`}`,
		children: e.count === null ? /* @__PURE__ */ (0, H.jsx)(m, {
			tone: "neutral",
			children: "The list could not be fetched; check again."
		}) : e.items.length ? /* @__PURE__ */ (0, H.jsxs)(v, { children: [
			/* @__PURE__ */ (0, H.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-2",
				children: [e.truncated ? /* @__PURE__ */ (0, H.jsxs)("span", {
					className: "text-body-2-regular text-text-secondary",
					children: [
						"Loaded ",
						e.items.length.toLocaleString(),
						" / ",
						e.count.toLocaleString(),
						" items"
					]
				}) : null, /* @__PURE__ */ (0, H.jsx)(t, {
					size: "small",
					variant: "secondary",
					...S(i.busy === "copy"),
					onClick: () => l(e.items),
					children: "Copy the current list"
				})]
			}),
			i.error ? /* @__PURE__ */ (0, H.jsx)(m, {
				tone: "error",
				children: i.error
			}) : null,
			/* @__PURE__ */ (0, H.jsx)(B, {
				label: e.label,
				title: "Video list",
				unit: "videos",
				panel: !1,
				items: e.items,
				columns: u,
				rowId: (e) => String(e.id),
				rowLabel: U,
				selected: s,
				onSelected: c,
				actions: (e) => /* @__PURE__ */ (0, H.jsx)(t, {
					size: "small",
					variant: "secondary",
					...S(i.busy === "copy"),
					onClick: () => l(e),
					children: "Copy selected"
				})
			})
		] }) : /* @__PURE__ */ (0, H.jsx)(o, {
			icon: F,
			title: "The list is empty",
			size: "compact",
			children: "No videos need handling."
		})
	});
}
// src/react/diagnostics/scraping-export.tsx
var K = "/api/diagnostics/exports", q = ["diagnostic-export"];
function J({ kind: r, codes: i = "", children: a }) {
	let o = I(), s = L({
		queryKey: q,
		queryFn: ({ signal: e }) => ee(K, e),
		refetchInterval: (e) => ["running", "cancelling"].includes(e.state.data?.status || "") ? 1e3 : !1
	}), c = s.data, l = c?.kind === r, u = c?.status === "running" || c?.status === "cancelling", d = r === "support" ? "Download diagnostics report" : "Export scrape records", f = (e) => {
		j.setQueryData(q, e);
	}, p = () => void o.run("start", async (t) => {
		let n = await fetch(K, {
			method: "POST",
			signal: t,
			credentials: "same-origin",
			headers: {
				...await T(),
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				kind: r,
				codes: i
			})
		}), a = await n.json().catch(() => null);
		if (!n.ok) throw new e(a?.detail || a?.error || "The diagnostic export never started", n.status, a);
		if (!a || !a.job_id) throw Error("Export task status unavailable");
		return a;
	}, f), h = () => void o.run("cancel", (e) => x(`${K}/${c.job_id}/cancel`, {}, "POST", e), f);
	return /* @__PURE__ */ (0, H.jsxs)("div", {
		className: "flex min-w-0 flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, H.jsxs)("div", {
				className: r === "support" ? "flex flex-wrap justify-end gap-2" : "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, H.jsx)(t, {
						type: "button",
						variant: "secondary",
						disabled: u,
						...S(o.busy === "start"),
						onClick: p,
						children: d
					}),
					l && u ? /* @__PURE__ */ (0, H.jsx)(t, {
						type: "button",
						variant: "secondary",
						disabled: c.status === "cancelling",
						...S(o.busy === "cancel"),
						onClick: h,
						children: "Cancel export"
					}) : null,
					l && c.status === "complete" && c.download_url ? /* @__PURE__ */ (0, H.jsx)(n, {
						variant: "secondary",
						href: c.download_url,
						children: "Download the generated file"
					}) : null,
					a
				]
			}),
			l && u ? /* @__PURE__ */ (0, H.jsx)(y, {
				embedded: r === "scraping",
				value: c.done || 0,
				total: c.total,
				label: c.total ? `${c.stage} · ${c.done || 0} / ${c.total} items` : `${c.stage || "Preparing export"}${c.rows ? ` · ${c.rows} candidates` : ""}${c.files ? ` · ${c.files} files` : ""}`
			}) : null,
			l && c.status === "complete" ? /* @__PURE__ */ (0, H.jsxs)("p", {
				role: "status",
				className: "text-body-2-regular text-text-secondary",
				children: [
					"Export complete · ",
					((c.bytes || 0) / 1024 / 1024).toFixed(2),
					" MiB"
				]
			}) : null,
			l && c.status === "cancelled" ? /* @__PURE__ */ (0, H.jsx)(m, {
				tone: "neutral",
				children: "Export canceled"
			}) : null,
			s.isError ? /* @__PURE__ */ (0, H.jsx)(m, {
				tone: "error",
				action: /* @__PURE__ */ (0, H.jsx)(t, {
					type: "button",
					variant: "secondary",
					...S(s.isFetching),
					onClick: () => {
						s.refetch();
					},
					children: "Read again"
				}),
				children: "Export progress not fetched"
			}) : null,
			o.error || l && c.status === "failed" ? /* @__PURE__ */ (0, H.jsx)(m, {
				tone: "error",
				children: o.error || c?.error
			}) : null
		]
	});
}
function Y() {
	let [e, t] = (0, V.useState)("");
	return /* @__PURE__ */ (0, H.jsx)(l, {
		layout: "stack",
		labelledBy: "scraping-export-title",
		footer: /* @__PURE__ */ (0, H.jsx)(J, {
			kind: "scraping",
			codes: e
		}),
		children: /* @__PURE__ */ (0, H.jsxs)("div", {
			className: "flex min-w-0 flex-col gap-4",
			"aria-label": "Export scrape records",
			children: [
				/* @__PURE__ */ (0, H.jsx)(u, {
					id: "scraping-export-title",
					children: "Scrape records"
				}),
				/* @__PURE__ */ (0, H.jsx)("p", {
					className: "text-body-2-regular text-text-secondary",
					children: "Export video profiles, source values, and performer, label, and series attribution for debugging scraping errors."
				}),
				/* @__PURE__ */ (0, H.jsx)(d, {
					label: "Problem codes (optional)",
					name: "scraping-codes",
					value: e,
					onChange: t,
					autoComplete: "off",
					spellCheck: "false",
					maxLength: 1300,
					placeholder: "e.g. ABF-087, SYKH-145…",
					hint: "Separate multiple codes with commas, up to 20; leave empty to export recent videos."
				})
			]
		})
	});
}
// src/react/diagnostics/diagnostics-page.tsx
var X = {
	ok: "Normal",
	warning: "Needs check",
	failed: "Needs processing",
	unknown: "Not fetched",
	disabled: "Not configured",
	stale: "Needs review",
	unchecked: "No records yet"
}, te = { "/tasks": "View task" }, ne = [
	["Libraries and mounts", ["media_mounts", "data_root"]],
	["Database and migration", ["database", "schema"]],
	["Tools", ["ffmpeg"]],
	["Configuration and access", [
		"configured",
		"security",
		"port",
		"version"
	]],
	["Background tasks", ["tasks"]]
], Z = (e) => new Date(e).toLocaleString();
function Q({ status: e }) {
	return /* @__PURE__ */ (0, H.jsx)(r, {
		variant: "caption",
		"data-diagnostic-status": e,
		color: e === "failed" ? "rose" : e === "ok" ? "lime" : e === "warning" || e === "stale" ? "yellow" : "neutral",
		children: X[e] ?? "Not fetched"
	});
}
function re() {
	return /* @__PURE__ */ (0, H.jsx)(J, { kind: "support" });
}
function $({ name: e, check: t, compact: r = !1 }) {
	let i = t.target === "/settings/library" && (e === "security" || e === "port") ? P("Network & access") : t.target, a = r ? "h4" : "h3";
	return /* @__PURE__ */ (0, H.jsxs)("div", {
		"data-diagnostic-check": e,
		className: w("flex flex-col gap-4 border-b border-separator-border pr-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between", r ? "py-3" : "py-5"),
		children: [/* @__PURE__ */ (0, H.jsxs)("div", {
			className: w("flex min-w-0 flex-1 flex-col", r ? "gap-1" : "gap-2"),
			children: [
				/* @__PURE__ */ (0, H.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [/* @__PURE__ */ (0, H.jsx)(a, {
						className: w("text-text-primary", r ? "text-body-2-medium" : "text-body-medium"),
						children: t.label
					}), /* @__PURE__ */ (0, H.jsx)(Q, { status: t.status })]
				}),
				/* @__PURE__ */ (0, H.jsx)("p", {
					"data-check-reason": !0,
					className: w("text-body-2-regular break-words", r ? "text-text-secondary" : "text-text-primary"),
					children: t.reason
				}),
				t.action ? /* @__PURE__ */ (0, H.jsxs)("p", {
					className: "text-body-2-regular text-text-secondary",
					children: ["Suggestion:", t.action]
				}) : null
			]
		}), i ? /* @__PURE__ */ (0, H.jsx)("div", {
			className: "shrink-0 self-end sm:self-auto",
			children: /* @__PURE__ */ (0, H.jsx)(n, {
				size: "small",
				variant: "secondary",
				href: i,
				children: i.startsWith("/settings/") ? `Open ${C(i)}` : te[i] ?? "Open the related page"
			})
		}) : null]
	});
}
function ie(e) {
	let r = L({
		queryKey: i,
		queryFn: ({ signal: e }) => O(e),
		staleTime: 1e4
	}), o = I(), [l, u] = (0, V.useState)(""), d = () => void o.run("refresh", async () => {
		let e = await r.refetch();
		if (e.error) throw e.error;
		return e.data;
	}, () => u(""), (e) => u(D(e))), f = r.data;
	if (!f && r.isPending) return /* @__PURE__ */ (0, H.jsx)("div", {
		role: "status",
		"aria-label": "Reading system diagnostics",
		dangerouslySetInnerHTML: { __html: E() }
	});
	if (!f) return /* @__PURE__ */ (0, H.jsxs)("div", {
		className: "ui-configpage",
		children: [
			/* @__PURE__ */ (0, H.jsx)(re, {}),
			/* @__PURE__ */ (0, H.jsx)(m, {
				tone: "error",
				title: "Reading diagnostics failed",
				action: /* @__PURE__ */ (0, H.jsx)(t, {
					variant: "secondary",
					onClick: d,
					...S(o.busy === "refresh"),
					children: "Check again"
				}),
				children: r.error ? D(r.error) : "The diagnostic report could not be fetched."
			}),
			/* @__PURE__ */ (0, H.jsx)(Y, {})
		]
	});
	let p = Object.entries(f.checks).filter(([, e]) => [
		"warning",
		"failed",
		"unknown"
	].includes(e.status)), y = Object.entries(f.checks).filter(([, e]) => ![
		"warning",
		"failed",
		"unknown"
	].includes(e.status));
	return /* @__PURE__ */ (0, H.jsxs)("div", {
		className: "flex min-w-0 flex-col gap-6",
		children: [
			/* @__PURE__ */ (0, H.jsx)("div", {
				"data-guide-target": "report",
				children: /* @__PURE__ */ (0, H.jsx)(J, {
					kind: "support",
					children: /* @__PURE__ */ (0, H.jsx)(t, {
						variant: "secondary",
						onClick: d,
						...S(o.busy === "refresh"),
						children: "Check again"
					})
				})
			}),
			l ? /* @__PURE__ */ (0, H.jsx)(m, {
				tone: "error",
				children: l
			}) : null,
			p.length ? /* @__PURE__ */ (0, H.jsx)(h, {
				guide: "attention",
				title: `Needs attention · ${p.length} ${p.length === 1 ? "item" : "items"}`,
				children: p.map(([e, t]) => /* @__PURE__ */ (0, H.jsx)($, {
					name: e,
					check: t
				}, e))
			}) : null,
			/* @__PURE__ */ (0, H.jsx)(h, {
				guide: "health",
				title: "Library health",
				children: /* @__PURE__ */ (0, H.jsxs)(v, { children: [f.library.issue_at ? /* @__PURE__ */ (0, H.jsxs)("p", {
					className: "text-body-2-regular text-text-secondary",
					children: ["Processing log · ", Z(f.library.issue_at)]
				}) : null, Object.entries(f.library.groups).map(([t, n]) => /* @__PURE__ */ (0, H.jsx)(G, {
					group: n,
					...e
				}, t))] })
			}),
			y.length ? /* @__PURE__ */ (0, H.jsx)("section", {
				"aria-label": "System checks",
				children: /* @__PURE__ */ (0, H.jsx)(a, {
					summary: `Other checks · ${y.length} ${y.length === 1 ? "item" : "items"}`,
					contentClassName: "gap-5",
					children: ne.map(([e, t]) => {
						let n = y.filter(([e]) => t.some((t) => t === e));
						return n.length ? /* @__PURE__ */ (0, H.jsxs)("section", {
							"aria-label": e,
							"data-diagnostic-group": "",
							className: "flex min-w-0 flex-col gap-2",
							children: [/* @__PURE__ */ (0, H.jsxs)("h3", {
								className: "flex items-center gap-2 px-3 text-body-medium text-text-primary",
								children: [e, /* @__PURE__ */ (0, H.jsxs)("span", {
									className: "text-caption-1-regular text-text-secondary",
									children: [n.length, " items"]
								})]
							}), /* @__PURE__ */ (0, H.jsx)(g, { children: n.map(([e, t]) => /* @__PURE__ */ (0, H.jsx)($, {
								name: e,
								check: t,
								compact: !0
							}, e)) })]
						}, e) : null;
					})
				})
			}) : null,
			/* @__PURE__ */ (0, H.jsx)(Y, {}),
			/* @__PURE__ */ (0, H.jsxs)("section", {
				"data-guide-target": "sessions",
				"aria-label": "Source sessions",
				className: "flex min-w-0 flex-col gap-3",
				children: [
					/* @__PURE__ */ (0, H.jsx)(_, { children: "Source sessions" }),
					f.sources.map((e) => /* @__PURE__ */ (0, H.jsx)("article", {
						"data-diagnostic-source": e.source,
						children: /* @__PURE__ */ (0, H.jsx)(g, { children: /* @__PURE__ */ (0, H.jsxs)(v, { children: [
							/* @__PURE__ */ (0, H.jsxs)("div", {
								className: "flex flex-wrap items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, H.jsxs)("h3", {
									className: "flex min-w-0 items-center gap-2 text-body-medium text-text-primary",
									children: [/* @__PURE__ */ (0, H.jsx)(z, { source: e.source }), e.label]
								}), /* @__PURE__ */ (0, H.jsx)(Q, { status: e.status })]
							}),
							/* @__PURE__ */ (0, H.jsx)(R, {
								text: e.reason,
								className: "text-body-regular text-text-primary"
							}),
							/* @__PURE__ */ (0, H.jsxs)(c, { children: [
								/* @__PURE__ */ (0, H.jsx)(s, {
									term: "Last parse succeeded",
									children: e.last_success_at ? Z(e.last_success_at) : "No successful record yet"
								}),
								e.last_check_at ? /* @__PURE__ */ (0, H.jsxs)(s, {
									term: "Last check",
									children: [Z(e.last_check_at), e.elapsed_s !== void 0 && e.elapsed_s !== null ? ` · ${e.elapsed_s.toFixed(2)} sec` : ""]
								}) : null,
								/* @__PURE__ */ (0, H.jsx)(s, {
									term: "Access paused until",
									children: e.cooldown_until ? Z(e.cooldown_until) : "Not paused"
								})
							] })
						] }) })
					}, e.source)),
					/* @__PURE__ */ (0, H.jsx)("div", { children: /* @__PURE__ */ (0, H.jsx)(n, {
						size: "small",
						variant: "secondary",
						href: "/sources",
						children: "Open source and credentials"
					}) })
				]
			})
		]
	});
}
export { ie as DiagnosticsPage };

//# debugId=5febd80e-9fb8-42f5-8ea3-e46ad00ef8f1