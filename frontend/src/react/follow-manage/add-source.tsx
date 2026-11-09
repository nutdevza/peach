/* Add follow: turn a link, a name or an id into a followed source.
 *
 * The search only lists candidates and writes nothing: discovery needs the network, results may be more than one, and
 * deciding "this one" for the user would be wrong. The actual registration still happens as a click among the candidates.
 *
 * The search run goes in the background and keeps running after the page closes. An old terminal state read on first screen
 * does not masquerade as a new result: only when you clicked search this time, or personally saw it running this time, are
 * results laid out (ADR-0031). */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { RiFilter3Line, RiSearchLine } from '@remixicon/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Popover } from 'react-aria-components';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import {
  MENU_ITEM, MENU_ITEM_INTERACTIVE, MENU_POPOVER_SURFACE,
} from '@/components/base/dropdown/menu-styles';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';

import { errorMessage } from '../../api';
import { useBackgroundJob } from '../background-job';
import { cardClass } from '../components/card';
import { LoadingDots } from '../components/loading-dots';
import { Note } from '../components/note';
import { TaskProgress } from '../components/task-progress';
import { SelectionPopover } from '../components/selection-popover';
import { busyProps } from '../settings/use-action';
import { ExternalLink, FieldLabel, Help } from '../settings/section';
import {
  addSource, fetchResolveJob, fetchSuggestions, FOLLOW_RESOLVE_KEY, followSuggestKey,
  reloadFollowManage, startCheck, startResolve, SUGGEST_DEBOUNCE_MS,
  type CredentialData, type FollowData, type ResolveCandidate, type ResolveJob, type ResolveRow,
} from './follow-manage';
import { SourceIcon } from './source-view';
import { composingKey } from '../components/ime';

const MENU_ROW = cx(MENU_ITEM, MENU_ITEM_INTERACTIVE, 'text-body-2-medium');
const PLACEHOLDER = 'Paste a source link, or type a creator name or id…';
const TITLE = 'Add a creator follow';
// The index download notice appears only when actually searching by name; a permanent explanation line would just be noise.
const BY_NAME_HINT = 'Searching (the first name lookup downloads the creator index and may take tens of seconds)';
const BY_LINK_HINT = 'Identifying';
const NO_CANDIDATE = 'The in-site lookup found no source';

export interface AddSourceProps {
  data: FollowData;
  credentials: CredentialData;
  readOnly: boolean;
  toast(message: string): void;
}

/** Credentials are configured in the 'Sources and subscriptions' settings; the credential link on candidate rows points there. */
const CREDENTIALS_PATH = '/settings/subscriptions';

/** A candidate's identity is its address: within one search the same address appears only once. */
const candidateKey = (row: number, candidate: ResolveCandidate) => `${row}:${candidate.url}`;

interface SuggestOption { value: string; matched: string; n: number; group: string }

/** The typeahead dropdown. Only open while the input has focus, with arrow keys walking inside.
 *
 * One group name per group; a row carries the name itself first, then where it was seen (archived site name, site category)
 * and the video count: the name is what gets queried on selection, the other two only help recognize the right one.
 *
 * The site-side path must ask completion first and category second, measured at about a second, and that time must look like
 * work: blank would read as typing with no response. The busy row is not a candidate; arrow keys and Enter must not select a
 * "looking up suggestions" state.
 *
 * Positioning shares the source filter's react-aria `Popover`: it compresses height into the space actually left under the
 * field and scrolls inside the menu when it does not fit. It never flips above: every keystroke changes the suggestion count,
 * and flipping up and down would make it unreadable as a table. Non-modal keeps focus in the input; scrolling the field off
 * the page collapses it, while the menu's own scrolling does not. */
function SuggestMenu(
  { field, menu, options, active, busy, onPick, onClose }:
  {
    field: RefObject<HTMLDivElement | null>; menu: RefObject<HTMLElement | null>;
    options: SuggestOption[]; active: number; busy: boolean;
    onPick(value: string): void; onClose(): void;
  },
) {
  // Arrow keys reaching a row outside the menu's visible area scroll it in; the page outside the menu does not move.
  useEffect(() => {
    menu.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [menu, active]);
  return (
    <Popover ref={menu} triggerRef={field} isOpen isNonModal shouldFlip={false}
      onOpenChange={(open) => { if (!open) onClose() }}
      placement="bottom start" offset={4} aria-label="Source suggestions"
      className={cx(MENU_POPOVER_SURFACE, 'flex w-(--trigger-width) flex-col gap-1 overscroll-contain')}>
      {busy && !options.length
        ? <div className="px-2 py-1.5"><LoadingDots label="Searching suggestions" /></div>
        : null}
      {options.map((option, at) => (
        <Fragment key={`${option.group}-${option.value}`}>
          {option.group !== options[at - 1]?.group ? (
            <div className="px-2 pt-1 text-caption-1-regular text-text-tertiary">{option.group}</div>
          ) : null}
          <button type="button"
            aria-current={at === active ? 'true' : undefined}
            className={at === active ? cx(MENU_ROW, 'bg-background-secondary-default') : MENU_ROW}
            // preventDefault on press: if the dropdown stole focus from the input, the half-typed word would be cut off there.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(option.value)}>
            <span className="min-w-0 grow truncate text-left">{option.value}</span>
            {option.matched ? (
              <span className="shrink-0 text-caption-1-regular text-text-tertiary">{option.matched}</span>
            ) : null}
            {option.n ? (
              <span className="shrink-0 text-caption-1-regular tabular-nums text-text-tertiary">
                {option.n.toLocaleString()}
              </span>
            ) : null}
          </button>
        </Fragment>
      ))}
    </Popover>
  );
}

/** Source filter: lists every followable site, all ticked by default. An unticked site's lookup rows are not shown and do not enter
 *  "Add selected". */
function SourceFilter(
  { credentials, hidden, onHidden }:
  {
    credentials: CredentialData; hidden: ReadonlySet<string>;
    onHidden(next: Set<string>): void;
  },
) {
  const rows = (credentials.providers || []).filter((row) => row.followable);
  const shown = rows.filter((row) => !hidden.has(row.provider_label)).length;
  const label = shown === rows.length ? 'All sources' : `${shown}/${rows.length} sources`;
  const toggle = (provider: string, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(provider); else next.add(provider);
    onHidden(next);
  };
  return <SelectionPopover label="Source filter" triggerLabel={label} leadingIcon={RiFilter3Line}
    empty="'No sources available yet'"
    items={rows.map(row => ({ id: row.provider_label, selected: !hidden.has(row.provider_label),
      label: <span className="flex min-w-0 items-center gap-1.5"><SourceIcon provider={row.provider} />{row.provider_label}</span> }))}
    onChange={toggle}
    actions={[
      { label: 'Select all', disabled: !rows.length, onPress: () => onHidden(new Set()) },
      { label: 'Deselect all', disabled: !rows.length, onPress: () => onHidden(new Set(rows.map(row => row.provider_label))) },
      { label: 'Credential setup', href: CREDENTIALS_PATH },
    ]} />;
}

/** One lookup result. Candidates are listed one by one; already-followed ones are shown but cannot be checked again, otherwise people think the search found nothing. */
function PickRow(
  { row, at, hidden, unpicked, onPick }:
  {
    row: ResolveRow; at: number; hidden: ReadonlySet<string>; unpicked: ReadonlySet<string>;
    onPick(key: string, on: boolean): void;
  },
) {
  if (row.kind === 'error') {
    return <Note tone="error" title={row.line}>{row.error || 'Lookup failed'}</Note>;
  }
  const candidates = (row.candidates || []).filter(
    (candidate) => !hidden.has(candidate.provider_label || ''));
  const failures = Object.entries(row.failures || {});
  return (
    <div className={cardClass({ variant: 'outlined', padding: 'none', className: 'flex flex-col gap-2 p-4' })}>
      <b className="text-body-medium text-text-primary">{row.line}</b>
      {candidates.length ? candidates.map((candidate) => {
        const key = candidateKey(at, candidate);
        return (
          <Checkbox key={key} isSelected={!candidate.known && !unpicked.has(key)}
            isDisabled={candidate.known} onChange={(on) => onPick(key, on)}>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <SourceIcon provider={candidate.provider} />
              <b className="text-body-medium">{candidate.provider_label}</b>
              <span className="min-w-0 break-words">{candidate.label}</span>
              <small className="text-caption-1-regular text-text-secondary">
                {candidate.known ? 'Already followed' : candidate.evidence}
              </small>
            </span>
          </Checkbox>
        );
      }) : <Help>{NO_CANDIDATE}</Help>}
      {(row.external_searches || []).map((search) => (
        <div key={search.url} className="flex flex-wrap items-center gap-2">
          <small className="text-caption-1-regular text-text-secondary">{search.evidence}</small>
          {/* This entry leaves Peach, so it carries the external link mark; the mark comes from the shared `ExternalLink`, one implementation site-wide. */}
          <ExternalLink href={search.url}>{`${search.label}: ${search.query}`}</ExternalLink>
        </div>
      ))}
      {failures.length ? (
        <Help>{failures.map(([name, reason]) => `${name}: ${reason}`).join('; ')}</Help>
      ) : null}
    </div>
  );
}

export function AddSource({ data, credentials, readOnly, toast }: AddSourceProps) {
  const [line, setLine] = useState('');
  const [composing, setComposing] = useState(false);
  /** What this search round is about. The pending hint uses the submitted term, and the input stays editable and keeps the retry content. */
  const [asked, setAsked] = useState('');
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  /** The dropdown was dismissed on this input (Escape, page scrolled away). One more keystroke or an arrow key reopens it. */
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const field = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set<string>());
  const [unpicked, setUnpicked] = useState<ReadonlySet<string>>(new Set<string>());
  const [problem, setProblem] = useState('');
  const [added, setAdded] = useState(0);

  /* Every keystroke schedules a suggestion, but only one request goes out: typing again within 250ms replaces the previous schedule.
     URLs do not enter this path; the server recognizes the `/` inside them, and the right move then is to parse the link. */
  useEffect(() => {
    const text = line.trim();
    if (composing || !text || text.includes('/')) { setTerm(''); return }
    const timer = setTimeout(() => setTerm(text), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [line, composing]);

  const suggest = useQuery({
    queryKey: followSuggestKey(term),
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    enabled: term.length > 0 && focused && !composing && closedAt !== line,
  });

  const options = useMemo<SuggestOption[]>(() => (suggest.data?.groups || []).flatMap((group) => (
    group.items.map((item) => ({
      value: item.value, matched: item.matched || '', n: item.n || 0, group: group.label,
    }))
  )), [suggest.data]);

  const { job, running, outcome, start: resolve, dismiss } = useBackgroundJob<ResolveJob, string>({
    queryKey: FOLLOW_RESOLVE_KEY,
    queryFn: ({ signal }) => fetchResolveJob(signal),
    start: (text) => startResolve([text]),
    onStarted: () => setUnpicked(new Set()),
    onError: (cause) => setProblem(errorMessage(cause)),
    onFinish: (state) => {
      if (state.status === 'failed') setProblem(state.error || 'Lookup failed');
    },
  });

  const search = (text: string) => {
    const query = text.trim();
    if (!query || readOnly || composing || running || resolve.isPending) return;
    setProblem('');
    setActive(-1);
    setAsked(query);
    setLine(query);
    setTerm('');
    setClosedAt(query);
    resolve.mutate(query);
  };

  const suggesting = suggest.isFetching;
  const menuOpen = focused && !composing && closedAt !== line && (options.length > 0 || suggesting);
  // Collapsing releases the selection too: a row you cannot see should not be picked by Enter and searched.
  const closeMenu = () => { setActive(-1); setClosedAt(line) };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing || composingKey(event.nativeEvent)) return;
    if (event.key === 'Escape' && menuOpen) { closeMenu(); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      if (!menuOpen) { setClosedAt(null); return }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((now) => {
        const next = now + step;
        if (next < 0) return options.length - 1;
        return next >= options.length ? 0 : next;
      });
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    /* Selecting a suggestion and pressing Enter amounts to filling that name in and searching. Search only lists candidates and writes nothing,
       so select-to-search is safe. */
    search(options[active]?.value || line);
  };

  const rows = outcome?.results || [];
  const picked = rows.flatMap((row, at) => (row.candidates || [])
    .filter((candidate) => !candidate.known && !hidden.has(candidate.provider_label || ''))
    .map((candidate) => ({ candidate, key: candidateKey(at, candidate) }))
    .filter((item) => !unpicked.has(item.key)));

  const register = useMutation({
    mutationFn: async (items: { candidate: ResolveCandidate }[]) => {
      const failures: string[] = [];
      const sources: number[] = [];
      setAdded(0);
      for (const item of items) {
        try {
          const done = await addSource(item.candidate);
          sources.push(done.source);
        } catch (cause) {
          // One failure should not discard the rest; report item by item.
          failures.push(`${item.candidate.label}: ${errorMessage(cause)}`);
        }
        setAdded((now) => now + 1);
      }
      // A source registered with `defer_check` skipped its check, so one pass kicks off right after registration.
      if (sources.length) {
        try { await startCheck(sources) } catch (cause) { failures.push(errorMessage(cause)) }
      }
      return { failures, sources };
    },
    onSuccess: (result) => {
      void reloadFollowManage();
      if (result.failures.length) { setProblem(result.failures.join('; ')); return }
      setProblem('');
      dismiss();
      toast(`Added ${result.sources.length} follow sources`);
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });

  const guesses = data.suggestions || [];
  const byName = !asked.includes('/');

  return (
    /* Old `.followmanage .fmain>.fsec`: one section was one filled card with the title inside it. */
    <section aria-label={TITLE} className={cardClass({ padding: 'none', className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4' })}>
      <h3 className="text-title-2-medium text-text-primary">{TITLE}</h3>

      <div className="flex flex-wrap items-end gap-2">
        {/* Collapse only when focus leaves both the field and the dropdown, not on leaving the input: every dropdown entry is a real button,
            and collapsing when focus lands inside would remove exactly the thing being clicked. The dropdown hangs in the overlay container, not
            under the field's DOM, so the two are recognized separately. */}
        <div ref={field} className="min-w-64 grow" onFocus={() => setFocused(true)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (!event.currentTarget.contains(next) && !menu.current?.contains(next)) setFocused(false);
          }}>
          <Input aria-label="Source link, name, or id" placeholder={PLACEHOLDER} value={line}
            leadingIcon={RiSearchLine} enterKeyHint="search" isDisabled={readOnly} onChange={setLine}
            onCompositionStart={() => { setComposing(true); setActive(-1) }}
            onCompositionEnd={(event) => { setComposing(false); setLine(event.currentTarget.value) }}
            onKeyDown={onKeyDown} />
          {menuOpen ? (
            <SuggestMenu field={field} menu={menu} options={options} active={active}
              busy={suggesting} onPick={search} onClose={closeMenu} />
          ) : null}
        </div>
        <SourceFilter credentials={credentials} hidden={hidden} onHidden={setHidden} />
        <Button variant="primary" disabled={readOnly || !line.trim()}
          {...busyProps(running || resolve.isPending)} onClick={() => search(line)}>Find</Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {running || resolve.isPending ? <TaskProgress embedded
          label={job?.message || (job?.total ? `Searching: ${job.checked || 0}/${job.total}` : byName ? BY_NAME_HINT : BY_LINK_HINT)}
          value={job?.checked} total={job?.total} /> : null}
        {problem ? <Note tone="error" title="This run did not finish">{problem}</Note> : null}
      </div>

      {rows.length ? (
        <div className="flex flex-col gap-3">
          <FieldLabel>Lookup results</FieldLabel>
          {rows.map((row, at) => (
            <PickRow key={`${row.line}-${at}`} row={row} at={at} hidden={hidden} unpicked={unpicked}
              onPick={(key, on) => {
                const next = new Set(unpicked);
                if (on) next.delete(key); else next.add(key);
                setUnpicked(next);
              }} />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="small"
              onClick={() => dismiss()}>Off</Button>
            <Button variant="primary" size="small" disabled={readOnly || !picked.length}
              {...busyProps(register.isPending)}
              onClick={() => register.mutate(picked)}>{`Add selected (${picked.length})`}</Button>
            {register.isPending ? (
              <span role="status" className="text-body-2-regular text-text-secondary">
                {`Adding… ${added}/${picked.length}`}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {guesses.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-2-regular text-text-secondary">Guess you like</span>
          {guesses.map((guess) => (
            <Button key={guess.name} variant="secondary" size="small" disabled={readOnly}
              title={`Appeared ${guess.visits} times in browsing history${guess.origin ? ` · ${guess.origin}` : ''}`}
              onClick={() => search(guess.name)}>{guess.name}</Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
