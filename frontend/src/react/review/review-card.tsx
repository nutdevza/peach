/* One card in the queue: what is being asked, what it is judged on, and the three verdicts.
 *
 * Pending cards offer Ignore, Decide later, and Approve in that order, main action right-aligned; dismissed cards offer only Restore. */
import { useRef } from 'react';

import { avatarInner } from '@peach/card-art';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Chip } from '@/components/base/badges/chip';
import { LinkButton } from '@/components/base/buttons/link-button';
import { cx } from '@/utils/cx';
import { cardClass } from '../components/card';
import { FIELDSET_FOOT } from '../components/fieldset-layout';
import { EmptyState } from '../components/empty-state';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { RiImageLine } from '@remixicon/react';
import { busyProps } from '../settings/use-action';
import { CandidateChoices, PendingGenres } from './candidate-form';
import { ComparisonText } from './comparison-text';
import { AssetPicker, EntityHead, IdentityEvidence, OriginAsset, SourceImage } from './review-evidence';
import type { DecisionStatus, ReviewCategory, ReviewQueue, ReviewRow, RowChoice } from './review';
import { REVIEW_DECISION_LABELS } from './review';
import {
  canApprove, ENTITY_REVIEW_KINDS, rowEvidence, rowFieldName, rowSubject, rowTags, rowTitle,
} from './review';

/* The card face sits at the same level as the management page; source choice is the only form in the card with a radio border. */
const CARD = cardClass({
  variant: 'filled', padding: 'none', className: 'flex flex-col overflow-hidden',
});

/* The card header row's line height: the field name is a caption Chip (12/16 plus 4 above and below), which sets the 24px. Title,
   checkbox and verdict badge each center within those 24px, so even when a font size changes they stay on the same midline. */
const HEADING_LINE = 'flex min-h-6 min-w-0 items-center';

/** How many reference videos an entity card header shows at most; the same count the server provides. */
const COMPARISON_SHOWN = 2;

/** Cards in a row are equal height, with overflow scrolling inside the card. If height followed content, cards in a row would be ragged
   and the eye would hunt for the "verdict" on every card; the identity rematch kind needs room for source images and sample lists, so it takes the taller tier. */
const CARD_HEIGHT = (category: ReviewCategory) =>
  (category === 'western_identity' ? 'h-review-card-tall' : 'h-review-card');

export interface CardHandlers {
  openItem(id: number): void;
  openEntity(kind: string, name: string): void;
  onReveal(id: number): void;
  revealing: number;
  revealNote: string;
  toast(message: string): void;
}

export interface ReviewCardProps {
  category: ReviewCategory;
  queueView?: ReviewQueue;
  row: ReviewRow;
  choice: RowChoice;
  onChoice(next: RowChoice): void;
  selected: boolean;
  onSelect(range: boolean, checked: boolean): void;
  locked: boolean;
  busy: boolean;
  problem: string;
  genreTags: string[];
  onDecide(status: DecisionStatus): void;
  handlers: CardHandlers;
}

export function ReviewCard(props: ReviewCardProps) {
  const {
    category, row, choice, onChoice, selected, onSelect, locked, busy, problem, genreTags,
    onDecide, handlers, queueView = 'pending',
  } = props;
  /* Checkbox's `onChange` only gives the new state; Shift must be read from the event that triggered it: keydown precedes the change,
     same for the keyboard space bar. */
  const range = useRef(false);
  /* The current profile and the candidates share one scroll area, keeping the card head and judgment actions visible. */
  const body = useOverlayScrollbar<HTMLDivElement>();
  const metadata = category === 'metadata_fields';
  const subjectKind = ENTITY_REVIEW_KINDS[category] || '';
  const subjectName = String(row.creator || '').trim();
  const asEntity = !!subjectKind && !!subjectName;
  const title = rowTitle(category, row);
  const fieldName = rowFieldName(category, row);
  const subject = rowSubject(category, row);
  const evidence = rowEvidence(row);
  const tags = rowTags(row);
  const approvable = canApprove(category, row);
  const comparison = row.comparison_assets || [];
  const assets = row.preview_assets || [];
  const decisionLabel = REVIEW_DECISION_LABELS[row.decision || ''];

  /* Comparison videos sit in the unshrunken card header: the server supplies two, and even with more only the first two show, the rest reported as a count,
     otherwise the header squeezes the action bar out of the card. */
  const origin = comparison.length > 1
    ? <div className="flex flex-col gap-3">
        {comparison.slice(0, COMPARISON_SHOWN).map((asset) => (
          <OriginAsset key={asset.id} asset={asset} openItem={handlers.openItem} />
        ))}
        {comparison.length > COMPARISON_SHOWN
          ? <p className="text-body-2-regular text-text-secondary">
              {`${(comparison.length - COMPARISON_SHOWN).toLocaleString()} more comparison videos`}
            </p>
          : null}
      </div>
    : asEntity
      ? <EntityHead kind={subjectKind} name={subjectName}
          works={Number(row.video_count || row.videos || 0)}
          openEntity={handlers.openEntity}
          avatar={avatarInner(subjectName,
            row.entity_id
              ? { id: row.entity_id, has_image: !!row.has_image, image_version: row.image_version, avatar_focus: row.avatar_focus }
              : null,
            null, subjectKind)} />
      : row.asset_id
        ? <OriginAsset openItem={handlers.openItem}
            asset={{ id: row.asset_id, name: row.asset_name, code: row.code, preview_url: row.asset_preview_url }} />
        : null;

  /* Preview and grounds are two halves of one thing: look at these frames, then read this line. The candidate form and identity evidence kinds
     are each their own frame, with no extra nesting. */
  const preview = metadata
    ? <CandidateChoices row={row} fieldName={fieldName} value={choice.candidateKey}
        onChange={(next) => onChoice({ ...choice, candidateKey: next })} locked={locked} />
    : category === 'creator_tags'
      ? (assets.length
        ? <AssetPicker assets={assets} picked={choice.assets} locked={locked}
            onPicked={(next) => onChoice({ ...choice, assets: next })} />
        /* A blank area reads as a broken UI. The real reason is these videos have no frames extracted yet, and saying so beats a blank. */
        : <EmptyState size="compact" icon={RiImageLine} title="This batch of videos has no frames extracted yet">
            {`${row.video_count || ''} videos have no usable preview yet; after approval, tags are still written from the selected details.`}
          </EmptyState>)
      : category === 'fc2_similarity'
        ? null
        : category === 'western_identity'
          ? <IdentityEvidence row={row} openItem={handlers.openItem} openEntity={handlers.openEntity}
              onReveal={handlers.onReveal} revealing={handlers.revealing} note={handlers.revealNote} />
          : <SourceImage url={row.preview_url} />;

  const heading = asEntity
    ? origin
    : fieldName
      /* The field name is the question this card asks ("who is the creator of this video"), and the video identifier is only what it asks about.
         Put at the end of the title, a code-less video's file name would push it out of the ellipsis first. */
      ? <h4 className={cx(HEADING_LINE, 'flex-wrap gap-2')}>
          {/* The Chip does not truncate itself: a capped clipping frame wraps it from outside, so overlong field names stay inside the card with the full text in the title. */}
          <span title={fieldName} className="flex max-w-full min-w-0 overflow-hidden rounded-md"><Chip variant="caption" color="neutral">{fieldName}</Chip></span>
          <span title={subject} className="min-w-0 truncate text-body-medium text-text-primary">{subject}</span>
        </h4>
      : <h4 className={HEADING_LINE}>
          <span title={title} className="min-w-0 truncate text-body-medium text-text-primary">{title}</span>
        </h4>;

  return (
    <section aria-label={title} data-review-key={row.item_key}
      className={cx(CARD, CARD_HEIGHT(category))}>
      <header className="flex min-w-0 shrink-0 items-center gap-2 border-b border-separator-border px-5 py-4">
        {locked ? null : (
          /* The checkbox is only 16px, the title row 24px. Centering each within 24px is what puts their midlines on one line;
             aligned top to top, the checkbox reads as floating above the title. */
          <span className={cx(HEADING_LINE, 'shrink-0')}
            onPointerDownCapture={(event) => { range.current = event.shiftKey }}
            onKeyDownCapture={(event) => { range.current = event.shiftKey }}>
            <Checkbox isSelected={selected} aria-label={`Select ${title}`}
              onChange={(on) => onSelect(range.current, on)} />
          </span>
        )}
        <div className="min-w-0 flex-1">{heading}</div>
        {decisionLabel ? <Chip variant="caption" color="neutral">{decisionLabel}</Chip> : null}
      </header>

      {/* The middle section only grows, never shrinks: when content is short it takes the leftover height, and when long the card does not deform, this section scrolling itself.
          The outer layer exists only to host the overlay scrollbar's track: it lays out with `absolute` and needs a positioned ancestor
          wrapping only the scrolling block itself, otherwise it runs to the whole page's right edge. */}
      <div className="relative mx-5 flex min-w-0 min-h-0 flex-1 flex-col">
        <div ref={body} className="flex min-w-0 min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
          {/* The database's canonical name is the title; the scraped source's spelling (usually romaji) becomes the subtitle. */}
          {row.source_name
            ? <p className="text-body-2-regular text-text-secondary">{`Source spelling: ${row.source_name}`}</p>
            : null}
          {/* Entity-type cards already show the video count in the creator entry; writing it here too would put the same number in two places. */}
          {!asEntity && (row.board || row.assets)
            ? <p className="text-body-2-regular text-text-secondary">
                {`Comparison files: ${Number(row.video_count || row.assets || 0).toLocaleString()}`}
              </p>
            : null}
          {!asEntity && origin ? origin : null}
          {metadata && (evidence || row.current_value !== undefined) ? <div role="region" aria-label="Current info"
            className="flex min-w-0 flex-col gap-1 border-b border-separator-border pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h5 data-copy-key="review.card.current_value" className="text-caption-1-medium text-text-secondary">Current value</h5>
              {row.current_owner?.startsWith('user:') || row.current_owner?.startsWith('review:')
                ? <Chip variant="caption" color="neutral">Manual confirmation</Chip> : null}
            </div>
            <p className="text-body-2-regular text-text-primary wrap-anywhere">
              {row.current_value === undefined ? evidence : row.current_value
                ? <ComparisonText value={row.current_value}
                    reference={(row.candidates?.find(candidate => candidate.candidate_key === choice.candidateKey)
                      || row.candidates?.[0])?.display_value} />
                : 'No details yet'}
            </p>
            {row.videos !== undefined ? <p className="text-caption-1-regular text-text-secondary">
              {`${Number(row.videos).toLocaleString()} ${row.asset_path ? 'matching files' : 'files with the same code'}`}
            </p> : null}
          </div> : null}
          {tags.length || category === 'creator_tags' ? (
            <div className="flex flex-wrap gap-1">
              {tags.length
                ? tags.map((tag) => <Chip key={tag} variant="caption" color="soft">{tag}</Chip>)
                : <small className="text-body-2-regular text-text-secondary">No tags pending confirmation</small>}
            </div>
          ) : null}
          {metadata ? <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-caption-1-medium text-text-secondary">
              <span data-copy-key="review.card.candidate_sources">Candidate sources</span>{` · ${row.candidates?.length || 0}`}
            </h5>
            {row.current_value || (row.candidates?.length || 0) > 1 ? <span
              data-copy-key={row.current_value ? 'review.card.compare_current' : 'review.card.compare_sources'}
              className="text-caption-1-regular text-text-tertiary">
              {row.current_value ? 'Compare with the current value' : 'Differences between sources'}
            </span> : null}
          </div> : null}
          {preview}
          <PendingGenres row={row} tags={genreTags} locked={locked} toast={handlers.toast} />
          {!metadata && evidence
            ? <p className="text-body-2-regular text-text-secondary wrap-anywhere">{evidence}</p>
            : null}
        </div>
      </div>

      <footer className={cx(FIELDSET_FOOT.stack, 'shrink-0')}>
        {queueView !== 'ignored' ? <LinkButton variant="secondary" size="small" className="me-auto" disabled={locked} {...busyProps(busy)}
          onClick={() => onDecide('rejected')}>Ignore</LinkButton> : null}
        {queueView === 'pending' ? <Button variant="secondary" size="small" disabled={locked} {...busyProps(busy)}
          onClick={() => onDecide('skipped')}>Handle later</Button> : <Button
          variant={queueView === 'ignored' ? 'primary' : 'secondary'} size="small" disabled={locked} {...busyProps(busy)}
          onClick={() => onDecide('restore')}>Restore pending</Button>}
        {queueView !== 'ignored' ? <Button variant="primary" size="small" disabled={locked || !approvable} {...busyProps(busy)}
          title={approvable ? undefined : 'No adoptable details; you can keep it for now or ignore'}
          onClick={() => onDecide('approved')}>
          {approvable ? 'Approve' : 'Never passes'}
        </Button> : null}
        {problem
          ? <p role="status" className="w-full text-body-2-regular text-text-error-primary">{problem}</p>
          : null}
      </footer>
    </section>
  );
}
