/* Stats page: what the database looks like right now.
 *
 * One screen answers two layers. The four cards on top are readouts and tabs at once: library, watched, content tags, storage;
 * clicking one expands that layer's details below; the block below that is arranged by dimension: content tag ranking,
 * recently watched, tag sources. The four cards double as tabs because the page has no other primary action; the readouts
 * themselves are the entry.
 *
 * Tabs use React Aria's `Tabs`: `role=tablist`/`tab`/`tabpanel`, left/right arrow keys and roving `tabindex` all come from
 * it; the registry's `tabs` entry is page-level navigation, not this kind of same-page sectioning.
 * Size and source names share the basis of `src/core/index.ts`; tags' display names are passed in by the legacy layer's
 * `tagLabel`. */
import {
  RiDatabase2Line, RiEyeLine, RiHardDrive2Line, RiHistoryLine, RiPriceTag3Line, RiVideoLine,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';

import { fmtSize, LOC } from '@peach/legacy/core';
import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';

import { settingsPath } from '@peach/history';
import { ButtonLink } from '@/components/base/buttons/button';

import { errorMessage } from '../../api';
import type { StatsProps } from '../bundle';
import { BarCard } from '../charts/bar-card';
import { CHART_COLORS } from '../charts/chart-card';
import { ActivityHeat } from '../charts/heat-card';
import { cardClass } from '../components/card';
import { EmptyState } from '../components/empty-state';
import { ExpandableRanking } from '../components/expandable-ranking';
import { Note } from '../components/note';
import { ConnectionStatus } from '../components/connection-status';
import { StatusLabel } from '../components/status-label';
import { Page } from '../components/page';
import { Progress } from '../components/progress';
import { SEGMENT, SEGMENTED_TRACK, SegmentedTabList } from '../components/segmented';
import { StatCard, statCardClass, STAT_STRIP } from '../components/stat-card';
import { RadialCard } from './radial-card';
import {
  bandRows, fetchStats, fmtCount, known, lengthRows, mediumRows, percentText, playedFor, playedItemUrl,
  reachedShare, replayRows, STATS_KEY, watchedShare, watchNote,
  type Attribution, type Count, type RecentPlay, type StatsData, type StorageVolume, type TagSource, type TopTag,
} from './stats';

/** The settings section 'Add media' goes to when the library is empty or no storage source exists. */
const MEDIA_SETTINGS = settingsPath('Library and imports');

/** This many ranking rows show when collapsed. Laying out thirty at once pushes the two panels below entirely off screen. */
const RANKING_PREVIEW = 10;

/** Chart colors follow the accent of the stat card above: library is `chart-6`, watched is `chart-5` (`StatCard`'s `accent`). */
const INVENTORY_COLOR = CHART_COLORS[5];
const VIEWING_COLOR = CHART_COLORS[4];

const CARD = `${cardClass()} flex flex-col gap-4`;

const NO_VIDEO_HINT = 'After adding media folders or follow sources, library stats show here.';
const NO_TAG_HINT = 'After completing details or adding tags, the library\'s content tags show here.';
const NO_WATCH_HINT = 'After playback starts, the latest real viewing evidence appears here.';
const NO_TAG_SOURCE_HINT = 'After video details are filled in or tags are added by hand, this shows the video count for each tag source.';
const NO_VOLUME_HINT = 'After adding media folders, storage shows here.';
const NO_LIBRARY_HINT = 'Once media folders join libraries, this shows video counts per library.';
const NO_LENGTH_HINT = 'After durations are probed, the duration distribution shows here.';
const NO_QUALITY_HINT = 'After quality is probed, the quality distribution shows here.';
const NO_PLAY_TIME_HINT = 'Once playback starts, this shows which weekday hours your plays land in.';
const NO_REPLAY_HINT = 'Once playback starts, this shows how many times each video played.';

/** The progress bar's reading: drawn full when it exceeds the total, and the screen-reader value never passes the cap either. */
const within = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/** One fact cell: a name paired with a number. The surface takes the overlay tier (the old `.insightfacts .kv`'s `--surface`),
 *  one step brighter than the card face. */
function Fact({ term, value }: { term: string; value: Count }) {
  return (
    <div className="flex min-h-16 min-w-0 flex-col gap-1.5 rounded-2lg bg-background-primary-default p-3">
      <span className="text-caption-1-regular text-text-secondary">{term}</span>
      <b className="text-title-3-medium tabular-nums text-text-primary">{fmtCount(value)}</b>
    </div>
  );
}

/** One coverage row with progress: the reading, the percentage, and the bar share the same numerator and denominator. */
function Coverage({ term, value, total }: { term: string; value: Count; total: number }) {
  const max = Math.max(total, 1);
  return (
    <div className="flex flex-col gap-1.5 border-b border-separator-border py-3 last:border-b-0">
      <p className="flex items-baseline justify-between gap-3 text-body-2-regular text-text-primary">
        <span>{term}</span>
        <b className="tabular-nums">
          {fmtCount(value)}
          {known(value)
            ? <span className="ml-1.5 text-caption-1-regular text-text-secondary">{percentText(value, total)}</span>
            : null}
        </b>
      </p>
      <Progress meter label={`${term}: ${fmtCount(value)} / ${total.toLocaleString()}`}
        value={known(value) ? within(value, max) : 0} max={max} />
    </div>
  );
}

/** The details cell's left column: one category line, one big number, one line of its unit.
 *
 * No line is drawn between the two columns: the old `board.css` specifically zeroes `.insightcopy`'s `border-right` to `border:0`;
 * another cut inside an already filled card just looks like two cards squeezed together. */
function Headline({ term, figure, unit }: { term: string; figure: string; unit: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 pb-5 md:w-64 md:pr-6 md:pb-0">
      <span className="text-caption-1-regular text-text-secondary">{term}</span>
      <b className="text-display-4-medium tabular-nums text-text-primary">{figure}</b>
      <span className="text-body-2-regular text-text-secondary">{unit}</span>
    </div>
  );
}

/** The details cell: a reading on the left, its expansion on the right. */
function Detail({ headline, children }: { headline: ReactNode; children: ReactNode }) {
  return (
    <div className={`${CARD} md:flex-row md:gap-6`}>
      {headline}
      <div className="min-w-0 grow">{children}</div>
    </div>
  );
}

function InventoryDetail({ data }: { data: StatsData } & StatsProps) {
  const videos = data.by_loc.reduce((sum, row) => sum + row.videos, 0);
  if (!videos) {
    return (
      <EmptyState icon={RiVideoLine} title="No videos yet" actions={
        <>
          <ButtonLink variant="secondary" href="/subscriptions?tab=add" size="small">Add follows</ButtonLink>
          <ButtonLink variant="primary" href={MEDIA_SETTINGS} size="small">Add media</ButtonLink>
        </>
      }>{NO_VIDEO_HINT}</EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="inline-grid w-full gap-5 md:grid-cols-2">
        <RadialCard title="Cloud drive and local" empty={NO_VIDEO_HINT} rows={data.by_loc.map((row) => (
          { name: LOC[row.k] ?? row.k, value: row.videos, bytes: row.bytes, mark: MEDIA_SOURCE_ICONS[row.k] || 'database' }))} />
        <RadialCard title="Media library" empty={NO_LIBRARY_HINT} rows={data.by_library.map((row) => (
          { name: row.name, value: row.videos, bytes: row.bytes, mark: MEDIA_SOURCE_ICONS[row.icon] || row.icon || 'database' }))} />
      </div>
      <div className="inline-grid w-full gap-5 md:grid-cols-2 xl:grid-cols-3">
        <BarCard title="Duration" unit="videos" series="Videos" color={INVENTORY_COLOR}
          rows={lengthRows(data.by_length)} empty={NO_LENGTH_HINT} />
        <BarCard title="Quality" unit="videos" series="Videos" color={INVENTORY_COLOR}
          rows={bandRows(data.by_quality)} empty={NO_QUALITY_HINT} />
        <BarCard title="File types" unit="items" series="Entries" color={INVENTORY_COLOR} layout="horizontal"
          rows={mediumRows(data.by_medium)} empty={NO_VIDEO_HINT} />
      </div>
    </div>
  );
}

/** The watched layer's chart: when the most recent playback happened, and how many times each video played. */
function ViewingCharts({ data }: { data: StatsData }) {
  return (
    <>
      <ActivityHeat activity={data.play_activity} title="Play time" dailyTitle="Daily plays"
        words={{ unit: 'videos', series: 'Videos', cellUnit: 'videos' }} tone={5} empty={NO_PLAY_TIME_HINT} />
      <BarCard title="Play counts" unit="videos" series="Videos" color={VIEWING_COLOR}
        rows={replayRows(data.replays)} empty={NO_REPLAY_HINT} />
    </>
  );
}

function CoverageDetail({ attribution }: { attribution: Attribution }) {
  const videos = attribution.videos;
  return (
    <div className="flex flex-col">
      <Coverage term="With creators" value={attribution.creator} total={videos} />
      <Coverage term="Has code" value={attribution.code} total={videos} />
      <Coverage term="Has label" value={attribution.studio} total={videos} />
      <Coverage term="Frames extracted" value={attribution.thumb} total={videos} />
      <Coverage term="Duration probed" value={attribution.duration} total={videos} />
    </div>
  );
}

/** One row per volume, in the same rhythm as the coverage list: the name with used space and share, a progress bar under it, and a small line below
 *  saying where it is mounted and how much is left. Volumes with no readable capacity draw no progress; the readout cell takes their state instead. */
function VolumeRow({ volume }: { volume: StorageVolume }) {
  const total = volume.total;
  const used = volume.used ?? 0;
  return (
    <article className="flex min-w-0 flex-col gap-1.5 border-b border-separator-border py-3 last:border-b-0">
      <header className="flex items-baseline justify-between gap-3 text-body-2-regular text-text-primary">
        <h3 className="min-w-0 break-words">{volume.label}</h3>
        {total != null ? (
          <b className="whitespace-nowrap tabular-nums">
            {fmtSize(used)}
            <span className="ml-1.5 text-caption-1-regular text-text-secondary">{percentText(used, total)}</span>
          </b>
        ) : volume.online ? <StatusLabel>Capacity not fetched</StatusLabel> : <ConnectionStatus online={false} />}
      </header>
      {total != null
        ? <Progress meter label={`${volume.label} space usage`} value={within(used, Math.max(total, 1))} max={Math.max(total, 1)} />
        : null}
      <p className="flex justify-between gap-3 text-caption-1-regular text-text-secondary">
        <span className="min-w-0 break-words">{volume.root ?? 'Unmapped'}</span>
        {total != null
          ? <span className="whitespace-nowrap tabular-nums">{`${fmtSize(volume.free ?? 0)} free · ${fmtSize(total)} total`}</span>
          : null}
      </p>
    </article>
  );
}

function StorageDetail({ volumes }: { volumes: StorageVolume[] } & StatsProps) {
  if (!volumes.length) {
    return (
      <EmptyState icon={RiHardDrive2Line} title="No storage sources yet" actions={
        <ButtonLink variant="primary" href={MEDIA_SETTINGS} size="small">Add media</ButtonLink>
      }>{NO_VOLUME_HINT}</EmptyState>
    );
  }
  return (
    <div className="flex flex-col">
      {volumes.map((volume) => <VolumeRow key={`${volume.kind}:${volume.label}`} volume={volume} />)}
    </div>
  );
}

function TagRanking({ tags, tagLabel, onTag, hasMedia }: { tags: TopTag[]; hasMedia: boolean } & StatsProps) {
  if (!tags.length) {
    return (
      <EmptyState icon={RiPriceTag3Line} title="No content tags yet"
        actions={<ButtonLink variant="secondary" href={hasMedia ? '/data-cleanup' : '/settings/library'} size="small">{hasMedia ? 'Complete details' : 'Add media'}</ButtonLink>}>{NO_TAG_HINT}</EmptyState>
    );
  }
  return (
    <ExpandableRanking previewCount={RANKING_PREVIEW}
      className="inline-grid w-full gap-x-6 gap-y-1 sm:grid-cols-2">
        {tags.map((tag, index) => (
          <li key={`${tag.k}:${index}`} className="min-w-0">
            <button type="button" onClick={() => onTag(tag.k)}
              className="flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
              <span className="w-6 shrink-0 text-caption-1-regular tabular-nums text-text-secondary">{index + 1}</span>
              <span className="min-w-0 grow text-body-2-regular break-words text-text-primary">{tagLabel(tag.k)}</span>
              <b className="text-body-2-medium tabular-nums text-text-secondary">{tag.n.toLocaleString()}</b>
            </button>
          </li>
        ))}
    </ExpandableRanking>
  );
}

function RecentWatches({ rows, hasMedia }: { rows: RecentPlay[]; hasMedia: boolean }) {
  if (!rows.length) {
    return (
      <EmptyState icon={RiHistoryLine} title="No watch history yet"
        actions={<ButtonLink variant="secondary" href={hasMedia ? '/' : '/settings/library'} size="small">{hasMedia ? 'Browse library' : 'Add media'}</ButtonLink>}>{NO_WATCH_HINT}</EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {rows.map((row) => {
        const real = watchedShare(row);
        return (
          <article key={`${row.kind}:${row.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-0 grow basis-64">
              <h3 className="min-w-0 text-body-2-medium text-text-primary">
                <a href={playedItemUrl(row)} data-middle-truncate
                  className="block max-w-full overflow-hidden whitespace-nowrap hover:underline">{row.name}</a>
              </h3>
              <p className="flex flex-wrap gap-3 text-caption-1-regular text-text-secondary">
                {row.creator ? <span className="min-w-0 wrap-anywhere">{row.creator}</span> : null}
                <span>{watchNote(row)}</span>
              </p>
            </div>
            <div className="min-w-0 basis-40">
              <Progress meter label={`Actually watched ${real.toFixed(0)}%`} value={real} />
              <small className="mt-1.5 block text-caption-1-regular text-text-secondary">
                {`Actual ${real.toFixed(0)}% · reached ${reachedShare(row).toFixed(0)}%`}
              </small>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TagSources({ sources, videos }: { sources: TagSource[]; videos: number }) {
  if (!sources.length) {
    return (
      <EmptyState icon={RiPriceTag3Line} title="No tag sources yet"
        actions={<ButtonLink variant="secondary" href={videos ? '/data-cleanup' : '/settings/library'} size="small">{videos ? 'Complete details' : 'Add media'}</ButtonLink>}>{NO_TAG_SOURCE_HINT}</EmptyState>
    );
  }
  return (
    <div className="inline-grid w-full gap-x-8 gap-y-6 sm:grid-cols-2">
      {sources.map((source) => (
        <article key={source.k} className="flex min-w-0 flex-col gap-1.5">
          <header className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 text-body-2-medium break-words text-text-primary">{source.k}</h3>
            <b className="text-body-2-medium whitespace-nowrap text-text-primary">
              {source.assets.toLocaleString()}
              <small className="ml-1 text-caption-1-regular font-normal text-text-secondary">videos</small>
            </b>
          </header>
          <Progress meter label={`${source.k} covers videos`} value={within(source.assets, Math.max(videos, 1))}
            max={Math.max(videos, 1)} />
          <small className="text-caption-1-regular text-text-secondary">{source.n.toLocaleString()} tags</small>
        </article>
      ))}
    </div>
  );
}

/** A card that is both a stat and a tab. The selected state swaps the card face tier and adds a 2px inner ring, without bolding or recoloring the text. */
function MetricTab(
  { id, label, figure, detail, icon: Icon, accent }:
  { id: string; label: string; figure: string; detail: string; icon: typeof RiEyeLine; accent: number },
) {
  return (
    <Tab id={id} className={statCardClass({ interactive: true, selectable: true })}>
      <StatCard label={label} icon={Icon} accent={accent} figure={figure} footer={detail} />
    </Tab>
  );
}

export function StatsPage(props: StatsProps) {
  const stats = useQuery({ queryKey: STATS_KEY, queryFn: ({ signal }) => fetchStats(signal) });
  const data = stats.data;
  if (!data) {
    return (
      <Page>
        <Note tone="error" title="Reading library stats failed">{stats.error ? errorMessage(stats.error) : 'Stats could not be fetched; refresh the page and retry.'}</Note>
      </Page>
    );
  }
  const consumption = data.consumption;
  const storage = data.storage_summary;
  const videos = data.by_loc.reduce((sum, row) => sum + row.videos, 0);
  const bytes = data.by_loc.reduce((sum, row) => sum + row.bytes, 0);
  const coverage = known(data.tag_cov) ? percentText(data.tag_cov, data.attribution.videos) : 'Not fetched';
  const covered = `${fmtCount(data.tag_cov)} / ${data.attribution.videos.toLocaleString()}`;
  return (
    <Page>
      <Tabs defaultSelectedKey="inventory" className="flex flex-col gap-4">
        <TabList aria-label="Stats view" className={STAT_STRIP}>
          <MetricTab id="inventory" label="Library videos" icon={RiDatabase2Line} accent={0}
            figure={videos.toLocaleString()} detail={fmtSize(bytes)} />
          <MetricTab id="viewing" label="Watched" icon={RiEyeLine} accent={1}
            figure={fmtCount(consumption.played)} detail={playedFor(consumption.play_seconds)} />
          <MetricTab id="coverage" label="Content tags" icon={RiPriceTag3Line} accent={2}
            figure={coverage} detail={covered} />
          <MetricTab id="storage" label="Space usage" icon={RiHardDrive2Line} accent={3}
            figure={`${storage.online.toLocaleString()} ${storage.online === 1 ? 'volume' : 'volumes'}`}
            detail={storage.measured ? `${fmtSize(storage.used)} used` : 'Capacity not fetched'} />
        </TabList>
        <TabPanel id="inventory"><InventoryDetail data={data} {...props} /></TabPanel>
        <TabPanel id="viewing" className="flex flex-col gap-5">
          <Detail headline={<Headline term="Plays" figure={fmtCount(consumption.played)} unit="videos have play records" />}>
            <div className="inline-grid w-full gap-3 sm:grid-cols-2">
              <Fact term="Library watches" value={consumption.library_played} />
              <Fact term="Watch online directly" value={consumption.online_played} />
              <Fact term="Climax counts" value={consumption.o_total} />
              <Fact term="Seek-skipped" value={consumption.skimmed} />
              <Fact term="Favorites" value={consumption.liked} />
              <Fact term="Explicit dislikes" value={consumption.dislike} />
              <Fact term="Watched" value={consumption.seen} />
              <Fact term="Trash" value={consumption.trash} />
            </div>
          </Detail>
          <ViewingCharts data={data} />
        </TabPanel>
        <TabPanel id="coverage">
          <Detail headline={<Headline term="Content tag coverage" figure={coverage} unit={covered} />}>
            <CoverageDetail attribution={data.attribution} />
          </Detail>
        </TabPanel>
        <TabPanel id="storage">
          <Detail headline={<Headline term="Space usage" figure={storage.measured.toLocaleString()}
            unit={` ${storage.measured === 1 ? 'volume has' : 'volumes have'} capacity fetched`} />}>
            <StorageDetail volumes={data.storage_volumes} {...props} />
          </Detail>
        </TabPanel>
      </Tabs>
      {/* Old `.insightpanel`: the whole block was one filled card with 16px radius, and the tabs were the segmented control at the top of the card. */}
      <Tabs defaultSelectedKey="tags" className={`${cardClass({ padding: 'none' })} flex flex-col`}>
        <div className="px-4 pt-3">
          <SegmentedTabList aria-label="Stats dimensions" className={SEGMENTED_TRACK}>
            <Tab id="tags" className={SEGMENT}>Content tags</Tab>
            <Tab id="recent" className={SEGMENT}>Recently watched</Tab>
            <Tab id="sources" className={SEGMENT}>Tag sources</Tab>
          </SegmentedTabList>
        </div>
        <TabPanel id="tags" className="px-4 pt-3.5 pb-4"><TagRanking tags={data.top_tags} hasMedia={videos > 0} {...props} /></TabPanel>
        <TabPanel id="recent" className="px-4 pt-3.5 pb-4"><RecentWatches rows={data.recent} hasMedia={videos > 0} /></TabPanel>
        <TabPanel id="sources" className="px-4 pt-3.5 pb-4">
          <TagSources sources={data.tag_source} videos={data.attribution.videos} />
        </TabPanel>
      </Tabs>
    </Page>
  );
}
