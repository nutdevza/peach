/* The tags page's three blocks: the filter overlay, the body (alphabet or tag cloud) and the selected tag's action bar.
 *
 * The two vocabularies share these three blocks, differing in color and destination: local tags are the ledger's Chinese
 * tags, colored by the ledger's nine categories, clicking through to the catalog filtered by them, and in selection mode
 * assembled into a multi-tag filter; online tags are the follow sources' booru tags, colored by upstream tag_type, clicking
 * through to "Follows, this tag", and never entering multi-select, since multi-select assembles catalog filters and filtering
 * the catalog with online tags would match nothing. */
import { Radio, RadioGroup } from 'react-aria-components';
import type { ReactNode } from 'react';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';

import { TabCount } from '../components/board-tabs';
import { cardClass } from '../components/card';
import { FilterGlassRows, FilterPill } from '../components/filter-glass';
import { SEGMENTED_GLASS_TRACK, SEGMENT_GLASS } from '../components/segmented';
import { SelectionDock } from '../components/selection-dock';
import { spriteGlyph } from '../components/sprite-glyph';
import { useHorizontalScroller } from '../components/use-horizontal-scroller';
import { EntityActionButton, FavoriteButton } from '../library-shortcuts/shortcut-controls';
import type { Favorite } from '../library-shortcuts/library-shortcuts';
import { tagColorKey, type IndexTag, type TagView } from './index-data';

export interface TagEntry extends IndexTag {
  label: string;
}

/** A tag's interaction: toggles selection in select mode, opens directly otherwise. */
export interface TagActions {
  online: boolean;
  favorites?: boolean;
  edit?(tag: string): void;
  picked: ReadonlySet<string>;
  press(tag: string): void;
}

const Dot = () => <span aria-hidden data-tag-dot="" className="size-1.75 flex-none rounded-full" />;
const Pencil = spriteGlyph('pencil');
const tagFavorite = (tag: TagEntry, online: boolean): Favorite => ({ kind: 'tag', name: tag.k, favorite: tag.favorite,
  ...(online ? { scope: 'online', tag_id: tag.id || tag.k } : { entity_id: tag.entity_id }) });

/* One tag per row: 36px tall, 8px radius, the sizing of Board's ranking rows. nowrap is the precondition for ellipsis;
   without it long tags wrap instead, dragging up the other tags in the row and leaving the rows of several columns misaligned. */
function AlphaTag({ tag, actions }: { tag: TagEntry; actions: TagActions }) {
  const pressed = actions.picked.has(tag.k);
  return (
    <div className="flex min-w-0 items-center gap-1">
    <button type="button" data-alpha-tag="" data-k={tag.k} data-tag-cat={tagColorKey(actions.online, tag.cat)}
      aria-pressed={pressed} title={tag.label} onClick={() => actions.press(tag.k)}
      className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.25 rounded-lg px-2.5 text-left text-body-regular text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
      <Dot />
      <span className="min-w-0 flex-1 truncate">{tag.label}</span>
      <span className="flex-none text-caption-1-regular text-text-secondary">{tag.n.toLocaleString()}</span>
    </button>
    {actions.favorites !== false ? <FavoriteButton item={tagFavorite(tag, actions.online)} /> : null}
    {actions.edit ? <EntityActionButton label={`Edit tag ${tag.label}`} onClick={() => actions.edit?.(tag.k)}><Pencil /></EntityActionButton> : null}
    </div>
  );
}

/** The alphabet: one card per initial letter, the letter as the card's heading, with the group's count at the right. `data-alpha-group` is the landing point for the
 *  jump keys in the overlay's bottom row, and the card top makes room for the sticky overlay. */
export function TagAlphabet({ groups, actions }: { groups: [string, TagEntry[]][]; actions: TagActions }) {
  return (
    <div data-alphabet="" className="flex flex-col gap-4">
      {groups.map(([letter, tags], at) => (
        <section key={letter} data-alpha-group={at}
          className={cardClass({ radius: 'plain', padding: 'none', className: 'px-5 pt-4 pb-3' })}>
          <h3 className="mb-2 flex items-center text-title-2-medium text-text-primary">
            {letter}<TabCount value={tags.length} />
          </h3>
          <div className="index-tag-list gap-x-4 gap-y-0.5">
            {tags.map((tag) => <AlphaTag key={tag.k} tag={tag} actions={actions} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

const NBSP = String.fromCharCode(0xa0);

/** Tag cloud: here they are the subject, not footnotes, so one tier larger than card tags. Between name and count sits a
 *  non-breaking space, wide as one space at the name's font size (about 3.7px at 13px); flex swallows normal spaces,
 *  hence the non-breaking one. */
export function TagCloud({ tags, actions }: { tags: TagEntry[]; actions: TagActions }) {
  return (
    <div data-tag-cloud="" className="flex flex-wrap gap-1.75">
      {tags.map((tag) => (
        <span key={tag.k} data-tag-token="" data-tag-cat={tagColorKey(actions.online, tag.cat)}
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-lg border p-1">
        <button type="button" data-tag-chip="" data-k={tag.k}
          data-tag-cat={tagColorKey(actions.online, tag.cat)} aria-pressed={actions.picked.has(tag.k)}
          onClick={() => actions.press(tag.k)}
          className="inline-flex max-w-full min-w-0 cursor-pointer items-center rounded-lg px-2 py-0.5 text-body-2-regular text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          <span className="min-w-0 truncate">{tag.label + NBSP}</span>
          <span data-tag-n="" className="text-caption-1-regular opacity-60">{tag.n.toLocaleString()}</span>
        </button>
        {actions.favorites !== false || actions.edit ? <span data-tag-actions="" className="inline-flex flex-none items-center gap-1">
          {actions.favorites !== false ? <FavoriteButton item={tagFavorite(tag, actions.online)} /> : null}
          {actions.edit ? <EntityActionButton label={`Edit tag ${tag.label}`} onClick={() => actions.edit?.(tag.k)}><Pencil /></EntityActionButton> : null}
        </span> : null}
        </span>
      ))}
    </div>
  );
}

const VIEWS: readonly (readonly [TagView, string, string])[] = [
  ['cloud', 'Tag cloud', 'tags'], ['alphabet', 'Alphabet', 'text-aa'],
];

/** The filter popover: type pills on the top row, readouts, jump-to-letter and view switching on the bottom. Only the kinds with data are laid out. */
export function TagFilters(
  { categories, category, online, readout, letters, view, onCategory, onJump, onView, status, actions }: {
    categories: readonly (readonly [string, string])[];
    category: string;
    online: boolean;
    readout: string;
    letters: string[];
    view: TagView;
    onCategory(key: string): void;
    onJump(at: number): void;
    onView(view: TagView): void;
    status?: { hidden: boolean; blocked?: boolean; onChange(hidden: boolean): void; onBlocked?(): void };
    actions?: ReactNode;
  },
) {
  const alphaScroll = useHorizontalScroller<HTMLElement>();
  return (
    <FilterGlassRows label="Tag filter" topLabel="Tag kinds"
      top={<>
        {status ? <div role="group" aria-label="Tag states" className="flex flex-none items-center gap-1.75 border-r border-(--glass-low) pr-3">
          {[[false, 'In use'], [true, 'Hidden']].map(([hidden, label]) => <FilterPill key={String(hidden)}
            data-tag-pill="" data-tag-cat="all" pressed={!status.blocked && status.hidden === hidden} onPress={() => status.onChange(Boolean(hidden))}>{label}</FilterPill>)}
          {status.onBlocked ? <FilterPill data-tag-pill="" data-tag-cat="all" pressed={!!status.blocked}
            onPress={status.onBlocked}>Blocked content</FilterPill> : null}
        </div> : null}
        {categories.map(([key, label]) => (
        <FilterPill key={key} data-tag-pill="" data-tag-cat={key === 'all' ? 'all' : tagColorKey(online, key)}
          pressed={category === key} onPress={() => onCategory(key)}>
          <Dot />{label}
        </FilterPill>
      ))}</>}
      bottom={<>
        <span data-index-readout="" className="flex-none text-caption-1-regular leading-5 whitespace-nowrap text-text-secondary tabular-nums">
          {readout}
        </span>
        {actions}
        {letters.length > 1 ? (
          <nav ref={alphaScroll} aria-label="Jump by first letter" data-alpha-jump=""
            className="flex min-w-0 gap-0.5 overflow-x-auto overscroll-x-contain">
            {letters.map((letter, at) => (
              <button key={letter} type="button" onClick={() => onJump(at)}
                className="h-8 min-w-8 flex-none cursor-pointer rounded-glass-key px-1.5 text-caption-1-regular leading-5 text-(--glass-text)/60 outline-none hover:text-(--glass-text) focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                {letter}
              </button>
            ))}
          </nav>
        ) : null}
        <RadioGroup aria-label="Tag view" orientation="horizontal" value={view}
          onChange={(next) => onView(next as TagView)} className={`ml-auto ${SEGMENTED_GLASS_TRACK}`}>
          {VIEWS.map(([value, label, symbol]) => {
            const Glyph = spriteGlyph(symbol);
            return (
              <Radio key={value} value={value} aria-label={label} data-glass-segment="" className={SEGMENT_GLASS}>
                <span title={label} className="contents"><Glyph className="size-4" /></span>
              </Radio>
            );
          })}
        </RadioGroup>
      </>}
    />
  );
}

/** The action bar for selected tags. All three keys act on this screen only: "Broad match" toggles whether returning to the catalog matches any or all,
 *  "Clear" clears only the local selection, and "Show results" returns to the catalog filtered by the selected tags; none of them writes the database. */
export function TagDock(
  { count, match, onMatch, onClear, onApply }:
  { count: number; match: 'any' | 'all'; onMatch(match: 'any' | 'all'): void; onClear(): void; onApply(): void },
) {
  return (
    <SelectionDock visible={count > 0} label="Selected tag actions" count={`Selected ${count.toLocaleString()} tags`}>
      <Checkbox isSelected={match === 'any'} onChange={(on) => onMatch(on ? 'any' : 'all')}>
        <span className="flex flex-col">
          <span className="text-body-medium">Broad match</span>
          <span className="text-caption-1-regular text-text-secondary">On, any selected tag matches; off, all selected tags must be present.</span>
        </span>
      </Checkbox>
      <Button variant="secondary" size="small" onClick={onClear}>Clear</Button>
      <Button variant="primary" size="small" disabled={!count} onClick={onApply}>Show results</Button>
    </SelectionDock>
  );
}
