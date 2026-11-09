/* The heatmap's data shape and folding. The stats page's play time and the taste page's browse time share one shape,
 * given server-side by `web_stats.q_stats`'s `play_activity` and taste analysis' `activity`. */

/** Counts by day and by "weekday × hour". `weekday` 0 is Monday, and `timezone` looks like `UTC+08:00`. */
export interface ActivityCounts {
  timezone?: string;
  days?: { date: string; count: number }[];
  hours?: { weekday: number; hour: number; count: number }[];
}

/** One cell in the heatmap. `share` is the cell's intensity relative to the busiest cell, 0 to 1. */
export interface HeatCell { key: string; label: string; count: number; share: number }

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A cell with any count keeps at least 10% intensity: one hit and zero hits must be visibly different. */
const shareOf = (count: number, max: number) => (count ? Math.max(0.12, count / max) : 0);

/** A 168-cell weekday x hour grid. Out-of-range or negative records count as absent. */
export function hourGrid(activity: ActivityCounts | undefined): { cells: HeatCell[]; total: number } {
  const counts = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const item of activity?.hours || []) {
    const { weekday, hour, count } = item;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (!Number.isFinite(count) || count < 0) continue;
    counts[weekday]![hour] = (counts[weekday]![hour] || 0) + count;
  }
  const flat = counts.flat();
  const max = Math.max(1, ...flat);
  const cells = counts.flatMap((row, day) => row.map((count, hour) => ({
    key: `${day}-${hour}`, label: `${WEEKDAYS[day]} ${hour}:00`, count, share: shareOf(count, max),
  })));
  return { cells, total: flat.reduce((sum, count) => sum + count, 0) };
}

/** A calendar of the last 91 days. The final day is decided by the data, counting 90 days back, with 0 filled in for days without records. */
export function dayCalendar(activity: ActivityCounts | undefined):
{ cells: HeatCell[]; total: number; start: string; end: string } {
  const days = (activity?.days || [])
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      && Number.isFinite(row.count) && row.count >= 0)
    .slice().sort((a, b) => a.date.localeCompare(b.date));
  const empty = { cells: [], total: 0, start: '', end: '' };
  if (!days.length) return empty;
  const end = new Date(`${days.at(-1)!.date}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const daily = new Map(days.map((row) => [row.date, row.count]));
  const max = Math.max(1, ...days.map((row) => row.count));
  const cells = Array.from({ length: 91 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const count = daily.get(key) || 0;
    return { key, label: key, count, share: shareOf(count, max) };
  });
  return {
    cells,
    total: cells.reduce((sum, cell) => sum + cell.count, 0),
    start: start.toISOString().slice(0, 10),
    end: days.at(-1)!.date,
  };
}
