import { useState } from 'react';
import { RiBuildingLine, RiGlobalLine } from '@remixicon/react';
import { siteMarkUrl } from '@peach/legacy/core';

const MARK = 'size-(--icon-inline) shrink-0';

/** Site favicon image: inline-tier size and square corners, swapped for a same-size globe when unregistered or unfetchable. Scraping sources and follow sources share this one. */
export function MarkImage({ src }: { src: string }) {
  const [failed, setFailed] = useState('');
  if (!src || failed === src) return <RiGlobalLine aria-hidden className={MARK} />;
  return <img src={src} alt="" width={16} height={16} loading="lazy" onError={() => setFailed(src)}
    className={`${MARK} rounded-none object-contain`} />;
}

/** Scraped source site logos are carried by this site's cache or by static assets shipped with the app. */
export function SiteMark({ source, linkId }: { source: string; linkId?: never } | { linkId: number | undefined; source?: never }) {
  if (source === 'makers') return <RiBuildingLine aria-hidden className={MARK} />;
  if (linkId === undefined && !source) return <MarkImage src="" />;
  const bundled = source && ['javten', 'fc2ppvdb', 'avwikidb', 'minnano-av', 'github'].includes(source);
  return <MarkImage src={linkId !== undefined ? `/link-mark?id=${linkId}` : bundled ? `/site-icon/${source}.png` : siteMarkUrl({ source: source! })} />;
}
