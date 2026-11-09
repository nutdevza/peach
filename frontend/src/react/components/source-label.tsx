import { MEDIA_SOURCE_ICONS } from '@peach/legacy/ui';
import { useState } from 'react';
import { SourceMark } from '../settings/section';

const sourceLocation = (source: string) => source.startsWith('clouddrive:') ? source.split(':')[1]! : source;
const sourceIcons = Object.fromEntries(Object.entries(MEDIA_SOURCE_ICONS).map(([source, mark]) => [source,
  function ProviderIcon({ className }: { className?: string }) {
    return <span className={className}><SourceMark mark={mark} /></span>;
  },
] as const));
function CloudIcon({ className }: { className?: string }) {
  return <span className={className}><SourceMark mark="database" /></span>;
}
export const providerIcon = (source: string) => sourceIcons[sourceLocation(source)] ?? CloudIcon;

/** Site badges are read through this site's cache. javdb and dmm are collection sources and use the site badges shipped with the app; text that does not fit is truncated,
 *  not pushed onto the external-link icon behind it. */
export function SiteLabel({ site, label }: { site: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const source = site === 'javdb' || site === 'dmm' ? `/site-mark?source=${site}`
    : site === 'missav' ? '/site-mark?domain=missav.com' : null;
  return <span className="inline-flex min-w-0 items-center gap-1.5">
    {failed || !source ? <SourceMark mark="globe" /> : <img src={source} alt="" className="size-(--icon-inline) shrink-0 object-contain" onError={() => setFailed(true)} />}
    <span className="min-w-0 truncate">{label}</span>
  </span>;
}

/** Cloud drive and local sources share the registered identifiers. */
export function SourceLabel({ source, label }: { source: string; label: string }) {
  const location = sourceLocation(source);
  return <span className="inline-flex min-w-0 items-center gap-1.5">
    <SourceMark mark={MEDIA_SOURCE_ICONS[location] || (location === 'local' ? 'hard-drive' : 'database')} />
    <span className="min-w-0 truncate">{label}</span>
  </span>;
}
