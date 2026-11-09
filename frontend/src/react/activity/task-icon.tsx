/* The icon before a task card's title: ten categories by what the task does, same icon within a category. Follow, data management, and taste share the icons of their corresponding pages in the nav;
 * the rest are picked by object. Giving each of the 35 task types its own icon would make half look alike, and be unrecognizable instead. Tasks not in the table use the generic task icon. */
import type { RemixiconComponentType } from '@remixicon/react';
import {
  RiDownloadCloud2Line, RiFileSearchLine, RiFilmLine, RiHardDrive3Line, RiHeart3Line, RiImage2Line,
  RiLinksLine, RiRssLine, RiTaskLine, RiToolsLine, RiUser3Line,
} from '@remixicon/react';

type Icon = RemixiconComponentType;

const FAMILIES: [Icon, string[]][] = [
  [RiRssLine, ['follow-check', 'follow-resolve', 'follow-creator', 'follow-evidence-reclaim', 'feed-check', 'feed-scrape',
    'feed-cover']],
  [RiHardDrive3Line, ['library-processing', 'organize', 'batch', 'resource-scan', 'resource-apply', 'seed-import']],
  [RiFileSearchLine, ['scrape-codes', 'jav-discovery-metadata', 'want-scrape', 'upgrade-library']],
  [RiImage2Line, ['scraping-cover', 'jav-covers', 'code-samples', 'timeline-thumbnails', 'entity-avatar']],
  [RiUser3Line, ['performer-profile', 'performer-alias', 'creator-identity', 'studio-mark']],
  [RiFilmLine, ['media-repair', 'mp4-header-repair']],
  [RiLinksLine, ['link-check', 'link-prune', 'source-check']],
  [RiDownloadCloud2Line, ['download-postprocess']],
  [RiHeart3Line, ['taste-refresh']],
  [RiToolsLine, ['upgrade-repairs', 'diagnostic-export', 'amane-bridge', 'face-models', 'ledger-backup', 'ledger-restore']],
];

const ICONS = new Map(FAMILIES.flatMap(([icon, keys]) => keys.map((key) => [key, icon] as const)));

export function TaskIcon({ taskKey, className }: { taskKey: string; className: string }) {
  const Icon = ICONS.get(taskKey) ?? RiTaskLine;
  return <Icon className={className} aria-hidden />;
}
