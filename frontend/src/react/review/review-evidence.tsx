/* The evidence frame in the review card's middle: source images, original video entry, creator entry, identity evidence, and the video samples' nine-grid.
 *
 * Watching these frames and then reading that sentence are two halves of one thing, so they merge into the card's middle frame. The candidate form and
 * identity evidence stay out of the frame: each of their items is already its own frame, and another layer would be a frame in a frame. */
import { useEffect, useState } from 'react';
import { RiExternalLinkLine, RiPlayLine } from '@remixicon/react';
import { VisuallyHidden } from 'react-aria-components';
import { spinnerHtml } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';
import { CheckboxGlyph } from '@/components/base/checkbox/checkbox-glyph';
import { LEGACY_AVATAR_IMG } from '../components/legacy-avatar';
import { SelectionActions } from '../components/selection-actions';
import { busyProps } from '../settings/use-action';
import type { ReviewAsset, ReviewRow } from './review';

/** Only http(s) and on-site absolute paths are allowed. That column in candidate files can contain anything. */
const webUrl = (value = '') => (/^https?:\/\//i.test(value) ? value : '');
const imageUrl = (value = '') =>
  webUrl(value) || (value.startsWith('/') && !value.startsWith('//') ? value : '');

/** The image provided by the source. When it cannot be fetched, say clearly 'not obtained' instead of leaving a blank cell that looks like a broken UI. */
export function SourceImage({ url }: { url?: string }) {
  const source = imageUrl(url || '');
  return <RequestedSourceImage key={source} source={source} />;
}

function RequestedSourceImage({ source }: { source: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('failed'), 30_000);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <div className="relative flex h-review-image items-center justify-center overflow-hidden rounded-surface bg-background-secondary-default">
      {status === 'loading' ? <span role="status" className="absolute flex items-center gap-2 text-body-2-regular text-text-secondary">
        <span dangerouslySetInnerHTML={{ __html: spinnerHtml('Loading image') }} />Loading image
      </span> : null}
      {source && (status === 'loading' || status === 'ready')
        ? <img src={source} alt="Alternate images provided by the source" referrerPolicy="no-referrer" decoding="async"
            className={`size-full object-contain ${status === 'loading' ? 'invisible' : ''}`} onLoad={() => setStatus('ready')}
            onError={() => setStatus('failed')} />
        : source ? <div className="flex flex-col items-center gap-2">
            {status === 'failed' ? <span className="text-body-2-regular text-text-secondary">Source image not fetched</span> : null}
            <Button variant="secondary" size="small" aria-label={status === 'failed' ? 'Retry loading source images now' : undefined}
              onClick={() => setStatus('loading')}>
              {status === 'failed' ? 'Retry now' : 'View source images'}
            </Button>
          </div> : <span className="text-body-2-regular text-text-secondary">Source image not fetched</span>}
    </div>
  );
}

/** One original video: cover, file name, open. */
export function OriginAsset(
  { asset, openItem }: { asset: ReviewAsset; openItem(id: number): void },
) {
  const name = asset.name || '';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" onClick={() => openItem(asset.id)}
        className="flex aspect-card-cover w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2lg bg-background-tertiary-default outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        {asset.preview_url
          ? <img src={asset.preview_url} alt="" loading="lazy" className="size-full object-cover" />
          : <span className="text-caption-1-regular text-text-secondary">No cover</span>}
        <VisuallyHidden>{`Open original video ${name}`}</VisuallyHidden>
      </button>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <b title={name} className="w-full truncate text-body-medium text-text-primary">
          {asset.code || name || 'Original video'}
        </b>
        <Button variant="secondary" size="small" leadingIcon={RiPlayLine}
          onClick={() => openItem(asset.id)}>Open original video</Button>
      </div>
    </div>
  );
}

/** Card header when the subject is a creator rather than one video: face, name, video count.
 *
 *  This candidate type judges "this creator"; creator tags look at what tags all their videos should get, and western identity back-matching
 *  looks at whether the person matches. Picking one sample from the set and painting it as "original video" reads wrong: 60 samples below,
 *  1 video above. */
export function EntityHead(
  { kind, name, works, avatar, openEntity }: {
    kind: string; name: string; works: number; avatar: string;
    openEntity(kind: string, name: string): void;
  },
) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* `avatarInner` in `card-art` is the only implementation of "image when there is one, initials otherwise"; pages do not redraw it. */}
      <button type="button" aria-label={`Open creator page: ${name}`} onClick={() => openEntity(kind, name)}
        className={`relative inline-grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-background-secondary-default text-caption-1-medium text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring ${LEGACY_AVATAR_IMG}`}
        dangerouslySetInnerHTML={{ __html: avatar }} />
      <div className="flex min-w-0 flex-col items-start">
        <button type="button" onClick={() => openEntity(kind, name)}
          className="max-w-full cursor-pointer truncate text-body-medium text-text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          {name}
        </button>
        {works
          ? <small className="tabular-nums text-body-2-regular text-text-secondary">{`${works.toLocaleString()} videos`}</small>
          : null}
      </div>
    </div>
  );
}

/** Evidence for back-matching a Western identity: candidate identities, source profile links, source images, local video samples. */
export function IdentityEvidence(
  { row, openItem, openEntity, onReveal, revealing, note }: {
    row: ReviewRow;
    openItem(id: number): void;
    openEntity(kind: string, name: string): void;
    onReveal(id: number): void;
    revealing: number;
    note: string;
  },
) {
  const profile = webUrl(row.profile_url || '');
  const samples = (row.preview_assets || []).slice(0, 6);
  const works = Math.max(0, Number(row.video_count || row.videos || 0));
  return (
    <section className="flex flex-col gap-3">
      <h5 className="text-body-medium text-text-primary">{`Person pending confirmation: ${row.babepedia_name || 'Unlabeled'}`}</h5>
      <div className="flex flex-wrap items-center gap-2">
        {profile
          ? <ButtonLink variant="secondary" size="small" trailingIcon={RiExternalLinkLine}
              href={profile} target="_blank" rel="noopener noreferrer">Source details</ButtonLink>
          : null}
        <Button variant="secondary" size="small"
          onClick={() => openEntity('creator', row.creator || '')}>
          {`View all ${works.toLocaleString()} videos`}
        </Button>
      </div>
      <SourceImage url={row.preview_url} />
      {samples.length ? <>
        <h5 className="text-body-medium text-text-primary">Local video samples</h5>
        <ul className="flex flex-col gap-1">
          {samples.map((asset) => (
            <li key={asset.id} className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="small" className="min-w-0"
                onClick={() => openItem(asset.id)}>
                <span title={asset.name} className="block max-w-full truncate">{asset.name}</span>
              </Button>
              <Button variant="ghost" size="small" aria-label={`Open the file location for ${asset.name}`}
                {...busyProps(revealing === asset.id)}
                onClick={() => onReveal(asset.id)}>File location</Button>
            </li>
          ))}
        </ul>
      </> : <p className="text-body-2-regular text-text-secondary">No local video samples yet; open all videos to check.</p>}
      {note ? <p role="status" className="text-body-2-regular text-text-error-primary">{note}</p> : null}
    </section>
  );
}

/** Video samples under creator-tag-like pages: click to toggle, Shift to select a range, the same selection semantics as the main grid,
 *  without inventing a separate "multi-select mode" for this page. */
export function AssetPicker(
  { assets, picked, onPicked, locked }: {
    assets: ReviewAsset[];
    picked: number[];
    onPicked(next: number[]): void;
    locked: boolean;
  },
) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const chosen = new Set(picked);
  const toggle = (index: number, range: boolean) => {
    if (locked) return;
    const next = new Set(chosen);
    if (range && anchor !== null) {
      const [from, to] = [Math.min(anchor, index), Math.max(anchor, index)];
      for (let at = from; at <= to; at++) next.add(assets[at]!.id);
    } else {
      const id = assets[index]!.id;
      if (next.has(id)) next.delete(id); else next.add(id);
    }
    setAnchor(index);
    onPicked(assets.filter((asset) => next.has(asset.id)).map((asset) => asset.id));
  };
  return (
    <div className="flex flex-col gap-2">
      <SelectionActions prefix={<span className="tabular-nums text-body-2-regular text-text-secondary">
          {`Selected ${chosen.size} / ${assets.length}`}
        </span>} actions={[
          { label: 'Select all', disabled: locked, onPress: () => onPicked(assets.map(asset => asset.id)) },
          { label: 'Clear', disabled: locked, onPress: () => onPicked([]) },
        ]} />
      <div className="review-asset-grid gap-1.5">
        {assets.map((asset, index) => {
          const on = chosen.has(asset.id);
          return (
            <button key={asset.id} type="button" aria-pressed={on} title={asset.name}
              onClick={(event) => toggle(index, event.shiftKey)}
              className={`relative aspect-card-cover cursor-pointer overflow-hidden rounded-surface bg-background-tertiary-default outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-border-focus-ring ${on ? 'opacity-100 ring-2 ring-border-button-active ring-inset' : 'opacity-50'}`}>
              <img src={`/poster?id=${asset.id}&c=4`} alt="" loading="lazy"
                className="size-full object-cover" />
              {/* The checkmark's look belongs to the one in the registry: no second drawing here, so the same page never shows two kinds of 'selected'. */}
              <span className="absolute top-1 right-1">
                <CheckboxGlyph size="sm" state={{ isSelected: on, isIndeterminate: false,
                  isFocusVisible: false, isDisabled: locked, isHovered: false }} />
              </span>
              <VisuallyHidden>{`${on ? 'Selected' : 'Not selected'} ${asset.name || asset.id}`}</VisuallyHidden>
            </button>
          );
        })}
      </div>
    </div>
  );
}
