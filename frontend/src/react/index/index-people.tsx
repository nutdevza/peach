/* The roster grid: performers, creators, labels, agencies, series rosters and online source creators.
 *
 * One cell per person: a round frame or portrait avatar, a name, one readout. The four entity kinds share one layout and one
 * image chain, differing only in cell width and readout basis. The round frame's HTML is assembled by `card-art`'s
 * `avatarInner` (image when present, initial when not, small images placed at native size over a blurred underlay) and the
 * page does not re-render it; native-size fetching and the underlay rule live in `web/css/01-base.css`'s `[data-person-ring]`,
 * and measuring the image is the `load` listener `installCardArt` hangs on the document.
 * Cell base, avatar frame, initial and readout colors live in the same directory's `index-people.css`. */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Chip } from '@/components/base/badges/chip';
import { entityDisplayName } from '../../core/entity-names';
import { useEntityNames } from '../use-entity-names';

import { cardClass } from '../components/card';
import { spriteGlyph } from '../components/sprite-glyph';
import type { OnlineAuthor } from '../follow/online-vocab';
import { ENTITY_KINDS, isCompany, personReadout, type IndexKind, type IndexPerson, type IndexProps, type PeopleLayout } from './index-data';

/* Panning hangs on the round frame, not the img: a portrait crop to 3:4 would cut the face if geometrically centered, and the
   img is assembled by the legacy layer, so only the container side can change it. Zooming is the reverse and can only hang on
   the img, so the face box is attached to the img by `avatarInner`.
   Zooming stretches the img wider than the frame and offsets it negatively, and Preflight's `max-width:100%` on imgs would
   clamp it back to frame width, pushing the face aside; so that rule is removed here. Small images placed at native size are
   reined in separately by `[data-native-small]`. */
function Ring({ html, face, company, big }: { html: string; face?: string; company: boolean; big: boolean }) {
  const ring = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (face) ring.current?.style.setProperty('--face', face);
    else ring.current?.style.removeProperty('--face');
  }, [face]);
  const shape = !big ? 'size-17.5 rounded-full' : company ? 'aspect-square w-full rounded-2lg' : 'aspect-3/4 w-full rounded-2lg';
  return (
    <span ref={ring} data-person-ring="" data-fit-native={company ? 'mark' : 'portrait'}
      className={`relative inline-grid flex-none place-items-center self-center overflow-hidden text-title-1-regular ${shape} [&_img]:absolute [&_img]:inset-0 [&_img]:block [&_img]:size-full [&_img]:max-w-none [&_img]:object-cover [&_img]:object-(--face)`}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

const CELL = 'relative flex cursor-pointer flex-col gap-2 p-3 text-inherit';
const Rss = spriteGlyph('rss');

function Cell(
  { name, readout, big, children, following, onPress, ...data }:
  { name: string; readout: string; big: boolean; children: ReactNode; following?: boolean; onPress(): void }
    & Record<`data-${string}`, string>,
) {
  return (
    <button type="button" {...data} data-index-cell="" onClick={onPress}
      className={cardClass({
        radius: 'plain', padding: 'none', interactive: true,
        className: `${CELL} ${big ? 'items-stretch text-left' : 'items-center text-center'}`,
      })}>
      {children}
      {following ? <span data-index-feed="" role="img" aria-label="Subscribed to new releases" className="index-feed-mark absolute top-4 right-4 z-2 inline-flex">
        <Chip variant="caption" color="soft"><Rss /></Chip>
      </span> : null}
      <span data-index-name="" className="text-body-medium wrap-anywhere text-text-primary">{name}</span>
      <span data-index-readout="" className="text-caption-1-regular">{readout}</span>
    </button>
  );
}

/** The local roster. The profile page's rosters (an agency's talents, a studio's labels) reuse this same cell, borrowing only the image fetching and the destinations. */
export function PeopleGrid(
  { kind, items, layout, props }:
  {
    kind: Exclude<IndexKind, 'tags'>; items: IndexPerson[]; layout: PeopleLayout;
    props: Pick<IndexProps, 'personAvatar' | 'openEntity'>;
  },
) {
  const company = isCompany(kind) || kind === 'series';
  useEntityNames();
  const big = layout === 'big';
  return (
    <div data-index-grid="" data-layout={layout} data-cells={company ? 'company' : 'people'}
      className={`${company ? 'index-grid-company' : 'index-grid-person'} gap-3`}>
      {items.map((item) => {
        const entityKind = item.entity_kind || ENTITY_KINDS[kind];
        const avatar = props.personAvatar(item, entityKind, big);
        return (
          <Cell key={`${entityKind}:${item.entity_id || item.k}`} data-k={item.k} data-kind={entityKind} name={entityDisplayName(entityKind, item.k, item.entity_id)} readout={`${personReadout(kind, item)}${item.identity_labels?.length ? ' · ' + item.identity_labels.join(' / ') : ''}`}
            big={big} following={item.following} onPress={() => props.openEntity(entityKind, item.k)}>
            <Ring html={avatar.html} face={avatar.face} company={company} big={big} />
          </Cell>
        );
      })}
    </div>
  );
}

/** The online tier: creators from followed sources. Those with a profile open onto their creator profile page; those without have their whole batch
 *  on the follows page, and opening equals "Follows · this person"; when the database has a same-named creator awaiting user confirmation, the count reads "pending",
 *  and opening goes to that person's profile page, where the confirm button lives. `data-follow-author` carries the follows page's creator keys. */
export function OnlineAuthors(
  { items, layout, props }: { items: OnlineAuthor[]; layout: PeopleLayout; props: IndexProps },
) {
  useEntityNames();
  const big = layout === 'big';
  return (
    <div data-index-grid="" data-layout={layout} data-cells="people" className="index-grid-person gap-3">
      {items.map((author) => (
        <Cell key={author.key} data-follow-author={author.key} data-kind="performer" name={entityDisplayName('creator', author.k, author.entity_id)}
          readout={`${author.n.toLocaleString()} updates${author.held_by ? ' · pending confirmation' : ''}`} big={big}
          onPress={() => {
            if (author.entity_id) props.openEntity('creator', author.k);
            else if (author.held_by) props.openEntity('creator', author.held_by);
            else props.openFollowAuthor(author.key);
          }}>
          <Ring html={props.authorAvatar(author)} company={false} big={big} />
        </Cell>
      ))}
    </div>
  );
}
