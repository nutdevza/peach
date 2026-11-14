/* "Storage": where the data directory is, how much its disk has left, how much each data category takes, cleaning the
 * rebuildable categories, or moving the whole data directory to another disk.
 *
 * The stats result is ringed into one panel: the two charts above (per-category shares, disk usage), one row per category
 * below. Cleanable categories carry checkboxes at the row start; check several to clean together, or "Clean all"; uncleanable
 * ones have disabled checkboxes and the row says why.
 *
 * Stats and cleanup run on server background threads, polled every 1.5 seconds while running. Stats estimates progress from
 * the last file count, or only reports files walked if never measured before. Once a migration request is accepted the
 * service exits, leaving the page one line of receipt: the tray reopens Peach itself after the migration completes. */
import { useEffect, useRef, useState } from 'react';
import { confirmModal } from '@peach/legacy/ui';
import { fmtSize } from '@peach/legacy/core';

import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';

import { ApiError, apiGet, apiSend, errorMessage } from '../../api';
import { PICK_FOLDER_URL } from '../../configuration-endpoints';
import type { StorageCategory, StorageState } from '../bundle';
import { AnimatedNumber } from '../components/animated-number';
import { cardClass } from '../components/card';
import { LoadingDots } from '../components/loading-dots';
import { PathLine } from '../components/path-line';
import { Progress } from '../components/progress';
import { CommandSteps, ErrorText, Fact, FactList, Footer, Help, Stack, Section } from './section';
import { CATEGORY_SWATCH, REST_SWATCH, StorageOverview } from './storage-charts';
import { busyProps, useAction } from './use-action';
import { StorageBudgetSettings } from './storage-budget-settings';

const STORAGE_URL = '/api/configuration/storage';
const POLL_MS = 1500;
/** The migration-complete receipt lasts a day; after that it shows only while work remains (notes). */
const RESULT_MS = 24 * 3600 * 1000;

const targetReason = (cause: unknown) =>
  (cause instanceof ApiError && (cause.body as { errors?: { target?: string } } | null)?.errors?.target)
  || errorMessage(cause);

function diskLine(storage: StorageState) {
  if (storage.free_bytes === null || storage.total_bytes === null) return 'Not fetched';
  const line = `${fmtSize(storage.free_bytes)} free of ${fmtSize(storage.total_bytes)}`;
  return storage.system_drive ? `${line} (system disk)` : line;
}

const cleanable = (category: StorageCategory) => category.cleanable && category.reclaimable > 0;

/** Counting in progress: with last run's file count, draw a progress bar; without it, only say how many have been walked. */
function Measuring({ job }: { job: StorageState['job'] }) {
  const files = job.files || 0;
  const expected = job.expected_files || 0;
  const reading = <>Measured <AnimatedNumber value={files} /> files · <AnimatedNumber value={job.bytes || 0} format={fmtSize} /></>;
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      {expected
        ? <>
            {/* When there are more files than last time, the progress bar holds at 99% until the result lands. */}
            <Progress label="Usage progress" value={Math.min(files, expected * 0.99)} max={expected} />
            <Help>{reading}, last time {expected.toLocaleString()} items</Help>
          </>
        : <LoadingDots label="'Measuring disk usage" />}
      {!expected ? <Help>{reading}</Help> : null}
    </div>
  );
}

/** One row per data category: checkbox, color chip, name and description, size. Uncleanable rows get a disabled checkbox with the reason in the description. */
function CategoryRow(
  { category, selected, disabled, onToggle }:
  { category: StorageCategory; selected: boolean; disabled: boolean; onToggle(next: boolean): void },
) {
  const able = cleanable(category);
  const reason = category.cleanable
    ? category.reclaimable > 0 ? `After cleanup, ${category.note}` : 'No files to clean up'
    : `Cannot clean: ${category.note}`;
  return (
    <div data-category={category.key}
      className="flex min-h-13 w-full items-start gap-3 border-b border-separator-border py-2.5 pr-3 last:border-b-0">
      <Checkbox aria-label={`Clean ${category.label}`} isSelected={selected} isDisabled={!able || disabled}
        onChange={onToggle} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-center gap-2 text-body-regular text-text-primary">
          <i aria-hidden className={`size-2.5 shrink-0 rounded-xs ${CATEGORY_SWATCH[category.key] || REST_SWATCH}`} />
          {category.label}
        </p>
        <p className="text-body-2-regular text-text-secondary">{category.description}</p>
        <p className="text-caption-1-regular text-text-tertiary">{reason}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <AnimatedNumber value={category.bytes} format={fmtSize} className="text-body-regular text-text-primary" />
        {able ? <span className="text-caption-1-regular text-text-secondary">Releasable {fmtSize(category.reclaimable)}</span> : null}
      </div>
    </div>
  );
}

export function StorageSettings({ initial, receipt }: { initial: StorageState; receipt(message: string): void }) {
  const [storage, setStorage] = useState(initial);
  const [accepted, setAccepted] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const action = useAction();
  const running = storage.job.state !== 'idle';
  const reported = useRef(running);

  useEffect(() => {
    if (initial.usage || initial.job.state !== 'idle' || document.body.classList.contains('peach-guiding')) return;
    void action.run('measure', signal => apiSend<StorageState>(`${STORAGE_URL}/measure`, {}, 'POST', signal), setStorage);
  }, []);

  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiGet<StorageState>(STORAGE_URL, controller.signal).then(setStorage, () => {
        if (!controller.signal.aborted) setStorage((current) => ({ ...current }));
      });
    }, POLL_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [storage]);

  // A stats or cleanup round has ended: success goes out as a Toast receipt, failure reasons stay in the section, and cleaned categories are no longer checked.
  useEffect(() => {
    if (running) { reported.current = true; return; }
    if (!reported.current) return;
    reported.current = false;
    setPicked(new Set());
    if (!storage.job.error) receipt(storage.job.message || 'Disk usage calculated');
  }, [running]);

  const measure = () => void action.run('measure', (signal) =>
    apiSend<StorageState>(`${STORAGE_URL}/measure`, {}, 'POST', signal), setStorage);

  const usage = storage.usage;
  const available = usage?.categories.filter(cleanable) ?? [];
  const chosen = available.filter((category) => picked.has(category.key));

  const clean = (targets: StorageCategory[], title: string) => {
    if (!targets.length) return;
    const total = targets.reduce((sum, category) => sum + category.reclaimable, 0);
    void confirmModal({
      title,
      body: `Will delete ${fmtSize(total)}: ${targets.map((category) =>
        `${category.label} ${fmtSize(category.reclaimable)} (${category.note} after cleanup)`).join('; ')}.`,
      confirmLabel: `Clean ${fmtSize(total)}`,
      danger: targets.some((category) => category.key === 'backups'),
      onConfirm: async () => setStorage(await apiSend<StorageState>(`${STORAGE_URL}/clean`,
        { categories: targets.map((category) => category.key) })),
    });
  };

  const relocate = () => void action.run('relocate', async (signal) => {
    const target = (await apiSend<{ path: string | null }>(PICK_FOLDER_URL, { initial: storage.data_root }, 'POST', signal)).path;
    if (!target) return;
    const size = storage.usage ? fmtSize(storage.usage.total_bytes) : '';
    await confirmModal({
      title: 'Migrate the data directory',
      body: `Move ${size} of data from ${storage.data_root} to ${target}. Peach exits during the migration and reopens automatically when it is done; data at the old location is deleted after it has been verified at the new one.`,
      confirmLabel: 'Migrate the data directory',
      onConfirm: async () => {
        try {
          setAccepted((await apiSend<{ message: string }>(`${STORAGE_URL}/relocate`, { target })).message);
        } catch (cause) {
          throw new Error(targetReason(cause));
        }
      },
    });
  }, () => undefined);

  const last = storage.relocation.last;
  const recent = last && (last.state === 'error' || (last.notes?.length ?? 0) > 0
    || Date.now() - last.finished_at * 1000 < RESULT_MS);
  const cleaningLabel = usage?.categories.find((category) => category.key === storage.job.category)?.label;
  const status = accepted
    || (storage.job.state === 'cleaning' ? `Cleaning${cleaningLabel || ''}…`
      : storage.job.state === 'measuring' ? 'Calculating disk usage…'
        : chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'category' : 'categories'} selected, ${fmtSize(chosen.reduce((sum, item) => sum + item.reclaimable, 0))} reclaimable`
          : usage ? `Measured at ${new Date(usage.measured_at * 1000).toLocaleString()}` : '');
  const locked = running || Boolean(accepted);
  const toggle = (key: string) => (next: boolean) => setPicked((current) => {
    const copy = new Set(current);
    if (next) copy.add(key); else copy.delete(key);
    return copy;
  });
  return (<>
    <Section id="storageSettings" guide="storage" title="Storage">
      <FactList>
        <Fact term="Data directory">
          <PathLine path={storage.data_root} className="text-body-regular text-text-primary" onRevealed={receipt} />
        </Fact>
        <Fact term="'Hosting disk'">{diskLine(storage)}</Fact>
      </FactList>
      <Stack divided>
        {storage.job.state === 'measuring' ? <Measuring job={storage.job} /> : null}
        {usage?.capacity_error ? <ErrorText>Capacity statistics incomplete:{usage.capacity_error}</ErrorText> : null}
        {usage?.allocated_bytes != null ? <Help>Peach data actually on disk {fmtSize(usage.allocated_bytes)}</Help> : null}
        {usage
          ? <div data-storage-result="" className={cardClass({ variant: 'outlined', padding: 'none', className: 'flex flex-col' })}>
              <div className="border-b border-separator-border p-4"><StorageOverview storage={storage} /></div>
              <div className="flex flex-col pl-4">
                {usage.categories.map((category) => (
                  <CategoryRow key={category.key} category={category} selected={picked.has(category.key)}
                    disabled={locked} onToggle={toggle(category.key)} />
                ))}
              </div>
            </div>
          : storage.job.state === 'measuring' ? null
            : <Help>After analysis, shows usage per data type and lets you clear the cache and old backups.</Help>}
        {!storage.relocation.available ? <Help>{storage.relocation.message}</Help> : null}
        {/* Deployments the settings page cannot migrate (containers): the steps to run on the host, each with one line of explanation and a copy-paste command. */}
        {!storage.relocation.available && storage.relocation.steps?.length
          ? <CommandSteps label="Migrate on the host machine" steps={storage.relocation.steps} />
          : null}
        {storage.job.error ? <ErrorText>{storage.job.message}</ErrorText> : null}
        {action.error ? <ErrorText>{action.error}</ErrorText> : null}
        {recent && last ? (last.state === 'error'
          ? <ErrorText>{last.message}</ErrorText>
          : <Help>{[last.message, ...(last.notes ?? [])].join('; ')}</Help>) : null}
      </Stack>
      <Footer status={status ? <p role={accepted ? 'status' : undefined}>{status}</p> : null}>
        {usage ? <>
          <Button variant="secondary" disabled={locked || !chosen.length}
            {...busyProps(storage.job.state === 'cleaning' && chosen.length > 0)}
            onClick={() => clean(chosen, 'Clean the selected data')}>Clean selected</Button>
          <Button variant="secondary" disabled={locked || !available.length}
            onClick={() => clean(available, 'Clean every cleanable piece of data')}>Clean all</Button>
        </> : null}
        <Button variant="secondary" disabled={locked || !storage.relocation.available || !usage}
          onClick={relocate} {...busyProps(action.busy === 'relocate')}>Change location</Button>
        <Button disabled={Boolean(accepted) || storage.job.state === 'cleaning'} onClick={measure}
          {...busyProps(action.busy === 'measure' || storage.job.state === 'measuring')}>
          {usage ? 'Re-measure' : 'Measure usage'}
        </Button>
      </Footer>
    </Section>
    {storage.budget ? <StorageBudgetSettings initial={storage.budget} after={setStorage} receipt={receipt} /> : null}
    </>
  );
}
