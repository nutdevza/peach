/* The body of the metadata-field card type: a set of mutually exclusive source values, plus genres not yet included.
 *
 * A candidate card's upper and lower halves read two different things: the upper half is the value this source gives, that is, what selecting it would write to the database;
 * the lower half is the other fields the same source returned along the way, used only as decision input. Each half carries its own background, separated by a line,
 * so which half can change the database needs no guessing. */
import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RadioGroup } from '@/components/base/radio/radio';
import { RadioCard } from '@/components/base/radio/radio-card';

import { Button } from '@/components/base/buttons/button';
import { InputBase, TextField } from '@/components/base/input/input';
import { CollapseChevron, CollapseRegion } from '../components/collapse-region';
import { errorMessage } from '../../api';
import type { ReviewCandidate, ReviewRow } from './review';
import { pendingGenres, recordGenre, reloadReview } from './review';
import { ComparisonText } from './comparison-text';
import { composingKey } from '../components/ime';

/** What the fields candidates hand back are called in the UI. Anything missing from the table shows under its original name. */
const EVIDENCE_LABELS: Record<string, string> = {
  title: 'Title', original_title: 'Original title', runtime: 'Source and duration', director: 'Director',
  label: 'Label', poster_url: 'Poster', cover_url: 'Cover', screenshot_urls: 'Stills',
  trailer_url: 'Trailer',
};

/** The candidate word list for accepting genres, mounted once on the whole page: writing it on every card would repeat the same hundred-odd options
 *  dozens of times in the DOM. */
export const GENRE_TAGS_ID = 'reviewgenretags';

export function GenreTagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <datalist id={GENRE_TAGS_ID}>
      {tags.map((tag) => <option key={tag} value={tag} />)}
    </datalist>
  );
}

/** Source evidence expands independently; clicking the explanation never also selects another source. */
function CandidateEvidence({ candidate, row }: { candidate: ReviewCandidate; row: ReviewRow }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const evidence = Object.entries(candidate.catalog_evidence || {})
    .filter(([, item]) => item && item.display_value);
  if (!evidence.length) return null;
  return (
    <div className="min-w-0">
      <Button variant="secondary" size="small" leadingIcon={CollapseChevron}
        aria-expanded={open} aria-controls={panel}
        aria-label={`${open ? 'Collapse' : 'Expand'} source evidence for ${candidate.source || 'this source'}`}
        onClick={() => setOpen(!open)}>
        <span data-copy-key="review.card.source_evidence">Source evidence</span>{` · ${evidence.length}`}
      </Button>
      <CollapseRegion id={panel} open={open}>
        <dl className="flex min-w-0 flex-col gap-2 px-3 pt-2 pb-1">
          {evidence.map(([field, item]) => (
            <div key={field} className="flex min-w-0 flex-wrap gap-x-2">
              <dt className="text-caption-1-regular text-text-tertiary">
                {EVIDENCE_LABELS[field] || field}
              </dt>
              <dd className="min-w-0 text-body-2-regular break-words text-text-primary">
                <ComparisonText value={item.display_value || ''}
                  reference={field === row.field && row.current_value
                    ? row.current_value
                    : row.candidates?.find(peer => peer.candidate_key !== candidate.candidate_key
                        && peer.catalog_evidence?.[field]?.display_value)?.catalog_evidence?.[field]?.display_value} />
              </dd>
              {(item.warnings || []).map((warning) => (
                <small key={warning} className="w-full text-caption-1-regular text-status-yellow-text">
                  {warning}
                </small>
              ))}
            </div>
          ))}
        </dl>
      </CollapseRegion>
    </div>
  );
}

function candidateHeading(candidate: ReviewCandidate) {
  const id = candidate.content_id || candidate.provider_id;
  return `${candidate.source || 'Source not stated'}${candidate.official ? ' - official preferred' : ''}${id ? ` - ID ${id}` : ''}`;
}

function CandidateValue({ candidate, reference }: { candidate: ReviewCandidate; reference?: string }) {
  return <span className="flex min-w-0 flex-col gap-2 whitespace-normal wrap-anywhere">
    <span className="text-body-regular text-text-primary">
      <ComparisonText value={candidate.display_value || ''} reference={reference} />
    </span>
    {(candidate.warnings || []).map(warning => (
      <span key={warning} className="text-body-2-regular text-status-yellow-text">{warning}</span>
    ))}
  </span>;
}

/** Mutually exclusive source values. With a single candidate there is nothing to choose: a radio circle would make people think other options exist,
 *  so it becomes display-only, and submission still follows that one candidate. */
export function CandidateChoices(
  { row, fieldName, value, onChange, locked }: {
    row: ReviewRow;
    fieldName: string;
    value: string;
    onChange(candidateKey: string): void;
    locked: boolean;
  },
) {
  const candidates = row.candidates || [];
  if (!candidates.length) return null;
  if (candidates.length === 1) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-2 rounded-2lg bg-background-primary-default px-4 py-3">
          <p className="text-body-medium text-text-primary">{candidateHeading(candidates[0]!)}</p>
          <CandidateValue candidate={candidates[0]!} reference={row.current_value || undefined} />
        </div>
        <CandidateEvidence candidate={candidates[0]!} row={row} />
      </div>
    );
  }
  return (
    <RadioGroup aria-label={`Sources for ${fieldName || 'details'}`} value={value} isDisabled={locked}
      onChange={onChange}>
      <div className="flex min-w-0 flex-col gap-3">
      {candidates.map((candidate) => (
        <div key={candidate.candidate_key} className="flex min-w-0 flex-col gap-1">
          <RadioCard value={candidate.candidate_key} className="relative items-start"
            title={<span title={candidateHeading(candidate)}>{candidateHeading(candidate)}</span>}
            description={<CandidateValue candidate={candidate}
              reference={row.current_value || candidates.find(peer => peer.candidate_key !== candidate.candidate_key)?.display_value} />} />
          <CandidateEvidence candidate={candidate} row={row} />
        </div>
      ))}
      </div>
    </RadioGroup>
  );
}

/** A genre not yet cataloged. Giving it a name enrolls it as that tag; judging it "not content" excludes it permanently. */
function GenreRow(
  { genre, tags, locked, toast }: {
    genre: string; tags: string[]; locked: boolean; toast(message: string): void;
  },
) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const record = useMutation({
    mutationFn: (tag: string) => recordGenre(genre, tag),
    onSuccess: async (result, tag) => {
      if (!result.ok) { setProblem(result.error || 'The server rejected this intake'); return }
      toast(tag ? `Filed "${genre}" as the tag "${tag}"` : `Marked "${genre}" as not a content tag`);
      await reloadReview();
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });
  const accept = () => {
    const tag = draft.trim();
    if (!tag) { setProblem('Give it a Chinese tag first'); return }
    setProblem('');
    record.mutate(tag);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <b lang="ja" className="text-body-medium text-text-primary">{genre}</b>
      <TextField aria-label={`The Chinese tag "${genre}" was filed as`} value={draft} onChange={setDraft}
        maxLength={40} isDisabled={locked || record.isPending} className="min-w-40 flex-1">
        {/* The Enter press while the IME is still composing means "accept this word", not "submit". */}
        <InputBase size="small" list={tags.length ? GENRE_TAGS_ID : undefined}
          autoComplete="off" placeholder="Chinese tag"
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || composingKey(event.nativeEvent)) return;
            event.preventDefault();
            accept();
          }} />
      </TextField>
      {/* Both conclusions are secondary keys: the card's primary action is "Approve", and adding a word to the vocabulary only gives that step
          something to pick. Making Include primary would put two blue keys fighting over "press here" on one card. */}
      <Button variant="secondary" size="small" disabled={locked || record.isPending}
        onClick={accept}>Archived</Button>
      <Button variant="secondary" size="small" disabled={locked || record.isPending}
        onClick={() => { setProblem(''); record.mutate('') }}>Not content</Button>
      {problem
        ? <p role="status" className="w-full text-body-2-regular text-text-error-primary">{problem}</p>
        : null}
    </div>
  );
}

/** Not-yet-included genres are the only thing on this card that is not a candidate decision: the source gave a value, Peach has not yet decided which tag it counts as,
 *  so the "source has 2 not-yet-included genres" line comes back verbatim with every batch. Including one speaks to the whole vocabulary,
 *  not to any one source, so it gets its own block below the candidates. */
export function PendingGenres(
  { row, tags, locked, toast }: {
    row: ReviewRow; tags: string[]; locked: boolean; toast(message: string): void;
  },
) {
  const genres = pendingGenres(row);
  if (!genres.length) return null;
  return (
    <div role="group" aria-label="Uncollected genre" className="flex flex-col gap-2 border-t border-separator-border pt-4">
      <h5 className="text-body-2-medium text-text-secondary">{`Unindexed genres · ${genres.length}`}</h5>
      <div role="list" className="flex flex-col">
        {genres.map((genre, index) => (
          <div key={genre} role="listitem"
            className={`py-3 first:pt-0 last:pb-0 ${index ? 'border-t border-separator-border' : ''}`}>
            <GenreRow genre={genre} tags={tags} locked={locked} toast={toast} />
          </div>
        ))}
      </div>
    </div>
  );
}
