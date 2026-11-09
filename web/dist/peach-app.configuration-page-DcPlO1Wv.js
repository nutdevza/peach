(function() {
	try {
		var e = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {}, t = new e.Error().stack;
		t && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[t] = "8e63bf87-00ef-4280-90a5-a9d316ed1ded", e._sentryDebugIdIdentifier = "sentry-dbid-8e63bf87-00ef-4280-90a5-a9d316ed1ded");
	} catch {}
})();
import { $2ec61d1d4f780267$export$a8a3e93435678ff9 as e, $3a442827418ebe87$export$eb2fcfdbd7ba97d4 as t, $542a13ca2fa5b484$export$5b6b19405a83ff9d as n, $72abaeab4d80592f$export$78efe591171d7d45 as r, $bd263d78e9bf3c56$export$f5c9f3c2c4054eec as i, $ea3928288112382f$export$439d29a4e110a164 as a, $f2ff30fde7b014be$export$3ddf2d174ce01153 as o, $fe21c36db05242bb$export$a98f0dcb43a68a25 as s, $fe21c36db05242bb$export$d7b12c4107be0d61 as c, ACCENTS as l, ApiError as u, Button as d, ButtonLink as f, CLOUD_LOCATIONS as p, CLOUD_PROXY_HELP as m, CONFIGURATION_KEY as h, CONFIGURATION_URL as g, CREDENTIAL_STATE as _, Checkbox as v, Chip as y, CommandSteps as b, Disclosure as x, ENTRY_LINKS_HELP as S, ENTRY_LINKS_HINT as C, EmptyState as ee, ErrorText as w, Eu as T, ExternalLink as E, FEED_SCHEDULE_KEY as D, FOLLOW_CREDENTIALS_KEY as O, FOLLOW_INITIAL_RANGE_OPTIONS as te, FOLLOW_SCHEDULE_KEY as ne, Fact as k, FactList as A, FieldLabel as re, Footer as j, Help as M, HintText as ie, Input as N, L1 as ae, LIBRARY_FOLDER_HELP as oe, LIBRARY_PROCESSING_KEY as se, Label as ce, LinkButton as le, LoadingDots as ue, M6 as de, MEDIA_PROCESSING_KEY as fe, MEDIA_PROCESSING_URL as pe, MEDIA_SOURCE_ICONS as me, MENU_POPOVER_SURFACE as he, Note as P, PICK_FOLDER_URL as ge, POLICY_COLUMNS as _e, POLICY_COVER_NOTE as ve, POLICY_MATRIX as ye, POLICY_SUMMARY as be, PathLine as xe, ProcessingMode as Se, Progress as Ce, RELEASE_NOTICE_EVENT as we, REPAIR_CENTER_PATH as Te, Rows as F, SEGMENT as Ee, SEGMENTED_TRACK as De, SETTINGS_KEY as Oe, SETTINGS_URL as ke, Section as I, SectionSkeleton as Ae, SegmentedRadioGroup as je, Select as Me, Select$1 as L, SelectItem as R, SettingsCard as Ne, SettingsRow as z, SiteLabel as Pe, SortableBoardTabs as Fe, SourceLabel as Ie, SourceMark as Le, Stack as B, StatusLabel as V, Switch as H, THUMBNAIL_JOBS_KEY as Re, TaskCenterLink as ze, TextField as Be, TextFieldContext as Ve, Uz as He, __toESM as Ue, _p as We, animate as Ge, apiGet as U, apiSend as W, appSettingsStore as Ke, boundedPreference as qe, busyProps as G, cardClass as Je, cloudProxySkeleton as Ye, clsx as Xe, cn as Ze, confirmModal as K, credentialDone as Qe, credentialsSkeleton as $e, cx as et, d6 as tt, devicesSkeleton as nt, errorMessage as q, fetchConfiguration as rt, fetchCredentials as it, fetchFeedSchedule as at, fetchFollowSchedule as ot, fetchLibraryProcessing as st, fetchMediaProcessing as ct, fetchSettings as lt, fetchThumbnailJobs as ut, fmtSize as J, i2 as dt, indexersSkeleton as ft, javBrowserSkeleton as pt, l1 as mt, momentText as ht, motion as gt, overlayHost as _t, peachHistory$1 as vt, previewLibraryColor as yt, processingActive as bt, providerIcon as xt, queryClient as St, randomId as Ct, rememberShape as wt, require_jsx_runtime as Tt, require_react as Et, restartEffectText as Dt, saveCredential as Ot, schedulePollInterval as kt, settingsPath as At, shellNavigate as jt, sortCx as Mt, sourceDefaultCost as Nt, useAction as Y, useClientUpdates as Pt, useLibraryTints as Ft, useMutation as It, useOrderedLibraries as Lt, useQuery as X, useQueryClient as Rt, useReducedMotion as zt, useRunSchedule as Bt, useSaveFollowSchedule as Vt, useSaveSettings as Ht, useSaveThumbnailMode as Ut, we as Wt, z3 as Gt } from "./peach-app.js";
import { ConnectionStatus as Kt } from "./peach-app.connection-status-B0tSnjj0.js";
import { CodeBlock as qt } from "./peach-app.code-block-Cqr-O1m6.js";
import { AnimatedItems as Jt, Cell as Yt, ChartBackground as Xt, ChartContainer as Zt, ChartLegend as Qt, ChartLegendContent as $t, ChartTip as en, ChartTooltip as tn, ChartTooltipContent as nn, Curve as rn, DATA_ITEM_GRAPHICAL_ITEM_ID_ATTRIBUTE_NAME as an, DATA_ITEM_INDEX_ATTRIBUTE_NAME as on, DefaultZIndexes as sn, EvilBarChart as cn, LabelList as ln, LabelListFromLabelProp as un, Layer as dn, LoadingIndicator as fn, PolarChart as pn, PolarLabelContextProvider as mn, PolarLabelListContextProvider as hn, RegisterGraphicalItemId as gn, Sector as _n, SetPolarGraphicalItem as vn, SetPolarLegendPayload as yn, SetTooltipEntrySettings as bn, Shape as xn, TIP_SWATCH as Sn, Text as Cn, ZIndexLayer as wn, adaptEventsOfChild as Tn, arrayTooltipSearcher as En, createSelector as Dn, defaultPolarChartProps as On, findAllByType as kn, get as An, getClassNameFromUnknown as jn, getColorsCount as Mn, getMaxRadius as Nn, getPercentValue as Pn, getTooltipNameProp as Fn, getValueByDataKey as In, interpolate as Ln, isNumber as Rn, matchAppend as zn, mathSign as Bn, polarToCartesian as Vn, resolveDefaultProps as Hn, selectActiveTooltipDataKey as Un, selectActiveTooltipGraphicalItemId as Wn, selectActiveTooltipIndex as Gn, selectChartDataAndAlwaysIgnoreIndexes as Kn, selectChartOffsetInternal as qn, selectUnfilteredPolarItems as Jn, svgPropertiesNoEvents as Yn, svgPropertiesNoEventsFromUnknown as Xn, tone as Zn, useAnimationCallbacks as Qn, useAppSelector as $n, useMouseClickItemDispatch as er, useMouseEnterItemDispatch as tr, useMouseLeaveItemDispatch as nr, usePolarChartLayout as rr } from "./peach-app.chart-tip-CRxYp6KT.js";
import { FolderField as ir, FolderFieldLine as ar, FolderRow as or, MEDIA_SOURCES as sr, MediaReadPolicy as cr, MediaReadPolicyHelp as lr, SourceSelect as ur, isCloudSource as dr, sourceMark as fr, useFolderRows as pr } from "./peach-app.folder-rows-c6xBdYCX.js";
import { BrowserIcon as mr, browserIconId as hr } from "./peach-app.browser-icon-N9Od-bAf.js";
import { SourceIcon as gr } from "./peach-app.source-view-Cr-fzNHo.js";
// src/react/settings/configuration-panel.ts
var Z = /* @__PURE__ */ Ue(Et(), 1), _r = "flex flex-col gap-6";
function vr(e) {
	return e ? {
		className: e.active ? `${_r} ui-board-group-active` : _r,
		"data-board-group": String(e.index),
		id: e.id,
		role: "tabpanel",
		"aria-labelledby": e.labelledBy
	} : { className: _r };
}
// src/react/settings/userscript-probe.ts
function yr() {
	let e = (0, Z.useRef)(null), [t, n] = (0, Z.useState)(0), [r, i] = (0, Z.useState)("checking");
	return (0, Z.useEffect)(() => {
		let t = Ct(), n = !1, r = e.current, a, o = () => {
			n = !0, clearInterval(u), i("missing");
		}, s = () => {
			n || (clearTimeout(a), a = setTimeout(o, 3e3), c());
		}, c = () => e.current?.contentWindow?.postMessage({
			type: "peach-userscript:probe",
			nonce: t
		}, window.location.origin), l = (r) => {
			!n && r.source === e.current?.contentWindow && r.origin === window.location.origin && r.data?.type === "peach-userscript:ready" && r.data.nonce === t && r.data.protocol === 1 && typeof r.data.version == "string" && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(r.data.version) && typeof r.data.paired == "boolean" && (n = !0, clearInterval(u), clearTimeout(a), i({
				version: r.data.version,
				paired: r.data.paired
			}));
		};
		window.addEventListener("message", l);
		let u = setInterval(c, 250);
		return a = setTimeout(o, 15e3), r?.addEventListener("load", s), r?.contentDocument?.readyState === "complete" && r.contentDocument.URL !== "about:blank" && s(), c(), () => {
			clearInterval(u), clearTimeout(a), r?.removeEventListener("load", s), window.removeEventListener("message", l);
		};
	}, [t]), {
		frame: e,
		attempt: t,
		status: r,
		retry: () => {
			r !== "checking" && (i("checking"), n((e) => e + 1));
		}
	};
}
// src/react/settings/userscript-status.tsx
var Q = Tt();
function br(e, t) {
	let n = e.split(".").map(Number), r = t.split(".").map(Number);
	for (let e = 0; e < 3; e++) if (n[e] !== r[e]) return n[e] > r[e];
	return !0;
}
function xr({ enabled: e, release: t }) {
	let { frame: n, attempt: r, status: i, retry: a } = yr(), o = typeof i == "object", s = o && !br(i.version, t.minimum_version), c = o && !br(i.version, t.version), l = i === "checking" ? "progress" : i === "missing" ? "neutral" : s || c || !i.paired ? "warning" : "success", u = i === "checking" ? "Detecting" : i === "missing" ? "Not detected" : s ? "Needs update" : c ? "Updatable" : i.paired ? "Connected" : "Pending pairing", f = i === "checking" ? "checking" : i === "missing" ? "missing" : s ? "required" : c ? "available" : i.paired ? e ? "enabled" : "disabled" : "unpaired";
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)("iframe", {
		ref: n,
		title: "Peach userscript detection",
		hidden: !0,
		src: "/integrations/peach-userscript-bridge"
	}, r), /* @__PURE__ */ (0, Q.jsxs)("div", {
		"aria-live": "polite",
		"data-userscript-status": "",
		className: Je({
			variant: "raised",
			bordered: "line",
			className: "flex flex-col gap-3"
		}),
		children: [
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, Q.jsx)("span", {
					className: "text-body-medium text-text-primary",
					children: "Peach userscript"
				}), /* @__PURE__ */ (0, Q.jsx)(Kt, {
					tone: l,
					children: /* @__PURE__ */ (0, Q.jsx)("span", {
						"data-copy-key": `userscript.${f}.status`,
						children: u
					})
				})]
			}),
			o ? /* @__PURE__ */ (0, Q.jsxs)("p", {
				"data-copy-key": "userscript.installed.version",
				className: "text-body-regular text-text-secondary",
				children: ["Userscript v", i.version]
			}) : null,
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, Q.jsx)("span", {
					className: "text-body-regular text-text-secondary",
					children: "Add browser"
				}), /* @__PURE__ */ (0, Q.jsx)(V, {
					tone: e ? "success" : "neutral",
					children: /* @__PURE__ */ (0, Q.jsx)("span", {
						"data-copy-key": `userscript.adding.${e ? "enabled" : "disabled"}`,
						children: e ? "Enabled" : "Not enabled"
					})
				})]
			}),
			/* @__PURE__ */ (0, Q.jsx)("p", {
				"data-copy-key": `userscript.${f}.message`,
				className: "text-caption-1-regular text-text-secondary",
				children: i === "checking" ? "Detecting the userscript in the current browser." : i === "missing" ? "Confirm the script is enabled and updated to the latest version. On Chrome, also enable \"Allow user scripts\" or developer mode in the Tampermonkey extension details, and allow access to the current Peach site; refresh the page and check again." : s ? `Please update to v${t.minimum_version} or later.` : c ? `User script v${t.version} can be updated.` : i.paired ? e ? "Supported sites can add directly to your Peach library." : "With browser adding enabled, you can add to the Peach library directly on supported sites." : "Generate a token, copy the pairing info, then paste and save it in the userscript settings."
			}),
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					i === "missing" || s || c ? /* @__PURE__ */ (0, Q.jsx)(E, {
						href: t.install_url,
						children: /* @__PURE__ */ (0, Q.jsx)("span", {
							"data-copy-key": `userscript.${i === "missing" ? "install" : "update"}.action`,
							children: s || c ? "Update the userscript" : "Install the Peach userscript"
						})
					}) : null,
					i === "missing" ? /* @__PURE__ */ (0, Q.jsx)(E, {
						href: "https://www.tampermonkey.net/faq.php#Q209",
						children: "Tampermonkey permission setup notes"
					}) : null,
					/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						type: "button",
						...G(i === "checking"),
						onClick: a,
						children: "Detect again"
					})
				]
			})
		]
	})] });
}
// src/react/settings/jav-browser-settings.tsx
var Sr = "/api/configuration/jav-browser";
function Cr({ receipt: e, refreshKey: t }) {
	let n = X({
		queryKey: ["jav-browser-settings", t],
		queryFn: ({ signal: e }) => U(Sr, e),
		refetchOnMount: "always",
		refetchOnWindowFocus: "always"
	});
	return n.error && !n.data ? /* @__PURE__ */ (0, Q.jsx)(w, { children: q(n.error) }) : n.isFetching && !n.data ? /* @__PURE__ */ (0, Q.jsx)(Ae, {
		label: "Reading browser add settings",
		html: pt
	}) : n.data ? /* @__PURE__ */ (0, Q.jsx)(wr, {
		initial: n.data,
		receipt: e
	}) : null;
}
function wr({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(e.provider), [o, s] = (0, Z.useState)(""), c = Y();
	(0, Z.useEffect)(() => {
		wt("javBrowser", {
			enabled: e.enabled,
			ready: e.providers.some((t) => t.key === e.provider && t.configured && t.target)
		}), r(e), a((t) => e.providers.some((e) => e.key === t) ? t : e.provider), e.enabled || s("");
	}, [e]);
	let l = (e) => {
		c.run(e, (t) => W(Sr, {
			action: e,
			provider: i
		}, "POST", t), (n) => {
			let { token: i = "", ...o } = n;
			r(o), a(o.provider), s(i), t(e === "disable" ? "Browser adding turned off" : "Dedicated token generated");
		});
	}, u = n.providers.some((e) => e.key === i && e.configured && e.target);
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "browser",
		title: "Add JAV via browser",
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 flex-col gap-4",
			children: [
				/* @__PURE__ */ (0, Q.jsx)(xr, {
					enabled: n.enabled,
					release: n.userscript
				}),
				/* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex flex-col gap-1",
					children: [/* @__PURE__ */ (0, Q.jsx)(re, { children: "Browser-added download channels" }), /* @__PURE__ */ (0, Q.jsx)(L, {
						"aria-label": "Browser-added download channels",
						selectedKey: i || null,
						placeholder: "'No channels available yet'",
						onSelectionChange: (e) => {
							e !== null && a(String(e));
						},
						isDisabled: !n.providers.length || !!c.busy,
						children: n.providers.map((e) => /* @__PURE__ */ (0, Q.jsx)(R, {
							id: e.key,
							textValue: e.label,
							children: /* @__PURE__ */ (0, Q.jsx)(Ie, {
								source: e.key,
								label: e.label
							})
						}, e.key))
					})]
				}),
				u ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: "Add a cloud-download-capable drive in the library and configure its account and target folder." }),
				n.problems?.map((e) => /* @__PURE__ */ (0, Q.jsx)(M, { children: e }, e)),
				n.enabled && n.active_provider && !n.providers.some((e) => e.key === n.active_provider) ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "The enabled download channel is unavailable; choose a channel and update the token." }) : null,
				/* @__PURE__ */ (0, Q.jsx)(N, {
					label: "Peach address",
					value: window.location.origin,
					isReadOnly: !0,
					autoComplete: "off"
				}),
				o ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
					/* @__PURE__ */ (0, Q.jsx)(N, {
						label: "Dedicated token for browser adds",
						type: "password",
						value: o,
						isReadOnly: !0,
						autoComplete: "new-password"
					}),
					/* @__PURE__ */ (0, Q.jsx)("div", { children: /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						type: "button",
						onClick: () => {
							c.run("copy", async () => navigator.clipboard.writeText(JSON.stringify({
								peach_pairing: 1,
								base: window.location.origin,
								token: o
							})), () => t("Pairing info copied"));
						},
						...G(c.busy === "copy"),
						children: "Copy the pairing info"
					}) }),
					/* @__PURE__ */ (0, Q.jsx)(M, { children: "Paste the pairing info into \"Peach address\" in the userscript settings to fill in the address and token." })
				] }) : null
			]
		}), c.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: c.error }) : null] }), /* @__PURE__ */ (0, Q.jsxs)(j, { children: [n.enabled ? /* @__PURE__ */ (0, Q.jsx)(d, {
			variant: "secondary",
			type: "button",
			disabled: !!c.busy,
			onClick: () => l("disable"),
			children: "Close browser add"
		}) : null, /* @__PURE__ */ (0, Q.jsx)(d, {
			type: "button",
			disabled: !n.available || !u || !!c.busy,
			onClick: () => l(n.enabled ? "rotate" : "enable"),
			...G(c.busy === "enable" || c.busy === "rotate"),
			children: n.enabled ? "Update channels and tokens" : "Enable and generate a token"
		})] })]
	});
}
// src/react/settings/download-settings.tsx
var Tr = "/api/configuration/downloads", Er = "/api/configuration/downloads/check", Dr = "/api/configuration/downloads/folder", Or = "/api/configuration/downloads/pikpak/login", kr = "/api/configuration/downloads/pikpak/logout", Ar = "/api/configuration/downloads/pikpak/browser-login", jr = 2e3, Mr = xt("pikpak");
function Nr({ initial: e, receipt: t, panel: n, issues: r }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(n),
		children: [r, e ? /* @__PURE__ */ (0, Q.jsx)(Pr, {
			initial: e,
			receipt: t
		}) : null]
	});
}
function Pr({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)("");
	(0, Z.useEffect)(() => {
		r((t) => ({
			...t,
			media_sources: e.media_sources,
			pikpak_roots: e.pikpak_roots
		}));
	}, [e.media_sources, e.pikpak_roots]);
	let o = n.media_sources ?? [], s = o.includes("pikpak"), c = o.some((e) => p.includes(e)), l = s && (n.pikpak.logged_in || !!i.trim());
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		c ? /* @__PURE__ */ (0, Q.jsx)(Fr, {
			state: n,
			settle: r,
			receipt: t,
			pikpakAccount: l
		}) : null,
		s ? /* @__PURE__ */ (0, Q.jsx)(Rr, {
			state: n,
			settle: r,
			receipt: t,
			username: i,
			setUsername: a
		}) : null,
		/* @__PURE__ */ (0, Q.jsx)(Cr, {
			receipt: t,
			refreshKey: JSON.stringify([
				n.media_sources,
				n.config,
				n.token_set,
				n.pikpak.logged_in
			])
		})
	] });
}
function Fr({ state: e, settle: t, receipt: n, pikpakAccount: r }) {
	let [i, a] = (0, Z.useState)(e.config), [o, s] = (0, Z.useState)(""), [c, l] = (0, Z.useState)(String(e.config.wait_hours)), [u, f] = (0, Z.useState)(null), [p, m] = (0, Z.useState)(""), [h, g] = (0, Z.useState)(Ir), [_, v] = (0, Z.useState)(""), [y, b] = (0, Z.useState)(!1), x = Y(), S = e.media_sources ?? [], C = S.includes("115"), ee = S.includes("pikpak"), T = (e) => i.targets[e] ?? "", E = (e, t) => a({
		...i,
		targets: {
			...i.targets,
			[e]: t
		}
	}), D = C && !(!h.target || h.target.exists || T("115") !== h.target.path), O = (e, t, n = "") => {
		let r = t.target ? e.suggested_target : null, i = !!(r && n && r.path === n), o = t.root ? e.suggested_pikpak_root : "";
		a((n) => ({
			...n,
			clouddrive_address: t.address && e.address ? e.address : n.clouddrive_address,
			targets: r && !i ? {
				...n.targets,
				115: r.path
			} : n.targets,
			pikpak_root: o || n.pikpak_root
		})), f(e), m(t.address ? e.address : ""), g({
			target: r,
			root: o,
			saved: i
		}), b(!1), v("");
	};
	return (0, Z.useEffect)(() => {
		if (!e.available || !e.config.clouddrive_address || !e.token_set) return;
		let t = {
			address: !1,
			target: !e.config.targets[115],
			root: !e.config.pikpak_root
		};
		x.run("auto", (e) => U(Er, e), (e) => O(e, t), (e) => v(q(e)));
	}, []), /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "download",
		title: "Cloud download",
		onSubmit: (e) => {
			if (e.preventDefault(), D) {
				b(!0);
				return;
			}
			let u = !T("115").trim(), d = {
				...i,
				wait_hours: c,
				token: o,
				pikpak_account: r
			};
			x.run("save", (e) => W(Tr, d, "POST", e), (e) => {
				let { report: r, ...i } = e;
				t(i), a(i.config), l(String(i.config.wait_hours)), s(""), r ? O(r, {
					address: !i.config.clouddrive_address,
					target: u,
					root: !i.config.pikpak_root
				}, i.config.targets[115] ?? "") : (f(null), m(""), g(Ir), b(!1), v("")), n("Configuration saved");
			}, (e) => v(q(e)));
		},
		children: [
			e.problems?.length ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "Cloud download configuration needs checking",
				children: e.problems.join("\n")
			}) }) : null,
			/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
				/* @__PURE__ */ (0, Q.jsx)(N, {
					label: "CloudDrive2 address",
					placeholder: "Leave empty to look up automatically",
					autoComplete: "off",
					maxLength: 200,
					value: i.clouddrive_address,
					isDisabled: !e.available,
					onChange: (e) => a({
						...i,
						clouddrive_address: e
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(N, {
					label: "CloudDrive2 API token",
					type: "password",
					autoComplete: "off",
					maxLength: 400,
					placeholder: e.token_set ? "Saved; leave empty to keep" : "Generated in CloudDrive2 under \"Settings → API tokens\"",
					hint: "Offline task permission required.",
					value: o,
					isDisabled: !e.available,
					onChange: s
				}),
				C ? /* @__PURE__ */ (0, Q.jsx)(N, {
					label: /* @__PURE__ */ (0, Q.jsx)(Ie, {
						source: "115",
						label: "115 target folder"
					}),
					placeholder: "Left empty, filled automatically from the library folder",
					autoComplete: "off",
					maxLength: 300,
					validationBehavior: "aria",
					isInvalid: D,
					hint: D ? y ? "Create this folder first, or fill in an existing one." : "This folder does not exist." : "Should sit inside the auto-intake cloud path prefix.",
					value: T("115"),
					isDisabled: !e.available,
					onChange: (e) => E("115", e)
				}) : null,
				ee ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(N, {
					label: /* @__PURE__ */ (0, Q.jsx)(Ie, {
						source: "pikpak",
						label: "PikPak target folder"
					}),
					placeholder: "A drive path starting with /",
					autoComplete: "off",
					maxLength: 300,
					hint: "The folder must already exist.",
					value: T("pikpak"),
					isDisabled: !e.available,
					onChange: (e) => E("pikpak", e)
				}), /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex flex-col gap-1",
					children: [/* @__PURE__ */ (0, Q.jsx)(re, { children: /* @__PURE__ */ (0, Q.jsx)(Ie, {
						source: "pikpak",
						label: "Media folder matching the PikPak root"
					}) }), e.pikpak_roots.length ? /* @__PURE__ */ (0, Q.jsx)(L, {
						"aria-label": "Media folder matching the PikPak root",
						selectedKey: i.pikpak_root || null,
						isDisabled: !e.available,
						placeholder: "Checking picks folders based on the library directories",
						onSelectionChange: (e) => a({
							...i,
							pikpak_root: e === null ? "" : String(e)
						}),
						children: e.pikpak_roots.map((e) => /* @__PURE__ */ (0, Q.jsx)(R, {
							id: e,
							children: e
						}, e))
					}) : /* @__PURE__ */ (0, Q.jsx)(M, { children: "Add the PikPak mount folder under \"Libraries and intake\" first." })]
				})] }) : null,
				/* @__PURE__ */ (0, Q.jsx)(N, {
					label: "Wait cap (hours)",
					type: "number",
					inputMode: "numeric",
					autoComplete: "off",
					hint: `Timeouts are marked stalled; enter 1–${e.max_wait_hours} hours.`,
					value: c,
					isDisabled: !e.available,
					onChange: l
				})
			] }),
			x.busy === "auto" ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(ue, { label: "Checking CloudDrive2" })
			}) : null,
			u ? /* @__PURE__ */ (0, Q.jsx)(Lr, {
				report: u,
				detected: p,
				suggested: h,
				create: e.available ? (e) => {
					let t = {
						clouddrive_address: i.clouddrive_address,
						token: o,
						path: e,
						pikpak_root: i.pikpak_root,
						pikpak_account: r
					};
					x.run("folder", (e) => W(Dr, t, "POST", e), (t) => {
						f(t), g((t) => ({
							...t,
							target: {
								path: e,
								exists: !0
							}
						})), b(!1), v(""), n("Catalog created");
					}, (e) => v(q(e)));
				} : void 0,
				creating: x.busy === "folder"
			}) : null,
			_ || x.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: _ || x.error })
			}) : null,
			/* @__PURE__ */ (0, Q.jsxs)(j, {
				status: e.available ? void 0 : "Cloud download is only available on devices allowed to modify the database.",
				children: [/* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					onClick: () => {
						let e = {
							address: !i.clouddrive_address.trim(),
							target: !T("115").trim(),
							root: !i.pikpak_root
						}, t = {
							clouddrive_address: i.clouddrive_address,
							token: o,
							target: T("115"),
							pikpak_root: i.pikpak_root,
							pikpak_account: r
						};
						x.run("check", (e) => W(Er, t, "POST", e), (t) => O(t, e), (e) => v(q(e)));
					},
					disabled: !e.available,
					...G(x.busy === "check"),
					children: "Check connection"
				}), /* @__PURE__ */ (0, Q.jsx)(d, {
					type: "submit",
					disabled: !e.available,
					...G(x.busy === "save"),
					children: "Save configuration"
				})]
			})
		]
	});
}
var Ir = {
	target: null,
	root: "",
	saved: !1
};
function Lr({ report: e, detected: t, suggested: n, create: r, creating: i }) {
	let a = n.target, o = !!(t || a || n.root || e.permissions.length || e.folder || e.quota);
	return !o && !e.problems.length ? null : /* @__PURE__ */ (0, Q.jsxs)(B, {
		divided: !0,
		children: [o ? /* @__PURE__ */ (0, Q.jsxs)(A, { children: [
			t ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "CloudDrive2 address",
				children: `Detected ${t}; it takes effect once the configuration is saved`
			}) : null,
			a?.exists ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: /* @__PURE__ */ (0, Q.jsx)(Ie, {
					source: "115",
					label: "115 target folder"
				}),
				children: n.saved ? `Filled from the library folder as ${a.path}` : `Filled from the library folder as ${a.path}; it takes effect once the configuration is saved`
			}) : null,
			a && !a.exists ? /* @__PURE__ */ (0, Q.jsxs)(k, {
				term: /* @__PURE__ */ (0, Q.jsx)(Ie, {
					source: "115",
					label: "115 target folder"
				}),
				children: [`${a.path} does not exist`, r ? /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					size: "small",
					onClick: () => r(a.path),
					...G(i),
					children: "Create this folder"
				}) : null]
			}) : null,
			n.root ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: /* @__PURE__ */ (0, Q.jsx)(Ie, {
					source: "pikpak",
					label: "PikPak root"
				}),
				children: `Filled from the library folder as ${n.root}; it takes effect once the configuration is saved`
			}) : null,
			e.permissions.length ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Offline permission",
				children: e.missing.length ? e.missing.map((e) => /* @__PURE__ */ (0, Q.jsx)(y, {
					variant: "caption",
					color: "yellow",
					children: `Missing ${e}`
				}, e)) : /* @__PURE__ */ (0, Q.jsx)(y, {
					variant: "caption",
					color: "lime",
					children: "Complete"
				})
			}) : null,
			e.folder ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Target folder",
				children: e.folder.can_offline ? `${e.folder.path} supports offline download` : `${e.folder.path} does not support offline download`
			}) : null,
			e.quota ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: /* @__PURE__ */ (0, Q.jsx)(Ie, {
					source: "115",
					label: "115 offline quota"
				}),
				children: `${e.quota.left} of ${e.quota.total} left this month`
			}) : null
		] }) : null, e.problems.map((e) => /* @__PURE__ */ (0, Q.jsx)(w, { children: e }, e))]
	});
}
function Rr({ state: e, settle: t, receipt: n, username: r, setUsername: i }) {
	let [a, o] = (0, Z.useState)(""), [s, c] = (0, Z.useState)(!1), [l, u] = (0, Z.useState)(""), [f, p] = (0, Z.useState)(""), [m, h] = (0, Z.useState)(""), g = Y(), _ = e.pikpak, y = e.pikpak_browser, b = y.state === "waiting";
	(0, Z.useEffect)(() => {
		if (!b) return;
		let e = new AbortController(), r, i = async () => {
			try {
				let r = await U(Ar, e.signal);
				if (e.signal.aborted || (t(r), r.pikpak_browser.state === "done" ? n("Signed in to PikPak") : r.pikpak_browser.state !== "waiting" && h(r.pikpak_browser.message), r.pikpak_browser.state !== "waiting")) return;
			} catch (t) {
				if (e.signal.aborted) return;
				p(q(t));
			}
			r = setTimeout(i, jr);
		};
		return r = setTimeout(i, jr), () => {
			e.abort(), clearTimeout(r);
		};
	}, [b]);
	let x = () => {
		h(""), g.run("browser", (e) => W(Ar, {}, "POST", e), (e) => {
			t(e), p("");
		}, (e) => p(q(e)));
	}, S = () => {
		g.run("cancel", (e) => W(`${Ar}/cancel`, {}, "POST", e), (e) => {
			t(e), p(""), h(e.pikpak_browser.message);
		}, (e) => p(q(e)));
	}, C = (e) => {
		if (e.preventDefault(), _.logged_in) return;
		let i = {
			username: r,
			password: a,
			remember: s
		};
		g.run("login", (e) => W(Or, i, "POST", e), (e) => {
			t(e.settings), p(""), e.ok ? (u(""), o(""), n("Signed in to PikPak")) : u(e.captcha_url ?? "");
		}, (e) => p(q(e)));
	}, ee = () => {
		g.run("logout", (e) => W(kr, {}, "POST", e), (e) => {
			t(e), p(""), n("Signed out of PikPak");
		}, (e) => p(q(e)));
	}, T = /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(N, {
			label: "Account",
			placeholder: "Email or phone",
			autoComplete: "username",
			maxLength: 200,
			value: r,
			isDisabled: !e.available,
			onChange: i
		}),
		/* @__PURE__ */ (0, Q.jsx)(N, {
			label: "Password",
			type: "password",
			autoComplete: "current-password",
			maxLength: 200,
			value: a,
			isDisabled: !e.available,
			onChange: o
		}),
		/* @__PURE__ */ (0, Q.jsx)(v, {
			isSelected: s,
			isDisabled: !e.available,
			onChange: c,
			children: "Save the password and re-sign in automatically when the session expires"
		}),
		l ? /* @__PURE__ */ (0, Q.jsx)(P, {
			tone: "warning",
			title: "A human check is required",
			extra: /* @__PURE__ */ (0, Q.jsx)("div", {
				className: "pt-2",
				children: /* @__PURE__ */ (0, Q.jsx)(E, {
					href: l,
					children: "Open the PikPak verification page"
				})
			}),
			children: "After finishing verification in the browser, come back here and click Sign in again."
		}) : null
	] }), D = /* @__PURE__ */ (0, Q.jsx)(d, {
		type: "submit",
		variant: "primary",
		disabled: !e.available || b,
		...G(g.busy === "login"),
		children: "Sign in"
	}), O = y.state === "timeout" || y.state === "failed";
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "pikpak",
		title: "PikPak account",
		icon: /* @__PURE__ */ (0, Q.jsx)(Mr, {}),
		onSubmit: C,
		aside: /* @__PURE__ */ (0, Q.jsx)(V, {
			tone: _.logged_in ? "success" : b ? "progress" : O ? "error" : "neutral",
			children: _.logged_in ? "Logged in" : b ? "Waiting for sign-in" : O ? "Sign-in not completed" : "Login pending"
		}),
		children: [
			_.logged_in ? /* @__PURE__ */ (0, Q.jsxs)(A, { children: [/* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Account",
				children: _.username || "Logged in"
			}), _.method === "browser" ? /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Sign-in method",
				children: "Browser sign-in, renewed by Peach"
			}) : /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Password",
				children: _.remember ? "Saved; re-signs-in automatically when the session expires" : "Not saved; after the session expires you must return here to sign in again"
			})] }) : /* @__PURE__ */ (0, Q.jsxs)(B, { children: [m ? O ? /* @__PURE__ */ (0, Q.jsx)(w, { children: m }) : /* @__PURE__ */ (0, Q.jsx)(M, {
				role: "status",
				children: m
			}) : null, T] }),
			f || g.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: f || g.error })
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, {
				status: !_.logged_in && b ? /* @__PURE__ */ (0, Q.jsx)(ue, { label: y.message || "Waiting for you to sign in to PikPak in the browser window" }) : null,
				children: _.logged_in ? /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					onClick: ee,
					disabled: !e.available,
					...G(g.busy === "logout"),
					children: "Sign out"
				}) : /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [y.available ? b ? /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					type: "button",
					onClick: S,
					...G(g.busy === "cancel"),
					children: "Cancel"
				}) : /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					type: "button",
					onClick: x,
					disabled: !e.available,
					...G(g.busy === "browser"),
					children: "Sign in with browser"
				}) : null, D] })
			})
		]
	});
}
// src/react/settings/ledger-backup-settings.tsx
var zr = "/api/configuration/ledger-backups", Br = 1500, Vr = (e) => (/* @__PURE__ */ new Date(e.modified_at * 1e3)).toLocaleString();
function Hr(e) {
	return [e.source === "manual" ? "Manual" : `Auto · ${e.purpose}`, J(e.bytes)].join(" · ");
}
function Ur({ job: e, label: t }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		"aria-live": "polite",
		className: "flex flex-col gap-2",
		children: [
			e.total ? /* @__PURE__ */ (0, Q.jsx)(Ce, {
				label: t,
				value: e.done || 0,
				max: e.total
			}) : /* @__PURE__ */ (0, Q.jsx)(ue, { label: t }),
			/* @__PURE__ */ (0, Q.jsx)(M, { children: e.stage || t }),
			/* @__PURE__ */ (0, Q.jsx)(ze, {})
		]
	});
}
function Wr({ receipt: e }) {
	let [t, n] = (0, Z.useState)(null), [r, i] = (0, Z.useState)(""), a = Y(), o = t?.backup.status === "running", s = t?.restore.status === "running", c = o || s, l = (0, Z.useRef)({
		backup: !1,
		restore: !1
	});
	if ((0, Z.useEffect)(() => {
		let e = new AbortController();
		return U(zr, e.signal).then(n, (t) => {
			e.signal.aborted || i(String(t?.message || t));
		}), () => e.abort();
	}, []), (0, Z.useEffect)(() => {
		if (!c) return;
		let e = new AbortController(), t = setTimeout(() => {
			U(zr, e.signal).then(n, () => {
				e.signal.aborted || n((e) => e && { ...e });
			});
		}, Br);
		return () => {
			e.abort(), clearTimeout(t);
		};
	}, [t]), (0, Z.useEffect)(() => {
		if (t) for (let n of ["backup", "restore"]) {
			let r = t[n];
			r.status === "running" ? l.current[n] = !0 : l.current[n] && (l.current[n] = !1, r.status === "complete" && e(n === "backup" ? `Ledger backed up: ${r.name}` : `The ledger has been restored from backup; the pre-restore ledger is saved separately as ${r.saved}. Refresh the page to view the restored profile`));
		}
	}, [t]), !t) return /* @__PURE__ */ (0, Q.jsx)(I, {
		id: "ledgerBackups",
		guide: "ledger-backups",
		title: "Ledger backup",
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: r ? /* @__PURE__ */ (0, Q.jsx)(w, { children: r }) : /* @__PURE__ */ (0, Q.jsx)(ue, { label: "Loading backup list" }) })
	});
	let u = () => void a.run("backup", (e) => W(`${zr}/backup`, {}, "POST", e), n), f = (e) => void K({
		title: "Restore ledger from backup",
		danger: !0,
		body: `The backup from ${Vr(e)} (${Hr(e)}) will replace the current ledger; metadata, watch history, and review conclusions from that point on revert to their state at backup time.Before replacing, save the current ledger as a backup; no new task can start during a restore.`,
		confirmLabel: "Replace current ledger",
		onConfirm: async () => {
			l.current.restore = !0, n(await W(`${zr}/restore`, {
				id: e.id,
				confirm: !0
			}));
		}
	}), p = [t.backup, t.restore].find((e) => e.status === "failed"), m = t.last_restore, h = o ? "Backing up…" : s ? "Restoring…" : t.backups.length ? `A total of ${t.backups.length} restorable backups` : "No backup yet";
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "ledgerBackups",
		guide: "ledger-backups",
		title: "Ledger backup",
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
				/* @__PURE__ */ (0, Q.jsx)(M, { children: "The ledger stores all resources, watch records, and review conclusions. Manual backups and pre-write automatic backups are kept together, retaining the most recent 5 and backups within 24 hours." }),
				t.writer ? null : /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["This computer is not the ledger write client; restore is only possible on the write client:", t.writer_reason] }),
				o ? /* @__PURE__ */ (0, Q.jsx)(Ur, {
					job: t.backup,
					label: "Backup progress"
				}) : null,
				s ? /* @__PURE__ */ (0, Q.jsx)(Ur, {
					job: t.restore,
					label: "Restore progress"
				}) : null,
				p ? /* @__PURE__ */ (0, Q.jsx)(w, { children: p.error || "Task not finished" }) : null,
				m ? m.outcome === "kept" || m.outcome === "completed" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: m.message }) : /* @__PURE__ */ (0, Q.jsx)(w, { children: m.message }) : null,
				a.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: a.error }) : null
			] }),
			t.backups.length ? /* @__PURE__ */ (0, Q.jsx)("div", {
				className: "border-t border-separator-border",
				"data-ledger-backups": "",
				children: /* @__PURE__ */ (0, Q.jsx)(F, { children: t.backups.map((e) => /* @__PURE__ */ (0, Q.jsx)(z, {
					label: Vr(e),
					description: Hr(e),
					children: /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						disabled: !t.writer || c,
						onClick: () => f(e),
						children: "Restore"
					})
				}, e.id)) })
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, {
				status: /* @__PURE__ */ (0, Q.jsx)("p", { children: h }),
				children: /* @__PURE__ */ (0, Q.jsx)(d, {
					disabled: c,
					onClick: u,
					...G(a.busy === "backup" || o),
					children: "Back up now"
				})
			})
		]
	});
}
// src/react/settings/library-sharing-settings.tsx
function Gr({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(null), [o, s] = (0, Z.useState)(!1), [c, l] = (0, Z.useState)(!1), u = (0, Z.useMemo)(() => i ? JSON.stringify(i.data, null, 2) : "", [i]), f = Y(), p = n.participation, m = {
		"not-attempted": "Not sent yet",
		queued: "Waiting to send",
		accepted: "Sent",
		failed: "Send failed",
		unknown: "Results not obtained",
		blocked: "Blocked"
	}, h = {
		queued: "progress",
		accepted: "success",
		failed: "error",
		unknown: "warning",
		blocked: "warning"
	}, g = (e) => void f.run("save", (t) => W("/api/configuration/library-sharing", {
		enabled: e,
		schema: n.schema,
		consent: c,
		preview_token: i?.token
	}, "POST", t), (e) => {
		r(e), a(null), l(!1), s(!1), t("Saved library and taste upload options");
	}), _ = () => {
		let e = URL.createObjectURL(new Blob([u], { type: "application/json" })), t = document.createElement("a");
		t.href = e, t.download = "peach-library-taste-preview.json", document.body.append(t);
		try {
			t.click();
		} finally {
			t.remove(), setTimeout(() => URL.revokeObjectURL(e), 1e3);
		}
	};
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
			label: "Upload library and taste details",
			description: "Shares library, preference and capacity statistics weekly; preview and agree first.",
			children: /* @__PURE__ */ (0, Q.jsx)(H, {
				"aria-label": "Upload library and taste details",
				isSelected: n.enabled,
				onChange: (e) => e ? s(!0) : g(!1),
				...G(f.busy === "save")
			})
		}) }),
		n.available ? null : /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)("span", {
				className: "self-start",
				children: /* @__PURE__ */ (0, Q.jsx)(V, { children: "Upload service not configured" })
			})
		}),
		n.consent_state === "needs-consent" ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)("span", {
				className: "self-start",
				children: /* @__PURE__ */ (0, Q.jsx)(V, {
					tone: "warning",
					children: "Needs re-agreement"
				})
			}), /* @__PURE__ */ (0, Q.jsx)(M, { children: "Fields updated; preview and agree again." })]
		}) : null,
		/* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsxs)(x, {
				summary: "Library statistics fields and sending rules",
				children: [/* @__PURE__ */ (0, Q.jsx)("ul", {
					className: "list-disc space-y-2 pl-5",
					children: n.fields.map((e) => /* @__PURE__ */ (0, Q.jsx)("li", { children: /* @__PURE__ */ (0, Q.jsx)(M, { children: e }) }, e))
				}), /* @__PURE__ */ (0, Q.jsx)(M, { children: n.notice })]
			})
		}),
		p ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)(A, { children: /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Participation state",
				children: /* @__PURE__ */ (0, Q.jsx)(V, {
					"aria-label": "Participation state",
					tone: p.pending_state ? "progress" : h[p.status] || "neutral",
					children: p.pending_state ? `About to send the ${p.pending_state === "disabled" ? "off" : "on"} state` : m[p.status] || "Results not obtained"
				})
			}) }), n.last_sent_at ? /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["'Last sent:'", new Date(n.last_sent_at).toLocaleDateString()] }) : null]
		}) : null,
		n.enabled && n.last_attempt?.status === "failed" ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)("span", {
				className: "self-start",
				children: /* @__PURE__ */ (0, Q.jsx)(V, {
					tone: n.last_attempt.attempted ? "error" : "warning",
					children: n.last_attempt.attempted ? "Upload failed" : "Pending re-prep"
				})
			}), /* @__PURE__ */ (0, Q.jsx)(w, { children: n.last_attempt.attempted ? "Library and taste uploads failed; nothing more sends this week." : "Library and taste uploads did not finish and will re-prepare automatically." })]
		}) : null,
		n.enabled && n.last_attempt?.status === "waiting-data" ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)("span", {
				className: "self-start",
				children: /* @__PURE__ */ (0, Q.jsx)(V, { children: "Waiting for data" })
			}), /* @__PURE__ */ (0, Q.jsx)(M, { children: "Waiting for library or preference data to analyze." })]
		}) : null,
		n.enabled && n.last_attempt?.status === "unknown" ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)("span", {
				className: "self-start",
				children: /* @__PURE__ */ (0, Q.jsx)(V, {
					tone: "warning",
					children: "Result not fetched"
				})
			}), /* @__PURE__ */ (0, Q.jsx)(M, { children: "No upload result received; not sending again this week." })]
		}) : null,
		i ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [
				/* @__PURE__ */ (0, Q.jsxs)(M, { children: [
					"The preview includes ",
					i.data.library.length,
					" works and ",
					i.data.coverage.uncoded_items,
					" unnumbered summaries, about ",
					(i.bytes / 1024).toFixed(1),
					" ' KiB.'"
				] }),
				/* @__PURE__ */ (0, Q.jsx)(M, { children: "'The random ID deduplicates instances. State goes out once a day; after turning it off only one closing state is sent.'" }),
				/* @__PURE__ */ (0, Q.jsx)(x, {
					summary: "'Upload data preview'",
					defaultOpen: !0,
					children: /* @__PURE__ */ (0, Q.jsx)(qt, {
						code: u,
						language: "json",
						label: "Library and taste upload preview",
						maxCharacters: 24e3
					})
				}),
				u.length > 24e3 ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "Showing the first 24,000 characters; download to view the full content." }) : null,
				/* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					onClick: _,
					children: "Download the full preview"
				}),
				n.enabled ? null : /* @__PURE__ */ (0, Q.jsx)(v, {
					isSelected: c,
					onChange: l,
					children: "I reviewed the upload preview and consent to uploading library and taste details"
				})
			]
		}) : null,
		f.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)(w, { children: f.error })
		}) : null,
		/* @__PURE__ */ (0, Q.jsxs)(j, { children: [
			o && !n.enabled ? /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => {
					s(!1), a(null), l(!1);
				},
				children: "Cancel"
			}) : null,
			p ? /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => void f.run("refresh", async (e) => {
					let t = await U("/api/configuration", e);
					if (!t.library_sharing) throw Error("Library upload state not obtained");
					return t.library_sharing;
				}, r),
				...G(f.busy === "refresh"),
				children: "Refresh the send state"
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => {
					s(!0), f.run("preview", (e) => U("/api/configuration/library-sharing/preview", e), (e) => {
						a(e), l(!1);
					});
				},
				...G(f.busy === "preview"),
				children: "Preview the upload contents"
			}),
			!n.enabled && i ? /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "primary",
				disabled: !c,
				onClick: () => g(!0),
				...G(f.busy === "save"),
				children: "Agree and enable upload"
			}) : null
		] })
	] });
}
// src/react/settings/remote-reporting-settings.tsx
function Kr({ value: e, onChange: t, busy: n = !1 }) {
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
		label: "Send version statistics and error diagnostics (recommended)",
		description: "Uploads version, system info, failure type, code location, and occurrence count.",
		children: /* @__PURE__ */ (0, Q.jsx)(H, {
			"aria-label": "Send version statistics and error diagnostics (recommended)",
			isSelected: e.usage && e.errors,
			onChange: (n) => t({
				...e,
				usage: n,
				errors: n
			}),
			...G(n)
		})
	}) }), e.available ? null : /* @__PURE__ */ (0, Q.jsx)(B, {
		divided: !0,
		children: /* @__PURE__ */ (0, Q.jsx)("span", {
			className: "self-start",
			children: /* @__PURE__ */ (0, Q.jsx)(V, { children: "Upload service not configured" })
		})
	})] });
}
function qr({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), i = Y(), a = Object.values(n.delivery ?? {}).flatMap((e) => e.last_sent_at ? [Date.parse(e.last_sent_at)] : []).filter(Number.isFinite), o = a.length ? Math.max(...a) : null;
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(Kr, {
			value: n,
			busy: i.busy === "save",
			onChange: (e) => {
				i.run("save", (t) => W("/api/configuration/remote-reporting", {
					usage: e.usage,
					errors: e.errors
				}, "POST", t), (e) => {
					r(e), t("Diagnostic options saved");
				});
			}
		}),
		/* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsxs)(x, {
				summary: "Statistics fields and sending rules",
				children: [
					/* @__PURE__ */ (0, Q.jsx)(M, { children: n.fields.usage }),
					/* @__PURE__ */ (0, Q.jsx)(M, { children: n.fields.errors }),
					/* @__PURE__ */ (0, Q.jsx)(M, { children: n.notice })
				]
			}), o === null ? null : /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["'Last sent:'", new Date(o).toLocaleDateString()] })]
		}),
		i.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)(w, { children: i.error })
		}) : null
	] });
}
// src/react/components/animated-number.tsx
var Jr = .6;
function Yr({ value: e, format: t = (e) => Math.round(e).toLocaleString(), className: n }) {
	let r = zt(), [i, a] = (0, Z.useState)(e), o = (0, Z.useRef)(e);
	return (0, Z.useEffect)(() => {
		if (r || o.current === e) {
			o.current = e, a(e);
			return;
		}
		let t = Ge(o.current, e, {
			duration: Jr,
			ease: "easeOut",
			onUpdate: (e) => {
				o.current = e, a(e);
			}
		});
		return () => t.stop();
	}, [e, r]), /* @__PURE__ */ (0, Q.jsx)("span", {
		className: n ? `tabular-nums ${n}` : "tabular-nums",
		children: t(i)
	});
}
// node_modules/recharts/es6/state/selectors/pieSelectors.js
function Xr(e, t) {
	var n = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var r = Object.getOwnPropertySymbols(e);
		t && (r = r.filter(function(t) {
			return Object.getOwnPropertyDescriptor(e, t).enumerable;
		})), n.push.apply(n, r);
	}
	return n;
}
function Zr(e) {
	for (var t = 1; t < arguments.length; t++) {
		var n = arguments[t] == null ? {} : arguments[t];
		t % 2 ? Xr(Object(n), !0).forEach(function(t) {
			Qr(e, t, n[t]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n)) : Xr(Object(n)).forEach(function(t) {
			Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
		});
	}
	return e;
}
function Qr(e, t, n) {
	return (t = $r(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
function $r(e) {
	var t = ei(e, "string");
	return typeof t == "symbol" ? t : t + "";
}
function ei(e, t) {
	if (typeof e != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (typeof r != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
var ti = Dn([Jn, (e, t) => t], (e, t) => e.filter((e) => e.type === "pie").find((e) => e.id === t)), ni = [], ri = (e, t, n) => n?.length === 0 ? ni : n, ii = Dn([
	Kn,
	ti,
	ri
], (e, t, n) => {
	var r = e.chartData;
	if (t != null) {
		var i = t?.data != null && t.data.length > 0 ? t.data : r;
		if (i && i.length || n == null || (i = n.map((e) => Zr(Zr({}, t.presentationProps), e.props))), i != null) return i;
	}
}), ai = Dn([
	ii,
	ti,
	ri
], (e, t, n) => {
	if (e != null && t != null) return e.map((e, r) => {
		var i, a = In(e, t.nameKey, t.name), o = n != null && (i = n[r]) != null && (i = i.props) != null && i.fill ? n[r].props.fill : typeof e == "object" && e && "fill" in e ? e.fill : t.fill;
		return {
			value: Fn(a, t.dataKey),
			dataKey: t.dataKey,
			color: o,
			payload: e,
			type: t.legendType
		};
	});
}), oi = Dn([
	ii,
	ti,
	ri,
	qn
], (e, t, n, r) => {
	if (t != null && e != null) return ji({
		offset: r,
		pieSettings: t,
		displayedData: e,
		cells: n
	});
}), si = ["key"], ci = [
	"onMouseEnter",
	"onClick",
	"onMouseLeave"
], li = ["id"], ui = ["id"];
function di() {
	return di = Object.assign ? Object.assign.bind() : function(e) {
		for (var t = 1; t < arguments.length; t++) {
			var n = arguments[t];
			for (var r in n) ({}).hasOwnProperty.call(n, r) && (e[r] = n[r]);
		}
		return e;
	}, di.apply(null, arguments);
}
function fi(e, t) {
	if (e == null) return {};
	var n, r, i = pi(e, t);
	if (Object.getOwnPropertySymbols) {
		var a = Object.getOwnPropertySymbols(e);
		for (r = 0; r < a.length; r++) n = a[r], t.indexOf(n) === -1 && {}.propertyIsEnumerable.call(e, n) && (i[n] = e[n]);
	}
	return i;
}
function pi(e, t) {
	if (e == null) return {};
	var n = {};
	for (var r in e) if ({}.hasOwnProperty.call(e, r)) {
		if (t.indexOf(r) !== -1) continue;
		n[r] = e[r];
	}
	return n;
}
function mi(e, t) {
	var n = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var r = Object.getOwnPropertySymbols(e);
		t && (r = r.filter(function(t) {
			return Object.getOwnPropertyDescriptor(e, t).enumerable;
		})), n.push.apply(n, r);
	}
	return n;
}
function $(e) {
	for (var t = 1; t < arguments.length; t++) {
		var n = arguments[t] == null ? {} : arguments[t];
		t % 2 ? mi(Object(n), !0).forEach(function(t) {
			hi(e, t, n[t]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n)) : mi(Object(n)).forEach(function(t) {
			Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
		});
	}
	return e;
}
function hi(e, t, n) {
	return (t = gi(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
function gi(e) {
	var t = _i(e, "string");
	return typeof t == "symbol" ? t : t + "";
}
function _i(e, t) {
	if (typeof e != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (typeof r != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
var vi = _n;
function yi(e) {
	var t = (0, Z.useMemo)(() => kn(e.children, Yt), [e.children]), n = $n((n) => ai(n, e.id, t));
	return n == null ? null : /*#__PURE__*/ Z.createElement(yn, { legendPayload: n });
}
function bi(e) {
	if (e != null && typeof e != "boolean" && typeof e != "function") {
		if (/*#__PURE__*/ Z.isValidElement(e)) {
			var t = e.props?.fill;
			return typeof t == "string" ? t : void 0;
		}
		var n = e.fill;
		return typeof n == "string" ? n : void 0;
	}
}
var xi = /*#__PURE__*/ Z.memo((e) => {
	var t = e.dataKey, n = e.nameKey, r = e.sectors, i = e.stroke, a = e.strokeWidth, o = e.fill, s = e.name, c = e.hide, l = e.tooltipType, u = e.formatter, d = e.id, f = e.activeShape, p = bi(f), m = {
		dataDefinedOnItem: r.map((e) => {
			var t = e.tooltipPayload;
			return p == null || t == null ? t : t.map((e) => $($({}, e), {}, {
				color: p,
				fill: p
			}));
		}),
		getPosition: (e) => r[Number(e)]?.tooltipPosition,
		settings: {
			stroke: i,
			strokeWidth: a,
			fill: o,
			dataKey: t,
			nameKey: n,
			name: Fn(s, t),
			hide: c,
			type: l,
			color: o,
			unit: "",
			formatter: u,
			graphicalItemId: d
		}
	};
	return /*#__PURE__*/ Z.createElement(bn, { tooltipEntrySettings: m });
}), Si = (e, t) => e > t ? "start" : e < t ? "end" : "middle", Ci = (e, t, n) => Pn(typeof t == "function" ? t(e) : t, n, n * .8), wi = (e, t, n) => {
	var r = t.top, i = t.left, a = t.width, o = t.height, s = Nn(a, o);
	return {
		cx: i + Pn(e.cx, a, a / 2),
		cy: r + Pn(e.cy, o, o / 2),
		innerRadius: Pn(e.innerRadius, s, 0),
		outerRadius: Ci(n, e.outerRadius, s),
		maxRadius: e.maxRadius || Math.sqrt(a * a + o * o) / 2
	};
}, Ti = (e, t) => Bn(t - e) * Math.min(Math.abs(t - e), 360), Ei = (e, t) => {
	if (/*#__PURE__*/ Z.isValidElement(e)) return /*#__PURE__*/ Z.cloneElement(e, t);
	if (typeof e == "function") return e(t);
	var n = Xe("recharts-pie-label-line", typeof e == "boolean" ? "" : e.className);
	t.key;
	var r = fi(t, si);
	return /*#__PURE__*/ Z.createElement(rn, di({}, r, {
		type: "linear",
		className: n
	}));
}, Di = (e, t, n) => {
	if (/*#__PURE__*/ Z.isValidElement(e)) return /*#__PURE__*/ Z.cloneElement(e, t);
	var r = n;
	if (typeof e == "function" && (r = e(t), /*#__PURE__*/ Z.isValidElement(r))) return r;
	var i = Xe("recharts-pie-label-text", jn(e));
	return /*#__PURE__*/ Z.createElement(Cn, di({}, t, {
		alignmentBaseline: "middle",
		className: i
	}), r);
};
function Oi(e) {
	var t = e.sectors, n = e.props, r = e.showLabels, i = n.label, a = n.labelLine, o = n.dataKey;
	if (!r || !i || !t) return null;
	var s = Yn(n), c = Xn(i), l = Xn(a), u = typeof i == "object" && "offsetRadius" in i && typeof i.offsetRadius == "number" && i.offsetRadius || 20, d = t.map((e, t) => {
		var n = (e.startAngle + e.endAngle) / 2, r = Vn(e.cx, e.cy, e.outerRadius + u, n), d = $($($($({}, s), e), {}, { stroke: "none" }, c), {}, {
			index: t,
			textAnchor: Si(r.x, e.cx)
		}, r), f = $($($($({}, s), e), {}, {
			fill: "none",
			stroke: e.fill
		}, l), {}, {
			index: t,
			points: [Vn(e.cx, e.cy, e.outerRadius, n), r],
			key: "line"
		});
		return /*#__PURE__*/ Z.createElement(wn, {
			zIndex: sn.label,
			key: `label-${e.startAngle}-${e.endAngle}-${e.midAngle}-${t}`
		}, /*#__PURE__*/ Z.createElement(dn, null, a && Ei(a, f), Di(i, d, In(e, o))));
	});
	return /*#__PURE__*/ Z.createElement(dn, { className: "recharts-pie-labels" }, d);
}
function ki(e) {
	var t = e.sectors, n = e.props, r = e.showLabels, i = n.label;
	return typeof i == "object" && i && "position" in i ? /*#__PURE__*/ Z.createElement(un, { label: i }) : /*#__PURE__*/ Z.createElement(Oi, {
		sectors: t,
		props: n,
		showLabels: r
	});
}
function Ai(e) {
	var t = e.sectors, n = e.activeShape, r = e.inactiveShape, i = e.allOtherPieProps, a = e.shape, o = e.id, s = e.animationElapsedTime, c = e.isAnimating, l = e.isEntrance, u = $n(Gn), d = $n(Un), f = $n(Wn), p = i.onMouseEnter, m = i.onClick, h = i.onMouseLeave, g = fi(i, ci), _ = tr(p, i.dataKey, o), v = nr(h), y = er(m, i.dataKey, o);
	return t == null || t.length === 0 ? null : /*#__PURE__*/ Z.createElement(Z.Fragment, null, t.map((e, p) => {
		if (e?.startAngle === 0 && e?.endAngle === 0 && t.length !== 1) return null;
		var m = f == null || f === o, h = String(p) === u && (d == null || i.dataKey === d) && m, b = n && h ? n : u ? r : null, x = $($({}, e), {}, {
			stroke: e.stroke,
			tabIndex: -1,
			index: p,
			isActive: h,
			animationElapsedTime: s,
			isAnimating: c,
			isEntrance: l,
			[on]: p,
			[an]: o
		});
		return /*#__PURE__*/ Z.createElement(dn, di({
			key: `sector-${e?.startAngle}-${e?.endAngle}-${e.midAngle}-${p}`,
			tabIndex: -1,
			className: "recharts-pie-sector"
		}, Tn(g, e, p), {
			onMouseEnter: _(e, p),
			onMouseLeave: v(e, p),
			onClick: y(e, p)
		}), /*#__PURE__*/ Z.createElement(xn, {
			option: b ?? a,
			DefaultShape: vi,
			shapeProps: x
		}));
	}));
}
function ji(e) {
	var t = e.pieSettings, n = e.displayedData, r = e.cells, i = e.offset, a = t.cornerRadius, o = t.startAngle, s = t.endAngle, c = t.dataKey, l = t.nameKey, u = t.tooltipType, d = Math.abs(t.minAngle), f = Ti(o, s), p = Math.abs(f), m = n.length <= 1 ? 0 : t.paddingAngle ?? 0, h = n.filter((e) => In(e, c, 0) !== 0).length, g = (p >= 360 ? h : h - 1) * m, _ = n.reduce((e, t) => {
		var n = In(t, c, 0);
		return e + (Rn(n) ? n : 0);
	}, 0), v = d > 0 && _ > 0 && n.some((e) => {
		var t = In(e, c, 0), n = (Rn(t) ? t : 0) / _;
		return t !== 0 && n * p < d;
	}) ? d : 0, y = p - h * v - g, b;
	if (_ > 0) {
		var x;
		b = n.map((e, n) => {
			var s = In(e, c, 0), d = In(e, l, n), p = wi(t, i, e), h = (Rn(s) ? s : 0) / _, g, b = $($({}, e), r && r[n] && r[n].props), S = b != null && "fill" in b && typeof b.fill == "string" ? b.fill : t.fill;
			g = n ? x.endAngle + Bn(f) * m * (s === 0 ? 0 : 1) : o;
			var C = g + Bn(f) * ((s === 0 ? 0 : v) + h * y), ee = (g + C) / 2, w = (p.innerRadius + p.outerRadius) / 2, T = [{
				name: d,
				value: s,
				payload: b,
				dataKey: c,
				type: u,
				color: S,
				fill: S,
				graphicalItemId: t.id
			}], E = Vn(p.cx, p.cy, w, ee);
			return x = $($($($({}, t.presentationProps), {}, {
				percent: h,
				cornerRadius: typeof a == "string" ? parseFloat(a) : a,
				name: d,
				tooltipPayload: T,
				midAngle: ee,
				middleRadius: w,
				tooltipPosition: E
			}, b), p), {}, {
				value: s,
				dataKey: c,
				startAngle: g,
				endAngle: C,
				payload: b,
				paddingAngle: s === 0 ? 0 : Bn(f) * m
			}), x;
		});
	}
	return b;
}
function Mi(e) {
	var t = e.showLabels, n = e.sectors, r = e.children, i = (0, Z.useMemo)(() => !t || !n ? [] : n.map((e) => ({
		value: e.value,
		payload: e.payload,
		clockWise: !1,
		parentViewBox: void 0,
		viewBox: {
			cx: e.cx,
			cy: e.cy,
			innerRadius: e.innerRadius,
			outerRadius: e.outerRadius,
			startAngle: e.startAngle,
			endAngle: e.endAngle,
			clockWise: !1
		},
		fill: e.fill
	})), [n, t]);
	return /*#__PURE__*/ Z.createElement(hn, { value: t ? i : void 0 }, r);
}
var Ni = (e, t) => {
	if (e == null) return [];
	var n = [], r = e.find((e) => e.status !== "removed"), i = r ? r.next.startAngle : 0;
	return e.forEach((e, r) => {
		if (e.status !== "removed") {
			var a = r > 0 ? An(e.next, "paddingAngle", 0) : 0;
			if (e.status === "matched") {
				var o = Ln(e.prev.endAngle - e.prev.startAngle, e.next.endAngle - e.next.startAngle, t), s = $($({}, e.next), {}, {
					startAngle: i + a,
					endAngle: i + o + a
				});
				n.push(s), i = s.endAngle;
			} else {
				var c = Ln(0, e.next.endAngle - e.next.startAngle, t), l = $($({}, e.next), {}, {
					startAngle: i + a,
					endAngle: i + c + a
				});
				n.push(l), i = l.endAngle;
			}
		}
	}), n;
};
function Pi(e) {
	var t = e.props, n = e.previousSectorsRef, r = e.id, i = t.sectors, a = t.activeShape, o = t.inactiveShape, s = t.animationInterpolateFn, c = Qn(t.onAnimationStart, t.onAnimationEnd), l = c.isAnimating, u = c.handleAnimationStart, d = c.handleAnimationEnd, f = rr();
	if (f == null) return null;
	var p = i[0];
	return /*#__PURE__*/ Z.createElement(Mi, {
		showLabels: !l,
		sectors: i
	}, /*#__PURE__*/ Z.createElement(Jt, {
		animationInput: t,
		animationIdPrefix: "recharts-pie-",
		items: i,
		previousItemsRef: n,
		isAnimationActive: t.isAnimationActive,
		animationBegin: t.animationBegin,
		animationDuration: t.animationDuration,
		animationEasing: t.animationEasing,
		onAnimationStart: u,
		onAnimationEnd: d,
		animationInterpolateFn: s,
		animationMatchBy: t.animationMatchBy,
		layout: f
	}, (e, n, i) => /*#__PURE__*/ Z.createElement(dn, null, /*#__PURE__*/ Z.createElement(Ai, {
		sectors: e,
		activeShape: a,
		inactiveShape: o,
		allOtherPieProps: t,
		shape: t.shape,
		id: r,
		animationElapsedTime: n,
		isAnimating: l || n < 1,
		isEntrance: i
	}))), /*#__PURE__*/ Z.createElement(ki, {
		showLabels: !l,
		sectors: i,
		props: t
	}), /*#__PURE__*/ Z.createElement(mn, {
		cx: p?.cx ?? 0,
		cy: p?.cy ?? 0,
		innerRadius: p?.innerRadius ?? 0,
		outerRadius: p?.outerRadius ?? 0,
		startAngle: t.startAngle,
		endAngle: t.endAngle,
		clockWise: !1
	}, t.children));
}
var Fi = {
	animationBegin: 400,
	animationDuration: 1500,
	animationEasing: "ease",
	animationInterpolateFn: Ni,
	animationMatchBy: zn,
	cx: "50%",
	cy: "50%",
	dataKey: "value",
	endAngle: 360,
	fill: "#808080",
	hide: !1,
	innerRadius: 0,
	isAnimationActive: "auto",
	label: !1,
	labelLine: !0,
	legendType: "rect",
	minAngle: 0,
	nameKey: "name",
	outerRadius: "80%",
	paddingAngle: 0,
	rootTabIndex: 0,
	shape: vi,
	startAngle: 0,
	stroke: "#fff",
	zIndex: sn.area
};
function Ii(e) {
	var t = e.id, n = fi(e, li), r = e.hide, i = e.className, a = e.rootTabIndex, o = (0, Z.useMemo)(() => kn(e.children, Yt), [e.children]), s = $n((e) => oi(e, t, o)), c = (0, Z.useRef)(null), l = Xe("recharts-pie", i);
	return r || s == null ? (c.current = null, /*#__PURE__*/ Z.createElement(dn, {
		tabIndex: a,
		className: l
	})) : /*#__PURE__*/ Z.createElement(wn, { zIndex: e.zIndex }, /*#__PURE__*/ Z.createElement(xi, {
		dataKey: e.dataKey,
		nameKey: e.nameKey,
		sectors: s,
		stroke: e.stroke,
		strokeWidth: e.strokeWidth,
		fill: e.fill,
		name: e.name,
		hide: e.hide,
		tooltipType: e.tooltipType,
		formatter: e.formatter,
		id: t,
		activeShape: e.activeShape
	}), /*#__PURE__*/ Z.createElement(dn, {
		tabIndex: a,
		className: l
	}, /*#__PURE__*/ Z.createElement(Pi, {
		props: $($({}, n), {}, { sectors: s }),
		previousSectorsRef: c,
		id: t
	})));
}
function Li(e) {
	var t = Hn(e, Fi), n = t.id, r = fi(t, ui), i = Yn(r);
	return /*#__PURE__*/ Z.createElement(gn, {
		id: n,
		type: "pie"
	}, (e) => /*#__PURE__*/ Z.createElement(Z.Fragment, null, /*#__PURE__*/ Z.createElement(vn, {
		type: "pie",
		id: e,
		data: r.data,
		dataKey: r.dataKey,
		hide: r.hide,
		angleAxisId: 0,
		radiusAxisId: 0,
		name: r.name,
		nameKey: r.nameKey,
		tooltipType: r.tooltipType,
		legendType: r.legendType,
		fill: r.fill,
		cx: r.cx,
		cy: r.cy,
		startAngle: r.startAngle,
		endAngle: r.endAngle,
		paddingAngle: r.paddingAngle,
		minAngle: r.minAngle,
		innerRadius: r.innerRadius,
		outerRadius: r.outerRadius,
		cornerRadius: r.cornerRadius,
		presentationProps: i,
		maxRadius: t.maxRadius
	}), /*#__PURE__*/ Z.createElement(yi, di({}, r, { id: e })), /*#__PURE__*/ Z.createElement(Ii, di({}, r, { id: e }))));
}
var Ri = Li;
Ri.displayName = "Pie";
// node_modules/recharts/es6/chart/PieChart.js
function zi(e, t) {
	var n = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var r = Object.getOwnPropertySymbols(e);
		t && (r = r.filter(function(t) {
			return Object.getOwnPropertyDescriptor(e, t).enumerable;
		})), n.push.apply(n, r);
	}
	return n;
}
function Bi(e) {
	for (var t = 1; t < arguments.length; t++) {
		var n = arguments[t] == null ? {} : arguments[t];
		t % 2 ? zi(Object(n), !0).forEach(function(t) {
			Vi(e, t, n[t]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(n)) : zi(Object(n)).forEach(function(t) {
			Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(n, t));
		});
	}
	return e;
}
function Vi(e, t, n) {
	return (t = Hi(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
function Hi(e) {
	var t = Ui(e, "string");
	return typeof t == "symbol" ? t : t + "";
}
function Ui(e, t) {
	if (typeof e != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (typeof r != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
var Wi = ["item"], Gi = Bi(Bi({}, On), {}, {
	layout: "centric",
	startAngle: 0,
	endAngle: 360
}), Ki = /*#__PURE__*/ (0, Z.forwardRef)((e, t) => {
	var n = Hn(e, Gi);
	return /*#__PURE__*/ Z.createElement(pn, {
		chartName: "PieChart",
		defaultTooltipEventType: "item",
		validateTooltipEventTypes: Wi,
		tooltipPayloadSearcher: En,
		categoricalChartProps: n,
		ref: t
	});
}), qi = 5, Ji = 2e3, Yi = 0, Xi = "80%", Zi = 0, Qi = 0, $i = 0, ea = 360, ta = [], na = (0, Z.createContext)(null);
function ra() {
	let e = (0, Z.use)(na);
	if (!e) throw Error("Pie chart parts (<Pie />, <Tooltip />, …) must be used within <EvilPieChart />");
	return e;
}
function ia({ config: e, data: t, dataKey: n, nameKey: r, children: i, className: a, chartProps: o, defaultSelectedSector: s = null, onSelectionChange: c, isLoading: l = !1 }) {
	let [u, d] = (0, Z.useState)(s), f = (0, Z.useCallback)((e) => {
		if (d(e), e === null) {
			c?.(null);
			return;
		}
		let i = t.find((t) => t[r] === e);
		i && c?.({
			dataKey: e,
			value: i[n]
		});
	}, [
		t,
		n,
		r,
		c
	]), p = (0, Z.useMemo)(() => ({
		config: e,
		data: t,
		dataKey: n,
		nameKey: r,
		isLoading: l,
		selectedSector: u,
		selectSector: f
	}), [
		e,
		t,
		n,
		r,
		l,
		u,
		f
	]);
	return /* @__PURE__ */ (0, Q.jsx)(na, {
		value: p,
		children: /* @__PURE__ */ (0, Q.jsxs)(Zt, {
			className: a,
			config: e,
			children: [/* @__PURE__ */ (0, Q.jsx)(fn, { isLoading: l }), /* @__PURE__ */ (0, Q.jsx)(Ki, {
				id: "evil-charts-pie-chart",
				accessibilityLayer: !0,
				...o,
				children: i
			})]
		})
	});
}
function aa({ variant: e = "gradient", innerRadius: t = Yi, outerRadius: n = Xi, cornerRadius: r = Zi, paddingAngle: i = Qi, startAngle: a = $i, endAngle: o = ea, isClickable: s = !1, glowingSectors: c = ta, children: l, pieProps: u }) {
	let { config: d, data: f, dataKey: p, nameKey: m, isLoading: h, selectedSector: g, selectSector: _ } = ra(), v = (0, Z.useId)().replace(/:/g, "");
	if (h) return /* @__PURE__ */ (0, Q.jsx)(Ri, {
		data: pa,
		dataKey: "value",
		nameKey: "name",
		innerRadius: t,
		outerRadius: n,
		cornerRadius: r,
		paddingAngle: i,
		startAngle: a,
		endAngle: o,
		strokeWidth: 0,
		isAnimationActive: !1,
		shape: (e) => /* @__PURE__ */ (0, Q.jsx)(ma, { ...e })
	});
	let y = ua(l, p), b = f.map((e) => ({
		...e,
		fill: `url(#${v}-colors-${e[m]})`
	}));
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(Ri, {
		data: b,
		dataKey: p,
		nameKey: m,
		innerRadius: t,
		outerRadius: n,
		cornerRadius: r,
		paddingAngle: i,
		startAngle: a,
		endAngle: o,
		strokeWidth: 0,
		isAnimationActive: !0,
		style: s ? { cursor: "pointer" } : void 0,
		onClick: (e, t) => {
			if (!s) return;
			let n = f[t]?.[m];
			_(g === n ? null : n);
		},
		shape: (e) => {
			let t = f[e.index ?? 0]?.[m], n = c.includes(t), r = s && g !== null && g !== t;
			return /* @__PURE__ */ (0, Q.jsx)(_n, {
				...e,
				fill: `url(#${v}-colors-${t})`,
				filter: n ? `url(#${v}-glow-${t})` : void 0,
				stroke: i < 0 ? "var(--background)" : "none",
				strokeWidth: i < 0 ? 5 : 0,
				opacity: r ? .15 : 1,
				className: "transition-opacity duration-200"
			});
		},
		...u,
		children: y
	}), /* @__PURE__ */ (0, Q.jsxs)("defs", { children: [/* @__PURE__ */ (0, Q.jsx)(da, {
		id: v,
		config: d,
		variant: e
	}), c.length > 0 && /* @__PURE__ */ (0, Q.jsx)(fa, {
		id: v,
		glowingSectors: c
	})] })] });
}
var oa = () => null;
function sa({ variant: e, roundness: t, defaultIndex: n }) {
	let { isLoading: r, nameKey: i } = ra();
	return r ? null : /* @__PURE__ */ (0, Q.jsx)(tn, {
		defaultIndex: n,
		content: /* @__PURE__ */ (0, Q.jsx)(nn, {
			nameKey: i,
			hideLabel: !0,
			roundness: t,
			variant: e
		})
	});
}
function ca({ variant: e, align: t = "center", verticalAlign: n = "bottom", isClickable: r = !1 }) {
	let { nameKey: i, selectedSector: a, selectSector: o } = ra();
	return /* @__PURE__ */ (0, Q.jsx)(Qt, {
		verticalAlign: n,
		align: t,
		content: /* @__PURE__ */ (0, Q.jsx)($t, {
			selected: a,
			onSelectChange: o,
			isClickable: r,
			nameKey: i,
			variant: e
		})
	});
}
function la({ variant: e = "dots" }) {
	return /* @__PURE__ */ (0, Q.jsx)(Xt, { variant: e });
}
var ua = (e, t) => {
	let n = null;
	return Z.Children.forEach(e, (e) => {
		if (!(0, Z.isValidElement)(e) || e.type !== oa) return;
		let { dataKey: r, labelListProps: i } = e.props;
		n = /* @__PURE__ */ (0, Q.jsx)(ln, {
			dataKey: r ?? t,
			stroke: "none",
			fontSize: 12,
			fontWeight: 500,
			fill: "currentColor",
			className: "fill-background",
			...i
		});
	}), n;
}, da = ({ id: e, config: t }) => /* @__PURE__ */ (0, Q.jsx)(Q.Fragment, { children: Object.entries(t).map(([t, n]) => {
	let r = Mn(n);
	return /* @__PURE__ */ (0, Q.jsx)("linearGradient", {
		id: `${e}-colors-${t}`,
		x1: "0",
		y1: "0",
		x2: "1",
		y2: "1",
		children: r === 1 ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)("stop", {
			offset: "0%",
			stopColor: `var(--color-${t}-0)`
		}), /* @__PURE__ */ (0, Q.jsx)("stop", {
			offset: "100%",
			stopColor: `var(--color-${t}-0)`
		})] }) : Array.from({ length: r }, (e, n) => {
			let i = `${n / (r - 1) * 100}%`;
			return /* @__PURE__ */ (0, Q.jsx)("stop", {
				offset: i,
				stopColor: `var(--color-${t}-${n}, var(--color-${t}-0))`
			}, i);
		})
	}, `${e}-colors-${t}`);
}) }), fa = ({ id: e, glowingSectors: t }) => /* @__PURE__ */ (0, Q.jsx)(Q.Fragment, { children: t.map((t) => /* @__PURE__ */ (0, Q.jsxs)("filter", {
	id: `${e}-glow-${t}`,
	x: "-100%",
	y: "-100%",
	width: "300%",
	height: "300%",
	children: [
		/* @__PURE__ */ (0, Q.jsx)("feGaussianBlur", {
			in: "SourceGraphic",
			stdDeviation: "8",
			result: "blur"
		}),
		/* @__PURE__ */ (0, Q.jsx)("feColorMatrix", {
			in: "blur",
			type: "matrix",
			values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0",
			result: "glow"
		}),
		/* @__PURE__ */ (0, Q.jsxs)("feMerge", { children: [/* @__PURE__ */ (0, Q.jsx)("feMergeNode", { in: "glow" }), /* @__PURE__ */ (0, Q.jsx)("feMergeNode", { in: "SourceGraphic" })] })
	]
}, `${e}-glow-${t}`)) }), pa = Array.from({ length: qi }, (e, t) => ({
	name: `loading${t}`,
	value: 100 / qi
})), ma = (e) => {
	let { index: t = 0, ...n } = e, r = t / qi * (Ji / 1e3);
	return /* @__PURE__ */ (0, Q.jsx)(gt.g, {
		initial: { opacity: .15 },
		animate: { opacity: [
			.15,
			.5,
			.15
		] },
		transition: {
			duration: Ji / 1e3,
			delay: r,
			repeat: Infinity,
			ease: "easeInOut"
		},
		children: /* @__PURE__ */ (0, Q.jsx)(_n, {
			...n,
			fill: "currentColor"
		})
	});
};
ia.Pie = aa, ia.Label = oa, ia.Tooltip = sa, ia.Legend = ca, ia.Background = la;
// src/react/settings/storage-charts.tsx
var ha = {
	database: "var(--color-chart-1)",
	backups: "var(--color-chart-2)",
	playback: "var(--color-chart-3)",
	thumbnails: "var(--color-chart-4)",
	previews: "var(--color-chart-5)",
	downloads: "var(--color-chart-6)",
	sources: "var(--color-chart-7)",
	records: "var(--color-chart-8)",
	tools: "var(--color-chart-9)"
}, ga = "var(--color-text-tertiary)", _a = {
	database: "bg-chart-1",
	backups: "bg-chart-2",
	playback: "bg-chart-3",
	thumbnails: "bg-chart-4",
	previews: "bg-chart-5",
	downloads: "bg-chart-6",
	sources: "bg-chart-7",
	records: "bg-chart-8",
	tools: "bg-chart-9"
}, va = (e) => J(e);
function ya(e) {
	let t = e.filter((e) => ha[e.key] && e.bytes > 0).map((e) => ({
		key: e.key,
		label: e.label,
		bytes: e.bytes,
		color: ha[e.key]
	})), n = e.filter((e) => !ha[e.key]).reduce((e, t) => e + t.bytes, 0);
	return n > 0 ? [...t, {
		key: "rest",
		label: "The rest",
		bytes: n,
		color: ga
	}] : t;
}
function ba({ storage: e }) {
	let t = e.usage, n = ya(t.categories), r = Object.fromEntries(n.map((e) => [e.key, {
		label: e.label,
		colors: Zn(e.color)
	}])), i = n.map((e) => ({
		slice: e.key,
		value: e.bytes
	}));
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-col gap-5 md:flex-row md:items-center",
		children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "relative mx-auto size-48 flex-none",
			role: "img",
			"aria-label": `Data directory totals ${va(t.total_bytes)}, breakdown by category`,
			children: [/* @__PURE__ */ (0, Q.jsxs)(ia, {
				data: i,
				dataKey: "value",
				nameKey: "slice",
				config: r,
				className: "aspect-square size-48 flex-none",
				children: [/* @__PURE__ */ (0, Q.jsx)(ia.Pie, {
					innerRadius: "68%",
					outerRadius: "100%",
					paddingAngle: 1,
					cornerRadius: 3
				}), /* @__PURE__ */ (0, Q.jsx)(en, {
					nameKey: "slice",
					hideLabel: !0,
					format: va
				})]
			}), /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "pointer-events-none absolute inset-0 flex flex-col items-center justify-center",
				children: [/* @__PURE__ */ (0, Q.jsx)("b", {
					className: "text-title-2-medium tabular-nums text-text-primary",
					children: va(t.total_bytes)
				}), /* @__PURE__ */ (0, Q.jsxs)("small", {
					className: "text-caption-1-regular tabular-nums text-text-secondary",
					children: [t.total_files.toLocaleString(), " files on this disk"]
				})]
			})]
		}), /* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 flex-1 flex-col gap-4",
			children: [/* @__PURE__ */ (0, Q.jsx)("ul", {
				className: "flex flex-wrap gap-x-4 gap-y-1.5",
				"aria-label": "Legend",
				children: n.map((e) => /* @__PURE__ */ (0, Q.jsxs)("li", {
					className: "flex items-center gap-1.5 text-caption-1-regular text-text-secondary",
					children: [
						/* @__PURE__ */ (0, Q.jsx)("i", {
							"aria-hidden": !0,
							className: `${Sn} ${_a[e.key] || "bg-text-tertiary"}`
						}),
						e.label,
						/* @__PURE__ */ (0, Q.jsx)("span", {
							className: "tabular-nums text-text-primary",
							children: va(e.bytes)
						})
					]
				}, e.key))
			}), /* @__PURE__ */ (0, Q.jsx)(xa, { storage: e })]
		})]
	});
}
function xa({ storage: e }) {
	if (e.total_bytes === null || e.free_bytes === null || !e.usage) return null;
	let t = Math.min(e.usage.total_bytes, e.total_bytes), n = e.free_bytes, r = Math.max(0, e.total_bytes - n - t), i = {
		peach: {
			label: "Peach data",
			colors: Zn("var(--color-border-focus-ring)")
		},
		others: {
			label: "Other files",
			colors: Zn(ga)
		},
		free: {
			label: "Available",
			colors: Zn("var(--color-background-tertiary-default)")
		}
	};
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ (0, Q.jsxs)("p", {
			className: "text-caption-1-regular text-text-secondary",
			children: [
				"A total of ",
				va(e.total_bytes),
				e.system_drive ? "(system drive)" : "",
				", Peach uses ",
				((t) => {
					let n = t / e.total_bytes * 100;
					return n < .1 ? "Under 0.1%" : `${n.toFixed(+(n < 10))}%`;
				})(t),
				", free ",
				va(n)
			]
		}), /* @__PURE__ */ (0, Q.jsxs)(cn, {
			data: [{
				disk: "Disk",
				peach: t,
				others: r,
				free: n
			}],
			config: i,
			layout: "horizontal",
			stackType: "percent",
			barRadius: 4,
			chartProps: { margin: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			} },
			className: "aspect-auto h-6 flex-none",
			children: [
				/* @__PURE__ */ (0, Q.jsx)(cn.YAxis, {
					dataKey: "disk",
					hide: !0
				}),
				/* @__PURE__ */ (0, Q.jsx)(cn.XAxis, { hide: !0 }),
				/* @__PURE__ */ (0, Q.jsx)(cn.Bar, { dataKey: "peach" }),
				/* @__PURE__ */ (0, Q.jsx)(cn.Bar, { dataKey: "others" }),
				/* @__PURE__ */ (0, Q.jsx)(cn.Bar, { dataKey: "free" }),
				/* @__PURE__ */ (0, Q.jsx)(en, {
					hideLabel: !0,
					format: va
				})
			]
		})]
	});
}
// src/react/components/configuration-fields.tsx
function Sa({ id: e, label: t, value: n, onChange: r, options: i, isDisabled: a, isInvalid: o, children: s }) {
	let l = `${e}-label`;
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-col gap-1.5",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(ce, {
				id: l,
				elementType: "span",
				children: t
			}),
			/* @__PURE__ */ (0, Q.jsx)(je, {
				id: e,
				"aria-labelledby": l,
				orientation: "horizontal",
				className: De,
				value: n,
				onChange: r,
				isDisabled: a,
				isInvalid: o,
				children: i.map((e) => /* @__PURE__ */ (0, Q.jsx)(c, {
					value: e.value,
					className: Ee,
					children: e.label
				}, e.value))
			}),
			s
		]
	});
}
function Ca({ prefix: e, suffix: t, unit: n, fieldClassName: r, ...i }) {
	let a = () => /* @__PURE__ */ (0, Q.jsx)("span", {
		"aria-hidden": n ? !0 : void 0,
		className: et("shrink-0 text-body-regular text-text-secondary", n ? "w-10" : "pr-1"),
		children: n ? /* @__PURE__ */ (0, Q.jsx)("span", {
			className: "absolute inset-y-0 right-0 flex items-center border-l border-border-button-default px-2",
			children: n
		}) : t
	});
	return /* @__PURE__ */ (0, Q.jsx)(N, {
		...i,
		fieldClassName: r,
		leadingAddon: e ? /* @__PURE__ */ (0, Q.jsx)("span", {
			className: "shrink-0 pl-1 text-body-regular text-text-secondary",
			children: e
		}) : void 0,
		trailingIcon: n || t ? a : void 0
	});
}
// src/react/settings/storage-budget-settings.tsx
var wa = [
	[
		"minimum_free_gib",
		"Disk reserved space",
		"Left empty, 5% is kept automatically, at least 1 GiB and at most 40 GiB"
	],
	[
		"data_max_gib",
		"Peach data limit",
		"Over the limit it pauses scraping and repairs without affecting playback"
	],
	[
		"cache_max_gib",
		"Peach cache limit",
		"Playback, network media and thumbnail caches"
	]
];
function Ta({ initial: e, after: t, receipt: n }) {
	let [r, i] = (0, Z.useState)(e.policy), a = Y(e.error), [o, s] = (0, Z.useState)("");
	(0, Z.useEffect)(() => {
		if (!r?.enabled || e.policy?.external_cache_path) return;
		let t = new AbortController();
		return s("Reading the CloudDrive cache directory…"), U("/api/configuration/storage/external-cache", t.signal).then((e) => {
			if (t.signal.aborted) return;
			let n = e.path;
			n ? (i((e) => e && !e.external_cache_path ? {
				...e,
				external_cache_path: n
			} : e), s("Read automatically; takes effect after saving the configuration")) : s("CloudDrive not configured; the cache directory can be filled by hand");
		}).catch((e) => {
			t.signal.aborted || s(`${q(e)}; can be filled by hand.`);
		}), () => t.abort();
	}, [r?.enabled, e.policy?.external_cache_path]);
	let c = (e, t) => i((n) => n && {
		...n,
		[e]: t
	}), l = e.last_check;
	return r ? /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "storageBudgetSettings",
		title: "Capacity protection",
		onSubmit: (e) => {
			e.preventDefault(), a.run("save", (e) => W("/api/configuration/storage/policy", r, "POST", e), (e) => {
				s(""), t(e), n("Saved capacity protection settings");
			});
		},
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(F, { children: [/* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Enable capacity protection",
				description: "Over the limit it clears old caches first; still over the limit it only pauses background tasks; playback is affected only when disk space runs low.",
				children: /* @__PURE__ */ (0, Q.jsx)(H, {
					"aria-label": "Enable capacity protection",
					isSelected: r.enabled,
					isDisabled: !!a.busy,
					onChange: (e) => c("enabled", e)
				})
			}), r.enabled ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [wa.map(([e, t, n]) => /* @__PURE__ */ (0, Q.jsx)(z, {
				label: t,
				description: n,
				children: /* @__PURE__ */ (0, Q.jsx)(Ca, {
					"aria-label": `${t} (GiB)`,
					unit: "GiB",
					inputMode: "numeric",
					pattern: "[0-9]*",
					size: "small",
					className: "w-32 shrink-0",
					placeholder: e === "minimum_free_gib" ? "Auto" : "Any",
					value: r[e] ? String(r[e]) : "",
					onChange: (t) => c(e, Number(t)),
					isDisabled: !!a.busy
				})
			}, e)), /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Clear caches automatically",
				description: "Clears the playback cache and thumbnails starting from the oldest",
				children: /* @__PURE__ */ (0, Q.jsx)(H, {
					"aria-label": "Clear caches automatically",
					isSelected: r.auto_clean,
					isDisabled: !!a.busy,
					onChange: (e) => c("auto_clean", e)
				})
			})] }) : null] }),
			r.enabled ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(N, {
					label: "External cache directory",
					hint: o || "Reads the CloudDrive of this machine automatically; can also be filled by hand; no automatic clearing",
					value: r.external_cache_path,
					size: "small",
					className: "w-full",
					placeholder: "Not set",
					onChange: (e) => c("external_cache_path", e),
					isDisabled: !!a.busy
				})
			}) : null,
			r.enabled && r.external_cache_path ? /* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "External cache limit",
				description: "Over the limit it pauses repairs; left empty it only checks free disk space",
				children: /* @__PURE__ */ (0, Q.jsx)(Ca, {
					"aria-label": "External cache limit (GiB)",
					unit: "GiB",
					size: "small",
					className: "w-32 shrink-0",
					placeholder: "Unlimited",
					inputMode: "numeric",
					pattern: "[0-9]*",
					value: r.external_cache_max_gib ? String(r.external_cache_max_gib) : "",
					onChange: (e) => c("external_cache_max_gib", Number(e)),
					isDisabled: !!a.busy
				})
			}) }) : null,
			/* @__PURE__ */ (0, Q.jsxs)(B, {
				divided: !0,
				children: [
					r.enabled ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "Recommended values come once usage data exists. An empty limit means unlimited; in-flight tasks may exceed it." }) : null,
					r.enabled && l?.paused ? /* @__PURE__ */ (0, Q.jsxs)(w, { children: [l.reasons.join("; "), ". After adjusting or clearing, retry repairs in the task center."] }) : null,
					a.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: a.error }) : null
				]
			}),
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				...G(a.busy === "save"),
				children: "Save configuration"
			}) })
		]
	}) : /* @__PURE__ */ (0, Q.jsx)(I, {
		title: "Capacity protection",
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(w, { children: a.error || "Capacity settings not obtained" }) })
	});
}
// src/react/settings/storage-settings.tsx
var Ea = "/api/configuration/storage", Da = 1500, Oa = 864e5, ka = (e) => e instanceof u && e.body?.errors?.target || q(e);
function Aa(e) {
	if (e.free_bytes === null || e.total_bytes === null) return "Not fetched";
	let t = `${J(e.free_bytes)} free of ${J(e.total_bytes)}`;
	return e.system_drive ? `${t} (system disk)` : t;
}
var ja = (e) => e.cleanable && e.reclaimable > 0;
function Ma({ job: e }) {
	let t = e.files || 0, n = e.expected_files || 0, r = /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		"Measured ",
		/* @__PURE__ */ (0, Q.jsx)(Yr, { value: t }),
		" files · ",
		/* @__PURE__ */ (0, Q.jsx)(Yr, {
			value: e.bytes || 0,
			format: J
		})
	] });
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		"aria-live": "polite",
		className: "flex flex-col gap-2",
		children: [n ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(Ce, {
			label: "Usage progress",
			value: Math.min(t, n * .99),
			max: n
		}), /* @__PURE__ */ (0, Q.jsxs)(M, { children: [
			r,
			", last time ",
			n.toLocaleString(),
			" items"
		] })] }) : /* @__PURE__ */ (0, Q.jsx)(ue, { label: "'Measuring disk usage" }), n ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: r })]
	});
}
function Na({ category: e, selected: t, disabled: n, onToggle: r }) {
	let i = ja(e), a = e.cleanable ? e.reclaimable > 0 ? `After cleanup, ${e.note}` : "No files to clean up" : `Cannot clean: ${e.note}`;
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		"data-category": e.key,
		className: "flex min-h-13 w-full items-start gap-3 border-b border-separator-border py-2.5 pr-3 last:border-b-0",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(v, {
				"aria-label": `Clean ${e.label}`,
				isSelected: t,
				isDisabled: !i || n,
				onChange: r,
				className: "mt-0.5"
			}),
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex min-w-0 flex-1 flex-col gap-0.5",
				children: [
					/* @__PURE__ */ (0, Q.jsxs)("p", {
						className: "flex items-center gap-2 text-body-regular text-text-primary",
						children: [/* @__PURE__ */ (0, Q.jsx)("i", {
							"aria-hidden": !0,
							className: `size-2.5 shrink-0 rounded-xs ${_a[e.key] || "bg-text-tertiary"}`
						}), e.label]
					}),
					/* @__PURE__ */ (0, Q.jsx)("p", {
						className: "text-body-2-regular text-text-secondary",
						children: e.description
					}),
					/* @__PURE__ */ (0, Q.jsx)("p", {
						className: "text-caption-1-regular text-text-tertiary",
						children: a
					})
				]
			}),
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex shrink-0 flex-col items-end gap-0.5 text-right",
				children: [/* @__PURE__ */ (0, Q.jsx)(Yr, {
					value: e.bytes,
					format: J,
					className: "text-body-regular text-text-primary"
				}), i ? /* @__PURE__ */ (0, Q.jsxs)("span", {
					className: "text-caption-1-regular text-text-secondary",
					children: ["Releasable ", J(e.reclaimable)]
				}) : null]
			})
		]
	});
}
function Pa({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(""), [o, s] = (0, Z.useState)(/* @__PURE__ */ new Set()), c = Y(), l = n.job.state !== "idle", u = (0, Z.useRef)(l);
	(0, Z.useEffect)(() => {
		e.usage || e.job.state !== "idle" || document.body.classList.contains("peach-guiding") || c.run("measure", (e) => W(`${Ea}/measure`, {}, "POST", e), r);
	}, []), (0, Z.useEffect)(() => {
		if (!l) return;
		let e = new AbortController(), t = setTimeout(() => {
			U(Ea, e.signal).then(r, () => {
				e.signal.aborted || r((e) => ({ ...e }));
			});
		}, Da);
		return () => {
			e.abort(), clearTimeout(t);
		};
	}, [n]), (0, Z.useEffect)(() => {
		l ? u.current = !0 : u.current && (u.current = !1, s(/* @__PURE__ */ new Set()), n.job.error || t(n.job.message || "Disk usage calculated"));
	}, [l]);
	let f = () => void c.run("measure", (e) => W(`${Ea}/measure`, {}, "POST", e), r), p = n.usage, m = p?.categories.filter(ja) ?? [], h = m.filter((e) => o.has(e.key)), g = (e, t) => {
		if (!e.length) return;
		let n = e.reduce((e, t) => e + t.reclaimable, 0);
		K({
			title: t,
			body: `Will delete ${J(n)}: ${e.map((e) => `${e.label} ${J(e.reclaimable)} (${e.note} after cleanup)`).join("; ")}.`,
			confirmLabel: `Clean ${J(n)}`,
			danger: e.some((e) => e.key === "backups"),
			onConfirm: async () => r(await W(`${Ea}/clean`, { categories: e.map((e) => e.key) }))
		});
	}, _ = () => void c.run("relocate", async (e) => {
		let t = (await W(ge, { initial: n.data_root }, "POST", e)).path;
		if (!t) return;
		let r = n.usage ? J(n.usage.total_bytes) : "";
		await K({
			title: "Migrate the data directory",
			body: `Move ${r} of data from ${n.data_root} to ${t}. Peach exits during the migration and reopens automatically when it is done; data at the old location is deleted after it has been verified at the new one.`,
			confirmLabel: "Migrate the data directory",
			onConfirm: async () => {
				try {
					a((await W(`${Ea}/relocate`, { target: t })).message);
				} catch (e) {
					throw Error(ka(e));
				}
			}
		});
	}, () => void 0), v = n.relocation.last, y = v && (v.state === "error" || (v.notes?.length ?? 0) > 0 || Date.now() - v.finished_at * 1e3 < Oa), x = p?.categories.find((e) => e.key === n.job.category)?.label, S = i || (n.job.state === "cleaning" ? `Cleaning${x || ""}…` : n.job.state === "measuring" ? "Calculating disk usage…" : h.length ? `${h.length} categories selected, ${J(h.reduce((e, t) => e + t.reclaimable, 0))} reclaimable` : p ? `Measured at ${(/* @__PURE__ */ new Date(p.measured_at * 1e3)).toLocaleString()}` : ""), C = l || !!i, ee = (e) => (t) => s((n) => {
		let r = new Set(n);
		return t ? r.add(e) : r.delete(e), r;
	});
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "storageSettings",
		guide: "storage",
		title: "Storage",
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(A, { children: [/* @__PURE__ */ (0, Q.jsx)(k, {
				term: "Data directory",
				children: /* @__PURE__ */ (0, Q.jsx)(xe, {
					path: n.data_root,
					className: "text-body-regular text-text-primary",
					onRevealed: t
				})
			}), /* @__PURE__ */ (0, Q.jsx)(k, {
				term: "'Hosting disk'",
				children: Aa(n)
			})] }),
			/* @__PURE__ */ (0, Q.jsxs)(B, {
				divided: !0,
				children: [
					n.job.state === "measuring" ? /* @__PURE__ */ (0, Q.jsx)(Ma, { job: n.job }) : null,
					p?.capacity_error ? /* @__PURE__ */ (0, Q.jsxs)(w, { children: ["Capacity statistics incomplete:", p.capacity_error] }) : null,
					p?.allocated_bytes == null ? null : /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["Peach data actually on disk ", J(p.allocated_bytes)] }),
					p ? /* @__PURE__ */ (0, Q.jsxs)("div", {
						"data-storage-result": "",
						className: Je({
							variant: "outlined",
							padding: "none",
							className: "flex flex-col"
						}),
						children: [/* @__PURE__ */ (0, Q.jsx)("div", {
							className: "border-b border-separator-border p-4",
							children: /* @__PURE__ */ (0, Q.jsx)(ba, { storage: n })
						}), /* @__PURE__ */ (0, Q.jsx)("div", {
							className: "flex flex-col pl-4",
							children: p.categories.map((e) => /* @__PURE__ */ (0, Q.jsx)(Na, {
								category: e,
								selected: o.has(e.key),
								disabled: C,
								onToggle: ee(e.key)
							}, e.key))
						})]
					}) : n.job.state === "measuring" ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: "After analysis, shows usage per data type and lets you clear the cache and old backups." }),
					n.relocation.available ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: n.relocation.message }),
					!n.relocation.available && n.relocation.steps?.length ? /* @__PURE__ */ (0, Q.jsx)(b, {
						label: "Migrate on the host machine",
						steps: n.relocation.steps
					}) : null,
					n.job.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: n.job.message }) : null,
					c.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: c.error }) : null,
					y && v ? v.state === "error" ? /* @__PURE__ */ (0, Q.jsx)(w, { children: v.message }) : /* @__PURE__ */ (0, Q.jsx)(M, { children: [v.message, ...v.notes ?? []].join("; ") }) : null
				]
			}),
			/* @__PURE__ */ (0, Q.jsxs)(j, {
				status: S ? /* @__PURE__ */ (0, Q.jsx)("p", {
					role: i ? "status" : void 0,
					children: S
				}) : null,
				children: [
					p ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						disabled: C || !h.length,
						...G(n.job.state === "cleaning" && h.length > 0),
						onClick: () => g(h, "Clean the selected data"),
						children: "Clean selected"
					}), /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						disabled: C || !m.length,
						onClick: () => g(m, "Clean every cleanable piece of data"),
						children: "Clean all"
					})] }) : null,
					/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						disabled: C || !n.relocation.available || !p,
						onClick: _,
						...G(c.busy === "relocate"),
						children: "Change location"
					}),
					/* @__PURE__ */ (0, Q.jsx)(d, {
						disabled: !!i || n.job.state === "cleaning",
						onClick: f,
						...G(c.busy === "measure" || n.job.state === "measuring"),
						children: p ? "Re-measure" : "Measure usage"
					})
				]
			})
		]
	}), n.budget ? /* @__PURE__ */ (0, Q.jsx)(Ta, {
		initial: n.budget,
		after: r,
		receipt: t
	}) : null] });
}
// src/react/settings/maintenance-settings.tsx
var Fa = [
	["6", "Every 6 hours"],
	["24", "Daily"],
	["168", "Weekly"]
];
function Ia({ data: e, receipt: t, reopenTutorial: n, panel: r }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(r),
		children: [
			e.storage ? /* @__PURE__ */ (0, Q.jsx)(Pa, {
				initial: e.storage,
				receipt: t
			}) : null,
			e.storage ? /* @__PURE__ */ (0, Q.jsx)(Wr, { receipt: t }) : null,
			e.remote_reporting || e.library_sharing ? /* @__PURE__ */ (0, Q.jsxs)(I, {
				id: "librarySharing",
				guide: "reporting",
				title: "Data uploads",
				children: [e.remote_reporting ? /* @__PURE__ */ (0, Q.jsx)(qr, {
					initial: e.remote_reporting,
					receipt: t
				}) : null, e.library_sharing ? /* @__PURE__ */ (0, Q.jsx)("div", {
					className: "border-t border-separator-border",
					children: /* @__PURE__ */ (0, Q.jsx)(Gr, {
						initial: e.library_sharing,
						receipt: t
					})
				}) : null]
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(za, {
				facts: e.facts,
				receipt: t
			}),
			/* @__PURE__ */ (0, Q.jsx)(La, {
				receipt: t,
				reopenTutorial: n
			}),
			e.uninstall ? /* @__PURE__ */ (0, Q.jsx)(Ba, {
				uninstall: e.uninstall,
				receipt: t
			}) : null
		]
	});
}
function La({ reopenTutorial: e }) {
	return /* @__PURE__ */ (0, Q.jsx)("section", {
		"aria-label": "Guided tour",
		className: "w-full",
		children: /* @__PURE__ */ (0, Q.jsx)(Ne, { children: /* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
			label: "Guided tour",
			description: "Brings the tour entry back to the top bar on every device and keeps your reading progress",
			children: /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => void e(),
				children: "Reopen"
			})
		}) }) })
	});
}
function Ra({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e.mode), [i, a] = (0, Z.useState)(e.interval_hours), o = Y(e.error), s = (r) => {
		r.preventDefault(), e.available && o.run("save", (e) => W("/api/configuration/automatic-updates", {
			mode: n,
			interval_hours: i
		}, "POST", e), () => t("Configuration saved"));
	}, c = e.available ? e.download_available ? "After downloading, confirm the restart install here." : void 0 : "Auto-update needs the tray-managed service.";
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "automaticUpdates",
		guide: "automatic-updates",
		title: "Auto-update",
		onSubmit: s,
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(F, { children: [
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Automatically check for new versions",
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Automatically check for new versions",
						isSelected: n !== "off",
						isDisabled: !e.available,
						onChange: (e) => r(e ? "check" : "off")
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Download updates automatically",
					description: "After finding a new version, it downloads first and asks before installing on the next restart.",
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Download updates automatically",
						isSelected: n === "download",
						isDisabled: !e.available || !e.download_available || n === "off",
						onChange: (e) => r(e ? "download" : "check")
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Check frequency",
					description: c,
					children: /* @__PURE__ */ (0, Q.jsx)(L, {
						"aria-label": "Check frequency",
						selectedKey: String(i),
						isDisabled: !e.available,
						onSelectionChange: (e) => {
							e !== null && a(Number(e));
						},
						children: Fa.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(R, {
							id: e,
							children: t
						}, e))
					})
				})
			] }),
			o.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: o.error })
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				disabled: !e.available,
				...G(o.busy === "save"),
				children: "Save configuration"
			}) })
		]
	});
}
function za({ facts: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(null), i = n ?? e, a = Y(), o = (e) => void a.run(e, (t) => W("/api/configuration/media-tools", { tool: e }, "POST", t), (e) => {
		r(e.facts), t(e.message);
	});
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "facts",
		title: "Runtime info",
		children: [/* @__PURE__ */ (0, Q.jsx)(A, { children: i.map(({ term: e, value: t, install_tool: n, download_url: r, download_label: i }) => /* @__PURE__ */ (0, Q.jsx)(k, {
			term: e,
			children: n ? /* @__PURE__ */ (0, Q.jsxs)("span", {
				className: "flex min-w-0 items-center gap-3",
				children: [/* @__PURE__ */ (0, Q.jsx)("span", {
					className: "min-w-0",
					children: t
				}), /* @__PURE__ */ (0, Q.jsx)(d, {
					size: "small",
					className: "shrink-0",
					onClick: () => o(n),
					...G(a.busy === n),
					children: "Install"
				})]
			}) : /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [t, r ? /* @__PURE__ */ (0, Q.jsx)(E, {
				href: r,
				children: i
			}) : null] })
		}, e)) }), a.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: a.error }) : null]
	});
}
function Ba({ uninstall: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(!1), [i, a] = (0, Z.useState)(""), o = () => void K({
		title: "Uninstall Peach",
		danger: !0,
		body: n ? "This quits Peach and removes the program, autostart, desktop icons, settings, the local database, watch history, credentials, and caches. Original media files are kept." : "Will quit Peach and remove the program, launch at startup and desktop icons. Settings, local database, watch history and cache are kept.",
		confirmLabel: "Uninstall Peach",
		onConfirm: async () => {
			let e = await W("/api/configuration/uninstall", {
				delete_data: n,
				confirmation: "Uninstall Peach"
			});
			a(e.message);
		}
	}), s = i || e.message, c = [.../* @__PURE__ */ new Set([e.data_root, ...e.directories])];
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "uninstallPeach",
		guide: "uninstall",
		title: "Uninstall Peach",
		children: [
			e.available ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(M, { children: "Uninstalling removes the Peach program itself; original media files are kept." }) }) : null,
			/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Full uninstall",
				description: "Also delete settings, the local database, watch history, credentials, and caches",
				children: /* @__PURE__ */ (0, Q.jsx)(H, {
					"aria-label": "Full uninstall",
					isSelected: n,
					isDisabled: !e.full_available || !!i,
					onChange: r
				})
			}) }),
			/* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(x, {
					summary: "Data directory",
					children: c.map((e) => /* @__PURE__ */ (0, Q.jsx)(xe, {
						path: e,
						className: "text-body-2-regular text-text-secondary",
						onRevealed: t
					}, e))
				})
			}),
			/* @__PURE__ */ (0, Q.jsx)(j, {
				status: s ? /* @__PURE__ */ (0, Q.jsx)("p", {
					role: i ? "status" : void 0,
					children: s
				}) : null,
				children: /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "danger",
					disabled: !e.available || !!i,
					onClick: o,
					children: "Uninstall Peach"
				})
			})
		]
	});
}
// src/react/settings/docker-update.tsx
var Va = 3e3, Ha = 9e5;
function Ua(e) {
	let [t, n] = (0, Z.useState)({ state: "idle" }), r = Y(), i = (0, Z.useRef)(0);
	return (0, Z.useEffect)(() => {
		if (t.state !== "updating") return;
		let r = new AbortController(), a, o = async () => {
			try {
				let t = (await U("/api/client-updates", r.signal)).runtime?.version;
				if (!r.signal.aborted && t && t !== e) {
					n({
						state: "done",
						version: t
					});
					return;
				}
			} catch {}
			r.signal.aborted || (Date.now() - i.current > Ha ? n({ state: "timeout" }) : a = setTimeout(o, Va));
		};
		return a = setTimeout(o, Va), () => {
			r.abort(), clearTimeout(a);
		};
	}, [t.state, e]), {
		job: t,
		run: () => r.run("docker-update", (e) => W("/api/configuration/docker-update", {}, "POST", e), () => {
			i.current = Date.now(), n({ state: "updating" });
		}),
		busy: r.busy === "docker-update",
		error: r.error
	};
}
function Wa({ job: e }) {
	return e.state === "updating" ? /* @__PURE__ */ (0, Q.jsx)(M, {
		role: "status",
		children: "Watchtower is pulling the new image and recreating the container. Peach disconnects briefly; this page prompts you to refresh once the new version is up."
	}) : e.state === "done" ? /* @__PURE__ */ (0, Q.jsxs)(M, {
		role: "status",
		children: [
			"Updated to Peach ",
			e.version,
			", refresh the page to use it."
		]
	}) : e.state === "timeout" ? /* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsx)(w, { children: "No new version started within 15 minutes. Check the Watchtower and Peach logs next to compose.yaml:" }), /* @__PURE__ */ (0, Q.jsx)(b, {
		label: "View the update changelog",
		steps: [{
			text: "Watchtower pull and rebuild history",
			command: "docker compose logs watchtower"
		}, {
			text: "Peach startup and database migration history",
			command: "docker compose logs peach"
		}]
	})] }) : null;
}
// src/react/settings/release-updates.tsx
var Ga = /* @__PURE__ */ new Set([
	"downloading",
	"verifying",
	"extracting",
	"preparing",
	"restarting",
	"installing"
]), Ka = [
	65,
	75,
	90
], qa = 120, Ja = "https://github.com/peach-mitao/peach/releases";
function Ya({ initial: e, initialJob: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(t || {
		state: "idle",
		progress: 0
	}), [o, s] = (0, Z.useState)(""), c = Y(), l = (0, Z.useRef)(!1), u = (0, Z.useRef)(!0), p = Ga.has(i.state), m = Ua(e.current_version), h = n.state === "available" && !!n.one_click?.available, g = m.job.state === "updating", _ = () => void K({
		title: "Update in one click",
		body: `Watchtower will pull the Peach ${n.latest_version || ""} image and recreate the container; the /data volume is kept.Peach disconnects during the rebuild; running tasks resume after startup. When database migrations are pending, the database is backed up before they run.`,
		confirmLabel: "Start the update",
		cancelLabel: "Cancel",
		onConfirm: m.run
	});
	(0, Z.useEffect)(() => (u.current = !0, () => {
		u.current = !1;
	}), []);
	let v = async () => {
		let e = await W("/api/configuration/update-restart", {});
		u.current && a(e);
	}, y = () => void K({
		title: "The update is ready",
		body: `Peach ${i.version || ""} will be installed after a restart.`,
		confirmLabel: "Restart now",
		cancelLabel: "Later",
		onConfirm: v
	});
	(0, Z.useEffect)(() => {
		i.state !== "ready" || l.current || (l.current = !0, y());
	}, [i.state]), (0, Z.useEffect)(() => {
		let e = new AbortController(), t = Ga.has(i.state) ? 1e3 : 3e4, n, o = 0, c = async () => {
			try {
				let t = await U("/api/configuration/update-status", e.signal);
				if (e.signal.aborted) return;
				a(t), o = 0, t.state === "complete" && r((e) => ({
					...e,
					current_version: t.version || e.current_version,
					state: "current",
					message: "Already the latest beta."
				}));
				let n = await U("/api/configuration/automatic-updates", e.signal);
				!e.signal.aborted && n.result && r(n.result);
			} catch {
				o += 1, o >= qa && !e.signal.aborted && s("Not connected to Peach yet; check the tray, then refresh the page.");
			}
			!e.signal.aborted && o < qa && (n = setTimeout(c, t));
		};
		return n = setTimeout(c, t), () => {
			e.abort(), clearTimeout(n);
		};
	}, [i.state]);
	let x = () => {
		p || (l.current = !1, s(""), c.run("download", (e) => W("/api/configuration/update", {}, "POST", e), a));
	}, S = () => void c.run("check", (e) => U("/api/configuration/updates", e), r, (t) => {
		r({
			...e,
			state: "error"
		}), c.setError(q(t));
	}), C = c.error || o || m.error, ee = i.state === "downloading" && i.total ? `${((i.downloaded || 0) / 1048576).toFixed(1)} / ${(i.total / 1048576).toFixed(1)} MB` : `${i.progress}%`;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "releaseUpdates",
		guide: "updates",
		title: "Check updates",
		aside: /* @__PURE__ */ (0, Q.jsx)(V, {
			tone: C || n.state === "error" || i.state === "error" || m.job.state === "timeout" ? "error" : p || g ? "progress" : m.job.state === "done" ? "success" : n.state === "available" ? "warning" : n.state === "unchecked" ? "neutral" : "success",
			children: C || n.state === "error" || i.state === "error" ? "Check unfinished" : m.job.state === "timeout" ? "Update unfinished" : p ? "Preparing update" : g ? "Updating" : m.job.state === "done" ? "Updated" : i.state === "ready" ? "Installable" : n.state === "available" ? "Update available" : n.state === "unchecked" ? "Not checked yet" : "Check finished"
		}),
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(A, { children: [
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "Current version",
					children: m.job.state === "done" ? m.job.version : n.current_version
				}),
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "Install method",
					children: n.installation
				}),
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "Update channel",
					children: n.channel
				}),
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "Latest version",
					children: n.latest_version || "Not fetched"
				}),
				n.package_kind ? /* @__PURE__ */ (0, Q.jsxs)(k, {
					term: "Download contents",
					children: [n.package_kind === "update" ? "Apply update" : n.package_kind === "installer" ? "macOS install image" : "Apps and tools", n.asset_size ? ` · ${(n.asset_size / 1048576).toFixed(1)} MB` : ""]
				}) : null
			] }),
			n.package_kind === "update" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "The app update package reuses installed tools; missing, damaged, or changed-version tools are downloaded separately as needed." }) : n.package_kind === "full" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "This update includes media tools." }) : n.package_kind === "installer" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "After downloading, open the image and drag Peach into Applications to replace the old version; the data directory and settings are kept. If macOS says it is damaged, follow the release page to clear the quarantine flag." }) : null,
			n.state === "unchecked" && !n.checked_at && !C && i.state === "idle" ? null : /* @__PURE__ */ (0, Q.jsxs)(B, {
				divided: !0,
				children: [
					n.checked_at ? /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["Checked at ", (/* @__PURE__ */ new Date(n.checked_at * 1e3)).toLocaleString()] }) : null,
					m.job.state === "done" ? null : n.state === "available" && !C ? /* @__PURE__ */ (0, Q.jsx)(P, {
						tone: "info",
						title: "Update available",
						children: n.message
					}) : C || n.state === "error" ? /* @__PURE__ */ (0, Q.jsx)(w, { children: C || n.message }) : n.state === "unchecked" ? null : /* @__PURE__ */ (0, Q.jsx)(M, {
						role: "status",
						children: n.message
					}),
					n.state === "available" && !C && !h && m.job.state === "idle" && n.steps?.length ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(b, {
						label: "Update on the host",
						steps: n.steps
					}), /* @__PURE__ */ (0, Q.jsx)(M, { children: n.one_click?.reason || "Once Watchtower runs with the compose watchtower profile, you can update from here in one click; read the Docker deployment notes before enabling it." })] }) : null,
					/* @__PURE__ */ (0, Q.jsx)(Wa, { job: m.job }),
					i.state === "error" ? /* @__PURE__ */ (0, Q.jsx)(w, { children: i.message }) : null,
					i.state !== "idle" && i.state !== "error" ? /* @__PURE__ */ (0, Q.jsxs)("div", {
						"aria-live": "polite",
						className: "flex flex-col gap-2",
						children: [
							/* @__PURE__ */ (0, Q.jsx)(Ce, {
								label: "'Update preparation progress'",
								value: i.progress,
								stops: Ka
							}),
							/* @__PURE__ */ (0, Q.jsxs)(M, { children: ["Download → verify → extract → preparing install · ", i.message] }),
							/* @__PURE__ */ (0, Q.jsx)(M, { children: ee })
						]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, Q.jsxs)(j, {
				status: /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex flex-wrap items-center gap-3",
					children: [
						/* @__PURE__ */ (0, Q.jsx)(E, {
							href: "https://peach.video/#download",
							children: "Official site"
						}),
						/* @__PURE__ */ (0, Q.jsx)(E, {
							href: "https://github.com/peach-mitao/peach",
							children: "GitHub"
						}),
						/* @__PURE__ */ (0, Q.jsx)(E, {
							href: n.release_url || Ja,
							children: "View release page"
						})
					]
				}),
				children: [
					/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "ghost",
						onClick: () => document.dispatchEvent(new Event(we)),
						children: "'Release notes for this version'"
					}),
					/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: i.state === "ready" || h || n.state === "available" && n.installation === "Standalone test package" ? "secondary" : "primary",
						disabled: p || g,
						onClick: S,
						...G(c.busy === "check"),
						children: "Check updates"
					}),
					m.job.state === "done" ? /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "primary",
						onClick: () => window.location.reload(),
						children: "Refresh the page"
					}) : h ? /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "primary",
						onClick: _,
						...G(g || m.busy),
						children: "Update in one click"
					}) : null,
					n.state === "available" && n.in_app_update && i.state !== "ready" ? /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "primary",
						onClick: x,
						...G(p || c.busy === "download"),
						children: "Download and install"
					}) : n.state === "available" && n.installation === "Standalone test package" && n.asset_url ? /* @__PURE__ */ (0, Q.jsx)(f, {
						variant: "primary",
						href: n.asset_url,
						children: "Download the new version"
					}) : null,
					i.state === "ready" ? /* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "primary",
						onClick: y,
						children: "Restart to install"
					}) : null
				]
			})
		]
	});
}
// src/react/settings/upgrade-repairs.tsx
var Xa = {
	pending: "Awaiting repair",
	running: "Repairing",
	failed: "Needs retry",
	review: "Needs review",
	complete: "Completed",
	unavailable: "Not enabled in this deployment"
};
function Za() {
	let { snapshot: e } = Pt(), [t, n] = (0, Z.useState)(null), r = Y();
	(0, Z.useEffect)(() => n(null), [e]);
	let i = t ?? e?.repairs, a = i?.state || "pending", o = i?.items.reduce((e, t) => e + (t.pending || 0), 0) || 0, s = i?.items.reduce((e, t) => e + (t.failed || 0), 0) || 0, c = i?.items.reduce((e, t) => e + (t.review_count || 0), 0) || 0;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "upgradeRepairs",
		title: "Auto repair",
		aside: /* @__PURE__ */ (0, Q.jsx)(V, {
			tone: a === "failed" ? "error" : a === "running" ? "progress" : a === "review" ? "warning" : a === "complete" ? "success" : "neutral",
			children: /* @__PURE__ */ (0, Q.jsx)("span", {
				"data-copy-key": `upgradeRepairs.${a}.status`,
				children: Xa[a] || "Not fetched"
			}, a)
		}),
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(A, { children: [
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "To do",
					children: /* @__PURE__ */ (0, Q.jsxs)("span", { children: [/* @__PURE__ */ (0, Q.jsx)(Yr, { value: o }), " items"] })
				}),
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "Failed",
					children: /* @__PURE__ */ (0, Q.jsxs)("span", { children: [/* @__PURE__ */ (0, Q.jsx)(Yr, { value: s }), " items"] })
				}),
				/* @__PURE__ */ (0, Q.jsx)(k, {
					term: "To review",
					children: /* @__PURE__ */ (0, Q.jsxs)("span", { children: [/* @__PURE__ */ (0, Q.jsx)(Yr, { value: c }), " items"] })
				})
			] }),
			i?.message || r.error ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(w, { children: r.error || i?.message }) }) : null,
			a === "running" ? /* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsx)(M, { children: "Details and previews are completing in the background." }), /* @__PURE__ */ (0, Q.jsx)(ze, {})] }) : null,
			/* @__PURE__ */ (0, Q.jsxs)(j, {
				status: c ? /* @__PURE__ */ (0, Q.jsx)(E, {
					href: "/api/configuration/upgrade-repairs/review",
					children: "Download the review records"
				}) : null,
				children: [/* @__PURE__ */ (0, Q.jsx)(le, {
					href: Te,
					size: "small",
					trailingIcon: dt,
					children: "Repairs and migrations"
				}), /* @__PURE__ */ (0, Q.jsx)(d, {
					size: "small",
					variant: "secondary",
					disabled: !i?.available || a === "running" || !!r.busy || !s && a !== "failed",
					onClick: () => void r.run("retry", (e) => W("/api/configuration/upgrade-repairs/retry", {}, "POST", e), (e) => {
						n(e), document.dispatchEvent(new Event("peach:client-updates"));
					}),
					children: "Retry failed items"
				})]
			})
		]
	});
}
// src/react/settings/general-settings.tsx
function Qa({ data: e, receipt: t, panel: n }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(n),
		children: [
			e.updates ? /* @__PURE__ */ (0, Q.jsx)(Ya, {
				initial: e.updates,
				initialJob: e.update_job
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(Za, {}),
			e.automatic_updates ? /* @__PURE__ */ (0, Q.jsx)(Ra, {
				initial: e.automatic_updates,
				receipt: t
			}) : null,
			e.startup ? /* @__PURE__ */ (0, Q.jsx)($a, {
				startup: e.startup,
				receipt: t
			}) : null
		]
	});
}
function $a({ startup: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e.enabled), [i, a] = (0, Z.useState)(e.silent), [o, s] = (0, Z.useState)(e.desktop), c = Y(), l = e.available && !e.desktop_message;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "startup",
		title: "Start at sign-in",
		onSubmit: (r) => {
			r.preventDefault(), e.available && c.run("save", (e) => W("/api/configuration/startup", {
				enabled: n,
				silent: i,
				desktop: o
			}, "POST", e), () => t("Configuration saved"));
		},
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(F, { children: [
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Start Peach after sign-in",
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Start Peach after sign-in",
						isSelected: n,
						isDisabled: !e.available,
						onChange: r
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Start the tray only, without opening the web app",
					description: "Runs in the background at startup; open the page from the tray when needed.",
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Start the tray only, without opening the web app",
						isSelected: i,
						isDisabled: !e.available || !n,
						onChange: a
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Create desktop shortcut",
					description: e.desktop_message || void 0,
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Create desktop shortcut",
						isSelected: o,
						isDisabled: !l,
						onChange: s
					})
				})
			] }),
			e.message || c.error ? /* @__PURE__ */ (0, Q.jsxs)(B, {
				divided: !0,
				children: [e.message ? /* @__PURE__ */ (0, Q.jsx)(M, { children: e.message }) : null, c.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: c.error }) : null]
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				disabled: !e.available,
				...G(c.busy === "save"),
				children: "Save configuration"
			}) })
		]
	});
}
// src/react/restart-redirect.ts
var eo = 8e3, to = [
	{
		name: "Hard disk drive, or up to 8 GB memory",
		cache: "10–20 GiB",
		read: "256 / 128 KB",
		task: "1 item"
	},
	{
		name: "SATA SSD with 8-16 GB memory",
		cache: "20–50 GiB",
		read: "256 / 128 KB",
		task: "1–2 items"
	},
	{
		name: "NVMe SSD with 16 GB+ memory",
		cache: "50–100 GiB",
		read: "256 / 128 KB",
		task: "Minimum 2"
	}
], no = [
	["cache", "Cache cap"],
	["read", "Read length (default / min)"],
	["task", "Process videos too"]
];
function ro() {
	return /* @__PURE__ */ (0, Q.jsx)("div", {
		className: "@container flex flex-col gap-3",
		children: /* @__PURE__ */ (0, Q.jsxs)(x, {
			summary: "CloudDrive setup help",
			children: [
				/* @__PURE__ */ (0, Q.jsxs)(M, { children: ["First mount the cloud drive from CloudDrive2 or OpenList as a local folder, then choose it here.", /* @__PURE__ */ (0, Q.jsx)(E, {
					href: "https://www.clouddrive2.com/help.html",
					children: "Mount help"
				})] }),
				/* @__PURE__ */ (0, Q.jsx)(M, { children: "The cache picks its starting value from the hosting disk and free memory, then adjusts to playback behavior." }),
				/* @__PURE__ */ (0, Q.jsx)(M, { children: "File operations need the mount tool and write permission granted by the cloud drive account. Uploading, creating folders, renaming, and moving on the Guangya cloud drive require CloudDrive2 v1.1.0 or later; deletion and copy are not supported yet." }),
				/* @__PURE__ */ (0, Q.jsx)("ul", {
					"aria-label": "Tiered by cache disk",
					className: "flex flex-col gap-2",
					children: to.map((e) => /* @__PURE__ */ (0, Q.jsxs)("li", {
						className: "flex flex-col gap-2 rounded-2lg border border-separator-border bg-background-primary-default p-3",
						children: [/* @__PURE__ */ (0, Q.jsx)("p", {
							className: "text-body-medium text-text-primary",
							children: e.name
						}), /* @__PURE__ */ (0, Q.jsx)("dl", {
							className: "inline-grid grid-cols-1 gap-2 @md:grid-cols-3",
							children: no.map(([t, n]) => /* @__PURE__ */ (0, Q.jsxs)("div", {
								className: "flex flex-col",
								children: [/* @__PURE__ */ (0, Q.jsx)("dt", {
									className: "text-caption-1-regular text-text-secondary",
									children: n
								}), /* @__PURE__ */ (0, Q.jsx)("dd", {
									className: "text-body-regular text-text-primary",
									children: e[t]
								})]
							}, t))
						})]
					}, e.name))
				}),
				/* @__PURE__ */ (0, Q.jsxs)("ul", {
					className: "flex list-disc flex-col gap-1 pl-5 text-body-2-regular text-text-secondary",
					children: [
						/* @__PURE__ */ (0, Q.jsx)("li", { children: "Fill in the cache limit and cleanup mode under CloudDrive \"Settings\", choosing LRU for cleanup. Do not set the limit to 0, and leave at least 40 GiB on the system disk; reopen the settings page after filling it in to confirm it persisted." }),
						/* @__PURE__ */ (0, Q.jsx)("li", { children: "Read length and download threads go in each cloud drive's own download settings, with threads starting at 2." }),
						/* @__PURE__ */ (0, Q.jsx)("li", { children: "Buffer Cache uses memory; disk cache and folder cache use disk; changing one does not govern the other two." })
					]
				}),
				/* @__PURE__ */ (0, Q.jsx)(M, { children: /* @__PURE__ */ (0, Q.jsx)(E, {
					href: "https://github.com/peach-mitao/peach/blob/master/docs/CLOUDDRIVE.md",
					children: "Full configuration and tuning guide"
				}) })
			]
		})
	});
}
// src/react/settings/cloud-proxy-settings.tsx
var io = "/api/configuration/cloud-proxies", ao = [
	["direct", "Direct"],
	["system", "Follow system"],
	["http", "HTTP proxy"],
	["socks5", "SOCKS5 proxy"]
];
function oo({ receipt: e }) {
	let [t, n] = (0, Z.useState)(null), [r, i] = (0, Z.useState)(!0), a = (0, Z.useRef)(/* @__PURE__ */ new Set()), o = (0, Z.useRef)(/* @__PURE__ */ new Set()), [s, c] = (0, Z.useState)(!1), l = (0, Z.useRef)(() => void 0), u = Y(), f = () => {
		o.current.size || u.run("refresh", (e) => U(io, e), (e) => {
			a.current.clear(), n(e), i(!1);
		}, (e) => {
			i(!1), u.setError(e instanceof Error ? e.message : "The drive proxy could not be read");
		});
	};
	return l.current = f, (0, Z.useEffect)(() => {
		l.current();
		let e = () => {
			a.current.size || l.current();
		};
		return window.addEventListener("focus", e), () => window.removeEventListener("focus", e);
	}, []), (0, Z.useEffect)(() => {
		if (!t) return;
		let e = (e) => e.mode === "http" || e.mode === "socks5";
		wt("cloudProxy", {
			configured: t.configured !== !1,
			unlinked: t.unlinked?.length ?? 0,
			accounts: t.accounts.map((t) => [e(t.data), e(t.api)])
		});
	}, [t]), r ? /* @__PURE__ */ (0, Q.jsx)(Ae, {
		label: "Reading the drive proxy",
		html: Ye
	}) : /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "cloud-proxy",
		title: "CloudDrive proxy",
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsx)(M, { children: m }), /* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 flex-col gap-4",
			children: [
				u.error ? /* @__PURE__ */ (0, Q.jsxs)(P, {
					tone: "error",
					title: "The configuration was not read",
					children: [
						u.error,
						" ",
						/* @__PURE__ */ (0, Q.jsx)(le, {
							href: "/settings/downloads",
							size: "small",
							children: "Download settings"
						})
					]
				}) : null,
				t?.configured === !1 ? /* @__PURE__ */ (0, Q.jsxs)(M, { children: ["After filling in the CloudDrive2 address and API token, set a proxy for each cloud drive account here. ", /* @__PURE__ */ (0, Q.jsx)(le, {
					href: "/settings/downloads",
					size: "small",
					children: "Download settings"
				})] }) : t?.accounts.length === 0 && !t.unlinked?.length ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "No library uses CloudDrive yet." }) : null,
				t?.unlinked?.map((e) => /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex min-w-0 flex-col gap-1",
					children: [/* @__PURE__ */ (0, Q.jsx)(re, { children: /* @__PURE__ */ (0, Q.jsxs)("span", {
						className: "inline-flex items-center gap-2",
						children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: fr(e.location) }), e.name]
					}) }), /* @__PURE__ */ (0, Q.jsx)(M, { children: "No CloudDrive account matched yet" })]
				}, e.root)),
				t?.accounts.map((t) => /* @__PURE__ */ (0, Q.jsx)(so, {
					initial: t,
					receipt: e,
					onDirty: () => a.current.add(t.id),
					onSaving: (e) => {
						e ? o.current.add(t.id) : o.current.delete(t.id), c(!!o.current.size);
					},
					onSaved: (e) => {
						a.current.delete(e.id), n((t) => t && {
							...t,
							accounts: t.accounts.map((t) => t.id === e.id ? e : t)
						});
					}
				}, t.id + t.revision))
			]
		})] }), /* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
			variant: "secondary",
			disabled: s,
			onClick: f,
			...G(u.busy === "refresh"),
			children: "Read again"
		}) })]
	});
}
function so({ initial: e, receipt: t, onDirty: n, onSaved: r, onSaving: i }) {
	let [a, o] = (0, Z.useState)(e), [s, c] = (0, Z.useState)([]), l = a.libraries?.map((e) => e.name).join("、") || a.name, u = Y(), f = (e, t) => {
		o((n) => ({
			...n,
			[e]: t
		})), c((t) => t.includes(e) ? t : [...t, e]), n();
	};
	return /* @__PURE__ */ (0, Q.jsxs)("form", {
		"aria-label": `${l} proxy`,
		onSubmit: (e) => {
			e.preventDefault(), i(!0), u.run("save", (e) => W(io, {
				id: a.id,
				revision: a.revision,
				...s.includes("api") ? { api: a.api } : {},
				...s.includes("data") ? { data: a.data } : {}
			}, "POST", e), (e) => {
				o(e), c([]), r(e), t("CloudDrive proxy saved");
			}).finally(() => i(!1));
		},
		className: "flex min-w-0 flex-col gap-4 border-t border-separator-border pt-4",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(re, { children: /* @__PURE__ */ (0, Q.jsxs)("span", {
				className: "inline-flex items-center gap-2",
				children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: fr(a.libraries?.[0]?.location || (a.cloud === "115open" ? "115" : a.cloud.toLowerCase())) }), l]
			}) }),
			/* @__PURE__ */ (0, Q.jsxs)(M, { children: [
				a.name,
				" · ",
				a.path
			] }),
			/* @__PURE__ */ (0, Q.jsx)(co, {
				label: "Data proxy",
				value: a.data,
				disabled: !a.writable || !!u.busy,
				onChange: (e) => f("data", e)
			}),
			/* @__PURE__ */ (0, Q.jsx)(co, {
				label: "API proxy",
				value: a.api,
				disabled: !a.writable || !!u.busy,
				onChange: (e) => f("api", e)
			}),
			a.writable ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: "The API token needs the \"modify drives\" permission to save." }),
			u.error ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "Not saved",
				children: u.error
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)("div", {
				className: "flex justify-end",
				children: /* @__PURE__ */ (0, Q.jsx)(d, {
					type: "submit",
					disabled: !a.writable || !s.length,
					...G(u.busy === "save"),
					children: "Save configuration"
				})
			})
		]
	});
}
function co({ label: e, value: t, disabled: n, onChange: r }) {
	let i = t.mode === "http" || t.mode === "socks5";
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex min-w-0 flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(re, { children: e }),
			/* @__PURE__ */ (0, Q.jsxs)(L, {
				"aria-label": e,
				selectedKey: t.mode,
				isDisabled: n,
				onSelectionChange: (e) => {
					e && r({
						...t,
						mode: String(e)
					});
				},
				children: [t.mode === "unknown" ? /* @__PURE__ */ (0, Q.jsx)(R, {
					id: "unknown",
					children: "Unrecognized proxy type"
				}) : null, ao.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(R, {
					id: e,
					children: t
				}, e))]
			}),
			i ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap gap-3",
				children: [/* @__PURE__ */ (0, Q.jsx)(N, {
					className: "min-w-40 flex-1",
					label: `${e} address`,
					value: t.host,
					autoComplete: "off",
					isDisabled: n,
					onChange: (e) => r({
						...t,
						host: e
					})
				}), /* @__PURE__ */ (0, Q.jsx)(N, {
					className: "w-full sm:w-28",
					label: `${e} port`,
					value: t.port ? String(t.port) : "",
					inputMode: "numeric",
					isDisabled: n,
					onChange: (e) => r({
						...t,
						port: Number(e)
					})
				})]
			}), /* @__PURE__ */ (0, Q.jsxs)(x, {
				summary: "Proxy authentication",
				children: [
					/* @__PURE__ */ (0, Q.jsx)(N, {
						label: `${e} account`,
						value: t.username,
						autoComplete: "off",
						isDisabled: n,
						onChange: (e) => r({
							...t,
							username: e
						})
					}),
					/* @__PURE__ */ (0, Q.jsx)(N, {
						label: `${e} password`,
						type: "password",
						value: t.password || "",
						autoComplete: "new-password",
						isDisabled: n,
						placeholder: t.password_set ? "Saved; leave empty to keep" : "Optional",
						onChange: (e) => r({
							...t,
							password: e
						})
					}),
					t.password_set ? /* @__PURE__ */ (0, Q.jsx)(v, {
						isSelected: !!t.clear_password,
						isDisabled: n,
						onChange: (e) => r({
							...t,
							clear_password: e
						}),
						children: "Clear the saved password"
					}) : null
				]
			})] }) : null
		]
	});
}
// src/react/settings/library-icon-picker.tsx
var lo = [
	["", "Auto-detect"],
	["hard-drive", "Disk"],
	["database", "Profile library"],
	["heart", "Crush"],
	["heart-hand", "Intimate"],
	["flame", "Passionate"],
	["cherry", "Cherry"],
	["lollipop", "Sweetheart"],
	["candy", "Candy"],
	["banana", "Banana"],
	["droplets", "Wet"],
	["venus", "Female"],
	["mars", "Male"],
	["venus-and-mars", "Couple"],
	["gem", "Featured"],
	["crown", "Queen"],
	["ribbon", "Ribbon"],
	["shirt", "Uniform"],
	["graduation-cap", "Student"],
	["stethoscope", "Nurse"],
	["glasses", "Glasses"],
	["footprints", "Footprints"],
	["hand", "Hands"],
	["flower", "Flowers"],
	["venetian-mask", "Cosplay"],
	["rabbit", "Bunny girl"],
	["paw-print", "Animal ears"],
	["dumbbell", "Gym"],
	["bed-double", "Bedroom"],
	["bath", "Bathroom"],
	["key-round", "Private"],
	["wine", "Tipsy"],
	["cigarette", "Smoke"],
	["moon", "Night"],
	["sparkles", "Fantasy"],
	["camera", "Photobook"],
	["video", "Movie"],
	["film", "Movies"],
	["image", "Gallery"],
	["gamepad-2", "Game"],
	["star", "Favorites"],
	["tags", "Theme"]
];
function uo(e) {
	let t = e === "local" ? "" : me[e];
	return t ? [t, "Auto-detect"] : ["hard-drive", "Default"];
}
var fo = "auto";
function po({ value: t, label: r, kind: i = "local", onChange: a }) {
	let l = (0, Z.useRef)(null), [u, f] = (0, Z.useState)(!1), [p, m] = (0, Z.useState)(t), [h, g] = uo(i);
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(d, {
		ref: l,
		variant: "secondary",
		className: "self-start",
		"aria-label": r,
		"aria-haspopup": "dialog",
		"aria-expanded": u,
		onClick: () => {
			m(t), f(!0);
		},
		children: /* @__PURE__ */ (0, Q.jsxs)("span", {
			"data-icon-choice": !0,
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: t || h }), ((e) => e && lo.find(([t]) => t === e)?.[1] || g)(t)]
		})
	}), /* @__PURE__ */ (0, Q.jsx)(n, {
		triggerRef: l,
		isOpen: u,
		onOpenChange: f,
		placement: "bottom start",
		offset: 4,
		className: he,
		children: /* @__PURE__ */ (0, Q.jsxs)(o, {
			"aria-label": `${r} icon options`,
			className: "flex w-72 flex-col gap-3 outline-none",
			children: [
				/* @__PURE__ */ (0, Q.jsx)(e, {
					slot: "title",
					className: "px-1 text-body-medium text-text-primary",
					children: "Select library icon"
				}),
				/* @__PURE__ */ (0, Q.jsx)(s, {
					"aria-label": "Optional marks",
					value: p || fo,
					onChange: (e) => m(e === fo ? "" : e),
					className: "inline-grid grid-cols-7 gap-1",
					children: lo.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(c, {
						value: e || fo,
						"aria-label": e ? t : g,
						className: "flex h-10 cursor-pointer items-center justify-center rounded-lg text-foreground-icon-secondary outline-none hover:bg-dropdown-item-hover-background focus-visible:ring-2 focus-visible:ring-border-focus-ring data-selected:bg-dropdown-item-hover-background data-selected:text-text-primary",
						children: /* @__PURE__ */ (0, Q.jsx)(Le, { mark: e || h })
					}, e || fo))
				}),
				/* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex justify-end gap-2 border-t border-separator-border pt-2.5",
					children: [/* @__PURE__ */ (0, Q.jsx)(d, {
						variant: "secondary",
						onClick: () => f(!1),
						children: "Cancel"
					}), /* @__PURE__ */ (0, Q.jsx)(d, {
						disabled: p === t,
						onClick: () => {
							a(p), f(!1);
						},
						children: "Apply"
					})]
				})
			]
		})
	})] });
}
// src/react/settings/library-policy-settings.tsx
var mo = [
	["probe", "Read video info"],
	["metadata", "Fetch profiles online"],
	["cover", "Fetch covers online"],
	["people", "Fetch person images online"],
	["preview", "Generate 3x3 grid preview"]
], ho = [
	"probe",
	"metadata",
	"cover",
	"people",
	"preview"
], go = [
	[
		"auto",
		"Auto-complete",
		"Fetches online only what is missing"
	],
	[
		"local",
		"Use local profiles only",
		"Never online; local NFO and images only"
	],
	[
		"custom",
		"Custom",
		"Pick the steps to run one by one"
	]
];
function _o() {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		"data-policy-legend": "",
		className: "flex flex-col gap-1",
		children: [/* @__PURE__ */ (0, Q.jsx)(M, { children: be }), /* @__PURE__ */ (0, Q.jsxs)(x, {
			summary: "Comparing the three handling methods",
			children: [/* @__PURE__ */ (0, Q.jsxs)("table", {
				"data-policy-matrix": "",
				className: "text-body-2-regular",
				children: [/* @__PURE__ */ (0, Q.jsx)("thead", { children: /* @__PURE__ */ (0, Q.jsxs)("tr", { children: [/* @__PURE__ */ (0, Q.jsx)("th", {
					scope: "col",
					children: /* @__PURE__ */ (0, Q.jsx)(a, { children: "Steps" })
				}), _e.map((e) => /* @__PURE__ */ (0, Q.jsx)("th", {
					scope: "col",
					children: e
				}, e))] }) }), /* @__PURE__ */ (0, Q.jsx)("tbody", { children: ye.map(([e, ...t]) => /* @__PURE__ */ (0, Q.jsxs)("tr", { children: [/* @__PURE__ */ (0, Q.jsx)("th", {
					scope: "row",
					children: e
				}), t.map((e, t) => /* @__PURE__ */ (0, Q.jsx)("td", {
					"data-policy-cell": e === "✓" ? "on" : e === "—" ? "off" : "choice",
					children: e === "✓" ? /* @__PURE__ */ (0, Q.jsx)("span", {
						"aria-label": "do",
						children: "✓"
					}) : e === "—" ? /* @__PURE__ */ (0, Q.jsx)("span", {
						"aria-label": "Skip",
						children: "—"
					}) : e
				}, _e[t]))] }, e)) })]
			}), /* @__PURE__ */ (0, Q.jsx)(M, { children: ve })]
		})]
	});
}
function vo({ name: e, value: t, onChange: n }) {
	return /* @__PURE__ */ (0, Q.jsx)(Me, {
		"data-guide-target": "library-policy",
		className: "w-full",
		"aria-label": `${e} handling`,
		selectedKey: t,
		prefix: "Handling",
		renderValue: /* @__PURE__ */ (0, Q.jsx)("span", {
			className: "truncate",
			children: go.find(([e]) => e === t)?.[1]
		}),
		onSelectionChange: (e) => n(String(e)),
		children: go.map(([e, t, n]) => /* @__PURE__ */ (0, Q.jsx)(R, {
			id: e,
			textValue: t,
			children: /* @__PURE__ */ (0, Q.jsxs)("span", {
				className: "flex min-w-0 flex-col",
				children: [/* @__PURE__ */ (0, Q.jsx)("span", { children: t }), /* @__PURE__ */ (0, Q.jsx)("span", {
					className: "text-body-2-regular text-text-secondary whitespace-normal",
					children: n
				})]
			})
		}, e))
	});
}
function yo({ name: e, value: t, onChange: n }) {
	return /* @__PURE__ */ (0, Q.jsx)(x, {
		defaultOpen: !0,
		summary: `${e} processing steps (${t.length}/${mo.length})`,
		children: /* @__PURE__ */ (0, Q.jsx)("div", {
			className: "flex flex-wrap gap-x-6 gap-y-2",
			role: "group",
			"aria-label": `${e} handling steps`,
			children: mo.map(([e, r]) => /* @__PURE__ */ (0, Q.jsx)(v, {
				isSelected: t.includes(e),
				onChange: (r) => n(r ? [...t, e] : t.filter((t) => t !== e)),
				children: r
			}, e))
		})
	});
}
function bo({ id: e, name: t, value: i, onChange: a }) {
	let s = (0, Z.useRef)(null), [c, u] = (0, Z.useState)(!1), d = l.find(([e]) => e === i)?.[1] || "No color", f = (t) => {
		a(t), yt(e, t), u(!1);
	};
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsxs)("button", {
		ref: s,
		type: "button",
		className: "text-body-medium",
		"data-glow-chip": "",
		"data-library-color-trigger": "",
		"aria-haspopup": "dialog",
		"aria-expanded": c,
		"aria-label": `Source color of ${t || "Unnamed library"}: ${d}`,
		title: d,
		onClick: () => u(!0),
		children: [
			/* @__PURE__ */ (0, Q.jsx)("span", {
				"aria-hidden": !0,
				className: "text-text-tertiary",
				children: "Source color"
			}),
			i ? /* @__PURE__ */ (0, Q.jsx)("span", {
				"data-glow-ball": "",
				"aria-hidden": "true",
				"data-accent-ball": i
			}) : /* @__PURE__ */ (0, Q.jsx)("span", {
				"data-glow-ball": "",
				"data-library-none": "",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, Q.jsx)("span", { children: d })
		]
	}), /* @__PURE__ */ (0, Q.jsx)(r, {
		getContainer: () => _t(s.current),
		children: /* @__PURE__ */ (0, Q.jsx)(n, {
			triggerRef: s,
			isOpen: c,
			onOpenChange: u,
			placement: "bottom start",
			offset: 8,
			containerPadding: 12,
			className: he,
			children: /* @__PURE__ */ (0, Q.jsxs)(o, {
				"aria-label": `Source color of ${t || "Unnamed library"}`,
				className: "outline-none",
				children: [/* @__PURE__ */ (0, Q.jsx)("p", {
					className: "px-1 pb-2 text-body-medium text-text-primary",
					children: "Pick source color"
				}), /* @__PURE__ */ (0, Q.jsxs)("div", {
					"data-accent-grid": "",
					"data-library-colors": "",
					role: "group",
					children: [/* @__PURE__ */ (0, Q.jsx)("button", {
						type: "button",
						"data-glow-chip": "",
						"aria-pressed": !i,
						title: "No color",
						"aria-label": "No color",
						onClick: () => f(""),
						children: /* @__PURE__ */ (0, Q.jsx)("span", {
							"data-glow-ball": "",
							"data-library-none": "",
							"aria-hidden": "true"
						})
					}), l.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)("button", {
						type: "button",
						"data-glow-chip": "",
						"aria-pressed": e === i,
						title: t,
						"aria-label": t,
						onClick: () => f(e),
						children: /* @__PURE__ */ (0, Q.jsx)("span", {
							"data-glow-ball": "",
							"aria-hidden": "true",
							"data-accent-ball": e
						})
					}, e))]
				})]
			})
		})
	})] });
}
// src/react/settings/push-discovery-settings.tsx
var xo = "/api/configuration/push-discovery", So = "/api/configuration/push-discovery/secret";
function Co({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(e.prefixes), [o, s] = (0, Z.useState)(""), c = Y(), l = n.media_roots, [u, f] = (0, Z.useState)(e), p = (e, n) => {
		r(e), f(e), a(e.prefixes), s(""), t(n);
	}, m = (e, t) => a((n) => n.map((n, r) => r === e ? {
		...n,
		...t
	} : n)), h = (e) => {
		e.preventDefault();
		let t = {
			enabled: n.enabled,
			watch_local: n.watch_local,
			cloud: n.cloud,
			prefixes: i
		};
		c.run("save", (e) => W(xo, t, "POST", e), (e) => p(e, "Configuration saved"), (e) => s(q(e)));
	}, g = () => {
		c.run("secret", (e) => W(So, {}, "POST", e), (e) => p(e, "Shared secret rotated"), (e) => s(q(e)));
	}, _ = `${u.queue.ingested} files added to library` + (u.queue.failed ? `, ${u.queue.failed} failed intake` : "") + (u.queue.pending ? `, ${u.queue.pending} more in the queue` : ""), v = u.local_running ? `Watching ${u.local_roots.join(", ")}` : u.local_message || "Not running";
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "pushDiscovery",
		guide: "discovery",
		title: "Discover new files automatically",
		onSubmit: h,
		children: [
			/* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, Q.jsx)("span", {
					className: "text-body-regular text-text-secondary",
					children: "Watch this machine"
				}), /* @__PURE__ */ (0, Q.jsx)(V, {
					tone: !u.enabled || !u.watch_local ? "neutral" : u.local_running ? "progress" : "warning",
					children: !u.enabled || !u.watch_local ? "Not enabled" : u.local_running ? "Running" : "Not running"
				})]
			}) }),
			/* @__PURE__ */ (0, Q.jsxs)(F, { children: [
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Auto-intake after finding new files",
					description: u.enabled ? _ : void 0,
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Auto-intake after finding new files",
						isSelected: n.enabled,
						isDisabled: !n.available,
						onChange: (e) => r({
							...n,
							enabled: e
						})
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Watch local folders",
					description: u.enabled && u.watch_local ? v : void 0,
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Watch local folders",
						isSelected: n.watch_local,
						isDisabled: !n.available || !n.enabled,
						onChange: (e) => r({
							...n,
							watch_local: e
						})
					})
				}),
				/* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Receive CloudDrive2 notifications",
					description: "When a cloud-drive directory changes, CloudDrive2 pushes the change over.",
					children: /* @__PURE__ */ (0, Q.jsx)(H, {
						"aria-label": "Receive CloudDrive2 notifications",
						isSelected: n.cloud,
						isDisabled: !n.available || !n.enabled,
						onChange: (e) => r({
							...n,
							cloud: e
						})
					})
				}),
				u.enabled && u.cloud ? /* @__PURE__ */ (0, Q.jsx)(z, {
					label: "Webhook configuration",
					description: u.config_toml ? "Paste into CloudDrive2 \"Settings → Webhooks\"; membership required. Paste again after changing the key." : u.origin ? "No shared secret yet; it generates after saving the configuration." : "A LAN address CloudDrive2 can reach must exist before this can be generated."
				}) : null
			] }),
			u.enabled && u.queue.last_error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(P, {
					tone: "error",
					title: "The most recent intake failure",
					children: u.queue.last_error
				})
			}) : null,
			u.enabled && u.cloud && u.config_toml ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)("div", {
					className: "flex flex-col gap-3",
					children: /* @__PURE__ */ (0, Q.jsxs)(x, {
						summary: "View configuration",
						children: [/* @__PURE__ */ (0, Q.jsx)(qt, {
							code: u.config_toml,
							language: "toml",
							label: "CloudDrive2 configuration",
							bounded: !1,
							copyLabel: "Copy configuration",
							onCopy: () => t("CloudDrive2 configuration copied")
						}), /* @__PURE__ */ (0, Q.jsx)(M, { children: "When the Windows desktop version shows \"Invalid\" after pasting, save this as a .toml file and put it in the %LOCALAPPDATA%\\CloudDrive.WinUI\\webhooks\\ directory." })]
					})
				})
			}) : null,
			n.enabled && n.cloud ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ (0, Q.jsx)(re, { children: "Cloud path prefix" }),
						/* @__PURE__ */ (0, Q.jsx)("div", {
							role: "group",
							"aria-label": "Cloud path prefix",
							className: "flex flex-col gap-3",
							children: i.map((e, t) => /* @__PURE__ */ (0, Q.jsxs)("div", {
								className: "flex items-start gap-2",
								children: [
									/* @__PURE__ */ (0, Q.jsx)(N, {
										className: "min-w-0 flex-1",
										"aria-label": `Cloud path prefix ${t + 1}`,
										placeholder: "/115",
										autoComplete: "off",
										maxLength: 200,
										value: e.prefix,
										onChange: (e) => m(t, { prefix: e })
									}),
									/* @__PURE__ */ (0, Q.jsx)(Me, {
										"aria-label": `Media root for prefix ${t + 1}`,
										prefix: "Matching folders",
										selectedKey: e.root,
										onSelectionChange: (e) => {
											e !== null && m(t, { root: String(e) });
										},
										children: l.map((e) => /* @__PURE__ */ (0, Q.jsx)(R, {
											id: e,
											children: e
										}, e))
									}),
									/* @__PURE__ */ (0, Q.jsx)(d, {
										variant: "danger",
										iconOnly: !0,
										leadingIcon: de,
										"aria-label": "Remove this entry",
										onClick: () => a((e) => e.filter((e, n) => n !== t))
									})
								]
							}, t))
						}),
						/* @__PURE__ */ (0, Q.jsx)("div", { children: /* @__PURE__ */ (0, Q.jsx)(d, {
							variant: "secondary",
							onClick: () => a((e) => [...e, {
								prefix: "",
								root: l[0] ?? ""
							}]),
							children: "Add prefix"
						}) })
					]
				})
			}) : null,
			o || c.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: o || c.error })
			}) : null,
			/* @__PURE__ */ (0, Q.jsxs)(j, { children: [u.enabled && u.cloud && u.config_toml ? /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: g,
				disabled: !n.available,
				...G(c.busy === "secret"),
				children: "Rotate the key"
			}) : null, /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				disabled: !n.available,
				...G(c.busy === "save"),
				children: "Save configuration"
			})] })
		]
	});
}
// src/react/settings/media-settings.tsx
async function wo(e) {
	let t;
	try {
		t = await st();
	} catch {
		return !0;
	}
	if (!bt(t)) return !0;
	let { confirmed: n } = await K({
		title: "Scanning and collecting in progress",
		body: Dt(t, e),
		confirmLabel: "Still kept"
	});
	return n;
}
var To = (e) => sr.find(([t]) => t === e)?.[1] ?? e, Eo = [...sr, ["smb", "SMB share"]], Do = (e) => e.library_icon || uo(e.transport === "smb" ? "smb" : e.location)[0], Oo = async (e) => (await W(ge, { initial: e })).path, ko = (e) => ({
	library_id: e.library_id,
	library: e.library,
	library_icon: e.library_icon,
	library_color: e.library_color,
	library_policy: e.library_policy,
	library_stages: e.library_stages
}), Ao = (e) => e.library_stages ? ho.filter((t) => e.library_stages.split(",").includes(t)) : [], jo = (e = "") => ({
	path: e,
	transport: e.startsWith("smb://") ? "smb" : "filesystem",
	location: "local",
	root: "",
	library_id: Ct(),
	library: "",
	library_icon: "",
	library_color: "",
	library_policy: "auto",
	library_stages: "",
	cost: "free"
});
function Mo(e) {
	let t = e.media_sources?.filter((e) => sr.some(([t]) => t === e.location));
	return t?.length ? t.map((e) => ({
		transport: e.transport === "smb" || e.path.startsWith("smb://") ? "smb" : "filesystem",
		smb_username: e.smb_username,
		smb_password: "",
		smb_encrypt: e.smb_encrypt,
		smb_password_saved: e.smb_password_saved,
		path: e.path,
		location: e.location,
		root: e.root,
		library: e.library || "",
		library_icon: e.library_icon || "",
		library_color: e.library_color || "",
		library_policy: e.library_policy || "auto",
		library_stages: e.library_stages || "",
		root_id: e.root_id,
		library_id: e.library_id || Ct(),
		cost: e.cost ?? Nt(e.location)
	})) : (e.media_dirs.length ? e.media_dirs : [""]).map((e) => jo(e));
}
var No = (e) => !(e instanceof u) || e.status !== 400 ? null : e.body?.errors ?? null;
function Po({ data: e, receipt: t, panel: n }) {
	let r = !!e.media_sources?.some((e) => dr(e.location));
	return (0, Z.useEffect)(() => {
		if (e.editable) {
			let t = /* @__PURE__ */ new Map();
			for (let n of Mo(e)) t.set(n.library_id, (t.get(n.library_id) ?? 0) + 1);
			wt("media", {
				folders: [...t.values()],
				cloud: r
			});
		}
		let t = e.push_discovery;
		t && wt("discovery", {
			enabled: t.enabled,
			watchLocal: t.watch_local,
			cloud: t.cloud,
			webhook: t.enabled && t.cloud && !!t.config_toml,
			prefixes: t.prefixes.length
		});
	}, [e, r]), /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(n),
		children: [
			e.editable ? /* @__PURE__ */ (0, Q.jsx)(Fo, {
				data: e,
				receipt: t
			}) : /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "neutral",
				title: "Read-only",
				children: e.notice
			}),
			e.editable ? null : /* @__PURE__ */ (0, Q.jsx)(Lo, { data: e }),
			r ? /* @__PURE__ */ (0, Q.jsx)(oo, { receipt: t }) : null,
			e.push_discovery ? /* @__PURE__ */ (0, Q.jsx)(Co, {
				initial: e.push_discovery,
				receipt: t
			}) : null
		]
	});
}
function Fo({ data: e, receipt: t }) {
	let { rows: n, edit: r, add: i, remove: a, errors: o, setErrors: s, picking: c, pick: l, inputRef: u } = pr({
		initial: () => Mo(e),
		blank: () => jo(),
		pickFolder: Oo,
		describe: q
	}), [f, p] = (0, Z.useState)(!1), [m, h] = (0, Z.useState)(!1), [_, y] = (0, Z.useState)(""), [b, x] = (0, Z.useState)({}), [S, C] = (0, Z.useState)(null), ee = (0, Z.useRef)(e.revision), w = (0, Z.useRef)(!1), T = Y();
	Ft();
	let D = (e, t) => {
		n.forEach((i, a) => {
			i.library_id === n[e].library_id && r(a, t);
		});
	}, O = Lt([...n.reduce((e, t) => e.has(t.library_id) ? e : e.set(t.library_id, t), /* @__PURE__ */ new Map()).values()], (e) => e.library_id), [te, ne] = (0, Z.useState)(null);
	(0, Z.useEffect)(() => {
		if (!te) return;
		let e = document.querySelector(`[data-library-key="${CSS.escape(te)}"] [data-library-head] input`);
		e?.scrollIntoView({ block: "center" }), e?.focus(), ne(null);
	}, [te]);
	let k = (e, t) => {
		let i = n.find((e) => e.library_id === t);
		if (i) {
			r(e, ko(i));
			return;
		}
		let a = Ct();
		r(e, {
			library_id: a,
			library: "",
			library_icon: "",
			library_color: "",
			library_policy: "auto",
			library_stages: ""
		}), ne(a);
	};
	(0, Z.useEffect)(() => {
		if (!S) return;
		let e = setTimeout(() => location.assign(S.url), eo);
		return () => clearTimeout(e);
	}, [S]);
	let A = (e) => {
		e.preventDefault();
		let t = n.findIndex((e) => !e.cost);
		if (t >= 0) {
			h(!0);
			let n = e.currentTarget;
			requestAnimationFrame(() => n.querySelector(`[data-media-read-policy="${t}"] button`)?.focus());
		} else T.busy || w.current || (y(""), w.current = !0, wo(f).then((e) => {
			w.current = !1, e && re();
		}));
	}, re = () => {
		T.run("save", (t) => W(g, {
			revision: ee.current,
			media_dirs: n.map((e) => e.path),
			...e.media_sources ? { media_sources: n } : {},
			port: String(e.port),
			scan_now: f
		}, "POST", t), (e) => {
			ee.current = e.revision, s([]), t("Configuration saved"), C(e);
		}, (e) => {
			let t = No(e);
			s(t?.media_dirs ?? []), (!t || t.port) && y(t?.port || q(e));
		});
	};
	if (S) return /* @__PURE__ */ (0, Q.jsx)(I, {
		guide: "media",
		title: "Libraries and folders",
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsxs)(P, {
			tone: "success",
			title: "Configuration saved",
			children: [
				"Peach is restarting. It will redirect shortly, or click",
				/* @__PURE__ */ (0, Q.jsx)(le, {
					href: S.url,
					size: "small",
					children: "Enter the library"
				}),
				"。"
			]
		}) })
	});
	let ie = (t) => e.media_sources?.find((e) => e.root_id === t.root_id && e.path === t.path), ae = n.some((e) => dr(e.location)), se = ae ? (e.mount_dependencies ?? []).filter((e) => !e.available) : [];
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "media",
		title: "Libraries and folders",
		onSubmit: A,
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
			/* @__PURE__ */ (0, Q.jsx)(_o, {}),
			/* @__PURE__ */ (0, Q.jsx)("div", {
				role: "group",
				"aria-label": "Libraries and folders",
				className: "flex flex-col gap-4",
				children: O.map((e) => {
					let t = n.findIndex((t) => t.library_id === e.library_id), s = n.map((e, t) => ({
						row: e,
						index: t
					})).filter(({ row: t }) => t.library_id === e.library_id), f = e.library_policy, p = e.library || "Unnamed library";
					return /* @__PURE__ */ (0, Q.jsxs)("div", {
						"data-library-block": "",
						"data-library-key": e.library_id,
						className: Je({
							variant: "raised",
							padding: "none",
							className: "flex flex-col p-2"
						}),
						"data-library": e.library_color ? e.library_id : void 0,
						children: [
							/* @__PURE__ */ (0, Q.jsxs)("div", {
								"data-library-head": "",
								children: [
									/* @__PURE__ */ (0, Q.jsx)(po, {
										label: `${p} icon`,
										value: e.library_icon,
										kind: e.transport === "smb" ? "smb" : e.location,
										onChange: (e) => D(t, { library_icon: e })
									}),
									/* @__PURE__ */ (0, Q.jsx)(N, {
										className: "w-full",
										"aria-label": `${p} name`,
										maxLength: 80,
										placeholder: "Library name",
										value: e.library,
										onChange: (e) => D(t, { library: e })
									}),
									/* @__PURE__ */ (0, Q.jsx)(bo, {
										id: e.library_id,
										name: e.library,
										value: e.library_color,
										onChange: (e) => D(t, { library_color: e })
									}),
									/* @__PURE__ */ (0, Q.jsx)(vo, {
										name: p,
										value: f,
										onChange: (n) => D(t, {
											library_policy: n,
											library_stages: n === "custom" ? e.library_stages || ho.join(",") : ""
										})
									})
								]
							}),
							f === "custom" ? /* @__PURE__ */ (0, Q.jsx)(yo, {
								name: p,
								value: Ao(e),
								onChange: (e) => D(t, { library_stages: ho.filter((t) => e.includes(t)).join(",") })
							}) : null,
							/* @__PURE__ */ (0, Q.jsxs)("div", {
								"data-library-folders": "",
								role: "group",
								"aria-label": `${p} folders`,
								children: [s.map(({ row: t, index: i }) => /* @__PURE__ */ (0, Q.jsxs)(or, {
									label: `Media folder ${i + 1}`,
									path: t.path,
									onPath: (e) => r(i, {
										path: e,
										transport: e.startsWith("smb://") ? "smb" : t.transport
									}),
									error: o[i],
									inputRef: u(i),
									picking: c === i,
									onPick: () => void l(i),
									onRemove: n.length > 1 ? () => a(i) : void 0,
									status: ie(t) ? /* @__PURE__ */ (0, Q.jsx)(Io, { online: ie(t)?.online }) : null,
									children: [/* @__PURE__ */ (0, Q.jsxs)(ar, { children: [
										/* @__PURE__ */ (0, Q.jsx)(ur, {
											index: i,
											value: t.transport === "smb" ? "smb" : t.location,
											options: Eo,
											onChange: (e) => {
												let n = e === "smb";
												r(i, {
													transport: n ? "smb" : "filesystem",
													location: n ? "local" : e,
													cost: n || e === "local" ? "free" : "",
													path: n ? t.path.startsWith("smb://") ? t.path : "smb://" : t.path.startsWith("smb://") ? "" : t.path
												}), x((e) => {
													let t = { ...e };
													return delete t[i], t;
												});
											}
										}),
										/* @__PURE__ */ (0, Q.jsx)(cr, {
											index: i,
											cost: t.cost,
											onChange: (e) => r(i, { cost: e }),
											error: m && !t.cost ? "Select a media reading strategy" : void 0
										}),
										t.root_id && !ie(t) ? /* @__PURE__ */ (0, Q.jsx)(ir, {
											label: "Change method",
											className: "w-full @lg:w-auto @lg:flex-1",
											children: /* @__PURE__ */ (0, Q.jsxs)(L, {
												className: "w-full",
												"aria-label": `Folder change method ${i + 1}`,
												placeholder: "Choose the folder change method",
												selectedKey: t.change_mode || null,
												onSelectionChange: (e) => {
													e === "add" ? r(i, {
														root_id: void 0,
														root: "",
														change_mode: ""
													}) : r(i, { change_mode: "relocate" });
												},
												children: [/* @__PURE__ */ (0, Q.jsx)(R, {
													id: "relocate",
													children: "Relocate this folder, keeping file records"
												}), /* @__PURE__ */ (0, Q.jsx)(R, {
													id: "add",
													children: "Add another folder"
												})]
											})
										}) : null,
										O.length > 1 ? /* @__PURE__ */ (0, Q.jsx)(ir, {
											label: "Move to library",
											className: "w-full @lg:w-48",
											children: /* @__PURE__ */ (0, Q.jsxs)(L, {
												className: "w-full",
												"aria-label": `Media library owning directory ${i + 1}`,
												selectedKey: t.library_id,
												renderValue: /* @__PURE__ */ (0, Q.jsxs)("span", {
													className: "flex min-w-0 items-center gap-2",
													children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: Do(e) }), /* @__PURE__ */ (0, Q.jsx)("span", {
														className: "truncate",
														children: p
													})]
												}),
												onSelectionChange: (e) => {
													e && k(i, String(e));
												},
												children: [O.map((e) => /* @__PURE__ */ (0, Q.jsx)(R, {
													id: e.library_id,
													textValue: e.library || "Unnamed library",
													children: /* @__PURE__ */ (0, Q.jsxs)("span", {
														className: "flex min-w-0 items-center gap-2",
														children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: Do(e) }), /* @__PURE__ */ (0, Q.jsx)("span", {
															className: "truncate",
															children: e.library || "Unnamed library"
														})]
													})
												}, e.library_id)), s.length > 1 ? /* @__PURE__ */ (0, Q.jsx)(R, {
													id: "new",
													textValue: "New library",
													children: /* @__PURE__ */ (0, Q.jsxs)("span", {
														className: "flex min-w-0 items-center gap-2",
														children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: "plus" }), /* @__PURE__ */ (0, Q.jsx)("span", { children: "New media library" })]
													})
												}) : null]
											})
										}) : null
									] }), t.transport === "smb" ? /* @__PURE__ */ (0, Q.jsxs)("div", {
										className: "flex w-full flex-col gap-2",
										children: [
											/* @__PURE__ */ (0, Q.jsxs)(ar, { children: [/* @__PURE__ */ (0, Q.jsx)(ir, {
												label: "SMB account",
												className: "w-full @lg:flex-1",
												children: /* @__PURE__ */ (0, Q.jsx)(N, {
													"aria-label": `SMB account ${i + 1}`,
													value: t.smb_username || "",
													autoComplete: "off",
													onChange: (e) => r(i, { smb_username: e })
												})
											}), /* @__PURE__ */ (0, Q.jsx)(ir, {
												label: "SMB password",
												className: "w-full @lg:flex-1",
												children: /* @__PURE__ */ (0, Q.jsx)(N, {
													"aria-label": `SMB password ${i + 1}`,
													type: "password",
													value: t.smb_password || "",
													autoComplete: "new-password",
													placeholder: t.smb_password_saved ? "Leave blank to keep the saved password" : "",
													onChange: (e) => r(i, { smb_password: e })
												})
											})] }),
											/* @__PURE__ */ (0, Q.jsx)(v, {
												isSelected: t.smb_encrypt || !1,
												onChange: (e) => r(i, { smb_encrypt: e }),
												children: "Require SMB encryption"
											}),
											/* @__PURE__ */ (0, Q.jsx)(v, {
												isSelected: t.smb_clear || !1,
												onChange: (e) => r(i, { smb_clear: e }),
												children: "Remove the saved SMB account"
											}),
											/* @__PURE__ */ (0, Q.jsx)(d, {
												className: "self-start",
												variant: "secondary",
												...G(T.busy === `smb-${i}`),
												onClick: () => void T.run(`smb-${i}`, (e) => W("/api/configuration/smb/test", t, "POST", e), (e) => x((t) => ({
													...t,
													[i]: {
														message: "Shared directory is readable",
														directories: e.directories
													}
												})), (e) => x((t) => ({
													...t,
													[i]: {
														message: q(e),
														directories: []
													}
												}))),
												children: "Test connection"
											}),
											b[i] ? /* @__PURE__ */ (0, Q.jsx)(M, { children: b[i].message }) : null,
											b[i]?.directories.length ? /* @__PURE__ */ (0, Q.jsx)(L, {
												"aria-label": `SMB subfolder ${i + 1}`,
												placeholder: "Enter subfolder",
												selectedKey: null,
												onSelectionChange: (e) => {
													e && (r(i, { path: t.path.replace(/\/$/, "") + "/" + encodeURIComponent(String(e)) }), x((e) => ({
														...e,
														[i]: {
															message: "Please test this subdirectory",
															directories: []
														}
													})));
												},
												children: b[i].directories.map((e) => /* @__PURE__ */ (0, Q.jsx)(R, {
													id: e,
													children: e
												}, e))
											}) : null,
											/* @__PURE__ */ (0, Q.jsx)(M, { children: "Enter the address as smb://server/share/folder. Reads and writes follow the share account's permissions; organizing and deleting are triggered by the matching actions, and details and previews are stored in the Peach data directory." })
										]
									}) : null]
								}, i)), /* @__PURE__ */ (0, Q.jsx)("div", {
									className: "flex",
									children: /* @__PURE__ */ (0, Q.jsx)(d, {
										variant: "secondary",
										"aria-label": `Add folders to ${p}`,
										onClick: () => {
											i(), r(n.length, {
												...ko(e),
												location: e.location,
												cost: e.cost
											});
										},
										children: "Add folder"
									})
								})]
							})
						]
					}, e.library_id);
				})
			}),
			/* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				className: "self-start",
				onClick: i,
				children: "Add media library"
			}),
			/* @__PURE__ */ (0, Q.jsx)(M, { children: oe }),
			ae ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(lr, {}), /* @__PURE__ */ (0, Q.jsx)(ro, {})] }) : null,
			se.map((e) => /* @__PURE__ */ (0, Q.jsxs)(M, { children: [
				"Not detected: ",
				e.name,
				"。",
				/* @__PURE__ */ (0, Q.jsxs)(E, {
					href: e.download_url,
					children: ["Download ", e.name]
				})
			] }, e.name)),
			/* @__PURE__ */ (0, Q.jsx)(v, {
				isSelected: f,
				onChange: p,
				children: "After saving, scan and complete details"
			}),
			_ ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "Not saved",
				children: _
			}) : null
		] }), /* @__PURE__ */ (0, Q.jsx)(j, {
			status: "Peach will restart after saving.",
			children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				...G(T.busy === "save"),
				children: "Save configuration"
			})
		})]
	});
}
function Io({ online: e }) {
	return /* @__PURE__ */ (0, Q.jsx)(Kt, { online: e });
}
function Lo({ data: e }) {
	let t = e.media_sources, n = Y();
	return t ? /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "mounts",
		title: "Mount state",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(A, { children: t.map((e, t) => /* @__PURE__ */ (0, Q.jsxs)(k, {
				term: /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(Le, { mark: fr(e.location) }), To(e.location)] }),
				children: [e.path || "No mount point configured", /* @__PURE__ */ (0, Q.jsx)(Io, { online: e.online })]
			}, t)) }),
			n.error ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: n.error })
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => void n.run("refresh", (e) => rt(e), (e) => St.setQueryData(h, e)),
				...G(n.busy === "refresh"),
				children: "Refresh mount state"
			}) })
		]
	}) : null;
}
// src/react/settings/service-preferences.tsx
var Ro = [
	["off", "Off"],
	["precise", "One per 10 seconds"],
	["coarse", "One per 30 seconds"]
];
function zo({ receipt: e }) {
	let t = X({
		queryKey: Oe,
		queryFn: ({ signal: e }) => lt(e)
	}), n = Ht(), r = n.error || t.error;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		title: "Background tasks",
		children: [/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
			label: "Default processing speed",
			description: "New tasks use this tier. Running tasks can be adjusted individually on the activity page.",
			children: /* @__PURE__ */ (0, Q.jsx)(Se, {
				value: t.data?.taskSpeedMode || "standard",
				busy: !t.data || n.isPending,
				onChange: (t) => n.mutate({ taskSpeedMode: t }, { onSuccess: () => e("Saved the default processing speed") })
			})
		}) }), r ? /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)(w, { children: q(r) })
		}) : null]
	});
}
function Bo({ epoch: e = 0, disabled: t = !1 }) {
	let n = X({
		queryKey: Re,
		queryFn: ({ signal: e }) => ut(e),
		refetchOnMount: "always"
	}), r = Ut(), i = r.reset;
	(0, Z.useEffect)(() => {
		i();
	}, [e, i]);
	let a = n.data, o = r.error || n.error;
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
			label: "Timeline preview",
			description: "Extract frames at the chosen interval, processing only videos on local disks.",
			children: /* @__PURE__ */ (0, Q.jsx)("div", {
				id: "videoThumbnailSetting",
				children: /* @__PURE__ */ (0, Q.jsx)(L, {
					"aria-label": "Thumbnail capture interval",
					selectedKey: a?.mode || "off",
					isDisabled: t || !a || n.isFetching || r.isPending,
					onSelectionChange: (e) => {
						e !== null && r.mutate(String(e));
					},
					children: Ro.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(R, {
						id: e,
						children: t
					}, e))
				})
			})
		}) }),
		r.isPending || a?.status === "running" ? /* @__PURE__ */ (0, Q.jsxs)(B, {
			divided: !0,
			children: [/* @__PURE__ */ (0, Q.jsx)(M, {
				role: "status",
				children: r.isPending ? "Saving…" : "Scraping."
			}), r.isPending ? null : /* @__PURE__ */ (0, Q.jsx)(ze, {})]
		}) : null,
		o ? /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)(w, { children: q(o) })
		}) : null
	] });
}
function Vo({ receipt: e }) {
	let t = Ke();
	(0, Z.useSyncExternalStore)(t.subscribe, t.version);
	let n = X({
		queryKey: Oe,
		queryFn: ({ signal: e }) => lt(e),
		refetchOnMount: "always"
	}), r = Ht(), i = n.data?.followInitialDays ?? t.value.followInitialDays, a = r.error || n.error;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "follow-options",
		title: "Follows harvesting",
		children: [/* @__PURE__ */ (0, Q.jsxs)(F, { children: [
			/* @__PURE__ */ (0, Q.jsx)(Ho, {}),
			/* @__PURE__ */ (0, Q.jsx)(Uo, {}),
			/* @__PURE__ */ (0, Q.jsx)(z, {
				label: "'Initial scrape range'",
				description: "How far back a newly followed source looks on its first pass.",
				children: /* @__PURE__ */ (0, Q.jsx)("div", {
					id: "followInitialDaysSetting",
					className: "shrink-0",
					children: /* @__PURE__ */ (0, Q.jsx)(L, {
						"aria-label": "'Initial scrape range'",
						selectedKey: String(i),
						isDisabled: n.isFetching || r.isPending,
						onSelectionChange: (n) => {
							n !== null && r.mutate({ followInitialDays: Number(n) }, { onSuccess: (n) => {
								typeof n.followInitialDays == "number" && (t.value.followInitialDays = n.followInitialDays), t.save(), e("Initial collection scope saved");
							} });
						},
						children: te.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(R, {
							id: e,
							children: t
						}, e))
					})
				})
			}),
			/* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Avatar refresh",
				description: "Re-fetch the followed creators' avatars.",
				children: /* @__PURE__ */ (0, Q.jsx)("span", {
					className: "shrink-0",
					children: "Every 3 months"
				})
			}),
			/* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Favicon refresh",
				description: "Re-fetch the source site's icon.",
				children: /* @__PURE__ */ (0, Q.jsx)("span", {
					className: "shrink-0",
					children: "Yearly"
				})
			})
		] }), a ? /* @__PURE__ */ (0, Q.jsx)(B, {
			divided: !0,
			children: /* @__PURE__ */ (0, Q.jsx)(w, { children: q(a) })
		}) : null]
	});
}
function Ho() {
	let e = X({
		queryKey: ne,
		queryFn: ({ signal: e }) => ot(e),
		refetchOnMount: "always",
		refetchInterval: (e) => kt(e.state.data)
	}), t = Vt(), n = e.data, r = (0, Z.useRef)(qe(Number(localStorage.getItem("peach.number.followScheduleSetting")), 15, 10080, 60)), [i, a] = (0, Z.useState)("60"), [o, s] = (0, Z.useState)(!1);
	(0, Z.useEffect)(() => {
		n?.enabled && (r.current = n.interval_minutes, a(String(n.interval_minutes)));
	}, [n]);
	let c = !n?.available || e.isFetching || t.isPending, l = () => {
		let e = Number(i);
		!Number.isInteger(e) || e < 15 || e > 10080 ? s(!0) : (s(!1), n?.enabled && !c && e !== n.interval_minutes && (r.current = e, localStorage.setItem("peach.number.followScheduleSetting", String(e)), t.mutate(e)));
	}, u = t.error || e.error;
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(z, {
			label: "'Auto-check for updates'",
			description: "Sources updated in the last 7 days are checked at this interval; those not updated for a long time slow down step by step, at most once a day",
			children: /* @__PURE__ */ (0, Q.jsxs)("div", {
				id: "followScheduleSetting",
				className: "flex min-h-9 shrink-0 flex-wrap items-center justify-end gap-2",
				children: [/* @__PURE__ */ (0, Q.jsx)(H, {
					"aria-label": "'Auto-check for updates'",
					isSelected: n?.enabled === !0,
					isDisabled: c,
					onChange: (e) => {
						localStorage.setItem("peach.number.followScheduleSetting", String(r.current)), t.mutate(e ? r.current : 0);
					}
				}), n?.enabled ? /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, Q.jsx)(N, {
						type: "number",
						inputMode: "numeric",
						name: "follow-interval",
						autoComplete: "off",
						"aria-label": "'Auto-check interval'",
						className: "w-21 sm:w-24",
						value: i,
						onChange: (e) => {
							a(e), s(!1);
						},
						onBlur: l,
						onKeyDown: (e) => {
							e.key === "Enter" && (e.preventDefault(), l());
						},
						isDisabled: c,
						isInvalid: o
					}), /* @__PURE__ */ (0, Q.jsx)("span", {
						className: "text-body-2-regular text-text-secondary",
						children: "min"
					})]
				}) : null]
			})
		}),
		o ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(w, { children: "Enter a whole number from 15 to 10080 (minutes)." }) }) : null,
		t.isPending || n?.running ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(M, {
			role: "status",
			children: t.isPending ? "Saving…" : "Checking source updates…"
		}) }) : null,
		/* @__PURE__ */ (0, Q.jsx)(Wo, {
			kind: "follow",
			status: n,
			title: "The last auto-check failed"
		}),
		u ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(w, { children: q(u) }) }) : null
	] });
}
function Uo() {
	let e = X({
		queryKey: D,
		queryFn: ({ signal: e }) => at(e),
		refetchOnMount: "always",
		refetchInterval: (e) => kt(e.state.data)
	}), t = e.data;
	if (!t) return e.isPending ? /* @__PURE__ */ (0, Q.jsx)(z, {
		label: "Feed fetch",
		children: /* @__PURE__ */ (0, Q.jsx)("span", {
			"data-skeleton": !0,
			"aria-busy": "true",
			"aria-label": "Reading the follow source fetch interval",
			className: "block h-4 w-16 rounded-2lg bg-background-tertiary-default"
		})
	}) : null;
	let n = t.interval_minutes, r = n % 60 ? `Every ${n} minutes` : `Every ${n / 60} hours`;
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsx)(z, {
			label: "Feed fetch",
			children: /* @__PURE__ */ (0, Q.jsx)("span", {
				id: "feedScheduleSetting",
				children: t.available ? t.enabled ? r : "Closed" : "Only available on the writer instance"
			})
		}),
		t.running ? /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(M, {
			role: "status",
			children: "Fetching follow sources…"
		}) }) : null,
		/* @__PURE__ */ (0, Q.jsx)(Wo, {
			kind: "feed",
			status: t,
			title: "The last auto-fetch failed"
		})
	] });
}
function Wo({ kind: e, status: t, title: n }) {
	let r = Bt(e);
	if (!t?.enabled || t.running || !t.last_error) return null;
	let i = t.consecutive_failures ?? 0, a = ht(t.next_run_at), o = [i > 1 ? `Failed ${i} times in a row` : "", a ? `Next round ${a}` : ""].filter(Boolean).join(", "), s = [
		t.last_error,
		o,
		r.error ? `No retry: ${q(r.error)}` : ""
	].filter(Boolean).join("\n");
	return /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(P, {
		tone: "error",
		title: n,
		action: /* @__PURE__ */ (0, Q.jsx)(d, {
			variant: "secondary",
			size: "small",
			disabled: !t.available,
			...G(r.isPending),
			onClick: () => r.mutate(),
			children: "Retry now"
		}),
		children: s
	}) });
}
// src/react/settings/media-processing-settings.tsx
function Go({ receipt: e }) {
	let t = X({
		queryKey: fe,
		queryFn: ({ signal: e }) => ct(e)
	}), n = Y(), r = n.error || (t.error ? q(t.error) : ""), i = !t.data || t.isFetching || !!n.busy;
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "preview",
		title: "Video previews",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Generate video previews",
				description: "Generates the nine-grid and timeline previews for local videos.",
				children: /* @__PURE__ */ (0, Q.jsx)(H, {
					"aria-label": "Generate video previews",
					isSelected: !!t.data && !t.data.metadata_only,
					isDisabled: i,
					onChange: (t) => void n.run("save", (e) => W(pe, { metadata_only: !t }, "POST", e), (t) => {
						St.setQueryData(fe, t), St.invalidateQueries({ queryKey: Re }), St.invalidateQueries({ queryKey: se }), e(t.metadata_only ? "Video preview generation disabled" : "Video preview generation enabled");
					})
				})
			}) }),
			/* @__PURE__ */ (0, Q.jsx)(Bo, { disabled: !t.data || t.data.metadata_only || !!n.busy }),
			/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Frame extraction decoder",
				description: "Used to generate covers, contact sheets, and timelines.",
				children: /* @__PURE__ */ (0, Q.jsx)("div", {
					id: "previewAccelerationSetting",
					children: /* @__PURE__ */ (0, Q.jsxs)(L, {
						"aria-label": "Frame extraction decoder",
						selectedKey: t.data?.preview_acceleration || "auto",
						isDisabled: i,
						onSelectionChange: (t) => {
							t !== null && n.run("preview_acceleration", (e) => W(pe, { preview_acceleration: String(t) }, "POST", e), (t) => {
								St.setQueryData(fe, t), e("Frame extraction decoder saved");
							});
						},
						children: [/* @__PURE__ */ (0, Q.jsx)(R, {
							id: "auto",
							children: "Automatic (hardware first)"
						}), /* @__PURE__ */ (0, Q.jsx)(R, {
							id: "software",
							children: "Software decode"
						})]
					})
				})
			}) }),
			n.busy ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(M, {
					role: "status",
					children: "Saving…"
				})
			}) : null,
			r ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: r })
			}) : null
		]
	});
}
function Ko({ receipt: e }) {
	let t = X({
		queryKey: fe,
		queryFn: ({ signal: e }) => ct(e)
	}), n = Y(), r = n.error || (t.error ? q(t.error) : "");
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "transcode",
		title: "Video playback",
		children: [
			/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Transcode method",
				description: "Used for video transcoding during playback.",
				children: /* @__PURE__ */ (0, Q.jsx)("div", {
					id: "playbackAccelerationSetting",
					children: /* @__PURE__ */ (0, Q.jsxs)(L, {
						"aria-label": "Transcode method",
						selectedKey: t.data?.playback_acceleration || "auto",
						isDisabled: !t.data || t.isFetching || !!n.busy,
						onSelectionChange: (t) => {
							t !== null && n.run("playback_acceleration", (e) => W(pe, { playback_acceleration: String(t) }, "POST", e), (t) => {
								St.setQueryData(fe, t), e("Transcode method saved");
							});
						},
						children: [/* @__PURE__ */ (0, Q.jsx)(R, {
							id: "auto",
							children: "Automatic (hardware first)"
						}), /* @__PURE__ */ (0, Q.jsx)(R, {
							id: "software",
							children: "Software codec"
						})]
					})
				})
			}) }),
			n.busy ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(M, {
					role: "status",
					children: "Saving…"
				})
			}) : null,
			r ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(w, { children: r })
			}) : null
		]
	});
}
// src/react/boardui/components/base/textarea/textarea.tsx
var qo = Mt({
	field: "relative flex w-full flex-col rounded-2lg bg-background-tertiary-default text-foreground-icon-tertiary ring-2 ring-inset ring-transparent transition-[background-color,box-shadow,color] duration-[var(--input-transition-ms)] ease",
	fieldSize: {
		medium: "p-2",
		small: "px-1.5 py-2"
	},
	textarea: "block w-full min-w-0 bg-transparent border-0 outline-none m-0 p-0 px-1 font-sans text-body-regular text-text-primary placeholder:text-text-tertiary focus:placeholder:text-text-primary disabled:text-input-disabled-text disabled:placeholder:text-input-disabled-text disabled:cursor-not-allowed aria-invalid:placeholder:text-text-error-placeholder",
	resize: {
		none: "resize-none",
		vertical: "resize-y"
	},
	footer: "flex w-full items-start justify-between gap-3",
	count: "ms-auto shrink-0 pt-px text-caption-1-medium text-text-tertiary tabular-nums"
}), Jo = 20;
function Yo({ size: e, rows: n = 3, autoResize: r = !1, maxRows: a, resize: o = "vertical", fieldClassName: s, className: c, ref: l, groupRef: u, onInput: d, ...f }) {
	let p = (0, Z.useContext)(Ve), m = e ?? p.size ?? "medium", h = (0, Z.useRef)(null), g = (e) => {
		h.current = e, typeof l == "function" ? l(e) : l && (l.current = e);
	}, _ = () => {
		let e = h.current;
		if (!e) return;
		if (!r) {
			e.style.height = "", e.style.maxHeight = "", e.style.overflowY = "";
			return;
		}
		let t = parseFloat(window.getComputedStyle(e).lineHeight) || Jo, i = a ? a * t : Infinity;
		e.style.height = "0px";
		let o = Math.max(e.scrollHeight, n * t);
		e.style.height = `${Math.min(o, i)}px`, e.style.maxHeight = a ? `${i}px` : "", e.style.overflowY = o > i ? "auto" : "hidden";
	};
	return (0, Z.useLayoutEffect)(_), /* @__PURE__ */ (0, Q.jsx)(t, {
		ref: u,
		className: ({ isFocusWithin: e, isHovered: t, isDisabled: n, isInvalid: r }) => et(qo.field, qo.fieldSize[m], t && !e && !n && !r && "ring-border-button-hover", e && !n && !r && "ring-border-button-active", n && "bg-input-disabled-background text-input-disabled-foreground", r && "bg-background-tertiary-error text-foreground-icon-error", p.fieldClassName, s),
		children: /* @__PURE__ */ (0, Q.jsx)(i, {
			ref: g,
			rows: n,
			...f,
			onInput: (e) => {
				_(), d?.(e);
			},
			className: et(qo.textarea, qo.resize[r ? "none" : o], p.inputClassName, c)
		})
	});
}
Yo.displayName = "TextareaBase";
function Xo({ label: e, hint: t, tooltip: n, placeholder: r, rows: i, autoResize: a, maxRows: o, resize: s, maxLength: c, showCount: l = !1, fieldClassName: u, ref: d, groupRef: f, className: p, value: m, defaultValue: h, onChange: g, ..._ }) {
	let [v, y] = (0, Z.useState)(() => (h ?? "").length), b = m === void 0 ? v : m.length;
	return /* @__PURE__ */ (0, Q.jsx)(Be, {
		..._,
		value: m,
		defaultValue: h,
		onChange: (e) => {
			l && m === void 0 && y(e.length), g?.(e);
		},
		className: p,
		"aria-label": _["aria-label"] ?? (!e && typeof r == "string" ? r : void 0),
		children: ({ isRequired: p, isInvalid: m }) => /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
			e && /* @__PURE__ */ (0, Q.jsx)(ce, {
				isRequired: p,
				isInvalid: m,
				tooltip: n,
				children: e
			}),
			/* @__PURE__ */ (0, Q.jsx)(Yo, {
				ref: d,
				groupRef: f,
				placeholder: r,
				rows: i,
				autoResize: a,
				maxRows: o,
				resize: s,
				maxLength: c,
				fieldClassName: u
			}),
			(t || l) && /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: qo.footer,
				children: [t && /* @__PURE__ */ (0, Q.jsx)(ie, {
					isInvalid: m,
					children: t
				}), l && /* @__PURE__ */ (0, Q.jsx)("span", {
					className: et(qo.count, m && "text-text-error-primary"),
					children: c ? `${b}/${c}` : b
				})]
			})
		] })
	});
}
Xo.displayName = "Textarea";
// src/react/settings/code-pattern-settings.tsx
var Zo = "^\\+{3}\\s*(?<code>FC2-PPV-\\d+)\n\\[(?<code>[A-Z]+-\\d+)\\]";
function Qo({ receipt: e }) {
	let t = X({
		queryKey: Oe,
		queryFn: ({ signal: e }) => lt(e)
	}), [n, r] = (0, Z.useState)(null), i = Y(), a = n ?? (t.data?.codePatterns ?? []).join("\n"), o = i.error || (t.error ? q(t.error) : "");
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "codes",
		title: "Code recognition rules",
		onSubmit: (t) => {
			t.preventDefault();
			let n = a.split("\n").map((e) => e.trim()).filter(Boolean);
			i.run("save", (e) => W(ke, { codePatterns: n }, "POST", e), (t) => {
				St.setQueryData(Oe, t), r(null), e("Configuration saved");
			});
		},
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsx)(M, { children: "When the built-in rules cannot recognize a code, it is taken from the file name by the rules here. One regular expression per line; write the code in (?<code>...), and without a named group the first parenthesized group is used. Rules take effect on the next processing run, for videos that do not have a code yet." }), /* @__PURE__ */ (0, Q.jsx)(Xo, {
			id: "codePatternSetting",
			"aria-label": "Code recognition rules",
			rows: 3,
			autoResize: !0,
			maxRows: 12,
			spellCheck: "false",
			autoComplete: "off",
			placeholder: Zo,
			value: a,
			isDisabled: !t.data,
			isInvalid: !!o,
			hint: o || void 0,
			onChange: r
		})] }), /* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
			type: "submit",
			...G(i.busy === "save"),
			children: "Save configuration"
		}) })]
	});
}
// src/react/settings/password-pair.tsx
function $o({ label: e, password: t, confirmation: n, onPassword: r, onConfirmation: i, disabled: a = !1, passwordError: o, passwordHint: s, confirmationError: c, confirmationInvalid: l = !1 }) {
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(N, {
		id: "access-password",
		type: "password",
		label: e,
		autoComplete: "new-password",
		maxLength: 256,
		value: t,
		onChange: r,
		isDisabled: a,
		isRequired: !a,
		validationBehavior: "aria",
		isInvalid: !a && !!o,
		hint: a ? s : o || s
	}), /* @__PURE__ */ (0, Q.jsx)(N, {
		id: "access-confirm",
		type: "password",
		label: "Confirm the access password",
		autoComplete: "new-password",
		maxLength: 256,
		value: n,
		onChange: i,
		isDisabled: a,
		isRequired: !a,
		validationBehavior: "aria",
		isInvalid: !a && (!!c || l),
		hint: a ? void 0 : c
	})] });
}
// src/react/settings/access-settings.tsx
var es = {
	legacy: "A system-generated access passphrase is in use. Set your own password, or turn off the sign-in requirement.",
	locked: "Access settings could not be read; check the configuration file on this machine.",
	password: "A password is set. New devices need to sign in; checking \"Keep me signed in\" keeps the session for 30 days."
};
function ts({ initial: e, receipt: t, devices: n, after: r }) {
	let [i, a] = (0, Z.useState)(e), [o, s] = (0, Z.useState)(""), [c, l] = (0, Z.useState)(""), [f, p] = (0, Z.useState)(""), [m, h] = (0, Z.useState)(!1), [g, _] = (0, Z.useState)({}), y = (0, Z.useRef)(null), b = Y(), x = (e) => {
		e.preventDefault();
		let n = {};
		i.mode === "password" && !o && (n.current_password = "Enter the current access password"), m || ((c.length < 8 || c.length > 256) && (n.password = "The access password needs 8-256 characters"), c !== f && (n.confirmation = "The two passwords do not match")), _(n), Object.keys(n).length ? requestAnimationFrame(() => y.current?.querySelector("input[aria-invalid=\"true\"]")?.focus()) : b.run("save", (e) => W("/api/configuration/access", {
			revision: i.revision,
			action: m ? "disable" : "set",
			confirm_disable: m,
			current_password: o,
			password: m ? "" : c,
			confirmation: m ? "" : f
		}, "POST", e), (e) => {
			a(e), s(""), l(""), p(""), h(!1), _({}), t(e.mode === "open" ? "Access password disabled" : "Configuration saved");
		}, (e) => {
			let t = e instanceof u ? e.body : null, n = t?.errors || t?.detail?.errors;
			n ? _(n) : b.setError(q(e));
		});
	}, S = es[i.mode], C = i.mode !== "locked";
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		/* @__PURE__ */ (0, Q.jsxs)(I, {
			guide: "access",
			title: "Access password",
			onSubmit: x,
			children: [/* @__PURE__ */ (0, Q.jsx)("div", {
				ref: y,
				children: /* @__PURE__ */ (0, Q.jsxs)(B, { children: [
					S ? /* @__PURE__ */ (0, Q.jsx)(M, { children: S }) : null,
					i.mode === "open" ? /* @__PURE__ */ (0, Q.jsx)(P, {
						tone: "warning",
						title: "No access password set",
						children: "Any device that can reach Peach can view the library by opening the address, with no sign-in required."
					}) : null,
					i.mode === "password" || i.mode === "legacy" ? /* @__PURE__ */ (0, Q.jsx)(v, {
						isSelected: m,
						onChange: h,
						children: "Turn off the access password"
					}) : null,
					i.mode === "password" ? /* @__PURE__ */ (0, Q.jsx)(N, {
						id: "access-current",
						type: "password",
						label: "'Current access password'",
						autoComplete: "current-password",
						maxLength: 256,
						value: o,
						onChange: s,
						isRequired: !0,
						validationBehavior: "aria",
						isInvalid: !!g.current_password,
						hint: g.current_password
					}) : null,
					C && !m ? /* @__PURE__ */ (0, Q.jsx)($o, {
						label: i.mode === "password" ? "New access password" : "Set the access password",
						password: c,
						confirmation: f,
						onPassword: l,
						onConfirmation: p,
						passwordError: g.password,
						confirmationError: g.confirmation,
						passwordHint: "At least 8 characters. After saving, other devices must sign in again."
					}) : null,
					m ? /* @__PURE__ */ (0, Q.jsx)(P, {
						tone: "warning",
						title: "Access range",
						children: "After saving, devices that can reach Peach will access the library directly."
					}) : null,
					b.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: b.error }) : null
				] })
			}), C ? /* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				...G(b.busy === "save"),
				children: "Save configuration"
			}) }) : null]
		}),
		n && (i.mode === "password" || i.mode === "legacy") ? n(i) : null,
		r ? r(i) : null
	] });
}
// src/react/settings/api-token-settings.tsx
var ns = "/api/configuration/access/token/rotate";
function rs(e, t) {
	let n = "Scripts and API calls using the old token stop working immediately.", r = e === "legacy" ? `Browsers signed in with this passphrase all sign out and must sign in again with the new one; this machine stays signed in.${n}` : e === "open" ? `Browsers without sign-in are unaffected.${n}` : `Browsers signed in with the access password are unaffected.${n}`;
	return t ? `${r}another computer needs the same token file for the two to keep exchanging review results.` : r;
}
function is({ initial: e, mode: t, receipt: n }) {
	let [r, i] = (0, Z.useState)(e), [a, o] = (0, Z.useState)(null), s = Y(), c = Rt();
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		title: "Access token",
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
			/* @__PURE__ */ (0, Q.jsx)(M, { children: "Scripts and API calls carry the access token in the X-Token header. The token stays on this machine and is never shown on the page." }),
			a ? /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex min-w-0 flex-col gap-2",
				children: [
					/* @__PURE__ */ (0, Q.jsxs)("div", {
						className: "flex min-w-0 flex-wrap items-end gap-2",
						children: [/* @__PURE__ */ (0, Q.jsx)(N, {
							className: "min-w-0 flex-1",
							label: "New access token",
							value: a.token,
							isReadOnly: !0,
							autoComplete: "off"
						}), /* @__PURE__ */ (0, Q.jsx)(d, {
							variant: "secondary",
							"aria-label": "Copy the new access token",
							onClick: () => void s.run("copy", () => navigator.clipboard.writeText(a.token), () => n("Token copied")),
							children: "Copy token"
						})]
					}),
					s.error ? /* @__PURE__ */ (0, Q.jsx)(M, {
						role: "status",
						children: "Copy failed; select the token and copy it manually."
					}) : null,
					/* @__PURE__ */ (0, Q.jsx)(P, {
						tone: "info",
						title: "The new token is shown only once",
						children: "Takes effect immediately, no restart needed. It stops showing once you leave this page; afterwards run peach token in a terminal to see it."
					})
				]
			}) : null,
			a?.relogin ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "warning",
				title: "This machine must sign in again",
				children: "Refresh the page and sign in with the new token."
			}) : null,
			r.rotatable ? null : /* @__PURE__ */ (0, Q.jsx)(M, { children: r.reason })
		] }), r.rotatable ? /* @__PURE__ */ (0, Q.jsx)(j, {
			status: "Takes effect immediately.",
			children: /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				onClick: () => void K({
					title: "Rotate the access token",
					body: rs(t, r.paired),
					confirmLabel: "Change token",
					onConfirm: async () => {
						let e = await W(ns, {});
						i(e), o(e), e.mode === "legacy" && c.invalidateQueries({ queryKey: ["access-sessions"] }), n(e.signed_out ? `Access token rotated; ${e.signed_out} devices must sign in again` : "Access token rotated");
					}
				}),
				children: "Rotate token"
			})
		}) : null]
	});
}
// src/react/settings/certificate-trust.tsx
function as({ rows: e, label: t }) {
	let n = e.length + 8, r = e.flatMap((e, t) => [...e].flatMap((e, n) => e === "1" ? [`M${n + 4} ${t + 4}h1v1h-1z`] : [])).join("");
	return /* @__PURE__ */ (0, Q.jsx)("svg", {
		role: "img",
		"aria-label": t,
		viewBox: `0 0 ${n} ${n}`,
		shapeRendering: "crispEdges",
		className: "size-40 shrink-0 rounded-lg bg-white text-black",
		children: /* @__PURE__ */ (0, Q.jsx)("path", {
			d: r,
			fill: "currentColor"
		})
	});
}
var os = [
	["iPhone/iPad", "Scan the code with the camera; in Safari, allow the profile to download, install it under Settings - General - VPN & Device Management, then turn on full trust for this certificate under Settings - General - About - Certificate Trust Settings."],
	["Android", "After scanning the code to download, open Settings - Security - Encryption & credentials - Install a certificate - CA certificate and pick the downloaded file. Menu names vary by maker."],
	["This computer", "Click Download certificate. On Windows double-click the file and install it into Trusted Root Certification Authorities; on macOS set it to Always Trust in Keychain Access."]
];
function ss({ initial: e }) {
	let t = X({
		queryKey: ["ca-certificate"],
		initialData: e,
		queryFn: ({ signal: e }) => U("/api/configuration/certificate", e),
		staleTime: Infinity,
		refetchInterval: Math.max(60, e.expires_in - 60) * 1e3
	}).data, n = t.fingerprint.split(":"), r = [
		0,
		8,
		16,
		24
	].map((e) => n.slice(e, e + 8).join(":"));
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		title: "Other devices trusting the HTTPS certificate",
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsx)(M, { children: "Phones, tablets, and other computers warn the first time they open the HTTPS address. Install and trust the CA certificate of this machine on the device and the warning goes away. The certificate holds public parts only, never the private key." }), /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex min-w-0 flex-wrap items-start gap-4",
				children: [/* @__PURE__ */ (0, Q.jsx)(as, {
					rows: t.qr,
					label: "Scan the code with a phone to download the CA certificate of this machine"
				}), /* @__PURE__ */ (0, Q.jsxs)("div", {
					className: "flex min-w-0 flex-1 basis-64 flex-col gap-2",
					children: [/* @__PURE__ */ (0, Q.jsxs)(A, { children: [/* @__PURE__ */ (0, Q.jsx)(k, {
						term: "SHA-256 fingerprint",
						children: /* @__PURE__ */ (0, Q.jsx)("span", {
							className: "flex max-w-sm flex-wrap justify-end gap-x-2 font-mono text-caption-1-regular",
							children: r.map((e, t) => /* @__PURE__ */ (0, Q.jsx)("span", {
								className: "whitespace-nowrap",
								children: e
							}, t))
						})
					}), /* @__PURE__ */ (0, Q.jsx)(k, {
						term: "Valid until",
						children: t.not_after
					})] }), /* @__PURE__ */ (0, Q.jsx)(M, { children: "The QR code is valid for 10 minutes and refreshes while the page stays open. If an Android device cannot open the .local address, open this page on this computer via the LAN IP instead and scan that." })]
				})]
			})] }),
			/* @__PURE__ */ (0, Q.jsx)(F, { children: os.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(z, {
				label: e,
				description: t
			}, e)) }),
			/* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(M, { children: "After installing, compare the SHA-256 fingerprint in the certificate details on the device; it must match the one above." })
			}),
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(f, {
				href: t.download,
				download: "peach-local-ca.crt",
				leadingIcon: Wt,
				children: "Download certificate"
			}) })
		]
	});
}
// src/react/settings/device-sessions.tsx
var cs = "/api/configuration/access/sessions", ls = (e) => e.device || "Unrecognized browser", us = {
	glyph: ae,
	brand: "apple"
}, ds = {
	glyph: mt,
	brand: "android"
}, fs = {
	iPhone: {
		platform: us,
		terminal: We
	},
	iPad: {
		platform: us,
		terminal: T
	},
	Android: {
		platform: ds,
		terminal: We
	},
	"Android 平板": {
		platform: ds,
		terminal: T
	},
	ChromeOS: {
		platform: { browser: "chrome" },
		terminal: Gt
	},
	Windows: {
		platform: {
			glyph: He,
			brand: "windows"
		},
		terminal: Gt
	},
	macOS: {
		platform: us,
		terminal: Gt
	},
	Linux: { terminal: Gt }
}, ps = "inline size-4 -mt-0.5 mr-1 align-middle";
function ms({ platform: e }) {
	if ("browser" in e) return /* @__PURE__ */ (0, Q.jsx)(mr, {
		name: e.browser,
		className: ps
	});
	let { glyph: t, brand: n } = e;
	return /* @__PURE__ */ (0, Q.jsx)(t, {
		"aria-hidden": !0,
		"data-platform-mark": n,
		className: ps
	});
}
function hs({ row: e }) {
	if (!e.device) return ls(e);
	let t = e.device.split(" · "), n = fs[t.at(-1) ?? ""] ? t.pop() : "", r = t.join(" · "), i = n ? fs[n].platform : void 0;
	return /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
		r ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [hr(r) ? /* @__PURE__ */ (0, Q.jsx)(mr, {
			name: r,
			className: ps
		}) : null, r] }) : null,
		r && n ? " · " : null,
		n ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [i ? /* @__PURE__ */ (0, Q.jsx)(ms, { platform: i }) : null, n] }) : null
	] });
}
function gs({ row: e }) {
	let t = fs[e.device.split(" · ").at(-1) ?? ""]?.terminal ?? tt;
	return /* @__PURE__ */ (0, Q.jsx)(t, {
		"aria-hidden": !0,
		className: "size-5 shrink-0 text-foreground-icon-secondary"
	});
}
function _s({ row: e, children: t }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex min-h-13 w-full items-center justify-between gap-4 border-b border-separator-border py-2.5 pr-2.5 last:border-b-0",
		children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 items-center gap-3",
			children: [/* @__PURE__ */ (0, Q.jsx)(gs, { row: e }), /* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex min-w-0 flex-col",
				children: [/* @__PURE__ */ (0, Q.jsx)("p", {
					className: "text-body-regular text-text-primary",
					children: /* @__PURE__ */ (0, Q.jsx)(hs, { row: e })
				}), /* @__PURE__ */ (0, Q.jsx)("p", {
					className: "text-body-2-regular text-text-secondary",
					children: bs(e)
				})]
			})]
		}), t]
	});
}
function vs(e, t = Date.now() / 1e3) {
	let n = Math.max(0, t - e);
	return n < 60 ? "Just now" : n < 3600 ? `${Math.floor(n / 60)} minutes ago` : n < 86400 ? `${Math.floor(n / 3600)} hours ago` : n < 2592e3 ? `${Math.floor(n / 86400)} days ago` : (/* @__PURE__ */ new Date(e * 1e3)).toLocaleDateString("zh-CN");
}
function ys(e) {
	return e.network === "loopback" ? "The computer running Peach" : e.network ? e.remote ? `Public entry · ${e.network}` : e.network : "";
}
var bs = (e) => [`Last active ${vs(e.last_seen)}`, ys(e)].filter(Boolean).join(" · ");
function xs({ revision: e, receipt: t }) {
	let n = X({
		queryKey: ["access-sessions", e],
		refetchOnMount: "always",
		queryFn: ({ signal: e }) => U(cs, e)
	});
	return n.error ? /* @__PURE__ */ (0, Q.jsx)(I, {
		title: "Signed-in devices",
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(w, { children: q(n.error) }) })
	}) : n.isFetching || !n.data ? /* @__PURE__ */ (0, Q.jsx)(Ae, {
		label: "Reading signed-in devices",
		html: nt
	}) : /* @__PURE__ */ (0, Q.jsx)(Ss, {
		initial: n.data,
		receipt: t
	});
}
function Ss({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e);
	(0, Z.useEffect)(() => r(e), [e]);
	let i = n.sessions.filter((e) => !e.current);
	(0, Z.useEffect)(() => {
		wt("devices", {
			rows: Math.min(n.sessions.length, 8),
			manageable: n.manageable && i.length > 0
		});
	}, [n, i.length]);
	let a = (e) => void K({
		title: "Sign out this device",
		body: `${ls(e)} (${bs(e)}) will need to re-enter the access password next time Peach is opened.`,
		confirmLabel: "Sign out",
		onConfirm: async () => {
			r(await W(`${cs}/revoke`, {
				revision: n.revision,
				id: e.id
			})), t("Signed out");
		}
	});
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		title: "Signed-in devices",
		children: [
			n.sessions.length ? /* @__PURE__ */ (0, Q.jsx)(F, { children: n.sessions.map((e) => /* @__PURE__ */ (0, Q.jsx)(_s, {
				row: e,
				children: e.current ? /* @__PURE__ */ (0, Q.jsx)(y, {
					color: "blue",
					variant: "caption",
					children: "This device"
				}) : n.manageable ? /* @__PURE__ */ (0, Q.jsx)(d, {
					size: "small",
					variant: "secondary",
					"aria-label": `Sign out ${ls(e)}`,
					onClick: () => a(e),
					children: "Undo"
				}) : null
			}, e.id)) }) : /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)(M, { children: "No browser has signed in with the access password yet." }) }),
			!n.manageable && i.length ? /* @__PURE__ */ (0, Q.jsx)(B, {
				divided: !0,
				children: /* @__PURE__ */ (0, Q.jsx)(M, { children: "You must open this page on the computer running Peach to sign out." })
			}) : null,
			n.manageable && i.length ? /* @__PURE__ */ (0, Q.jsx)(j, {
				status: "Changing the access password signs out every device.",
				children: /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "secondary",
					onClick: () => void K({
						title: "Sign out the other devices",
						body: `The ${i.length} devices other than this one will need to re-enter the access password next time Peach is opened.`,
						confirmLabel: "Sign out",
						onConfirm: async () => {
							let e = await W(`${cs}/revoke`, {
								revision: n.revision,
								scope: "others"
							});
							r(e), t(`Signed out ${e.removed} devices`);
						}
					}),
					children: "Sign out other devices"
				})
			}) : null
		]
	});
}
// src/react/settings/port-settings.tsx
var Cs = [{
	value: "0.0.0.0",
	label: "Devices on the same LAN"
}, {
	value: "127.0.0.1",
	label: "This computer only"
}];
function ws({ data: e, receipt: t }) {
	let n = e.network, r = n ? n.editable : e.editable && e.port_editable !== !1, [i, a] = (0, Z.useState)(n?.host ?? "127.0.0.1"), [o, s] = (0, Z.useState)(n?.mdns_name ?? "peach"), [c, l] = (0, Z.useState)(String(e.port)), [f, p] = (0, Z.useState)({}), [m, h] = (0, Z.useState)(null), _ = Y();
	return (0, Z.useEffect)(() => {
		if (!m) return;
		let e = setTimeout(() => location.assign(m.url), eo);
		return () => clearTimeout(e);
	}, [m]), m ? /* @__PURE__ */ (0, Q.jsx)(I, {
		guide: "port",
		title: "Access address",
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsxs)(P, {
			tone: "success",
			title: "Configuration saved",
			children: ["Peach is restarting.", /* @__PURE__ */ (0, Q.jsx)(le, {
				href: m.url,
				size: "small",
				children: "Back to network and access"
			})]
		}) })
	}) : /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "port",
		title: "Access address",
		onSubmit: r ? (r) => {
			r.preventDefault(), p({}), _.run("save", (t) => W(g, {
				revision: e.revision,
				media_dirs: e.media_dirs,
				...e.media_sources ? { media_sources: e.media_sources } : {},
				port: c,
				scan_now: !1,
				...n?.editable ? {
					host: i,
					...i === "0.0.0.0" ? { mdns_name: o } : {}
				} : {}
			}, "POST", t), (e) => {
				h({ url: new URL("/settings/network", e.url).href }), t("Configuration saved");
			}, (e) => {
				let t = e instanceof u && e.status === 400 ? e.body?.errors : null;
				t && (t.port || t.host || t.mdns_name) ? p(t) : _.setError(q(e));
			});
		} : void 0,
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
			n ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(Ts, {
				label: "Local address",
				value: n.local_url,
				receipt: t
			}), n.lan_url || n.ip_url ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [
				/* @__PURE__ */ (0, Q.jsx)(Ts, {
					label: "Phone connection address",
					value: n.lan_url || n.ip_url,
					receipt: t
				}),
				n.lan_url && n.ip_url ? /* @__PURE__ */ (0, Q.jsx)(Ts, {
					label: "Fallback IP address",
					value: n.ip_url,
					receipt: t
				}) : null,
				/* @__PURE__ */ (0, Q.jsxs)(M, { children: ["Phone and computer on the same Wi-Fi.", n.ip_url && n.lan_url ? "If the hostname does not open, try the fallback IP address." : ""] })
			] }) : /* @__PURE__ */ (0, Q.jsx)(M, { children: n.scope === "local" ? "Only this computer may access for now, so phones cannot connect." : "LAN address not obtained. Check the network connection and service startup configuration on this computer." })] }) : null,
			r ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [n?.editable ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(Sa, {
				id: "configHost",
				label: "Who can access",
				value: i,
				onChange: a,
				options: Cs,
				isDisabled: !!_.busy,
				isInvalid: !!f.host,
				children: f.host ? /* @__PURE__ */ (0, Q.jsx)(w, { children: f.host }) : null
			}), i === "0.0.0.0" ? /* @__PURE__ */ (0, Q.jsx)(Ca, {
				id: "configMdnsName",
				label: "LAN access address",
				value: o,
				onChange: s,
				prefix: n.local_url.startsWith("https:") ? "https://" : "http://",
				suffix: ".local",
				autoComplete: "off",
				spellCheck: "false",
				maxLength: 63,
				isDisabled: !!_.busy,
				validationBehavior: "aria",
				isInvalid: !!f.mdns_name,
				hint: f.mdns_name || void 0
			}) : null] }) : null, /* @__PURE__ */ (0, Q.jsx)(Ca, {
				id: "configPort",
				label: "Port",
				prefix: "localhost:",
				inputMode: "numeric",
				value: c,
				onChange: l,
				isDisabled: !!_.busy,
				validationBehavior: "aria",
				isInvalid: !!f.port,
				hint: f.port
			})] }) : /* @__PURE__ */ (0, Q.jsx)(M, { children: e.notice || "Access range, name, and port are managed by the service startup configuration." }),
			n?.editable && i === "0.0.0.0" && n.scope === "local" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: "After saving and restarting, the phone connection address shows. Set an access password below." }) : null,
			_.error ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "Not saved",
				children: _.error
			}) : null
		] }), r ? /* @__PURE__ */ (0, Q.jsx)(j, {
			status: "Peach will restart after saving and jump to the new address.",
			children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				...G(_.busy === "save"),
				children: "Save configuration"
			})
		}) : null]
	});
}
function Ts({ label: e, value: t, receipt: n }) {
	let r = Y();
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex min-w-0 flex-col gap-2",
		children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 flex-wrap items-end gap-2",
			children: [/* @__PURE__ */ (0, Q.jsx)(N, {
				className: "min-w-0 flex-1",
				label: e,
				value: t,
				isReadOnly: !0,
				autoComplete: "off"
			}), /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				"aria-label": `Copy ${e}`,
				onClick: () => void r.run("copy", () => navigator.clipboard.writeText(t), () => n("Address copied")),
				children: "Copy address"
			})]
		}), r.error ? /* @__PURE__ */ (0, Q.jsx)(M, {
			role: "status",
			children: "Copy failed; select the address and copy it."
		}) : null]
	});
}
// src/react/settings/peach-proxy-fields.tsx
var Es = [
	["environment", "Follow the environment"],
	["direct", "Direct"],
	["proxy", "Custom"]
];
function Ds({ mode: e, onChange: t, labelledBy: n }) {
	return /* @__PURE__ */ (0, Q.jsx)(L, {
		"aria-label": n ? void 0 : "Connection method",
		"aria-labelledby": n,
		selectedKey: e,
		onSelectionChange: (e) => {
			e !== null && t(String(e));
		},
		children: Es.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(R, {
			id: e,
			children: t
		}, e))
	});
}
function Os({ id: e, value: t, onChange: n, saved: r = !1, error: i }) {
	return /* @__PURE__ */ (0, Q.jsx)(N, {
		id: e,
		type: "password",
		label: "Proxy address",
		autoComplete: "off",
		spellCheck: "false",
		value: t,
		onChange: n,
		placeholder: r ? "Saved; leave empty to keep" : "http://127.0.0.1:7890",
		validationBehavior: "aria",
		isInvalid: !!i,
		hint: i
	});
}
// src/react/settings/tunnel-settings.tsx
var ks = 2e3, As = [["quick", "Temporary link"], ["named", "Named tunnel"]], js = {
	quick: "For temporary preview only; the address is random and changes after restart. Set an access password before starting.",
	named: "Uses the fixed domain you bound on Cloudflare. Set an access password before starting."
};
function Ms({ revision: e, initial: t, receipt: n }) {
	let [r, i] = (0, Z.useState)(t), [a, o] = (0, Z.useState)(e), [s, l] = (0, Z.useState)(t.mode), [f, p] = (0, Z.useState)(t.hostname), [m, g] = (0, Z.useState)(""), [_, v] = (0, Z.useState)({}), y = Y(), b = r.state === "starting" || r.state === "running", x = r.named_available && s === "named";
	(0, Z.useEffect)(() => {
		if (r.state !== "starting") return;
		let e = new AbortController(), t = window.setInterval(() => {
			rt(e.signal).then((t) => {
				!e.signal.aborted && t.tunnel && (St.setQueryData(h, t), i(t.tunnel), o(t.revision));
			}).catch(() => void 0);
		}, ks);
		return () => {
			e.abort(), window.clearInterval(t);
		};
	}, [r.state]);
	let S = (e, t, n) => {
		v({}), y.run(e, (e) => W("/api/configuration/tunnel", {
			revision: a,
			enabled: t,
			mode: s,
			hostname: f,
			token: m
		}, "POST", e), (e) => {
			i(e), o(e.revision), l(e.mode), p(e.hostname), g(""), n(e);
		}, (e) => {
			let t = e instanceof u ? e.body : null, n = t?.errors || t?.detail?.errors;
			n ? v(n) : y.setError(q(e));
		});
	};
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "tunnel",
		guide: "tunnel",
		title: "Cloudflare public entry",
		onSubmit: (e) => {
			e.preventDefault(), S("save", b, () => n("Configuration saved"));
		},
		aside: /* @__PURE__ */ (0, Q.jsx)(V, {
			tone: r.error ? "error" : b ? "progress" : "neutral",
			children: r.error ? "Connection failed" : r.state === "running" ? "Running" : r.state === "starting" ? "Connecting" : "Stopped"
		}),
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
			r.named_available ? /* @__PURE__ */ (0, Q.jsx)(je, {
				"aria-label": "Public entry form (pick one of two)",
				value: s,
				isDisabled: b,
				onChange: (e) => l(e),
				className: De,
				children: As.map(([e, t]) => /* @__PURE__ */ (0, Q.jsx)(c, {
					value: e,
					className: Ee,
					children: t
				}, e))
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(M, { children: js[x ? "named" : "quick"] }),
			x ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)(N, {
				id: "tunnel-hostname",
				label: "Public hostname",
				autoComplete: "off",
				maxLength: 253,
				value: f,
				onChange: p,
				isDisabled: b,
				validationBehavior: "aria",
				isInvalid: !!_.hostname,
				hint: _.hostname || "The hostname in Cloudflare Zero Trust that points at this computer."
			}), /* @__PURE__ */ (0, Q.jsx)(N, {
				id: "tunnel-token",
				type: "password",
				label: "Tunnel token",
				autoComplete: "off",
				maxLength: 2048,
				value: m,
				onChange: g,
				isDisabled: b,
				validationBehavior: "aria",
				hint: r.token_set ? "Saved. Leave blank to keep unchanged." : "Copy it from the tunnel details page in Cloudflare Zero Trust."
			})] }) : null,
			r.available ? null : /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "warning",
				title: "Could not find cloudflared",
				children: "Install the official cloudflared, or specify a path via tunnel.binary in the settings file and PEACH_CLOUDFLARED."
			}),
			r.state === "running" && r.url ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "info",
				title: "Public address",
				children: /* @__PURE__ */ (0, Q.jsx)(E, {
					href: r.url,
					children: r.url
				})
			}) : null,
			r.state === "starting" ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "info",
				title: "Connecting",
				children: "Waiting for cloudflared to connect to the Cloudflare edge."
			}) : null,
			r.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: r.error }) : null,
			y.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: y.error }) : null
		] }), /* @__PURE__ */ (0, Q.jsxs)(j, { children: [/* @__PURE__ */ (0, Q.jsx)(d, {
			variant: r.named_available ? "secondary" : "primary",
			onClick: () => S("toggle", !b, (e) => n(e.enabled ? "Public entry point started" : "Public entry point stopped")),
			...G(y.busy === "toggle"),
			children: b ? "Stop the public entry" : "Start the public entry point"
		}), r.named_available ? /* @__PURE__ */ (0, Q.jsx)(d, {
			type: "submit",
			...G(y.busy === "save"),
			children: "Save configuration"
		}) : null] })]
	});
}
// src/react/settings/network-settings.tsx
function Ns({ data: e, receipt: t, panel: n, issues: r }) {
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(n),
		children: [
			r,
			e.network || e.editable && e.port_editable !== !1 && !e.section_errors?.media_sources ? /* @__PURE__ */ (0, Q.jsx)(ws, {
				data: e,
				receipt: t
			}) : null,
			e.access ? /* @__PURE__ */ (0, Q.jsx)(ts, {
				initial: e.access,
				receipt: t,
				devices: (e) => /* @__PURE__ */ (0, Q.jsx)(xs, {
					revision: e.revision,
					receipt: t
				}),
				after: e.api_token ? (n) => /* @__PURE__ */ (0, Q.jsx)(is, {
					initial: e.api_token,
					mode: n.mode,
					receipt: t
				}) : void 0
			}) : null,
			e.certificate ? /* @__PURE__ */ (0, Q.jsx)(ss, { initial: e.certificate }) : null,
			e.tunnel ? /* @__PURE__ */ (0, Q.jsx)(Ms, {
				revision: e.revision,
				initial: e.tunnel,
				receipt: t
			}) : null,
			e.peach_proxy ? /* @__PURE__ */ (0, Q.jsx)(Ps, {
				initial: e.peach_proxy,
				receipt: t
			}) : null
		]
	});
}
function Ps({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e), [i, a] = (0, Z.useState)(e.mode), [o, s] = (0, Z.useState)(""), c = Y();
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		id: "peachProxy",
		guide: "proxy",
		title: "Peach proxy",
		onSubmit: (e) => {
			e.preventDefault(), c.run("save", (e) => W("/api/configuration/peach-proxy", {
				mode: i,
				proxy: o
			}, "POST", e), (e) => {
				r(e), s(""), t("Configuration saved");
			});
		},
		children: [
			/* @__PURE__ */ (0, Q.jsx)(F, { children: /* @__PURE__ */ (0, Q.jsx)(z, {
				label: "Connection method",
				description: "Used when Peach reaches the internet and collects sources.",
				children: /* @__PURE__ */ (0, Q.jsx)(Ds, {
					mode: i,
					onChange: a
				})
			}) }),
			i === "proxy" || n.needs_selection || c.error ? /* @__PURE__ */ (0, Q.jsxs)(B, {
				divided: !0,
				children: [
					i === "proxy" ? /* @__PURE__ */ (0, Q.jsx)(Os, {
						id: "peachProxyAddress",
						value: o,
						onChange: s,
						saved: n.proxy_saved
					}) : null,
					n.needs_selection ? /* @__PURE__ */ (0, Q.jsx)(P, {
						tone: "warning",
						title: "A connection method must be chosen.",
						children: "Existing sources use different proxy addresses; choose the shared connection method."
					}) : null,
					c.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: c.error }) : null
				]
			}) : null,
			/* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
				type: "submit",
				...G(c.busy === "save"),
				children: "Save configuration"
			}) })
		]
	});
}
// src/react/follow-manage/credentials.tsx
var Fs = "This will clear this source's login credentials on this machine and in shared copies.", Is = "Other system users can read this credentials file. On the Mac or Linux computer running Peach, set the file permissions so only the current user can read and write it (0600).";
function Ls(e, t) {
	return (e.shared_fields || []).includes(t) ? "From sharing; leave empty to keep as is" : e.fields.includes(t) ? "Saved; leave empty to keep as is" : "Not filled in";
}
function Rs({ row: e }) {
	if (Qe(e)) return /* @__PURE__ */ (0, Q.jsx)(y, {
		variant: "caption",
		color: "lime",
		children: "Configured"
	});
	let t = e.requirement === "required" ? "yellow" : e.requirement === "blocked" ? "rose" : "neutral";
	return /* @__PURE__ */ (0, Q.jsx)(y, {
		variant: "caption",
		color: t,
		children: _[e.requirement] || ""
	});
}
function zs({ row: e, readOnly: t, toast: n }) {
	let [r, i] = (0, Z.useState)({}), [a, o] = (0, Z.useState)(""), s = Qe(e), c = It({
		mutationFn: (t) => Ot(e.provider, t),
		onSuccess: (e, t) => {
			e.note ? o(e.note) : (o(""), i({}), St.invalidateQueries({
				queryKey: O,
				exact: !0
			}), n(Object.keys(t).length ? "Source credentials saved" : "Source credentials cleared"));
		},
		onError: (e) => o(q(e))
	}), l = () => {
		let e = Object.fromEntries(Object.entries(r).map(([e, t]) => [e, t.trim()]).filter(([, e]) => e));
		Object.keys(e).length ? c.mutate(e) : o("Nothing was filled in");
	};
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, Q.jsxs)(M, { children: [e.why, e.where ? /* @__PURE__ */ (0, Q.jsxs)(Q.Fragment, { children: [" ", /* @__PURE__ */ (0, Q.jsx)(E, {
				href: e.where,
				children: "Get credentials"
			})] }) : null] }),
			e.howto ? /* @__PURE__ */ (0, Q.jsx)(M, { children: e.howto }) : null,
			/* @__PURE__ */ (0, Q.jsx)("div", {
				className: "flex w-full flex-col gap-3",
				children: (e.needs || []).map((n) => /* @__PURE__ */ (0, Q.jsx)(N, {
					type: "password",
					label: n,
					placeholder: Ls(e, n),
					autoComplete: "off",
					spellCheck: "false",
					isDisabled: t,
					value: r[n] || "",
					onChange: (e) => i({
						...r,
						[n]: e
					}),
					className: "w-full min-w-0"
				}, n))
			}),
			/* @__PURE__ */ (0, Q.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [s ? /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "danger",
					disabled: t,
					...G(c.isPending),
					onClick: () => void K({
						title: "Clear source credentials",
						body: Fs,
						confirmLabel: "Clear source credentials",
						danger: !0,
						onConfirm: () => c.mutateAsync({})
					}),
					children: "Clear"
				}) : null, /* @__PURE__ */ (0, Q.jsx)(d, {
					variant: "primary",
					disabled: t,
					...G(c.isPending),
					onClick: l,
					children: "Save configuration"
				})]
			}),
			a ? /* @__PURE__ */ (0, Q.jsx)(w, { children: a }) : null,
			(e.shared_fields || []).length ? /* @__PURE__ */ (0, Q.jsx)(M, { children: `${e.shared_fields.join(", ")} use login information from the shared copy; this machine keeps no separate copy. Clearing deletes the login information on both this machine and the shared copy.` }) : null,
			e.path ? /* @__PURE__ */ (0, Q.jsx)(x, {
				summary: "Credentials file",
				children: /* @__PURE__ */ (0, Q.jsx)(xe, {
					path: e.path,
					className: "font-mono text-caption-1-regular text-text-tertiary",
					onRevealed: n
				})
			}) : null
		]
	});
}
function Bs({ row: e, readOnly: t, toast: n }) {
	let r = /* @__PURE__ */ (0, Q.jsxs)("span", {
		className: "flex min-w-0 flex-wrap items-center gap-2",
		children: [
			/* @__PURE__ */ (0, Q.jsx)("span", {
				className: "inline-flex size-3.5 shrink-0 items-center justify-center",
				children: /* @__PURE__ */ (0, Q.jsx)(gr, { provider: e.provider })
			}),
			/* @__PURE__ */ (0, Q.jsx)("b", {
				className: "min-w-0 text-body-medium wrap-anywhere text-text-primary",
				children: e.provider_label
			}),
			/* @__PURE__ */ (0, Q.jsx)(Rs, { row: e }),
			e.missing.map((e) => /* @__PURE__ */ (0, Q.jsx)(y, {
				variant: "caption",
				color: "rose",
				children: `Missing ${e}`
			}, e))
		]
	});
	return e.requirement === "none" || e.requirement === "blocked" ? /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-wrap items-center gap-3 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4",
		children: [r, e.requirement === "blocked" ? /* @__PURE__ */ (0, Q.jsx)(M, { children: e.why }) : null]
	}) : /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: "flex flex-col gap-2 border-b border-separator-border px-6 py-5 last:border-b-0 max-sm:px-4",
		children: [
			r,
			/* @__PURE__ */ (0, Q.jsx)(x, {
				summary: Qe(e) ? "Edit credentials" : "Fill in credentials",
				defaultOpen: e.requirement === "required" && !Qe(e),
				children: /* @__PURE__ */ (0, Q.jsx)(zs, {
					row: e,
					readOnly: t,
					toast: n
				})
			}),
			e.world_readable ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "The credentials file permissions are too broad",
				children: Is
			}) : null
		]
	});
}
function Vs({ data: e, readOnly: t, toast: n, embedded: r = !1 }) {
	let i = e.providers || [], a = i.filter((e) => e.requirement === "required" && !Qe(e));
	if ((0, Z.useEffect)(() => {
		wt("credentials", { done: i.filter(Qe).map((e) => e.provider) });
	}, [e]), !i.length) return /* @__PURE__ */ (0, Q.jsx)(ee, {
		size: "compact",
		icon: Ze,
		title: "No configurable sources",
		children: "Connected sites and their credential states show here."
	});
	let o = a.length ? /* @__PURE__ */ (0, Q.jsx)("span", {
		className: "text-body-2-regular text-text-error-primary",
		children: `${a.length} items to configure`
	}) : null, s = /* @__PURE__ */ (0, Q.jsx)(Q.Fragment, { children: [
		{
			title: "Configurable credentials",
			rows: i.filter((e) => e.requirement !== "none" && e.requirement !== "blocked")
		},
		{
			title: "No credentials needed",
			rows: i.filter((e) => e.requirement === "none")
		},
		{
			title: "Not supported yet",
			rows: i.filter((e) => e.requirement === "blocked")
		}
	].filter((e) => e.rows.length).map((e) => /* @__PURE__ */ (0, Q.jsxs)("section", {
		"aria-label": e.title,
		className: "flex flex-col gap-2",
		children: [/* @__PURE__ */ (0, Q.jsx)("h4", {
			className: "text-body-medium text-text-secondary",
			children: e.title
		}), /* @__PURE__ */ (0, Q.jsx)("div", {
			className: Je({
				variant: "outlined",
				padding: "none",
				className: "flex flex-col overflow-hidden"
			}),
			children: e.rows.map((e) => /* @__PURE__ */ (0, Q.jsx)(Bs, {
				row: e,
				readOnly: t,
				toast: n
			}, e.provider))
		})]
	}, e.title)) });
	return r ? /* @__PURE__ */ (0, Q.jsx)(I, {
		guide: "credentials",
		title: "Source credentials",
		aside: o || void 0,
		children: /* @__PURE__ */ (0, Q.jsx)(B, { children: /* @__PURE__ */ (0, Q.jsx)("div", {
			className: "flex flex-col gap-4",
			children: s
		}) })
	}) : /* @__PURE__ */ (0, Q.jsxs)("div", {
		className: Je({
			padding: "none",
			className: "flex flex-col gap-4 px-6 py-5 max-sm:px-4"
		}),
		children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex flex-wrap items-center gap-2",
			children: [/* @__PURE__ */ (0, Q.jsx)("h3", {
				className: "mr-auto text-title-2-medium text-text-primary",
				children: "Source credentials"
			}), o]
		}), s]
	});
}
// src/react/settings/entry-links-settings.tsx
function Hs({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e.sites), i = Y(), a = (e, t) => r((n) => n.map((n) => n.key === e ? {
		...n,
		host: t
	} : n));
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "entry-links",
		title: "Video detail sites",
		onSubmit: (e) => {
			e.preventDefault();
			let a = { sites: Object.fromEntries(n.map((e) => [e.key, { host: e.host }])) };
			i.run("save", (e) => W("/api/configuration/entry-links", a, "POST", e), (e) => {
				r(e.sites), t("Configuration saved");
			});
		},
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [
			/* @__PURE__ */ (0, Q.jsx)(M, { children: S }),
			n.map((e) => /* @__PURE__ */ (0, Q.jsx)(N, {
				id: `entry-link-${e.key}`,
				label: /* @__PURE__ */ (0, Q.jsx)(Pe, {
					site: e.key,
					label: `${e.label} address`
				}),
				autoComplete: "off",
				maxLength: 100,
				value: e.host,
				placeholder: e.default_host,
				onChange: (t) => a(e.key, t),
				validationBehavior: "aria",
				hint: C
			}, e.key)),
			i.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: i.error }) : null
		] }), /* @__PURE__ */ (0, Q.jsx)(j, { children: /* @__PURE__ */ (0, Q.jsx)(d, {
			type: "submit",
			...G(i.busy === "save"),
			children: "Save configuration"
		}) })]
	});
}
// src/react/settings/indexer-settings.tsx
var Us = "/api/configuration/indexers";
function Ws({ receipt: e }) {
	let t = X({
		queryKey: ["indexers"],
		queryFn: ({ signal: e }) => U(Us, e),
		refetchOnMount: "always"
	});
	return t.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: q(t.error) }) : t.isFetching ? /* @__PURE__ */ (0, Q.jsx)(Ae, {
		label: "Reading resource search settings",
		html: ft
	}) : t.data ? /* @__PURE__ */ (0, Q.jsx)(qs, {
		initial: t.data,
		receipt: e
	}) : null;
}
function Gs(e) {
	try {
		return new globalThis.URL(e).host;
	} catch {
		return e;
	}
}
function Ks({ row: e, index: t }) {
	let n = [
		e.url ? Gs(e.url) : "Address not filled",
		e.enabled ? "Enabled" : "Disabled",
		e.api_key_set && !e.clear_api_key ? "API key saved" : e.api_key ? "API key pending save" : "No API key"
	];
	return /* @__PURE__ */ (0, Q.jsxs)("span", {
		className: "flex min-w-0 items-baseline gap-3",
		children: [/* @__PURE__ */ (0, Q.jsx)("span", {
			className: "shrink-0 text-text-primary",
			children: e.name || `Indexer ${t + 1}`
		}), /* @__PURE__ */ (0, Q.jsx)("span", {
			className: "truncate text-body-2-regular text-text-secondary",
			children: n.join(" · ")
		})]
	});
}
function qs({ initial: e, receipt: t }) {
	let [n, r] = (0, Z.useState)(e.indexers), i = Y();
	(0, Z.useEffect)(() => {
		wt("indexers", { open: e.indexers.map((e) => !e.url) });
	}, [e]);
	let a = (e, t) => r((n) => n.map((n) => n.key === e ? {
		...n,
		...t
	} : n));
	return /* @__PURE__ */ (0, Q.jsxs)(I, {
		guide: "indexers",
		title: "Resource search",
		onSubmit: (e) => {
			e.preventDefault(), i.run("save", (e) => W(Us, { indexers: n }, "POST", e), (e) => {
				r(e.indexers), t("Indexer saved");
			});
		},
		children: [/* @__PURE__ */ (0, Q.jsxs)(B, { children: [/* @__PURE__ */ (0, Q.jsxs)("div", {
			className: "flex min-w-0 flex-col gap-4",
			children: [/* @__PURE__ */ (0, Q.jsx)(x, {
				summary: "Indexer connection help",
				children: /* @__PURE__ */ (0, Q.jsxs)(M, { children: [
					"Fill in the Torznab address and API key from Prowlarr or Jackett.",
					" ",
					/* @__PURE__ */ (0, Q.jsx)(E, {
						href: "https://github.com/peach-mitao/peach/blob/master/docs/RESOURCE_SEARCH.md",
						children: "Detailed configuration notes"
					})
				] })
			}), n.map((e, t) => /* @__PURE__ */ (0, Q.jsx)("div", {
				className: "min-w-0 border-t border-separator-border pt-2",
				children: /* @__PURE__ */ (0, Q.jsx)(x, {
					defaultOpen: !e.url,
					summary: /* @__PURE__ */ (0, Q.jsx)(Ks, {
						row: e,
						index: t
					}),
					children: /* @__PURE__ */ (0, Q.jsxs)("div", {
						className: "flex min-w-0 flex-col gap-4",
						children: [
							/* @__PURE__ */ (0, Q.jsx)(N, {
								label: "Name",
								"aria-label": `Indexer ${t + 1} name`,
								value: e.name,
								maxLength: 80,
								isDisabled: !!i.busy,
								onChange: (t) => a(e.key, { name: t })
							}),
							/* @__PURE__ */ (0, Q.jsx)(N, {
								label: "Torznab address",
								"aria-label": `Indexer ${t + 1} Torznab address`,
								value: e.url,
								type: "url",
								autoComplete: "off",
								placeholder: "API address provided by the indexer",
								isDisabled: !!i.busy,
								onChange: (t) => a(e.key, { url: t })
							}),
							/* @__PURE__ */ (0, Q.jsx)(N, {
								label: "API key",
								"aria-label": `Indexer ${t + 1} API key`,
								type: "password",
								autoComplete: "new-password",
								value: e.api_key || "",
								placeholder: e.api_key_set ? "Saved; leave empty to keep" : void 0,
								isDisabled: !!i.busy,
								onChange: (t) => a(e.key, { api_key: t })
							}),
							/* @__PURE__ */ (0, Q.jsxs)("div", {
								className: "flex flex-wrap items-center gap-x-6 gap-y-2",
								children: [
									/* @__PURE__ */ (0, Q.jsx)(v, {
										isSelected: e.enabled,
										isDisabled: !!i.busy,
										onChange: (t) => a(e.key, { enabled: t }),
										children: "Enabled"
									}),
									e.api_key_set ? /* @__PURE__ */ (0, Q.jsx)(v, {
										isSelected: !!e.clear_api_key,
										isDisabled: !!i.busy,
										onChange: (t) => a(e.key, { clear_api_key: t }),
										children: "Clear the saved API key"
									}) : null,
									/* @__PURE__ */ (0, Q.jsx)(d, {
										variant: "danger",
										type: "button",
										size: "small",
										disabled: !!i.busy,
										"aria-label": `Remove indexer ${t + 1}`,
										onClick: () => r(n.filter((t) => t.key !== e.key)),
										children: "Remove"
									})
								]
							})
						]
					})
				})
			}, e.key))]
		}), i.error ? /* @__PURE__ */ (0, Q.jsx)(w, { children: i.error }) : null] }), /* @__PURE__ */ (0, Q.jsxs)(j, { children: [/* @__PURE__ */ (0, Q.jsx)(d, {
			variant: "secondary",
			type: "button",
			disabled: !!i.busy || n.length >= e.max_indexers,
			onClick: () => r([...n, {
				key: Ct(),
				name: "",
				url: "",
				enabled: !0,
				api_key_set: !1
			}]),
			children: "Add indexer"
		}), /* @__PURE__ */ (0, Q.jsx)(d, {
			type: "submit",
			...G(i.busy === "save"),
			children: "Save configuration"
		})] })]
	});
}
// src/react/settings/source-settings.tsx
function Js({ data: e, receipt: t, panel: n, issues: r }) {
	let i = X({
		queryKey: O,
		queryFn: ({ signal: e }) => it(e),
		enabled: n?.active !== !1,
		refetchOnMount: "always"
	});
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		...vr(n),
		children: [
			r,
			/* @__PURE__ */ (0, Q.jsx)("div", {
				"data-guide-target": "sources",
				children: /* @__PURE__ */ (0, Q.jsx)(f, {
					href: "/sources",
					variant: "secondary",
					children: "Scrape sources and login status"
				})
			}),
			i.data ? /* @__PURE__ */ (0, Q.jsx)(Vs, {
				data: i.data,
				readOnly: !!e.ledger_read_only,
				toast: t,
				embedded: !0
			}) : i.error ? /* @__PURE__ */ (0, Q.jsx)(P, {
				tone: "error",
				title: "Source credentials not fetched",
				children: q(i.error)
			}) : n?.active === !1 ? null : /* @__PURE__ */ (0, Q.jsx)(Ae, {
				label: "Reading source credentials",
				html: $e
			}),
			/* @__PURE__ */ (0, Q.jsx)(Vo, { receipt: t }),
			/* @__PURE__ */ (0, Q.jsx)(Ws, { receipt: t }),
			e.entry_links ? /* @__PURE__ */ (0, Q.jsx)(Hs, {
				initial: e.entry_links,
				receipt: t
			}) : null
		]
	});
}
// src/react/settings/configuration-shape.ts
function Ys(e) {
	let t = e.downloads;
	if (!t) return null;
	let n = t.media_sources ?? [];
	return {
		cloud: n.some((e) => p.includes(e)),
		has115: n.includes("115"),
		pikpak: n.includes("pikpak"),
		pikpakRoots: t.pikpak_roots.length > 0,
		pikpakLoggedIn: t.pikpak.logged_in,
		browserLogin: t.pikpak_browser.available
	};
}
function Xs(e) {
	let t = e.tunnel;
	return {
		port: !!(e.editable && e.port_editable !== !1),
		addresses: e.network ? 1 + Number(!!(e.network.lan_url || e.network.ip_url)) + Number(!!(e.network.lan_url && e.network.ip_url)) : 0,
		networkEditable: !!e.network?.editable,
		lan: e.network?.host === "0.0.0.0",
		proxyAddress: e.peach_proxy?.mode === "proxy" || !!e.peach_proxy?.needs_selection,
		access: e.access?.mode ?? "",
		tunnelNamed: !!t?.named_available,
		tunnelNamedMode: !!(t?.named_available && t.mode === "named"),
		tunnelNote: !!(t && (!t.available || t.state === "starting" || t.state === "running" && t.url))
	};
}
function Zs(e) {
	let t = e.updates, n = e.update_job?.state ?? "idle", r = !t || t.state === "unchecked" && !t.checked_at && n === "idle", i = +!!t?.package_kind + (r ? 0 : +!!t?.checked_at + (t?.state === "unchecked" ? 0 : 1) + (n === "idle" ? 0 : 1)), a = e.automatic_updates, o = e.storage;
	return {
		releaseFacts: t?.package_kind ? 5 : 4,
		releaseNotes: i,
		autoUpdateHelp: !(!a || a.available && !a.download_available),
		startupNote: !!e.startup?.message,
		desktopNote: !!e.startup?.desktop_message,
		storageRows: o?.usage?.categories.length ?? 0,
		storageNotes: o && !o.relocation.available ? 1 : 0,
		reporting: !!e.remote_reporting,
		reportingIdle: !(!e.remote_reporting || e.remote_reporting.available),
		sharing: !!e.library_sharing,
		sharingNotice: !!e.library_sharing?.notice,
		sharingIdle: !(!e.library_sharing || e.library_sharing.available),
		facts: e.facts.map((e) => e.term),
		uninstall: !!e.uninstall,
		uninstallHelp: !!e.uninstall?.available
	};
}
// src/react/settings/configuration-page.tsx
function Qs({ receipt: e, reopenTutorial: t, section: n = "", diagnostics: r }) {
	let i = X({
		queryKey: h,
		queryFn: ({ signal: e }) => rt(e)
	}), a = i.data;
	return a ? /* @__PURE__ */ (0, Q.jsx)(tc, {
		data: a,
		receipt: e,
		reopenTutorial: t,
		section: n,
		diagnostics: r,
		refreshing: i.isFetching,
		reload: () => {
			i.refetch({ cancelRefetch: !1 });
		}
	}) : /* @__PURE__ */ (0, Q.jsx)("div", {
		className: "ui-configpage",
		children: /* @__PURE__ */ (0, Q.jsx)(P, {
			tone: "error",
			title: "Reading the configuration failed",
			children: i.error ? q(i.error) : "The configuration could not be fetched; refresh the page and retry."
		})
	});
}
function $s({ data: e, sections: t, reload: n, refreshing: r }) {
	return /* @__PURE__ */ (0, Q.jsx)(Q.Fragment, { children: t.map((t) => {
		let i = e.section_errors?.[t];
		return i ? /* @__PURE__ */ (0, Q.jsx)(P, {
			tone: "error",
			title: i.title,
			action: /* @__PURE__ */ (0, Q.jsx)(d, {
				variant: "secondary",
				size: "small",
				onClick: n,
				...G(r),
				children: "Read again"
			}),
			children: i.message
		}, t) : null;
	}) });
}
var ec = 0;
function tc({ data: e, receipt: t, reopenTutorial: n, section: r, diagnostics: i, reload: a, refreshing: o }) {
	let [s] = (0, Z.useState)(() => `board-tabs-${++ec}`), [c, l] = (0, Z.useState)(r), u = (0, Z.useRef)(null), d = (0, Z.useRef)(c);
	(0, Z.useEffect)(() => {
		l(r);
	}, [r]), (0, Z.useEffect)(() => {
		let t = Ys(e);
		t && wt("downloads", t), wt("network", Xs(e)), wt("maintenance", Zs(e));
	}, [e]), (0, Z.useLayoutEffect)(() => {
		if (d.current === c) return;
		d.current = c;
		let e = u.current?.querySelector(".ui-board-local-nav"), t = u.current?.querySelector(".ui-board-group-active");
		if (!e || !t) return;
		let n = parseFloat(getComputedStyle(e).top);
		if (!Number.isFinite(n) || e.getBoundingClientRect().top > n + 1) return;
		let r = matchMedia("(max-width:900px)").matches ? e.getBoundingClientRect().bottom + 8 : n;
		window.scrollTo(0, Math.max(0, window.scrollY + t.getBoundingClientRect().top - r));
	}, [c]);
	let f = (e) => {
		l(e), jt(At(e), {
			replace: !0,
			state: vt.navigation.location.state
		});
	}, [p, m] = (0, Z.useState)(() => matchMedia("(max-width:900px)").matches);
	(0, Z.useEffect)(() => {
		let e = matchMedia("(max-width:900px)"), t = () => m(e.matches);
		return e.addEventListener("change", t), () => e.removeEventListener("change", t);
	}, []);
	let h = {
		data: e,
		receipt: t
	}, g = (t) => /* @__PURE__ */ (0, Q.jsx)($s, {
		data: e,
		sections: t,
		reload: a,
		refreshing: o
	}), _ = [
		"peach_proxy",
		"access",
		"tunnel",
		"push_discovery",
		...e.editable && e.port_editable !== !1 ? ["media_sources"] : []
	], v = !!(e.peach_proxy || e.access || e.tunnel || e.editable && e.port_editable !== !1 || _.some((t) => e.section_errors?.[t])), y = e.downloads, b = [
		{
			id: "library",
			title: "Library and imports",
			body: (n) => /* @__PURE__ */ (0, Q.jsxs)("div", {
				...vr(n),
				children: [
					g([
						"media_sources",
						"library_count",
						"mount_dependencies"
					]),
					!e.section_errors?.media_sources && !e.section_errors?.library_count ? /* @__PURE__ */ (0, Q.jsx)(Po, { ...h }) : null,
					/* @__PURE__ */ (0, Q.jsx)(Qo, { receipt: t }),
					/* @__PURE__ */ (0, Q.jsx)(Go, { receipt: t }),
					/* @__PURE__ */ (0, Q.jsx)(zo, { receipt: t })
				]
			})
		},
		{
			id: "sources",
			title: "Sources and subscriptions",
			body: (e) => /* @__PURE__ */ (0, Q.jsx)(Js, {
				...h,
				panel: e,
				issues: g(["entry_links"])
			})
		},
		...y || e.section_errors?.downloads ? [{
			id: "downloads",
			title: "Download channels",
			body: (e) => /* @__PURE__ */ (0, Q.jsx)(Nr, {
				initial: y,
				receipt: t,
				panel: e,
				issues: g(["downloads"])
			})
		}] : [],
		...v ? [{
			id: "network",
			title: "Network & access",
			body: (e) => /* @__PURE__ */ (0, Q.jsx)(Ns, {
				...h,
				panel: e,
				issues: g(_)
			})
		}] : [],
		{
			id: "maintenance",
			title: "App and maintenance",
			body: (e) => /* @__PURE__ */ (0, Q.jsxs)("div", {
				...vr(e),
				children: [
					g([
						"startup",
						"uninstall",
						"storage",
						"remote_reporting",
						"library_sharing",
						"updates",
						"update_job",
						"automatic_updates",
						"facts"
					]),
					/* @__PURE__ */ (0, Q.jsx)(Qa, { ...h }),
					/* @__PURE__ */ (0, Q.jsx)(Ko, { receipt: t }),
					/* @__PURE__ */ (0, Q.jsx)(Ia, {
						...h,
						reopenTutorial: n
					})
				]
			})
		},
		{
			id: "diagnostics",
			title: "System diagnostics",
			body: (e) => /* @__PURE__ */ (0, Q.jsx)("div", {
				...vr(e),
				children: e.active ? i : null
			})
		}
	], x = Math.max(0, b.findIndex((e) => e.title === c));
	return /* @__PURE__ */ (0, Q.jsxs)("div", {
		ref: u,
		className: "ui-configpage",
		children: [/* @__PURE__ */ (0, Q.jsx)("div", {
			className: "ui-board-local-nav",
			"data-section-nav": "",
			children: /* @__PURE__ */ (0, Q.jsx)(Fe, {
				group: "configuration",
				label: "Configuration sections",
				value: b[x].id,
				tabs: b.map(({ id: e, title: t }) => ({
					value: e,
					label: t
				})),
				sectionItems: !0,
				panelPrefix: s,
				orientation: p ? "horizontal" : "vertical",
				className: "",
				onChange: (e) => f(b.find((t) => t.id === e).title)
			})
		}), b.map(({ id: e, title: t, body: n }, r) => /* @__PURE__ */ (0, Q.jsxs)(Z.Fragment, { children: [/* @__PURE__ */ (0, Q.jsx)("h2", {
			className: "ui-configgroup",
			children: t
		}), n({
			index: r,
			id: `${s}-panel-${e}`,
			labelledBy: `${s}-tab-${e}`,
			active: r === x
		})] }, t))]
	});
}
export { Qs as ConfigurationPage };

//# debugId=8e63bf87-00ef-4280-90a5-a9d316ed1ded