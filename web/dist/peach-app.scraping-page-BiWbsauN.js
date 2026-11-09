(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "52ecc5de-4bc2-402e-bfb4-208892984398", e._sentryDebugIdIdentifier = "sentry-dbid-52ecc5de-4bc2-402e-bfb4-208892984398");
	} catch {}
})();
import { $fe21c36db05242bb$export$d7b12c4107be0d61 as e, AMANE_BRIDGE_CHECK_URL as t, AMANE_BRIDGE_KEY as n, AMANE_BRIDGE_REBUILD_URL as r, Button as i, CHECK_ALL_KEY as a, COVER_JOB_KEY as o, CUSTOM_SOURCES_KEY as s, CUSTOM_SOURCES_URL as c, Checkbox as l, Disclosure as u, ErrorText as d, ExternalLink as f, Fact as p, FactList as m, FieldLabel as h, Footer as g, Help as _, Input as v, IssueRow as y, LinkButton as ee, LoadingDots as b, Note as x, Progress as S, Rows as te, SCRAPING_CHECK_ALL_URL as C, SCRAPING_CHECK_URL as ne, SCRAPING_COVER_URL as w, SCRAPING_KEY as T, SCRAPING_SETTINGS_URL as re, SEGMENT as ie, SEGMENTED_TRACK as ae, Section as E, SegmentedRadioGroup as oe, Select$1 as se, SelectField as D, SelectItem as ce, SettingsRow as le, Stack as O, StatusLabel as k, __toESM as A, apiSend as j, busyProps as M, checkText as ue, composingKey as N, confirmModal as de, errorMessage as P, esc as F, fetchAmaneBridge as I, fetchCheckAllJob as L, fetchCoverJob as R, fetchCustomSources as z, fetchSources as fe, i2 as pe, momentText as me, queryClient as B, require_jsx_runtime as he, require_react as ge, spinnerHtml as _e, useAction as V, useBackgroundJob as H, useMutation as U, useQuery as W } from "./peach-app.js";
import { ConnectionStatus as ve } from "./peach-app.connection-status-B0tSnjj0.js";
import { Page as G } from "./peach-app.page-QAncjzM1.js";
import { SiteMark as K } from "./peach-app.site-mark-D_VlIyJz.js";
import { CodeBlock as ye } from "./peach-app.code-block-Cqr-O1m6.js";
// src/react/scraping/custom-sources.tsx
var q = /* @__PURE__ */ A(ge(), 1), J = he(), be = [
	["code", "Code"],
	["title", "Title"],
	["studio", "Labels"],
	["series", "Series"],
	["release_date", "Release date"],
	["performers", "Cast (text array)"],
	["tags", "Tags (text array)"]
], xe = [
	["censored", "Censored"],
	["amateur", "Amateur"],
	["uncensored", "Uncensored"],
	["fc2", "FC2"],
	["kmib", "Korean MIB"],
	["other", "Other"],
	["unsure", "Codes to verify"],
	["unknown", "Unknown"]
], Se = () => ({
	name: "",
	endpoint: "",
	enabled: !1,
	fields: {
		code: "id",
		title: "title"
	},
	content_types: ["censored"]
});
function Ce({ receipt: e }) {
	let [t, n] = (0, q.useState)(null), r = W({
		queryKey: s,
		queryFn: ({ signal: e }) => z(e)
	}), a = V(), o = (e) => B.setQueryData(s, e), l = !!(r.isPending || r.error || r.data?.items.length || a.error), u = /* @__PURE__ */ (0, J.jsx)(i, {
		variant: "secondary",
		onClick: () => n(Se()),
		children: "Add source"
	});
	return /* @__PURE__ */ (0, J.jsxs)(E, {
		title: "Custom metadata source",
		children: [
			l ? /* @__PURE__ */ (0, J.jsxs)(O, { children: [
				r.isPending ? /* @__PURE__ */ (0, J.jsx)("div", {
					"aria-busy": "true",
					"data-skeleton": "",
					"aria-label": "Read custom sources"
				}) : null,
				r.error ? /* @__PURE__ */ (0, J.jsx)(d, { children: P(r.error) }) : null,
				r.data?.items.map((t) => /* @__PURE__ */ (0, J.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [
						/* @__PURE__ */ (0, J.jsx)("span", {
							className: "min-w-0 flex-1",
							children: t.name
						}),
						/* @__PURE__ */ (0, J.jsx)(k, {
							tone: t.enabled ? "success" : "neutral",
							children: t.enabled ? "Enabled" : "Disabled"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "secondary",
							onClick: () => n(t),
							children: "Edit"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "secondary",
							...M(a.busy === t.id),
							onClick: () => void a.run(t.id, (e) => j(c, {
								...t,
								enabled: !t.enabled
							}, "POST", e), (n) => {
								o(n), e(t.enabled ? "Source disabled" : "Source enabled");
							}),
							children: t.enabled ? "Disabled" : "Enabled"
						}),
						/* @__PURE__ */ (0, J.jsx)(i, {
							variant: "danger",
							onClick: () => de({
								title: "Delete custom sources",
								body: `After deleting "${F(t.name)}", harvesting will no longer query this source.`,
								confirmLabel: "Delete source",
								danger: !0,
								onConfirm: async () => {
									o(await j(c, {
										action: "delete",
										id: t.id
									})), n(null), e("Source deleted");
								}
							}),
							children: "Delete"
						})
					]
				}, t.id)),
				a.error ? /* @__PURE__ */ (0, J.jsx)(d, { children: a.error }) : null
			] }) : null,
			t ? null : l ? /* @__PURE__ */ (0, J.jsx)(g, { children: u }) : /* @__PURE__ */ (0, J.jsx)(O, { children: /* @__PURE__ */ (0, J.jsx)("div", {
				className: "flex justify-end",
				children: u
			}) }),
			t ? /* @__PURE__ */ (0, J.jsx)(we, {
				initial: t,
				cancel: () => n(null),
				saved: (t) => {
					o(t), n(null), e("Source saved");
				}
			}, t.id || "new") : null
		]
	});
}
function we({ initial: e, cancel: t, saved: n }) {
	let [r, a] = (0, q.useState)(e), [o, s] = (0, q.useState)(""), [u, f] = (0, q.useState)(""), p = (0, q.useRef)(0), m = V(), y = (e) => {
		p.current++, a((t) => ({
			...t,
			...e
		})), f("");
	};
	return /* @__PURE__ */ (0, J.jsxs)("form", {
		"aria-label": "Metadata source configuration",
		"aria-busy": m.busy === "preview",
		onSubmit: (e) => {
			e.preventDefault(), m.run("save", (e) => j(c, r, "POST", e), n);
		},
		children: [/* @__PURE__ */ (0, J.jsxs)(O, { children: [
			/* @__PURE__ */ (0, J.jsx)(v, {
				label: "Source name",
				value: r.name,
				maxLength: 80,
				onChange: (e) => y({ name: e })
			}),
			/* @__PURE__ */ (0, J.jsx)(v, {
				label: "JSON API endpoint",
				value: r.endpoint,
				maxLength: 2048,
				placeholder: "https://example.com/api/movies/{code}",
				onChange: (e) => y({ endpoint: e })
			}),
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)(h, { children: "Source connection method" }), /* @__PURE__ */ (0, J.jsx)(D, {
					id: "custom-source-network",
					label: "Source connection method",
					epoch: 0,
					value: r.network || "direct",
					options: [["direct", "Direct"], ["peach_proxy", "Peach proxy"]],
					onPick: (e) => y({ network: e })
				})]
			}),
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)(h, { children: "API code format" }), /* @__PURE__ */ (0, J.jsx)(D, {
					id: "custom-source-code-format",
					label: "API code format",
					epoch: 0,
					value: r.code_format || "original",
					options: [
						["original", "As-is"],
						["lowercase", "Lowercase"],
						["compact", "Strip hyphens"],
						["underscore", "Hyphens to underscores"]
					],
					onPick: (e) => y({ code_format: e })
				})]
			}),
			/* @__PURE__ */ (0, J.jsx)(_, { children: "Fill in the public JSON endpoint and response field paths, e.g. data.title. The code field verifies video identity." }),
			be.map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(v, {
				label: `${t} field path`,
				value: r.fields[e] || "",
				onChange: (t) => {
					let n = { ...r.fields };
					t ? n[e] = t : delete n[e], y({ fields: n });
				}
			}, e)),
			/* @__PURE__ */ (0, J.jsx)("div", {
				className: "flex flex-wrap gap-3",
				role: "group",
				"aria-label": "Applicable content kinds",
				children: xe.map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(l, {
					isSelected: r.content_types.includes(e),
					onChange: (t) => y({ content_types: t ? [...r.content_types, e] : r.content_types.filter((t) => t !== e) }),
					children: t
				}, e))
			}),
			/* @__PURE__ */ (0, J.jsx)(l, {
				isSelected: r.enabled,
				onChange: (e) => y({ enabled: e }),
				children: "Enable the source"
			}),
			/* @__PURE__ */ (0, J.jsx)(v, {
				label: "Probe a code (Enter to search)",
				value: o,
				onChange: (e) => {
					p.current++, s(e), f("");
				},
				onKeyDown: (e) => {
					if (e.key !== "Enter" || N(e.nativeEvent)) return;
					e.preventDefault();
					let t = p.current;
					m.run("preview", (e) => j(c, {
						...r,
						code: o,
						action: "preview"
					}, "POST", e), (e) => {
						t === p.current && f(JSON.stringify(e.record, null, 2));
					}, (e) => {
						t === p.current && m.setError(P(e));
					});
				}
			}),
			m.busy === "preview" ? /* @__PURE__ */ (0, J.jsxs)(_, {
				role: "status",
				children: [/* @__PURE__ */ (0, J.jsx)("span", { dangerouslySetInnerHTML: { __html: _e("Probing the source") } }), "Probing the source"]
			}) : null,
			u ? /* @__PURE__ */ (0, J.jsx)(ye, {
				code: u,
				language: "json",
				label: "Metadata API response"
			}) : null,
			m.error ? /* @__PURE__ */ (0, J.jsx)(d, { children: m.error }) : null
		] }), /* @__PURE__ */ (0, J.jsxs)(g, { children: [/* @__PURE__ */ (0, J.jsx)(i, {
			variant: "secondary",
			type: "button",
			onClick: t,
			children: "Cancel"
		}), /* @__PURE__ */ (0, J.jsx)(i, {
			type: "submit",
			...M(m.busy === "save"),
			children: "Save source"
		})] })]
	});
}
// src/react/scraping/scraping-page.tsx
var Y = [["peach", "Peach proxy"], ["direct", "Direct connection"]];
function X(e) {
	return Y.some(([t]) => t === e) || !e ? [...Y] : [...Y, [e, e]];
}
function Z(e) {
	try {
		return new URL(e).host || e;
	} catch {
		return e;
	}
}
var Q = [["paste", "Paste cookies"], ["file", "Import file"]];
function Te() {
	return /* @__PURE__ */ (0, J.jsx)(K, { source: "github" });
}
function Ee({ source: t, toast: n }) {
	let [r, a] = (0, q.useState)(t.network), [o, s] = (0, q.useState)(""), [c, l] = (0, q.useState)(""), [u, p] = (0, q.useState)(Q[0][0]), [m, _] = (0, q.useState)(""), [y, b] = (0, q.useState)(""), S = (0, q.useRef)(null);
	function C() {
		s(""), l(""), _(""), b(""), S.current && (S.current.value = "");
	}
	let w = U({
		mutationFn: (e) => j(re, {
			source: t.source,
			network: r,
			cookie: o,
			cookies_text: c,
			revoke: e
		}),
		onSuccess: (e, t) => {
			B.setQueryData(T, (t) => t && {
				...t,
				sources: t.sources.map((t) => t.source === e.saved.source ? e.saved : t)
			}), C(), n(t ? "Cookies revoked" : "Source settings saved");
		}
	}), D = U({ mutationFn: () => j(ne, { source: t.source }) }), A = w.isPending || D.isPending, N = (e) => {
		e.preventDefault(), A || (D.reset(), w.mutate(!1));
	}, de = () => {
		A || (D.reset(), w.mutate(!0));
	}, F = () => {
		A || (w.reset(), D.mutate());
	};
	async function I(e) {
		let t = e.currentTarget, n = t.files?.[0];
		if (l(""), b(""), !n) _("");
		else if (n.size > 262144) t.value = "", _(""), b("The cookie text exceeds 256 KiB");
		else try {
			let e = await n.text();
			l(e), _(n.name);
		} catch {
			b("The cookie file was not read; choose it again");
		}
	}
	let L = y || (w.error ? P(w.error) : "") || (D.error ? P(D.error) : ""), R = D.data?.results ?? [], z = r === "peach" || t.accepts_cookie || t.browser || !!L || R.length > 0;
	return /* @__PURE__ */ (0, J.jsxs)(E, {
		title: t.label,
		onSubmit: N,
		aside: /* @__PURE__ */ (0, J.jsxs)("span", {
			className: "flex min-w-0 items-center gap-1",
			children: [/* @__PURE__ */ (0, J.jsx)(K, { source: t.source }), t.login ? /* @__PURE__ */ (0, J.jsx)(f, {
				href: t.login,
				children: Z(t.login)
			}) : null]
		}),
		children: [
			/* @__PURE__ */ (0, J.jsx)(te, { children: /* @__PURE__ */ (0, J.jsx)(le, {
				label: "Connection method",
				children: /* @__PURE__ */ (0, J.jsx)(se, {
					"aria-label": "Connection method",
					className: "w-44 min-w-0",
					selectedKey: r,
					onSelectionChange: (e) => {
						e !== null && a(String(e));
					},
					children: X(r).map(([e, t]) => /* @__PURE__ */ (0, J.jsx)(ce, {
						id: e,
						children: t
					}, e))
				})
			}) }),
			t.cooldown_until && t.cooldown_until > Date.now() / 1e3 ? /* @__PURE__ */ (0, J.jsx)(x, {
				tone: "warning",
				children: /* @__PURE__ */ (0, J.jsxs)("span", {
					className: "inline-flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, J.jsx)(k, {
						tone: "warning",
						children: "Cooling down"
					}), /* @__PURE__ */ (0, J.jsxs)("span", { children: [
						"Under ",
						(/* @__PURE__ */ new Date(t.cooldown_until * 1e3)).toLocaleString("zh-CN"),
						" then retry."
					] })]
				})
			}) : null,
			z ? /* @__PURE__ */ (0, J.jsxs)(O, {
				divided: !0,
				children: [
					r === "peach" ? /* @__PURE__ */ (0, J.jsx)("span", {
						className: "self-start",
						children: /* @__PURE__ */ (0, J.jsx)(ee, {
							href: "/settings/library#peachProxy",
							size: "small",
							trailingIcon: pe,
							children: "Configure Peach proxy"
						})
					}) : null,
					t.browser ? /* @__PURE__ */ (0, J.jsx)("p", {
						className: "text-body-2-regular text-text-secondary",
						children: "Human verification is completed automatically by the local browser; a window pops up when a click is needed. No cookies are needed on this machine."
					}) : null,
					t.accepts_cookie && !t.browser ? /* @__PURE__ */ (0, J.jsxs)(J.Fragment, { children: [
						/* @__PURE__ */ (0, J.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [/* @__PURE__ */ (0, J.jsx)("span", {
								className: "self-start",
								children: /* @__PURE__ */ (0, J.jsx)(k, {
									tone: t.cookie_saved ? "success" : "neutral",
									children: t.cookie_saved ? "Cookies saved" : "Cookies not configured"
								})
							}), /* @__PURE__ */ (0, J.jsx)("p", {
								className: "text-body-2-regular text-text-secondary",
								children: t.cookie_saved ? "Login validity pending verification." : "When login is required, provide a Cookie using any one of these methods."
							})]
						}),
						/* @__PURE__ */ (0, J.jsx)(oe, {
							"aria-label": "How to provide cookies (choose one)",
							value: u,
							onChange: (e) => {
								p(e), C();
							},
							className: ae,
							children: Q.map(([t, n]) => /* @__PURE__ */ (0, J.jsx)(e, {
								value: t,
								className: ie,
								children: n
							}, t))
						}),
						u === "paste" ? /* @__PURE__ */ (0, J.jsx)(v, {
							type: "password",
							label: "Cookie",
							autoComplete: "off",
							value: o,
							onChange: s
						}) : /* @__PURE__ */ (0, J.jsxs)("div", {
							className: "flex flex-col gap-2",
							children: [
								/* @__PURE__ */ (0, J.jsx)(h, { children: "Netscape Cookie file (.txt)" }),
								/* @__PURE__ */ (0, J.jsxs)("div", {
									className: "flex flex-wrap items-center gap-3",
									children: [/* @__PURE__ */ (0, J.jsx)(i, {
										variant: "secondary",
										onClick: () => S.current?.click(),
										children: "Choose file"
									}), /* @__PURE__ */ (0, J.jsx)("span", {
										className: "min-w-0 text-body-2-regular break-all text-text-secondary",
										children: m || "No file selected"
									})]
								}),
								/* @__PURE__ */ (0, J.jsx)("input", {
									ref: S,
									type: "file",
									accept: ".txt",
									tabIndex: -1,
									"aria-hidden": !0,
									className: "hidden",
									onChange: (e) => {
										I(e);
									}
								})
							]
						})
					] }) : null,
					L ? /* @__PURE__ */ (0, J.jsx)(d, { children: L }) : null,
					R.map((e) => /* @__PURE__ */ (0, J.jsx)(x, {
						tone: e.ok ? "success" : "error",
						children: /* @__PURE__ */ (0, J.jsxs)("span", {
							className: "flex flex-col items-start gap-1",
							children: [/* @__PURE__ */ (0, J.jsx)(ve, {
								tone: e.ok ? "success" : "error",
								children: e.ok ? "Accessible" : "Connection failed"
							}), /* @__PURE__ */ (0, J.jsx)("span", { children: ue(e, t.label) })]
						})
					}, e.label))
				]
			}) : null,
			/* @__PURE__ */ (0, J.jsxs)(g, { children: [
				t.accepts_cookie && t.cookie_saved ? /* @__PURE__ */ (0, J.jsx)(i, {
					variant: "secondary",
					onClick: de,
					...M(A),
					children: "Revoke Cookie"
				}) : null,
				/* @__PURE__ */ (0, J.jsx)(i, {
					variant: "secondary",
					onClick: F,
					...M(A),
					children: "Check connection"
				}),
				/* @__PURE__ */ (0, J.jsx)(i, {
					type: "submit",
					...M(A),
					children: "Save"
				})
			] })
		]
	});
}
var De = {
	ok: "success",
	auth: "warning",
	http: "error",
	cooldown: "warning",
	network: "error",
	skipped: "neutral"
}, $ = [
	"ok",
	"auth",
	"cooldown",
	"http",
	"network",
	"skipped"
];
function Oe(e, t) {
	return t.label === "Source page" ? e.label : `${e.label} images`;
}
function ke({ toast: e }) {
	let { job: t, running: n, start: r, query: o } = H({
		queryKey: a,
		queryFn: ({ signal: e }) => L(e),
		start: () => j(C, {}),
		onFinish: (t) => {
			B.invalidateQueries({
				queryKey: T,
				exact: !0
			}), t.status === "complete" && e(t.failed ? `Check finished, ${t.failed} failed` : "Check finished, all reachable");
		}
	}), s = (e) => {
		e.preventDefault(), !o.data || n || r.isPending || r.mutate();
	}, c = (t?.results ?? []).flatMap((e) => e.results.map((t) => ({
		source: e.source,
		name: Oe(e, t),
		check: t
	}))), l = (e, t) => /* @__PURE__ */ (0, J.jsxs)("span", {
		className: "inline-flex min-w-0 items-center gap-1.5",
		children: [/* @__PURE__ */ (0, J.jsx)(K, { source: e }), t]
	}), d = c.filter(({ check: e }) => e.outcome === "ok"), f = c.filter(({ check: e }) => e.outcome !== "ok").sort((e, t) => $.indexOf(e.check.outcome) - $.indexOf(t.check.outcome)), h = r.error ? P(r.error) : o.error ? P(o.error) : t?.status === "failed" ? t.error || "Check unfinished" : "", v = t?.status === "complete" && t.completed_at ? [me((/* @__PURE__ */ new Date(t.completed_at * 1e3)).toISOString()), t.elapsed_s === void 0 ? "" : `Took ${t.elapsed_s.toFixed(1)} s`].filter(Boolean).join(" · ") : "";
	return /* @__PURE__ */ (0, J.jsxs)(E, {
		id: "check-all",
		title: "Connectivity check",
		onSubmit: s,
		children: [/* @__PURE__ */ (0, J.jsxs)(O, { children: [
			o.isPending ? /* @__PURE__ */ (0, J.jsx)("div", {
				role: "status",
				"aria-label": "Reading the connection check state",
				"data-skeleton": "",
				className: "skeleton-sheen h-6 rounded-md"
			}) : null,
			/* @__PURE__ */ (0, J.jsx)(_, { children: "Checks each source page and the DMM HD image servers. Reachable only means the address answers, not that the login works." }),
			n ? /* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-col gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)(S, {
					label: "Connectivity check progress",
					value: t?.checked ?? 0,
					max: t?.total ?? 0
				}), /* @__PURE__ */ (0, J.jsxs)(_, {
					role: "status",
					children: [
						"Checked ",
						t?.checked ?? 0,
						" / ",
						t?.total ?? 0,
						" sources"
					]
				})]
			}) : null,
			h ? /* @__PURE__ */ (0, J.jsx)(x, {
				tone: "error",
				children: h
			}) : null,
			c.length ? /* @__PURE__ */ (0, J.jsx)("div", {
				className: "flex flex-wrap gap-2",
				children: $.map((e) => {
					let t = c.filter(({ check: t }) => t.outcome === e).length;
					return t ? /* @__PURE__ */ (0, J.jsxs)(k, {
						tone: De[e],
						children: [
							c.find(({ check: t }) => t.outcome === e)?.check.outcome_label,
							" ",
							t
						]
					}, e) : null;
				})
			}) : null,
			f.length ? /* @__PURE__ */ (0, J.jsx)("ul", {
				className: "flex min-w-0 flex-col",
				children: f.map(({ source: e, name: t, check: n }) => /* @__PURE__ */ (0, J.jsx)(y, {
					title: l(e, t),
					children: /* @__PURE__ */ (0, J.jsxs)("span", {
						className: "flex flex-wrap items-center gap-2",
						children: [/* @__PURE__ */ (0, J.jsx)(k, {
							tone: De[n.outcome],
							children: n.outcome_label
						}), n.message ? /* @__PURE__ */ (0, J.jsx)("span", {
							className: "text-body-2-regular text-text-secondary",
							children: n.message
						}) : null]
					})
				}, t))
			}) : null,
			d.length ? /* @__PURE__ */ (0, J.jsx)(u, {
				summary: `${d.length} reachable`,
				children: /* @__PURE__ */ (0, J.jsx)(m, { children: d.map(({ source: e, name: t, check: n }) => /* @__PURE__ */ (0, J.jsx)(p, {
					term: l(e, t),
					children: [n.width ? `${n.width} × ${n.height}` : "", n.elapsed_s === void 0 ? "" : `${n.elapsed_s.toFixed(2)} s`].filter(Boolean).join(" · ")
				}, t)) })
			}) : null
		] }), /* @__PURE__ */ (0, J.jsx)(g, {
			status: v ? `Last check ${v}` : void 0,
			children: /* @__PURE__ */ (0, J.jsx)(i, {
				type: "submit",
				disabled: !o.data,
				...M(n || r.isPending),
				children: "All checks"
			})
		})]
	});
}
function Ae({ toast: e }) {
	let [t, n] = (0, q.useState)(""), { running: r, outcome: a, start: s, query: c } = H({
		queryKey: o,
		queryFn: ({ signal: e }) => R(e),
		start: () => j(w, { code: t }),
		onFinish: (t) => {
			t.status === "complete" && e(t.result || "Cover scraping finished");
		}
	}), l = (e) => {
		e.preventDefault(), c.data && !r && !s.isPending && t.trim() && s.mutate();
	}, u = s.error ? P(s.error) : c.error ? P(c.error) : a?.status === "failed" ? a.error || "Scrape not fetched" : "";
	return /* @__PURE__ */ (0, J.jsx)(E, {
		title: "HD cover",
		onSubmit: l,
		children: /* @__PURE__ */ (0, J.jsxs)(O, { children: [
			c.isPending ? /* @__PURE__ */ (0, J.jsx)("div", {
				role: "status",
				"aria-label": "Reading the cover task state",
				"data-skeleton": "",
				className: "skeleton-sheen h-6 rounded-md"
			}) : null,
			/* @__PURE__ */ (0, J.jsxs)("div", {
				className: "flex flex-wrap items-end gap-2",
				children: [/* @__PURE__ */ (0, J.jsx)("div", {
					className: "min-w-0 flex-1",
					children: /* @__PURE__ */ (0, J.jsx)(v, {
						"aria-label": "Library code",
						isRequired: !0,
						isDisabled: r,
						value: t,
						onChange: n,
						placeholder: "Enter a library code, e.g. ABW-232"
					})
				}), /* @__PURE__ */ (0, J.jsx)(i, {
					type: "submit",
					disabled: !c.data || !t.trim(),
					...M(r || s.isPending),
					children: "Scrape cover"
				})]
			}),
			r ? /* @__PURE__ */ (0, J.jsx)(b, { label: "Scraping covers" }) : null,
			u ? /* @__PURE__ */ (0, J.jsx)(x, {
				tone: "error",
				children: u
			}) : null,
			a?.status === "complete" ? /* @__PURE__ */ (0, J.jsx)(x, {
				tone: "success",
				children: a.result || "Cover scraping finished"
			}) : null
		] })
	});
}
function je({ toast: e }) {
	let { query: a, running: o, outcome: s, start: c } = H({
		queryKey: n,
		queryFn: ({ signal: e }) => I(e),
		start: () => j(r, {}),
		jobOf: (e) => e.job,
		withJob: (e, t) => e && {
			...e,
			job: t
		},
		onFinish: (t) => {
			t.status === "complete" && e(t.result || "The amane bridge was rebuilt");
		}
	}), l = U({ mutationFn: () => j(t, {}) }), d = a.data;
	if (!d) return a.error ? /* @__PURE__ */ (0, J.jsx)(E, {
		id: "amane",
		title: "amane",
		children: /* @__PURE__ */ (0, J.jsx)(O, { children: /* @__PURE__ */ (0, J.jsx)(x, {
			tone: "error",
			children: P(a.error)
		}) })
	}) : null;
	let h = o || c.isPending || l.isPending, v = c.error ? P(c.error) : l.error ? P(l.error) : s?.status === "failed" ? s.error || "Rebuild unfinished" : "";
	return /* @__PURE__ */ (0, J.jsxs)(E, {
		id: "amane",
		title: "amane",
		aside: /* @__PURE__ */ (0, J.jsx)(f, {
			href: d.repository,
			leadingIcon: Te,
			children: d.repository
		}),
		children: [
			/* @__PURE__ */ (0, J.jsxs)(m, { children: [
				/* @__PURE__ */ (0, J.jsx)(p, {
					term: "Installed version",
					children: d.installed_version || "Not installed"
				}),
				/* @__PURE__ */ (0, J.jsx)(p, {
					term: "Latest upstream version",
					children: l.data?.latest ?? "Not checked yet"
				}),
				/* @__PURE__ */ (0, J.jsx)(p, {
					term: "Runtime environment",
					children: d.installed ? "Installed" : "Not installed"
				}),
				/* @__PURE__ */ (0, J.jsxs)(p, {
					term: "Built-in sites",
					children: [d.sites.length.toLocaleString(), " items"]
				})
			] }),
			/* @__PURE__ */ (0, J.jsxs)(O, {
				divided: !0,
				children: [
					d.sites.length ? /* @__PURE__ */ (0, J.jsx)(u, {
						summary: "View built-in sites",
						children: /* @__PURE__ */ (0, J.jsx)("p", {
							className: "text-body-2-regular text-text-secondary",
							children: d.sites.map((e) => e.label).join("、")
						})
					}) : null,
					d.problem ? /* @__PURE__ */ (0, J.jsx)(x, {
						tone: "error",
						children: d.problem
					}) : /* @__PURE__ */ (0, J.jsxs)(_, { children: [
						"amane (",
						d.license,
						"') provides resolution for these built-in sites. The first time one is needed, Peach automatically prepares the pinned '",
						d.version,
						" Version; used directly when the installer already ships a working environment. Manual installs also use this version and do not auto-upgrade with upstream."
					] }),
					o ? /* @__PURE__ */ (0, J.jsx)(b, { label: "Rebuilding the runtime environment" }) : null,
					v ? /* @__PURE__ */ (0, J.jsx)(x, {
						tone: "error",
						children: v
					}) : null,
					s?.status === "complete" ? /* @__PURE__ */ (0, J.jsx)(x, {
						tone: "success",
						children: s.result || "The amane bridge was rebuilt"
					}) : null
				]
			}),
			/* @__PURE__ */ (0, J.jsxs)(g, { children: [/* @__PURE__ */ (0, J.jsx)(i, {
				variant: "secondary",
				onClick: () => {
					h || l.mutate();
				},
				...M(l.isPending),
				children: "Check upstream version"
			}), /* @__PURE__ */ (0, J.jsx)(i, {
				disabled: !!d.problem,
				onClick: () => {
					h || c.mutate();
				},
				...M(o || c.isPending),
				children: d.installed ? "Reinstall" : "Install"
			})] })
		]
	});
}
function Me({ toast: e }) {
	let t = W({
		queryKey: T,
		queryFn: ({ signal: e }) => fe(e)
	}), n = t.data;
	return n ? /* @__PURE__ */ (0, J.jsxs)(G, { children: [
		/* @__PURE__ */ (0, J.jsx)("p", {
			className: "text-body-2-regular text-text-secondary",
			children: "HD images may need the proxy to download; check the connection first."
		}),
		/* @__PURE__ */ (0, J.jsx)(ke, { toast: e }),
		/* @__PURE__ */ (0, J.jsx)(Ae, { toast: e }),
		/* @__PURE__ */ (0, J.jsx)(Ce, { receipt: e }),
		(n.sources || []).map((t) => /* @__PURE__ */ (0, J.jsx)(Ee, {
			source: t,
			toast: e
		}, t.source)),
		/* @__PURE__ */ (0, J.jsx)(je, { toast: e })
	] }) : /* @__PURE__ */ (0, J.jsx)(G, { children: /* @__PURE__ */ (0, J.jsx)(x, {
		tone: "error",
		title: "Reading scrape sources failed",
		children: t.error ? P(t.error) : "Reading scrape sources failed"
	}) });
}
export { Me as ScrapingPage, Z as linkHost, X as networkOptions };

//# debugId=52ecc5de-4bc2-402e-bfb4-208892984398