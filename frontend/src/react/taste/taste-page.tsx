/* Taste page: two sets of evidence saying the same thing.
 *
 * The left is browser history (read on this machine, or imported from a private export elsewhere); the right is Peach's own
 * watch behavior. Each set has its own readouts, charts and rankings, switched wholesale by the tabs on top: they are two
 * bodies of evidence, not two renderings of one dataset; side by side they would read as corroborating each other.
 *
 * The analysis window rides on `queryKey` (`['taste', window]`), and switching uses `keepPreviousData` to keep the previous
 * copy: this screen's structure does not change, only the numbers do, and falling back to a skeleton would take away what you
 * already read and put it back. The window itself is component state and stays out of the address bar: routing still belongs
 * to the legacy shell, and entering this page always starts a fresh look from "All time". The page sets no `staleTime`, so
 * every window change refetches: returning to a previously viewed window after an import or removal reads the post-write
 * numbers, not the pre-write ones from cache.
 *
 * "Read browser history" is a background job that keeps running after the page closes. An old terminal state read on first
 * screen does not masquerade as a new result: only when you clicked read this time, or personally saw it running this time,
 * does the terminal state send a receipt and have the dashboard refetch (ADR-0031). */
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import type { ChangeEvent } from 'react';
import {
  RiArrowDownSLine, RiArrowRightSLine, RiCompassLine, RiDatabase2Line, RiDeleteBinLine,
  RiEyeLine, RiHistoryLine, RiPriceTag3Line, RiSearchLine, RiThumbDownLine,
  RiThumbUpLine, RiUploadLine, RiBookmarkLine, RiExternalLinkLine,
} from '@remixicon/react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Popover, Tab, TabPanel, Tabs } from 'react-aria-components';
import { MenuDialog as Dialog } from '../components/menu-dialog';

import { avatarInner } from '@peach/card-art';
import { firstGrapheme, fmtSize, siteMarkUrl } from '@peach/legacy/core';
import { confirmModal } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';
import {
  MENU_ITEM, MENU_ITEM_INTERACTIVE, MENU_POPOVER_SURFACE,
} from '@/components/base/dropdown/menu-styles';
import { Select, SelectItem } from '@/components/base/select/select';
import { cx } from '@/utils/cx';

import { errorMessage } from '../../api';
import { useBackgroundJob } from '../background-job';
import type { TasteProps } from '../bundle';
import { cardClass } from '../components/card';
import { EmptyState } from '../components/empty-state';
import { ExpandableRanking } from '../components/expandable-ranking';
import { LEGACY_AVATAR_IMG } from '../components/legacy-avatar';
import { TaskProgress } from '../components/task-progress';
import { Note } from '../components/note';
import { Page } from '../components/page';
import { Progress } from '../components/progress';
import { SEGMENT, SEGMENTED_TRACK, SegmentedTabList as TabList } from '../components/segmented';
import { StatCard, statCardClass, STAT_STRIP } from '../components/stat-card';
import { queryClient } from '../query';
import { Disclosure } from '../settings/section';
import { busyProps } from '../settings/use-action';
import { ActivityHeat } from '../charts/heat-card';
import { CreatorSankey, RankedBars, TasteRadar } from './charts';
import { BrowserSources, SOURCE_TILE } from './browser-sources';
import {
  DEFAULT_WINDOW, fetchTaste, fetchTasteJob, historySpan, IDLE_POLL_MS, importTasteExport, radarRows,
  rankDetail, rankShares, removeTasteSource, startTasteRefresh, tasteDate, tasteDimensions, tasteHours,
  tasteKey, tasteRefetchInterval, tasteTime, TASTE_REFRESH_KEY, TASTE_WINDOWS, type RankRow, type TasteData,
  type TasteJob,
} from './taste';

/** This many ranking entries show when collapsed. Laying out twenty at once pushes the blocks below entirely off screen. */
const RANK_PREVIEW = 10;

const MENU_ROW = cx(MENU_ITEM, MENU_ITEM_INTERACTIVE, 'text-body-2-medium');
const CARD = `${cardClass()} flex flex-col gap-4`;
/** A cell in the card: the legacy `.tastelead` and `.tastesource` use the overlay-tier surface, one step brighter than the card face. */
const TILE = 'rounded-xl bg-background-primary-default p-3';

/* Chinese body text is written as constants: line-wrapped text in JSX gains a space at the seam, which is visible in Chinese sentences. */
const REFRESH_TITLE = 'Read the browsing history and bookmarks on this computer running Peach';
const NO_SOURCE_HINT = 'After importing or reading browsing data, this lists which devices the records came from.';
const NO_LEAD_HINT = 'No tags in the library currently match what you have browsed.';
const NO_CATEGORY_HINT = 'After reading browsing data, this summarizes what you browsed by category.';
const GAP_HINT = 'These tags appear in browsing history but not yet in the watch or rating records in Peach';
const NO_BROWSER_TAG_HINT = 'After collecting browsing data, this lists the tags you browsed.';
const NO_BROWSER_CREATOR_HINT = 'After browsing history is collected, the creators you viewed are listed here.';
const NO_DOMAIN_HINT = 'After collecting browsing data, this lists the sites you visit often.';
const NO_PEACH_TAG_HINT = 'After you play or rate videos in Peach, the related tags are listed here.';
const NO_PEACH_CREATOR_HINT = 'After you play or rate videos in Peach, the related creators are listed here.';
const NO_PEACH_PERFORMER_HINT = 'After you play or rate videos in Peach, the related performers are listed here.';
const GUIDE_LOCAL = 'In the browser on the computer running Peach: click "Read browser history" above.';
const GUIDE_REMOTE = 'Records on other devices: after exporting the file, choose "Import history file" or "Import bookmarks file". Bookmarks accept browser-exported HTML files and Chromium Bookmarks JSON files.';
const GUIDE_REFRESH = 'Read or import again whenever a refresh is needed; data sources can be removed at the bottom of the page.';
const REMOVE_BODY = 'Deletes the imported records of this source; original files are kept. If the browser source is still enabled, the next read imports them again.';

/** Skipping the guide is a persistent preference of this browser, unrelated to analysis results, so it stays out of Query. */
export const TASTE_GUIDE_KEY = 'peach-taste-guide-dismissed';

type Glyph = typeof RiEyeLine;

const TasteEmptyAction = createContext<ReactNode>(<ButtonLink size="small" href="/">Browse library</ButtonLink>);

function TasteRecordActions() {
  return useContext(TasteEmptyAction);
}

/** One readout cell: a name, a big number, one line about where it comes from. The same card as the stats page's readout card. */
function SummaryCard({ icon: Icon, term, figure, detail, detailTitle, accent }:
{ icon: Glyph; term: string; figure: string; detail?: string; detailTitle?: string; accent: number }) {
  return (
    <div className={statCardClass()}>
      <StatCard label={term} icon={Icon} accent={accent} figure={figure}
        footer={<span className="block min-w-0 truncate" title={detailTitle || detail}>{detail ?? ''}</span>} />
    </div>
  );
}

/** Site roundels: back an initial first, then layer the server's roundel on top; if it cannot be fetched, remove the `<img>` and expose the initial.
 *
 *  Roundels go through `/site-mark`; the browser sends no request to the target site nor any third-party icon proxy; such requests
 *  would report every site in the column one by one, in exchange for a 16px bitmap. */
function SiteAvatar({ name, domain }: { name: string; domain: string }) {
  return (
    <span className="relative inline-grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-background-tertiary-default text-caption-1-medium text-text-secondary">
      {firstGrapheme(name).toUpperCase()}
      <img src={siteMarkUrl({ domain })} alt="" loading="lazy" width={20} height={20}
        onError={(event) => event.currentTarget.remove()}
        className="absolute size-5 object-contain" />
    </span>
  );
}

/** The entity roundel. `avatarInner` in `card-art` is the only fallback-chain implementation; pages do not redraw it. */
function EntityAvatar({ html }: { html: string }) {
  return (
    <span className={`relative inline-grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-background-tertiary-default text-caption-1-medium text-text-secondary ${LEGACY_AVATAR_IMG}`}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

interface RankListProps {
  rows: RankRow[];
  /** The signal type handed back to the shell when this board is clickable (`tag` / `creator` / `performer`). An empty string means this board is not clickable. */
  kind: string;
  /** What to draw on a row's left: an entity round badge, a site round badge, or nothing at all. */
  visual: 'entity' | 'domain' | 'creator' | 'none';
  empty: string;
  onSignal: TasteProps['onSignal'];
}

/** One board's placements. The clickable ones are buttons, the rest are rows: with no matching library entry, clicking through lands on an empty page. */
function RankList({ rows, kind, visual, empty, onSignal }: RankListProps) {
  if (!rows.length) {
    return <EmptyState size="compact" icon={RiSearchLine} title="Not enough records"
      actions={<TasteRecordActions />}>{empty}</EmptyState>;
  }
  const shares = rankShares(rows);
  return (
    <ExpandableRanking previewCount={RANK_PREVIEW}
      className="inline-grid w-full gap-x-7 gap-y-2 sm:grid-cols-2">
        {rows.map((row, index) => {
          const clickable = !!kind && !!row.peach_items;
          const domain = String(row.source_domain || '');
          const body = (
            <>
              {/* The rank bar fills the whole row: the old `.taste-rank-track` was `position:absolute;inset:0` with a 14%
                  opacity backing, not the thin line under the text; the eye reads how long the row is. */}
              <svg viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden
                className="absolute inset-0 -z-10 size-full overflow-hidden rounded-lg opacity-15">
                <rect width={shares[index]} height={1} className="fill-chart-4" />
              </svg>
              <span className="w-6 shrink-0 text-caption-1-regular tabular-nums text-text-secondary">
                {index + 1}
              </span>
              {visual === 'domain' ? <SiteAvatar name={row.name} domain={row.name} /> : null}
              {visual === 'creator' && !row.entity_id && !row.has_avatar && domain
                ? <SiteAvatar name={row.name} domain={domain} /> : null}
              {visual !== 'none' && visual !== 'domain'
                && (row.entity_id || row.has_avatar || !domain)
                ? <EntityAvatar html={avatarInner(
                    row.name,
                    row.entity_id
                      ? { id: row.entity_id, has_image: !!row.has_image, image_version: row.image_version,
                        avatar_focus: row.avatar_focus, avatar_stand_in: row.avatar_stand_in }
                      : null,
                    row.has_avatar ? row.representative_asset_id ?? null : null,
                    visual === 'creator' ? 'creator' : kind || 'performer',
                  )} /> : null}
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <b className="min-w-0 text-body-medium break-words text-text-primary">{row.name}</b>
                <small className="text-caption-1-regular text-text-secondary">{rankDetail(row)}</small>
              </span>
              {clickable ? <RiArrowRightSLine aria-hidden className="size-4 shrink-0 text-text-tertiary" /> : null}
            </>
          );
          const shape = 'relative isolate flex min-h-11 w-full min-w-0 items-center gap-2.5'
            + ' rounded-lg px-3 py-2 text-left';
          return (
            <li key={`${row.name}:${index}`} className="min-w-0">
              {clickable
                ? <button type="button" onClick={() => onSignal(kind, row.name)}
                    className={`${shape} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring`}>
                    {body}
                  </button>
                : <div className={shape}>{body}</div>}
            </li>
          );
        })}
    </ExpandableRanking>
  );
}

/** The dimension panel for one side's evidence. Tabs use React Aria, switching between ranked layers of the same area. */
function DimensionPanels(
  { label, panels, onSignal }:
  {
    label: string;
    panels: { id: string; name: string; props: Omit<RankListProps, 'onSignal'> }[];
  } & Pick<TasteProps, 'onSignal'>,
) {
  return (
    /* Old `.insightpanel`: one filled card with 16px radius, and the tabs are the segmented control at the top of the card. */
    <Tabs className={`${cardClass({ padding: 'none' })} flex flex-col`}>
      <div className="px-4 pt-3">
        <TabList aria-label={label} className={SEGMENTED_TRACK}>
          {panels.map((panel) => <Tab key={panel.id} id={panel.id} className={SEGMENT}>{panel.name}</Tab>)}
        </TabList>
      </div>
      {panels.map((panel) => (
        <TabPanel key={panel.id} id={panel.id} className="px-4 pt-3.5 pb-4">
          <RankList {...panel.props} onSignal={onSignal} />
        </TabPanel>
      ))}
    </Tabs>
  );
}

/** Taste summary: one conclusion, a few key points, plus actions reachable in one click. */
function AnalysisCard({ data, onSignal, navigate }:
{ data: TasteData } & Pick<TasteProps, 'onSignal' | 'navigate'>) {
  const analysis = data.analysis;
  if (!analysis?.headline) return null;
  const confidence = analysis.confidence || {};
  const leads = [
    ...(analysis.explore || []).map((item) => (
      { key: `tag:${item.tag}`, title: item.title, detail: item.detail, act: () => onSignal('tag', item.tag) })),
    ...(analysis.next_steps || []).map((item) => (
      { key: `route:${item.route}`, title: item.title, detail: item.detail, act: () => navigate(item.route) })),
  ];
  return (
    <section className={CARD} aria-label="Taste summary">
      <header className="flex flex-col gap-2">
        <h3 className="text-title-2-medium text-text-primary">Taste summary</h3>
        {/* The conclusion sentence is this card's protagonist: the old `.tasteleads .tastelede p` was 20/30 in primary text color, one tier
            larger than body text and capped at 64ch wide. "How confident" is its footnote; the old version was one gray line with an 8px dot. */}
        <p className="max-w-prose text-title-2-regular wrap-anywhere text-text-primary">{analysis.headline}</p>
        <p className="flex flex-wrap items-center gap-2 text-body-2-regular text-text-secondary">
          <i aria-hidden className={`size-2 shrink-0 rounded-full ${confidence.level === 'high'
            ? 'bg-status-lime-text'
            : confidence.level === 'medium' ? 'bg-status-yellow-text' : 'bg-text-tertiary'}`} />
          <span className="min-w-0 wrap-anywhere">{confidence.label || 'Still learning'}</span>
        </p>
      </header>
      {analysis.points?.length ? (
        <div className="inline-grid w-full gap-3 sm:grid-cols-2">
          {analysis.points.map((point) => (
            <div key={point.label} className={`flex min-w-0 flex-col gap-1 ${TILE}`}>
              <span className="text-caption-1-regular text-text-secondary">{point.label}</span>
              <b className="text-body-2-medium break-words text-text-primary">{point.text}</b>
            </div>
          ))}
        </div>
      ) : null}
      {leads.length ? (
        <div className="flex flex-col gap-2">
          {leads.map((lead) => (
            <button key={lead.key} type="button" onClick={lead.act}
              className={`flex w-full min-w-0 cursor-pointer items-center gap-3 ${TILE} text-left outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring`}>
              <span className="flex min-w-0 grow flex-col gap-1">
                <b className="text-body-2-medium wrap-anywhere text-text-primary">{lead.title}</b>
                <small className="text-caption-1-regular wrap-anywhere text-text-secondary">{lead.detail}</small>
              </span>
              <RiArrowRightSLine aria-hidden className="size-4 shrink-0 text-text-tertiary" />
            </button>
          ))}
        </div>
      ) : <EmptyState size="compact" icon={RiSearchLine} title="No entry points to explore yet"
        actions={<ButtonLink size="small" href="/">Browse library</ButtonLink>}>{NO_LEAD_HINT}</EmptyState>}
    </section>
  );
}

/** How the browsing history came to be. It stops appearing once records are scraped or the step is skipped, and enters expanded when arriving with `?onboarding=1`. */
function HistoryGuide({ onboarding, done }: { onboarding: boolean; done: boolean }) {
  const [skipped, setSkipped] = useState(() => {
    try { return localStorage.getItem(TASTE_GUIDE_KEY) === '1' } catch { return false }
  });
  if (done || skipped) return null;
  const skip = () => {
    try { localStorage.setItem(TASTE_GUIDE_KEY, '1') } catch { /* When storage is unavailable, still collapse this time */ }
    setSkipped(true);
  };
  return (
    <div className={cardClass({ padding: 'none', className: 'p-4' })}>
      <Disclosure summary="Browser history import guide" defaultOpen={onboarding}>
        <p className="text-body-2-regular text-text-secondary">{GUIDE_LOCAL}</p>
        <p className="text-body-2-regular text-text-secondary">{GUIDE_REMOTE}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-2-regular text-text-secondary">
          <li>
            Chrome: in <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer"
              className="text-text-primary underline-offset-4 hover:underline">Google Takeout<RiExternalLinkLine aria-hidden className="size-(--icon-inline) shrink-0" /></a>
            {' '}Select Chrome history and import directly after downloading the ZIP.
          </li>
          <li>
            Other browsers: use <a href="https://github.com/purarue/browserexport" target="_blank" rel="noopener noreferrer"
              className="text-text-primary underline-offset-4 hover:underline">browserexport<RiExternalLinkLine aria-hidden className="size-(--icon-inline) shrink-0" /></a>
            {' '}Export history, then import the export file.
          </li>
        </ul>
        <p className="text-body-2-regular text-text-secondary">{GUIDE_REFRESH}</p>
        <span className="self-start">
          <Button variant="secondary" size="small" onClick={skip}>Skip</Button>
        </span>
      </Disclosure>
    </div>
  );
}

/** A dropdown on the primary key: reading and importing are two entry points to the same thing, and splitting them into two buttons hides which one is the everyday one.
 *
 *  The menu's first item matches the left button in name and action; keyboard and screen reader users only ever take the menu, so a missing item means a missing action. */
function HistoryActions(
  { busy, onRefresh, onImport, onImportBookmarks }:
  { busy: boolean; onRefresh(): void; onImport(): void; onImportBookmarks(): void },
) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = (act: () => void) => { setOpen(false); act() };
  return (
    <>
      <span data-guide-target="history-import" data-button-group data-split-button data-variant="primary">
        <Button leadingIcon={RiCompassLine} title={REFRESH_TITLE} onClick={onRefresh} {...busyProps(busy)}>
          Read browser history
        </Button>
        <Button ref={trigger} iconOnly leadingIcon={RiArrowDownSLine}
          aria-label="More ways to obtain browsing data" aria-haspopup="dialog" aria-expanded={open}
          {...busyProps(busy)} onClick={() => { if (!busy) setOpen(true) }} />
      </span>
      <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen}
        placement="bottom end" offset={4} className={MENU_POPOVER_SURFACE}>
        <Dialog aria-label="More ways to obtain browsing data" className="flex w-52 flex-col gap-1 outline-none">
          <button type="button" className={MENU_ROW} onClick={() => pick(onRefresh)}>
            <RiCompassLine aria-hidden className="size-4 shrink-0" />Read browser history
          </button>
          <button type="button" className={MENU_ROW} onClick={() => pick(onImport)}>
            <RiUploadLine aria-hidden className="size-4 shrink-0" />Import history file
          </button>
          <button type="button" className={MENU_ROW} onClick={() => pick(onImportBookmarks)}>
            <RiBookmarkLine aria-hidden className="size-4 shrink-0" />Import bookmarks file
          </button>
        </Dialog>
      </Popover>
    </>
  );
}

/** Collected devices. Removal affects analysis only; the original export files stay on this machine. */
function SourceList(
  { sources, browsers, window: range, toast, emptyActions }:
  { sources: NonNullable<TasteData['sources']>; browsers: NonNullable<TasteData['browsers']>; window: string; emptyActions: ReactNode } & Pick<TasteProps, 'toast'>,
) {
  const remove = useMutation({
    mutationFn: (sourceKey: string) => removeTasteSource(sourceKey, range),
    onSuccess: (result) => {
      // The server returns the new dashboard for this range along with it; swap it into the cache instead of refetching the whole page over one removal.
      queryClient.setQueryData(tasteKey(range), result.dashboard);
      toast('Removed the taste data source');
    },
  });
  return (
    <BrowserSources browsers={browsers} sources={sources} range={range}>
      {remove.error ? <div className="sm:col-span-2"><Note tone="error">{errorMessage(remove.error)}</Note></div> : null}
      {sources.length ? (
        <>
          {sources.filter(source => !browsers.some(browser => browser.source_keys?.includes(source.source_key))).map((source) => (
            <div key={source.source_key} data-taste-source="import"
              className={SOURCE_TILE}>
              <span className="inline-grid size-8 shrink-0 place-items-center rounded-lg text-text-secondary">
                {source.browser === 'browserexport'
                  ? <RiUploadLine aria-hidden className="size-4" />
                  : <RiDatabase2Line aria-hidden className="size-4" />}
              </span>
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <b className="min-w-0 text-body-2-medium break-words text-text-primary">{source.profile}</b>
                <small className="min-w-0 text-caption-1-regular break-words text-text-secondary">
                  {`Import files · ${source.host} · ${Number(source.visits || source.bookmarks || 0).toLocaleString()} ${source.bookmarks ? 'bookmarks' : 'history entries'}`}
                </small>
              </span>
              <Button variant="secondary" size="small" aria-label={`Remove ${source.profile}`} className="shrink-0"
                iconOnly leadingIcon={RiDeleteBinLine} {...busyProps(remove.isPending)}
                onClick={() => {
                  if (remove.isPending) return;
                  void confirmModal({
                    title: 'Remove taste data source', body: REMOVE_BODY, confirmLabel: 'Remove taste data source',
                    onConfirm: () => remove.mutateAsync(source.source_key),
                  });
                }} />
            </div>
          ))}
        </>
      ) : !browsers.length ? <EmptyState size="compact" icon={RiDatabase2Line} title="No data sources yet"
        actions={emptyActions}>{NO_SOURCE_HINT}</EmptyState> : null}
    </BrowserSources>
  );
}

export function TastePage(props: TasteProps) {
  const { onSignal, navigate, toast, onboarding } = props;
  const [range, setRange] = useState(DEFAULT_WINDOW);
  const [evidence, setEvidence] = useState('browser');
  const file = useRef<HTMLInputElement>(null);
  const bookmarkFile = useRef<HTMLInputElement>(null);

  const taste = useQuery({
    queryKey: tasteKey(range),
    queryFn: ({ signal }) => fetchTaste(range, signal),
    /* Keep the previous one when the scope changes: this screen's structure stays, only the numbers change. Falling back to a skeleton takes what was already read
       away and puts it back, and the server-side cache usually returns immediately anyway. */
    placeholderData: keepPreviousData,
    refetchInterval: (query) => tasteRefetchInterval(query.state.data),
  });
  const { job, running, outcome, start: refresh } = useBackgroundJob<TasteJob>({
    queryKey: TASTE_REFRESH_KEY,
    queryFn: ({ signal }) => fetchTasteJob(signal),
    start: () => startTasteRefresh(range),
    /* The read can start from the onboarding page or the previous session, and polls occasionally while idle. */
    idlePollMs: IDLE_POLL_MS,
    onFinish: (state) => {
      if (state.status === 'failed') return;
      void queryClient.invalidateQueries({ queryKey: ['taste'] });
      toast(state.warnings?.length ? 'Some browsing history unavailable' : 'Taste analysis updated');
    },
  });
  /* After a failed recompute the server holds off and the page stops polling. "Retry now" makes the server skip the wait and compute once more; the response
     is swapped into the cache of its scope: a finished one is the new result, a still-running one keeps polling with `stale`. */
  const retry = useMutation({
    mutationFn: (window: string) => fetchTaste(window, undefined, true),
    onSuccess: (result, window) => { queryClient.setQueryData(tasteKey(window), result) },
  });
  const load = useMutation({
    mutationFn: (chosen: File) => importTasteExport(chosen),
    onSuccess: (result) => {
      /* What the server returns is the "all time" copy, and the page switches over to it: freshly imported records mostly fall outside the current
         window, and staying on the old range would show a result with no change at all. Swap it into the cache before switching the range;
         in the reverse order, "all time" would still be empty at the moment of switching, the page would fire another request for it,
         and the returning copy would overwrite the one just swapped in. */
      queryClient.setQueryData(tasteKey('all'), result.dashboard);
      setRange('all');
      toast('Taste data imported');
    },
  });

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!chosen || load.isPending) return;
    load.reset();
    load.mutate(chosen);
  };
  const startRefresh = () => {
    if (running || refresh.isPending) return;
    refresh.reset();
    refresh.mutate();
  };

  const data = taste.data;
  if (!data) {
    return (
      <Page>
        <Note tone="error" title="Reading taste analysis failed">
          {taste.error ? errorMessage(taste.error) : 'Reading taste analysis failed'}
        </Note>
      </Page>
    );
  }
  const summary = data.summary || {};
  const coverage = data.coverage || {};
  const rank = data.rankings || {};
  const storage = data.storage || {};
  const categories = tasteDimensions(rank.browser_categories || []);
  const radar = radarRows(categories).length > 0;
  const gaps = data.gaps || [];
  const tagged = coverage.tagged || 0;
  const identified = coverage.identified || 0;
  const problem = refresh.error ? errorMessage(refresh.error)
    : load.error ? errorMessage(load.error)
    : retry.error ? errorMessage(retry.error)
    : outcome?.status === 'failed' ? (outcome.error || 'Read not fetched')
    : '';

  const browserActions = <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" {...busyProps(running || refresh.isPending || load.isPending)} onClick={startRefresh}>Read browser history</Button>
            <Button variant="secondary" {...busyProps(load.isPending)} onClick={() => file.current?.click()}>Import history file</Button>
          </div>;
  return (
    <Page>
      <TasteEmptyAction value={range !== DEFAULT_WINDOW
        ? <Button size="small" variant="secondary" onClick={() => setRange(DEFAULT_WINDOW)}>View all time</Button>
        : evidence === 'peach' ? <ButtonLink size="small" variant="secondary" href="/">Browse library</ButtonLink> : browserActions}>
      <Tabs selectedKey={evidence} onSelectionChange={(key) => setEvidence(String(key))}
        className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Old `.insightswitch`: the evidence came from two mutually exclusive views, shaped as a segmented control rather than two bare buttons. */}
          <TabList aria-label="Data sources for taste analysis" className={SEGMENTED_TRACK}>
            <Tab id="peach" className={SEGMENT}>Peach watches and ratings</Tab>
            <Tab id="browser" className={SEGMENT}>Browser history</Tab>
          </TabList>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Analysis range" selectedKey={range}
              onSelectionChange={(key) => { if (key !== null) setRange(String(key)) }}>
              {TASTE_WINDOWS.map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
            </Select>
            <HistoryActions busy={running || refresh.isPending || load.isPending}
              onRefresh={startRefresh} onImport={() => file.current?.click()}
              onImportBookmarks={() => bookmarkFile.current?.click()} />
            {/* The native file picker's look is not controllable: the button is BoardUI's, and the input remains only to receive files. */}
            <input ref={file} type="file" tabIndex={-1} aria-hidden className="hidden"
              onChange={pickFile} />
            <input ref={bookmarkFile} type="file" tabIndex={-1} aria-hidden className="hidden"
              data-bookmark-import onChange={pickFile} />
          </div>
        </div>
        <HistoryGuide onboarding={onboarding}
          done={!!(summary.history_sources || data.updated_at)} />
        {/* This run keeps going in the background after the page closes, so its state lives on the page instead of just spinning a button. */}
        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {running ? <TaskProgress label={job?.message || 'Reading browsing data and updating taste analysis'}
            value={job?.checked} total={job?.total} /> : null}
          {load.isPending ? <TaskProgress label="Importing taste data" /> : null}
          {data.stale && data.error ? (
            <Note tone="error" action={<Button variant="secondary" size="small"
              {...busyProps(retry.isPending)} onClick={() => retry.mutate(range)}>Retry now</Button>}>
              {`Taste analysis update failed; showing the result from ${tasteTime(data.computed_at)}. ${data.error}`}
            </Note>
          ) : data.stale ? <TaskProgress label={`Updating taste analysis, currently showing results from ${tasteTime(data.computed_at)}`} /> : null}
          {problem ? <Note tone="error">{problem}</Note> : null}
          {outcome?.warnings?.length ? <Note tone="warning">{outcome.warnings.join('; ')}</Note> : null}
        </div>
        <TabPanel id="browser" className="flex flex-col gap-5">
          <div className={STAT_STRIP}>
            <SummaryCard accent={0} icon={RiHistoryLine} term="Browsing data"
              figure={Number(summary.history_visits || 0).toLocaleString()}
              detail={historySpan(summary)} detailTitle={`${tasteDate(summary.range_start)}—${tasteDate(summary.range_end)}`} />
            <SummaryCard accent={1} icon={RiPriceTag3Line} term="Taste dimensions"
              figure={categories.length.toLocaleString()} detail={categories[0]?.name || 'No main dimension yet'} />
            <SummaryCard accent={2} icon={RiSearchLine} term="Browsing leads" figure={gaps.length.toLocaleString()} />
            <SummaryCard accent={3} icon={RiBookmarkLine} term="Browser bookmarks"
              figure={Number(summary.bookmarks || 0).toLocaleString()}
              detail={`${Number(storage.exports || 0).toLocaleString()} private exports - ${fmtSize(storage.bytes || 0)}`} />
          </div>
          {/* Fewer than three dimensions cannot draw a radar: the left column keeps only the title and update time, and the ranking bar takes the whole card. */}
          <section className={radar ? `${CARD} md:flex-row md:gap-6` : CARD} aria-label="Browser profile">
            <div className={radar
              ? 'flex shrink-0 flex-col gap-2 pb-5 md:w-80 md:pr-6 md:pb-0'
              : 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'}>
              <span className="text-caption-1-regular text-text-secondary">Browser profile</span>
              {radar ? <TasteRadar rows={categories} label="Main taste dimensions" /> : null}
              <small className="text-caption-1-regular text-text-secondary">
                {data.updated_at ? `Updated ${tasteDate(data.updated_at)}` : 'Browsing data not collected yet'}
              </small>
            </div>
            {/* The right column matches the radar column's height (the default inline stretch), and the ranking bars fill this column in the vertical flex. */}
            <div className="flex min-w-0 grow flex-col">
              {categories.length
                ? <RankedBars rows={categories} label="Taste dimension ranking" />
                : <EmptyState size="compact" icon={RiSearchLine} title="No taste dimensions yet"
                  actions={<TasteRecordActions />}>{NO_CATEGORY_HINT}</EmptyState>}
            </div>
          </section>
          <ActivityHeat activity={data.activity} title="'Browsing activity times'" dailyTitle="Daily activity"
            words={{ unit: 'Taste site visits', series: 'Access', cellUnit: 'visits' }} tone={4}
            empty="No taste-analyzable site visits yet." />
          <CreatorSankey flows={data.creator_flows} />
          <DimensionPanels label="Browser taste dimensions" onSignal={onSignal}
            panels={[
              { id: 'tags', name: 'Tags', props: { rows: rank.browser_tags || [], kind: 'tag', visual: 'none', empty: NO_BROWSER_TAG_HINT } },
              { id: 'creators', name: 'Creators', props: { rows: rank.browser_creators || [], kind: 'creator', visual: 'creator', empty: NO_BROWSER_CREATOR_HINT } },
              { id: 'performers', name: 'Performers', props: { rows: rank.browser_performers || [], kind: 'performer', visual: 'entity', empty: 'No browsing records linked to archived performers yet.' } },
              { id: 'domains', name: 'Frequently visited sites', props: { rows: rank.domains || [], kind: '', visual: 'domain', empty: NO_DOMAIN_HINT } },
              { id: 'gaps', name: 'Browsing leads', props: { rows: gaps, kind: '', visual: 'none', empty: GAP_HINT } },
            ]} />
        </TabPanel>
        <TabPanel id="peach" className="flex flex-col gap-5">
          <div className={STAT_STRIP}>
            <SummaryCard accent={0} icon={RiEyeLine} term="Peach watched"
              figure={Number(summary.peach_items || 0).toLocaleString()}
              detail={tasteHours(summary.peach_seconds || 0)} />
            <SummaryCard accent={1} icon={RiThumbUpLine} term="Favorites" figure={Number(summary.liked || 0).toLocaleString()} />
            <SummaryCard accent={2} icon={RiThumbDownLine} term="Not my taste" figure={Number(summary.disliked || 0).toLocaleString()} />
            <SummaryCard accent={3} icon={RiPriceTag3Line} term="Has tags" figure={tagged.toLocaleString()} />
          </div>
          <section className={`${CARD} md:flex-row md:gap-6`} aria-label="Peach plays">
            <div className="flex shrink-0 flex-col gap-0.5 pb-5 md:w-72 md:pr-6 md:pb-0">
              <span className="text-caption-1-regular text-text-secondary">Peach plays</span>
              <b className="text-display-4-medium tabular-nums text-text-primary">
                {Number(summary.peach_items || 0).toLocaleString()}
              </b>
              <span className="text-body-2-regular text-text-secondary"> videos have watch or rating records</span>
            </div>
            <div className="flex min-w-0 grow flex-col">
              <CoverageMetric term="Has tags" value={tagged} rest={coverage.untagged || 0} />
              <CoverageMetric term="Has identity" value={identified} rest={coverage.unidentified || 0} />
            </div>
          </section>
          <DimensionPanels label="Peach taste dimensions" onSignal={onSignal}
            panels={[
              { id: 'tags', name: 'Tags', props: { rows: rank.peach_tags || [], kind: 'tag', visual: 'none', empty: NO_PEACH_TAG_HINT } },
              { id: 'creators', name: 'Creators', props: { rows: rank.peach_creators || [], kind: 'creator', visual: 'creator', empty: NO_PEACH_CREATOR_HINT } },
              { id: 'performers', name: 'Performers', props: { rows: rank.peach_performers || [], kind: 'performer', visual: 'entity', empty: NO_PEACH_PERFORMER_HINT } },
            ]} />
        </TabPanel>
      </Tabs>
      <AnalysisCard data={data} onSignal={onSignal} navigate={navigate} />
      <SourceList sources={data.sources || []} browsers={data.browsers || []} window={range} toast={toast} emptyActions={browserActions} />
      </TasteEmptyAction>
    </Page>
  );
}

/** One coverage figure: the numbers, the backfill count and the bar all share the same numerator and denominator. */
function CoverageMetric({ term, value, rest }: { term: string; value: number; rest: number }) {
  const total = Math.max(value + rest, 1);
  return (
    <div className="flex flex-col gap-1.5 border-b border-separator-border py-3 last:border-b-0">
      <p className="flex items-baseline justify-between gap-3 text-body-2-regular text-text-primary">
        <span>{term}</span>
        <b className="tabular-nums">
          {value.toLocaleString()}
          <span className="ml-1.5 text-caption-1-regular text-text-secondary">{`${rest.toLocaleString()} items to backfill`}</span>
        </b>
      </p>
      <Progress meter label={`${term}：${value.toLocaleString()} / ${total.toLocaleString()}`}
        value={value} max={total} />
    </div>
  );
}
