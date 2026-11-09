/* The two charts of the "Storage" stats result: how much each data category takes in the data directory, and how much Peach
 * takes of the whole disk.
 *
 * The two charts answer different wholes, so they are drawn separately with their own totals. Per-category shares use
 * EvilCharts' donut chart with the total in the middle; the disk uses EvilCharts' horizontal percent-stacked bar, one bar in
 * three segments: Peach, other files on the disk, free. Color follows the category, not the rank: when one category shrinks
 * after cleanup its color stays. There are only nine chart colors; logs, login state and "other" are usually the smallest and
 * merge into the gray "rest" on the chart while the list still lists them one by one.
 * Differences registered in `../evilcharts/ORIGIN.md`. */
import { fmtSize } from '@peach/legacy/core';

import { EvilBarChart } from '@/registry/charts/recharts-bar-chart';
import { EvilPieChart } from '@/registry/charts/recharts-pie-chart';
import type { ChartConfig } from '@/registry/ui/recharts-chart';

import type { StorageCategory, StorageState } from '../bundle';
import { tone } from '../charts/chart-card';
import { ChartTip, TIP_SWATCH } from '../charts/chart-tip';

/** Each category gets a fixed chart color; anything not in the table merges into "Other". */
const CATEGORY_COLORS: Record<string, string> = {
  database: 'var(--color-chart-1)', backups: 'var(--color-chart-2)', playback: 'var(--color-chart-3)',
  thumbnails: 'var(--color-chart-4)', previews: 'var(--color-chart-5)', downloads: 'var(--color-chart-6)',
  sources: 'var(--color-chart-7)', records: 'var(--color-chart-8)', tools: 'var(--color-chart-9)',
};
const REST_COLOR = 'var(--color-text-tertiary)';

/** The color chip's class name in the list, matching the chart's color. The class is written as a full string so Tailwind can scan it. */
export const CATEGORY_SWATCH: Record<string, string> = {
  database: 'bg-chart-1', backups: 'bg-chart-2', playback: 'bg-chart-3', thumbnails: 'bg-chart-4',
  previews: 'bg-chart-5', downloads: 'bg-chart-6', sources: 'bg-chart-7', records: 'bg-chart-8',
  tools: 'bg-chart-9',
};
export const REST_SWATCH = 'bg-text-tertiary';

const size = (value: number) => fmtSize(value);

/** The segments on the chart: each colored category gets one, the rest merge into one. Zeroes are not drawn. */
export function storageSlices(categories: StorageCategory[]) {
  const named = categories.filter((item) => CATEGORY_COLORS[item.key] && item.bytes > 0)
    .map((item) => ({ key: item.key, label: item.label, bytes: item.bytes, color: CATEGORY_COLORS[item.key]! }));
  const rest = categories.filter((item) => !CATEGORY_COLORS[item.key])
    .reduce((sum, item) => sum + item.bytes, 0);
  return rest > 0 ? [...named, { key: 'rest', label: 'The rest', bytes: rest, color: REST_COLOR }] : named;
}

export function StorageOverview({ storage }: { storage: StorageState }) {
  const usage = storage.usage!;
  const slices = storageSlices(usage.categories);
  const config: ChartConfig = Object.fromEntries(slices.map((slice) =>
    [slice.key, { label: slice.label, colors: tone(slice.color) }]));
  const data = slices.map((slice) => ({ slice: slice.key, value: slice.bytes }));
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-center">
      {/* The donut chart's total is written inside the ring: its container ships with `flex-1`, swapped to a fixed width within this flex row. */}
      <div className="relative mx-auto size-48 flex-none" role="img"
        aria-label={`Data directory totals ${size(usage.total_bytes)}, breakdown by category`}>
        <EvilPieChart data={data} dataKey="value" nameKey="slice" config={config}
          className="aspect-square size-48 flex-none">
          <EvilPieChart.Pie innerRadius="68%" outerRadius="100%" paddingAngle={1} cornerRadius={3} />
          <ChartTip nameKey="slice" hideLabel format={size} />
        </EvilPieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-title-2-medium tabular-nums text-text-primary">{size(usage.total_bytes)}</b>
          <small className="text-caption-1-regular tabular-nums text-text-secondary">
            {usage.total_files.toLocaleString()} files on this disk
          </small>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-1.5 text-caption-1-regular text-text-secondary">
              <i aria-hidden className={`${TIP_SWATCH} ${CATEGORY_SWATCH[slice.key] || REST_SWATCH}`} />
              {slice.label}
              <span className="tabular-nums text-text-primary">{size(slice.bytes)}</span>
            </li>
          ))}
        </ul>
        <DiskBar storage={storage} />
      </div>
    </div>
  );
}

/** The whole disk: what Peach takes, what other files take, and what remains. Skipped entirely when disk capacity cannot be read. */
function DiskBar({ storage }: { storage: StorageState }) {
  if (storage.total_bytes === null || storage.free_bytes === null || !storage.usage) return null;
  const peach = Math.min(storage.usage.total_bytes, storage.total_bytes);
  const free = storage.free_bytes;
  const others = Math.max(0, storage.total_bytes - free - peach);
  const config = {
    /* Uses none of the chart category colors: this segment is the entire data catalog, and sharing a color with any category above would read as "database only". */
    peach: { label: 'Peach data', colors: tone('var(--color-border-focus-ring)') },
    others: { label: 'Other files', colors: tone(REST_COLOR) },
    free: { label: 'Available', colors: tone('var(--color-background-tertiary-default)') },
  } satisfies ChartConfig;
  const share = (part: number) => {
    const percent = (part / storage.total_bytes!) * 100;
    return percent < 0.1 ? 'Under 0.1%' : `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption-1-regular text-text-secondary">
        A total of {size(storage.total_bytes)}{storage.system_drive ? '(system drive)' : ''}, Peach uses {share(peach)},
        free {size(free)}
      </p>
      <EvilBarChart data={[{ disk: 'Disk', peach, others, free }]} config={config}
        layout="horizontal" stackType="percent" barRadius={4}
        chartProps={{ margin: { top: 0, right: 0, bottom: 0, left: 0 } }}
        className="aspect-auto h-6 flex-none">
        <EvilBarChart.YAxis dataKey="disk" hide />
        <EvilBarChart.XAxis hide />
        <EvilBarChart.Bar dataKey="peach" />
        <EvilBarChart.Bar dataKey="others" />
        <EvilBarChart.Bar dataKey="free" />
        <ChartTip hideLabel format={size} />
      </EvilBarChart>
    </div>
  );
}
