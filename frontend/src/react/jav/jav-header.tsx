import { useState, type ReactNode } from 'react';
import { Button } from '@/components/base/buttons/button';
import { CloudDownloadDialog, type DownloadPrefill } from '../activity/cloud-download-dialog';
import { JAV_TABS, javPath } from './jav';
import { SortableBoardTabs } from '../components/navigation-order';

/** Header row: title, the section's own filter box (the `IndexSearch` of the same-named tab, right-aligned), and Find resource. The library uses the catalog top-bar search; not passed in. */
export function JavHeader({ tab, navigate, find, search }: {
  tab: string; navigate(path: string): void; find(): void; search?: ReactNode;
}) {
  return <div className="flex w-full flex-col gap-4">
    <div className="flex min-w-0 flex-wrap items-center gap-3 max-board-narrow:gap-x-2">
      <h2 data-page-title="" className="text-display-4-medium text-text-primary max-board-narrow:text-title-1-medium">JAV</h2>
      {search}
      <Button variant="primary" className={search ? 'flex-none' : 'ml-auto flex-none'} onClick={find}>Find resources</Button>
    </div>
    <SortableBoardTabs group="jav" tabs={JAV_TABS.map(([value, label]) => ({ value, label }))} value={tab}
      label="JAV sections" className="" onChange={key => navigate(javPath(key))} />
  </div>;
}

/** The library reuses the catalog's grid, filters, and search; section navigation and resource lookup live in the catalog page header. */
export function JavLibraryHeader({ navigate, receipt }: { navigate(path: string): void; receipt(message: string): void }) {
  const [download, setDownload] = useState<DownloadPrefill | null>(null);
  return <>
    <JavHeader tab="library" navigate={navigate} find={() => setDownload({})} />
    <CloudDownloadDialog prefill={download} close={() => setDownload(null)} receipt={receipt} />
  </>;
}
