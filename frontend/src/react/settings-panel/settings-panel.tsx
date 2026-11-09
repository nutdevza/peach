/* Settings panel: the overlay screen opened by the top bar's gear, with section nav on the left and rows of settings on the
 * right.
 *
 * Resident component `settings-panel` (the resident table in `router/managed-routes.tsx`): on first open the shell's
 * `loadSettingsPanel` creates a `[data-settings-host]`, the resident component's `place` puts it at the end of body, and the
 * route tree renders the panel as its child in the same task. After that, open and close only toggle `hidden`; state beyond
 * section and scroll position survives across opens. The shell opens and closes through the handle `configureSettingsPanel`
 * provides: the handle writes this module's store and notifies via `flushSync`, so the panel is rendered by the time the call
 * returns, with scroll locking, fetching and focus right behind it. UI preferences read and write the `appSettings` the shell
 * passes in (`host.store`); after changing an item, `host.changed(effect)` tells the shell what to do about it; the items that
 * follow the database write through `/api/settings` (`settings-data.ts`).
 *
 * The host is not inside `.peach-react`: rows, switches, dropdowns, sliders and color balls are site-wide legacy controls;
 * their look comes from `settings-panel.css` and the legacy stylesheets.
 *
 * On every open the shared controls re-render, the value boxes reset to current values, and shared settings refetch.
 * Focus goes to the close button first; Tab cycles within the panel and returns to the previously focused button on close. */
import {
  useLayoutEffect, useRef, useState, useSyncExternalStore,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { VisuallyHidden } from 'react-aria-components';
import { ButtonLink } from '@/components/base/buttons/button';
import {
  attachOverlayScrollbar, closeAnchoredMenu, iconSwapHtml, moveGlidePane, revealTexts,
  setActionBusy, setIconSwap, wireHorizontalScroller,
} from '@peach/legacy/ui';

import { isInterfaceLanguageChoice, t, type InterfaceLanguageChoice } from '../../i18n';
import { normalizeJavImage } from '../../jav-artwork';
import { boundedPreference } from '../../number-setting';
import { GlowSettings } from './glow-settings';
import { Icon, RemixIcon } from './icon';
import { IconSwitch, SelectField } from './legacy-controls';
import { NumberSetting } from './number-setting';
import type { Choice, PanelSettings, SettingsPanelApi, SettingsPanelHost } from './settings-panel-api';
import { fetchSettings, refreshPanelData, SETTINGS_KEY, useSaveSettings } from './settings-data';
import { Note } from '../components/note';
import { ShortcutSetting } from './shortcut-setting';
import { SidebarOrder } from './sidebar-order';
import { NavigationDropLine, NavigationOrderMenu, NavigationOrderPreferences, useNavigationOrder } from '../components/navigation-order';
import { useSidebarReorder } from '../sidebar/use-sidebar-reorder';
import { SettingsDialogClose } from '../components/settings-dialog-close';

/* The left column's sections, in the same order as the groups on the right. Glyphs are taken by each entry's own name: the whole column comes from Remix, since only one vendor's strokes
   match in weight. */
const SECTIONS = [
  { id: 'appearance', title: 'Appearance & navigation', icon: 'ri-palette-line' },
  { id: 'browsing', title: 'Browsing & playback', icon: 'ri-play-circle-line' },
  { id: 'jav', title: 'JAV & new releases', icon: 'jav' },
  { id: 'search', title: 'Search & recommendations', icon: 'ri-search-line' },
  { id: 'content', title: 'Content display', icon: 'ri-shield-check-line' },
] as const;

const SORT_OPTIONS: readonly Choice[] = [
  ['seed', 'Random'], ['rating', 'Rating'], ['o', 'Climax count'], ['plays', 'Watch count'],
  ['dur', 'Duration'], ['size', 'Size'], ['new', 'Date added'], ['played', 'Watch time'],
];
const DIRECTION_OPTIONS: readonly Choice[] = [['desc', 'Descending'], ['asc', 'Ascending']];
const JAV_IMAGE_OPTIONS: readonly Choice[] = [['cover', 'Official cover', ''], ['thumbnail', 'Preview image', '']];
/* Whether the new releases row takes compilations is filtered server-side from the database setting; the toggle here is only a mirror: the truth lives in `/api/settings`. */
const FEED_COMPILATIONS = [
  ['feedHideGroupSetting', 'feedHideGroupCompilations', 'Large compilations', 'Hide large compilations'],
  ['feedHideSoloSetting', 'feedHideSoloCompilations', 'Solo compilations', 'Hide solo compilations'],
  ['feedHideExcerptSetting', 'feedHideExcerpts', 'Clips', 'Hide clips'],
] as const;
type CompilationKey = typeof FEED_COMPILATIONS[number][1];

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href]';

interface View { open: boolean; closing: boolean; epoch: number; tab: number; configurable: boolean | null }

let host: SettingsPanelHost | null = null;
let view: View = { open: false, closing: false, epoch: 0, tab: 0, configurable: null };
let transition = 0;
let returnFocus: Element | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/* Writes to the store render synchronously: by the time the handle returns, the panel already looks new, and the scroll lock, fetch and focus that follow all read the rendered DOM.
   After this surface throws and an error boundary unmounts it, no one subscribes; incoming writes go to the store only, with no rendering and no throwing. */
function update(patch: Partial<View>): void {
  view = { ...view, ...patch };
  flushSync(notify);
}

/* The Peach configuration entry admits based on the current device's configuration permissions. */
async function checkMachine(current: SettingsPanelHost): Promise<void> {
  const epoch = view.epoch;
  const configurable = await current.configurable();
  if (!view.open || view.epoch !== epoch) return;
  update({ configurable });
}

function open(section = ''): void {
  const current = host;
  if (!current) return;
  const requested = SECTIONS.findIndex(({ title }) => title === section);
  if (view.open && !view.closing) {
    if (requested >= 0 && requested !== view.tab) update({ tab: requested });
    return;
  }
  /* The settings screen covers the whole page, so any anchored popover still open must be dismissed first: settings has several entry points, the sidebar settings button,
     the color popover's "Advanced settings", and shortcuts; dismissing here misses none of them. */
  closeAnchoredMenu();
  transition += 1;
  returnFocus ||= document.activeElement;
  current.sound('whoosh');
  document.documentElement.style.overflow = 'hidden';
  document.body.classList.add('settings-open');
  /* Fetch first, then render: on first open the query does not exist yet, this pass creates it via `fetchQuery`, and when the component renders it reads
     the in-flight one, so no second request goes out. */
  const remote = refreshPanelData();
  update({ open: true, closing: false, configurable: null, epoch: view.epoch + 1, tab: requested >= 0 ? requested : view.tab });
  void remote.then((settings) => { if (settings) current.syncRemote(settings) });
  void checkMachine(current);
  queueMicrotask(() => document.getElementById('settingsClose')?.focus());
}

function close(notify = true): void {
  if (!view.open || view.closing) return;
  const ticket = ++transition;
  if (notify) host?.closed?.();
  update({ closing: true });
  const finish = () => {
    if (ticket !== transition || !view.closing) return;
    update({ open: false, closing: false });
    document.documentElement.style.overflow = '';
    document.body.classList.remove('settings-open');
    if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { queueMicrotask(finish); return }
  document.querySelector('#settingsPanel > [data-settings-card]')?.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 380);
}

const api: SettingsPanelApi = {
  open,
  close,
  isOpen: () => view.open,
  reveal: (selector) => queueMicrotask(() => document.querySelector(selector)?.scrollIntoView({ block: 'nearest' })),
};

/** Attach the host the shell provides and get back the settings panel's imperative handle. Called once; the shell's `loadSettingsPanel` then opens this surface in the router tree,
 *  handing over the handle only after the (collapsed) panel is drawn. */
export function configureSettingsPanel(next: SettingsPanelHost): SettingsPanelApi {
  host = next;
  return api;
}

/** The resident table's face: reads this module's store and renders nothing until the host is attached. */
export function SettingsPanelSurface() {
  const shown = useSyncExternalStore(subscribe, () => view);
  return host ? <SettingsPanel host={host} view={shown} /> : null;
}

function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  /* Unselected sections are hidden whole, so their controls cannot take focus; both ends of the cycle are found among visible controls only. */
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((node) => node.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

const tabId = (index: number) => `settings-tab-${index}`;
const groupId = (index: number) => `settings-group-${index}`;

/* The left column's current item is marked by a piece of glass sliding across, the same thing as the left drawer in another form. Coordinates use `offsetTop`,
   not screen coordinates: panel open/close carries a scale animation, and screen coordinates would swallow that in-flight motion. The glass follows the pointer,
   sliding back to the current cell when the pointer leaves the column; touch has no hover, and sliding over on a tap would equal clicking for the user, so it is blocked outside. */
function SettingsNav({ tab, epoch, configurable, openConfiguration, onSelect }: {
  tab: number; epoch: number; configurable: boolean | null; openConfiguration(): void; onSelect(index: number): void;
}) {
  const nav = useRef<HTMLDivElement | null>(null);
  const order = useNavigationOrder('preferences');
  const items = order.keys.map(key => {
    const index = SECTIONS.findIndex(section => section.id === key);
    return { ...SECTIONS[index]!, index };
  });
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width:760px)').matches);
  useLayoutEffect(() => {
    const media = matchMedia('(max-width:760px)');
    const changed = () => setNarrow(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const glide = useRef<HTMLSpanElement | null>(null);
  const box = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const shown = useRef(tab);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const place = (active: HTMLElement | null | undefined, animate: boolean) => {
    const pane = glide.current;
    if (!pane) return;
    if (!active || !active.offsetHeight) { pane.hidden = true; return }
    pane.hidden = false;
    const next = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight };
    const from = box.current;
    box.current = next;
    moveGlidePane(pane, animate ? from : null, next, 'y');
  };
  const placeRef = useRef(place);
  placeRef.current = place;
  const reorder = useSidebarReorder(nav, order.keys, order.commit,
    () => requestAnimationFrame(() => placeRef.current(buttons.current[shown.current], false)), narrow ? 'x' : 'y', 'tab');

  useLayoutEffect(() => {
    const node = nav.current;
    if (!node) return undefined;
    wireHorizontalScroller(node);
    /* Collapsed, this column has zero size and no landing point can be measured; both the frame it reappears in and narrow-breakpoint width changes align through this one. */
    const observer = new ResizeObserver(() => placeRef.current(buttons.current[shown.current], false));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const moved = shown.current !== tab;
    shown.current = tab;
    placeRef.current(buttons.current[tab], moved);
  }, [tab, epoch, order.keys.join(',')]);

  const keys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey) return;
    const count = items.length;
    const position = items.findIndex(item => item.index === index);
    let next = position;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (position + 1) % count;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (position + count - 1) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else return;
    event.preventDefault();
    onSelect(items[next].index);
    buttons.current[items[next].index]?.focus();
  };

  /* The whole block is one tablist: the subheading is written as presentation and takes no tab slot, so the arrow keys walk it from start to end. */
  return (
    <div data-settings-nav="" data-glass-pane="" role="tablist" aria-label="Settings sections" ref={nav}
      data-navigation-order="preferences" data-navigation-axis={narrow ? 'x' : 'y'} data-reordering={reorder.picked ? '' : undefined}
      onClickCapture={reorder.clickCapture}
      onPointerLeave={(event) => { if (event.pointerType !== 'touch') place(buttons.current[shown.current], true) }}>
      <span data-settings-glide="" aria-hidden="true" hidden ref={glide} />
      <p data-settings-nav-caption="" role="presentation">Settings</p>
      {items.map(({ id, title, icon, index }) => (
        <button type="button" role="tab" key={title} id={tabId(index)} aria-controls={groupId(index)}
          data-tab={id} data-dragging={reorder.picked?.key === id ? '' : undefined}
          style={{ '--navigation-picked-left': `${reorder.picked?.bounds.left || 0}px`,
            '--navigation-picked-top': `${reorder.picked?.bounds.top || 0}px`,
            '--navigation-picked-width': `${reorder.picked?.bounds.width || 0}px`,
            '--navigation-picked-offset': `${reorder.picked?.offset || 0}px`,
            '--sidebar-nudge': `${reorder.nudge(id).distance}px`, '--sidebar-delay': `${reorder.nudge(id).delay}ms` } as CSSProperties}
          {...reorder.bindings(id)} aria-keyshortcuts={narrow ? 'Alt+ArrowLeft Alt+ArrowRight' : 'Alt+ArrowUp Alt+ArrowDown'}
          aria-selected={index === tab} tabIndex={index === tab ? 0 : -1}
          ref={(node) => { buttons.current[index] = node }}
          onClick={() => onSelect(index)} onKeyDown={(event) => { reorder.bindings(id).onKeyDown(event); keys(event, index) }}
          onPointerEnter={(event) => { if (event.pointerType !== 'touch') place(event.currentTarget, true) }}>
          {icon === 'jav' ? <Icon name={icon} /> : <RemixIcon name={icon} />}{title}
        </button>
      ))}
      <NavigationDropLine reorder={reorder} />
      <VisuallyHidden role="status" aria-live="polite">{reorder.announcement}</VisuallyHidden>
      <NavigationOrderMenu order={order} />
      <div data-settings-service="" role="presentation">
        <button type="button" disabled={configurable !== true} onClick={openConfiguration}
          title={configurable === false ? 'Open Peach configuration on the device running Peach' : undefined}>
          <Icon name="folder-cog" />Peach configuration<Icon name="chevron-right" />
        </button>
      </div>
    </div>
  );
}

function Group({ index, tab, children, cards = false }: { index: number; tab: number; children: ReactNode; cards?: boolean }) {
  return (
    <section data-setting-group="" data-setting-layout={cards ? 'cards' : undefined}
      id={groupId(index)} role="tabpanel" aria-labelledby={tabId(index)} hidden={index !== tab}>
      <h3>{SECTIONS[index].title}</h3>
      {children}
    </section>
  );
}

/** One switch row: the whole row is a label, toggling wherever clicked. The description's id defaults to the switch id minus `Setting` plus `Description`. */
function ToggleRow({ id, title, description, describedBy = `${id.replace(/Setting$/, '')}Description`, checked, onToggle }: {
  id: string; title: string; description?: string; describedBy?: string; checked: boolean; onToggle(on: boolean): void;
}) {
  return (
    <label data-setting-row="">
      <span><b>{title}</b>{description ? <small id={describedBy}>{description}</small> : null}</span>
      <input data-toggle="" type="checkbox" id={id} role="switch" aria-describedby={description ? describedBy : undefined}
        checked={checked} onChange={(event) => onToggle(event.target.checked)} />
    </label>
  );
}

function Row({ title, description, kind, children }: {
  title: string; description?: ReactNode; kind?: 'sort' | 'related'; children: ReactNode;
}) {
  return (
    <div data-setting-row="" data-setting-sort={kind === 'sort' ? '' : undefined}
      data-setting-related={kind === 'related' ? '' : undefined}>
      <span><b>{title}</b>{typeof description === 'string' ? <small>{description}</small> : description}</span>
      {children}
    </div>
  );
}

function SettingsPanel({ host: current, view: shown }: { host: SettingsPanelHost; view: View }) {
  /* The subscription exists only to redraw: it reads the live object `store.value`, the version number itself is unused. */
  useSyncExternalStore(current.store.subscribe, current.store.version);
  const settings = current.store.value;
  const panel = useRef<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const head = useRef<HTMLDivElement | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const resync = useRef<(() => void) | null>(null);
  const lastTab = useRef(shown.tab);

  /* The threshold for the shadow under the title is that gap itself: it lives on this column's top padding, scrolling it away means the two blocks overlap,
     and the shadow lights up at 4px remaining. The gap value is written only in `--settings-gap`, which is read here. */
  const fade = () => {
    const [box, body] = [card.current, scroll.current];
    if (!box || !body) return;
    const gap = parseFloat(getComputedStyle(box).getPropertyValue('--settings-gap')) || 0;
    box.toggleAttribute('data-scrolled', body.scrollTop > Math.max(gap - 4, 0));
  };
  const fadeRef = useRef(fade);
  fadeRef.current = fade;

  useLayoutEffect(() => {
    const body = scroll.current;
    if (!body || !panel.current) return undefined;
    resync.current = attachOverlayScrollbar(body) ?? resync.current;
    current.attached(panel.current);
    const listener = () => fadeRef.current();
    body.addEventListener('scroll', listener, { passive: true });
    return () => body.removeEventListener('scroll', listener);
  }, [current]);
  /* Switching sections and every open return to the top; on a section change the title reveals character by character, and it only opens and closes, never plays. */
  useLayoutEffect(() => {
    const moved = lastTab.current !== shown.tab;
    lastTab.current = shown.tab;
    if (scroll.current) scroll.current.scrollTop = 0;
    if (moved && head.current) revealTexts(head.current, 'h2');
    fadeRef.current();
  }, [shown.tab, shown.epoch]);
  /* Switching sections and expanding or collapsing a group only toggle `hidden`; the scrollbar observer only watches subtree additions and removals and does not know the content length changed.
     After each paint, re-measure the thumb and the two edge fades against the new content length. */
  useLayoutEffect(() => { resync.current?.() });

  const epoch = shown.epoch;
  const select = (index: number) => { if (index !== view.tab) { update({ tab: index }); current.selectSection?.(SECTIONS[index].title) } };
  const save = () => current.store.save();

  return (
    <section data-settings-panel="" id="settingsPanel" hidden={!shown.open} aria-modal="true" role="dialog"
      aria-labelledby="settingsTitle" data-closing={shown.closing ? '' : undefined} ref={panel} onKeyDown={trapTab}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <div data-settings-card="" ref={card}>
        <div data-settings-head="" ref={head}>
          <h2 id="settingsTitle">{SECTIONS[shown.tab].title}</h2>
            <SettingsDialogClose id="settingsClose" label="Close settings" onPress={() => close()} />
        </div>
        <SettingsNav tab={shown.tab} epoch={epoch} configurable={shown.configurable} onSelect={select}
          openConfiguration={() => { close(false); current.openConfiguration() }} />
        <div data-settings-scroll="" ref={scroll}>
          <Group index={0} tab={shown.tab} cards>
            <div data-setting-card="">
            <Row title="Theme">
              <IconSwitch id="themeSetting" name="theme" legend="Theme" options={current.themeOptions} value={settings.theme}
                attr="data-theme-choice" variant="themeswitch" epoch={epoch}
                onChoose={(choice) => { settings.theme = choice; save(); current.changed('theme') }} />
            </Row>
            <InterfaceLanguageSetting host={current} epoch={epoch} />
            <div data-setting-row="">
              <label htmlFor="glassContrastSetting"><b>Increase contrast</b></label>
              <input type="checkbox" id="glassContrastSetting" data-toggle="" role="switch" checked={current.highContrast()}
                onChange={(event) => current.setHighContrast(event.target.checked)} />
            </div>
            <ToggleRow id="uiSoundsSetting" title="Interface sounds" checked={settings.uiSounds}
              onToggle={(on) => { settings.uiSounds = on; save(); current.changed('uiSounds') }} />
            <ToggleRow id="homeGlowSetting" title="Sidebar glow" checked={settings.homeGlow.on}
              onToggle={(on) => { settings.homeGlow.on = on; save(); current.changed('glow') }} />
            </div>
            <GlowSettings host={current} />
            <section data-setting-block="" aria-labelledby="sidebarOrderTitle">
              <h4 data-settings-subheading="" id="sidebarOrderTitle">Navigation entries & order</h4>
              <div data-setting-card="">
                <section data-sidebar-setting=""><SidebarOrder host={current} /></section>
              </div>
              <div data-setting-card="">
                <section data-sidebar-setting=""><NavigationOrderPreferences /></section>
              </div>
            </section>
          </Group>
          <BrowseGroup host={current} tab={shown.tab} epoch={epoch} />
          <JavGroup host={current} tab={shown.tab} epoch={epoch} />
          <Group index={3} tab={shown.tab}>
            <SearchHistoryRow host={current} epoch={epoch} />
            <Row title="Related suggestion count">
              <div id="relatedLimitSetting">
                <NumberSetting key={epoch} id="relatedLimitSetting" label="Related suggestion count" value={settings.relatedLimit}
                  onApply={(value) => { settings.relatedLimit = value; save() }} />
              </div>
            </Row>
            <Row title="Taste & history"><div className="peach-react"><ButtonLink variant="secondary" href="/taste" onClick={() => close(false)}>Open taste & history</ButtonLink></div></Row>
          </Group>
          <Group index={4} tab={shown.tab}>
            <ToggleRow id="censorSetting" title="SFW mode" describedBy="sfwDescription" checked={current.censored()}
              description="Hide sensitive content and stop hover previews."
              onToggle={(on) => current.setCensored(on)} />
            <ShortcutSetting current={current.sfwShortcut()} onChange={current.setSfwShortcut} />
          </Group>
        </div>
      </div>
    </section>
  );
}

interface GroupProps { host: SettingsPanelHost; tab: number; epoch: number }

/* The sort-direction cell stacks two arrows, and only the direction changes: rewriting the whole cell discards the old glyph together with its animation,
   which reads as a hard cut, so write it once, only while the cell has not been built yet. */
function decorateDirection(field: HTMLElement, ascending: boolean): void {
  const mark = field.querySelector('[data-select-label]');
  if (!mark) return;
  if (!mark.querySelector('[data-icon-swap]')) {
    mark.innerHTML = iconSwapHtml('arrow-up', 'arrow-down', 'a', { className: 'gselectmark', iconClass: 'gselectmark' })
      + '<span data-sort-direction-label></span>';
  }
  setIconSwap(mark, ascending ? 'a' : 'b');
  const label = mark.querySelector('[data-sort-direction-label]');
  if (label) label.textContent = ascending ? 'Ascending' : 'Descending';
}

/* "Browse and play" splits in two: the video list (grid, sorting, cards, and hover) first, playback after. The transcode method describes the machine running Peach,
   configured in Peach configuration "App and maintenance -> Video playback", not here (ADR-0103). */
function BrowseGroup({ host: current, tab, epoch }: GroupProps) {
  const settings = current.store.value;
  const save = () => current.store.save();
  const random = settings.defaultSort === 'seed';
  const ascending = settings.defaultSortDirection === 'asc';
  return (
    <Group index={1} tab={tab}>
      <h4 data-settings-subheading="">Video list</h4>
      <Row title="Videos loaded per batch">
        <div id="batchSizeSetting">
          <NumberSetting key={epoch} id="batchSizeSetting" label="Videos per batch" value={settings.batchSize}
            onApply={(value) => { settings.batchSize = value || 60; save(); current.changed('batchSize') }} />
        </div>
      </Row>
      <Row title="Default sort" kind="sort">
        <div data-setting-sort-controls="">
          <SelectField id="defaultSortSetting" label="Default sort" options={SORT_OPTIONS} value={settings.defaultSort} epoch={epoch}
            onPick={(value) => { settings.defaultSort = value; save(); current.changed('defaultSort') }} />
          <SelectField id="defaultSortDirectionSetting" label="Default sort direction" options={DIRECTION_OPTIONS}
            value={ascending ? 'asc' : 'desc'} hidden={random} disabled={random} epoch={epoch}
            onPick={(value) => { settings.defaultSortDirection = value; save(); current.changed('sortDirection') }}
            decorate={(field) => decorateDirection(field, ascending)} />
        </div>
      </Row>
      <Row title="Video card size">
        <IconSwitch id="javSizeSetting" name="video-size" legend="Video card size" options={current.videoLayouts}
          value={current.videoLayout()} attr="data-video-layout" variant="javimageswitch" text epoch={epoch}
          onChoose={(layout) => current.setVideoLayout(layout)} />
      </Row>
      <label data-setting-row=""><span><b>Merge volumes & editions</b></span>
        <input type="checkbox" id="groupCollapseSetting" data-toggle="" role="switch" checked={settings.groupCollapse}
          onChange={(event) => { settings.groupCollapse = event.target.checked; save(); current.changed('groupCollapse') }} />
      </label>
      <Row title="Hover preview delay">
        <div id="hoverDelaySetting">
          <NumberSetting key={epoch} id="hoverDelaySetting" label="Hover preview delay" value={settings.hoverDelaySeconds}
            onApply={(value) => {
              settings.hoverDelaySeconds = boundedPreference(value, 0, 60, 5); save(); current.changed('hoverDelay');
            }} />
        </div>
      </Row>
      <h4 data-settings-subheading="">Playback</h4>
      <PlaybackRows host={current} epoch={epoch} />
    </Group>
  );
}

function JavGroup({ host: current, tab, epoch }: GroupProps) {
  const settings = current.store.value;
  const save = () => current.store.save();
  return (
    <Group index={2} tab={tab}>
      <h4 data-settings-subheading="">Video display</h4>
      <NameLanguageSetting host={current} epoch={epoch} />
      <Row title="Default image">
        <IconSwitch id="javImageSetting" name="jav-image" legend="Default image" options={JAV_IMAGE_OPTIONS}
          value={settings.javImage} attr="data-jav-image-choice" variant="javimageswitch" text epoch={epoch}
          onChoose={(choice) => { settings.javImage = normalizeJavImage(choice); save(); current.changed('javImage') }} />
      </Row>
      <h4 data-settings-subheading="">New releases</h4>
      <Row title="Display count">
        <div id="feedLimitSetting">
          <NumberSetting key={epoch} id="feedLimitSetting" label="New release count" value={settings.feedLimit}
            onApply={(value) => { settings.feedLimit = boundedPreference(value, 1, 100, 12); save(); current.changed('feedLimit') }} />
        </div>
      </Row>
      <ToggleRow id="feedAutoScrollSetting" title="Auto-scroll" checked={settings.feedAutoScroll}
        onToggle={(on) => { settings.feedAutoScroll = on; save(); current.changed('feedAutoScroll') }} />
      {FEED_COMPILATIONS.map(([id, key, label, title]) => (
        <CompilationToggle key={id} host={current} id={id} settingKey={key} label={label} title={title} />
      ))}
    </Group>
  );
}
/* 语言名称写成各自语言的自称，不随界面语言翻译：看不懂当前界面的人也要认得出自己那一项。
   「自动」只写一个词：手机上选择框窄，括号里再带语言名会把标题挤成两行，页面本身已经在用探测出的语言。 */
const languageChoices = (): readonly (readonly [InterfaceLanguageChoice, string])[] =>
  [['auto', t('settings:interfaceLanguage.auto')], ['zh-CN', 'Simplified Chinese'], ['en', 'English']];
/* 存进数据库、回来交壳对账；壳发现本地那份变了就整页重载，换成新语言。 */
function InterfaceLanguageSetting({ host: current, epoch }: { host: SettingsPanelHost; epoch: number }) {
  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal), staleTime: 0 });
  const save = useSaveSettings();
  const [pending, setPending] = useState<InterfaceLanguageChoice | null>(null);
  const language = query.data?.interfaceLanguage;
  const choices = languageChoices();
  return <>
    <Row title={t('settings:interfaceLanguage.title')}
      description={<small>{t('settings:interfaceLanguage.help')}</small>}>
      <SelectField id="interfaceLanguageSetting" label={t('settings:interfaceLanguage.title')} epoch={epoch}
        options={choices}
        value={pending ?? language ?? current.store.value.interfaceLanguage}
        disabled={query.isPending || query.isError || save.isPending || !language} busy={save.isPending}
        onPick={(value) => {
          if (save.isPending || !isInterfaceLanguageChoice(value) || value === language) return;
          setPending(value);
          save.mutate({ interfaceLanguage: value }, {
            onSuccess: (saved) => { current.receipt(t('settings:interfaceLanguage.saved')); current.syncRemote(saved) },
            onError: (error) => current.failure(t('settings:interfaceLanguage.saveFailed'), error),
            onSettled: () => setPending(null),
          });
        }} />
    </Row>
    {query.isError ? <Note tone="error">{t('settings:interfaceLanguage.unavailable')}</Note> : null}
  </>;
}
function NameLanguageSetting({ host: current, epoch }: { host: SettingsPanelHost; epoch: number }) {
  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal), staleTime: 0 });
  const save = useSaveSettings();
  const [pending, setPending] = useState<'zh-CN' | 'ja' | null>(null);
  const language = query.data?.performerNameLanguage;
  return <>
    <Row title="Performer names" description={<small data-copy-key="performer-name-language-help">Names and aliases show only the chosen language; where a match is missing the current name is kept.</small>}>
      <SelectField id="performerNameLanguageSetting" label="Performer names" epoch={epoch}
        options={[["zh-CN", "Chinese"], ["ja", "Original Japanese"]]}
        value={pending ?? language ?? current.store.value.performerNameLanguage}
        disabled={query.isPending || query.isError || save.isPending || !language} busy={save.isPending}
        onPick={(value) => {
          if (save.isPending || (value !== 'zh-CN' && value !== 'ja') || value === language) return;
          setPending(value);
          save.mutate({ performerNameLanguage: value }, {
            onSuccess: (saved) => { current.syncRemote(saved); current.receipt('Name display preference saved') },
            onError: (error) => current.failure('Save name display preference', error),
            onSettled: () => setPending(null),
          });
        }} />
    </Row>
    {query.isError ? <Note tone="error">Couldn't load the name preference from the database. Reopen settings.</Note> : null}
  </>;
}
/* The compilation switch is decided by the server, and the list, unread count, and backfill-cover queue all follow it, so save to the server first, then repaint; during the round trip the switch
   stays in its new position with a busy state, and reverts on failure. */
function CompilationToggle({ host: current, id, settingKey, label, title }: {
  host: SettingsPanelHost; id: string; settingKey: CompilationKey; label: string; title: string;
}) {
  const save = useSaveSettings();
  const [pending, setPending] = useState<boolean | null>(null);
  const box = useRef<HTMLInputElement | null>(null);
  const settings: PanelSettings = current.store.value;
  const toggle = (on: boolean) => {
    setPending(on);
    setActionBusy(box.current);
    save.mutate({ [settingKey]: on }, {
      onSuccess: (saved) => {
        settings[settingKey] = saved[settingKey] === true;
        current.store.save();
        current.changed('feedCompilations');
        current.receipt(on ? `New releases collapsed: ${label}` : `New releases listed: ${label}`);
      },
      onError: (error) => current.failure(`Save ${label} toggle`, error),
      onSettled: () => { setPending(null); setActionBusy(box.current, false) },
    });
  };
  return (
    <label data-setting-row="">
      <span><b>{title}</b></span>
      <input data-toggle="" type="checkbox" id={id} role="switch" ref={box}
        checked={pending ?? settings[settingKey]} onChange={(event) => toggle(event.target.checked)} />
    </label>
  );
}

function PlaybackRows({ host: current, epoch }: Omit<GroupProps, 'tab'>) {
  const settings = current.store.value;
  const save = () => current.store.save();
  return (
    <>
      <ToggleRow id="detailAutoplaySetting" title="Autoplay on opening details" checked={settings.detailAutoplay}
        onToggle={(on) => { settings.detailAutoplay = on; save() }} />
      <ToggleRow id="miniplayerSetting" title="Mini player after leaving details" checked={settings.miniplayer}
        onToggle={(on) => { settings.miniplayer = on; save(); current.changed('miniplayer') }} />
      <Row title="Seek step">
        <div id="seekSecondsSetting">
          <NumberSetting key={epoch} id="seekSecondsSetting" label="Seek forward / back" value={settings.seekSeconds}
            onApply={(value) => { settings.seekSeconds = value || 10; save(); current.changed('seekSeconds') }} />
        </div>
      </Row>
    </>
  );
}

function SearchHistoryRow({ host: current, epoch }: { host: SettingsPanelHost; epoch: number }) {
  const settings = current.store.value;
  const save = useSaveSettings();
  /* The count follows the database (`/api/settings`), so every client sees the same number; the local copy is only a mirror. */
  return (
    <Row title="Search history size">
      <div id="searchHistoryLimitSetting">
        <NumberSetting key={epoch} id="searchHistoryLimitSetting" label="Search history" value={settings.searchHistoryLimit}
          onApply={(value) => {
            settings.searchHistoryLimit = boundedPreference(value, 0, 50, 10);
            current.store.save();
            current.changed('searchHistoryLimit');
            save.mutate({ searchHistoryLimit: settings.searchHistoryLimit }, { onError: () => {} });
          }} />
      </div>
    </Row>
  );
}
