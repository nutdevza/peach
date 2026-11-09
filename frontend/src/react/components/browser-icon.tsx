import { useState } from 'react';
import { RiCompassLine } from '@remixicon/react';
import catalog from '../../../../resources/browser-icons/manifest.json';

const normalize = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[\s_-]/g,'');
const icons = new Map(catalog.icons.flatMap(icon => icon.aliases.map(alias => [normalize(alias),icon.id] as const)));

export function browserIconId(name: string): string | undefined {
  return icons.get(normalize(name));
}

/** className overrides the default size (standalone block 24px); when inline with text, pass a smaller size. */
export function BrowserIcon({ name, className }: {name:string; className?:string}) {
  const [failed,setFailed] = useState('');
  const id = browserIconId(name);
  return id && failed !== id
    ? <img src={`/browser-icon/${id}`} width={24} height={24} alt="" aria-hidden loading="lazy"
        className={`${className ?? 'size-6 shrink-0'} object-contain`} onError={() => setFailed(id)} />
    : <RiCompassLine aria-hidden className={`${className ?? 'size-5 shrink-0'} text-foreground-icon-secondary`} />;
}
