/* The collection tier and source-update preferences in Peach's config; reads and writes reuse the settings API and the query cache. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { appSettingsStore } from '@peach/appearance';
import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Select, SelectItem } from '@/components/base/select/select';
import { Switch } from '@/components/base/switch/switch';
import { Input } from '@/components/base/input/input';
import { Button } from '@/components/base/buttons/button';

import { FOLLOW_INITIAL_RANGE_OPTIONS } from '../../application/initial-follow-ranges';
import { errorMessage } from '../../api';
import { boundedPreference } from '../../number-setting';
import { momentText } from '../activity/tasks';
import { Note } from '../components/note';
import {
  FEED_SCHEDULE_KEY, FOLLOW_SCHEDULE_KEY, SCHEDULE_RUNS, SETTINGS_KEY, THUMBNAIL_JOBS_KEY, fetchFeedSchedule,
  fetchFollowSchedule, fetchSettings, fetchThumbnailJobs, schedulePollInterval, useRunSchedule,
  useSaveFollowSchedule, useSaveSettings, useSaveThumbnailMode, type FollowScheduleStatus,
} from '../settings-panel/settings-data';
import { ErrorText, Help, Rows, Section, Stack, TaskCenterLink } from './section';
import { busyProps } from './use-action';
import { ProcessingMode } from '../library-processing/processing-effort';

const THUMBNAIL_OPTIONS = [['off', 'Off'], ['precise', 'One per 10 seconds'], ['coarse', 'One per 30 seconds']] as const;

export function TaskSpeedSettings({ receipt }: { receipt(message: string): void }) {
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal) });
  const save = useSaveSettings();
  const error = save.error || settings.error;
  return <Section title="Background tasks">
    <Rows><SettingsRow label="Default processing speed" description="New tasks use this tier. Running tasks can be adjusted individually on the activity page.">
      <ProcessingMode value={settings.data?.taskSpeedMode || 'standard'} busy={!settings.data || save.isPending}
        onChange={(mode) => save.mutate({ taskSpeedMode: mode }, { onSuccess: () => receipt('Saved the default processing speed') })} />
    </SettingsRow></Rows>
    {error ? <Stack divided><ErrorText>{errorMessage(error)}</ErrorText></Stack> : null}
  </Section>;
}

export function VideoThumbnailRow({ epoch = 0 }: { epoch?: number }) {
  return <Section guide="timeline" title="'Timeline thumbnails'"><VideoThumbnailControls epoch={epoch} /></Section>;
}

export function VideoThumbnailControls({ epoch = 0, disabled = false }: { epoch?: number; disabled?: boolean }) {
  const status = useQuery({ queryKey: THUMBNAIL_JOBS_KEY, queryFn: ({ signal }) => fetchThumbnailJobs(signal), refetchOnMount: 'always' });
  const save = useSaveThumbnailMode();
  const reset = save.reset;
  useEffect(() => { reset() }, [epoch, reset]);
  const data = status.data;
  const error = save.error || status.error;
  return (
    <>
      <Rows>
        <SettingsRow label="Timeline preview" description="Extract frames at the chosen interval, processing only videos on local disks.">
          <div id="videoThumbnailSetting">
            <Select aria-label="Thumbnail capture interval" selectedKey={data?.mode || 'off'}
              isDisabled={disabled || !data || status.isFetching || save.isPending}
              onSelectionChange={(key) => { if (key !== null) save.mutate(String(key)) }}>
              {THUMBNAIL_OPTIONS.map(([key, label]) => <SelectItem key={key} id={key}>{label}</SelectItem>)}
            </Select>
          </div>
        </SettingsRow>
      </Rows>
      {save.isPending || data?.status === 'running'
        ? <Stack divided>
            <Help role="status">{save.isPending ? 'Saving…' : 'Scraping.'}</Help>
            {save.isPending ? null : <TaskCenterLink />}
          </Stack>
        : null}
      {error ? <Stack divided><ErrorText>{errorMessage(error)}</ErrorText></Stack> : null}
    </>
  );
}

export function FollowPreferenceRows({ receipt }: { receipt(message: string): void }) {
  const store = appSettingsStore();
  useSyncExternalStore(store.subscribe, store.version);
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal), refetchOnMount: 'always' });
  const initial = useSaveSettings();
  const initialDays = settings.data?.followInitialDays ?? store.value.followInitialDays;
  const error = initial.error || settings.error;
  return (
    <Section guide="follow-options" title="Follows harvesting">
      <Rows>
        <FollowScheduleRow />
        <FeedScheduleRow />
        <SettingsRow label="'Initial scrape range'" description="How far back a newly followed source looks on its first pass.">
          <div id="followInitialDaysSetting" className="shrink-0">
            <Select aria-label="'Initial scrape range'" selectedKey={String(initialDays)}
              isDisabled={settings.isFetching || initial.isPending}
              onSelectionChange={(key) => {
                if (key === null) return;
                initial.mutate({ followInitialDays: Number(key) }, { onSuccess: (saved) => {
                  if (typeof saved.followInitialDays === 'number') store.value.followInitialDays = saved.followInitialDays;
                  store.save();
                  receipt('Initial collection scope saved');
                } });
              }}>
              {FOLLOW_INITIAL_RANGE_OPTIONS.map(([key, label]) => <SelectItem key={key} id={key}>{label}</SelectItem>)}
            </Select>
          </div>
        </SettingsRow>
        <SettingsRow label="Avatar refresh" description="Re-fetch the followed creators' avatars."><span className="shrink-0">Every 3 months</span></SettingsRow>
        <SettingsRow label="Favicon refresh" description="Re-fetch the source site's icon."><span className="shrink-0">Yearly</span></SettingsRow>
      </Rows>
      {error ? <Stack divided><ErrorText>{errorMessage(error)}</ErrorText></Stack> : null}
    </Section>
  );
}

function FollowScheduleRow() {
  const status = useQuery({ queryKey: FOLLOW_SCHEDULE_KEY, queryFn: ({ signal }) => fetchFollowSchedule(signal),
    refetchOnMount: 'always', refetchInterval: (query) => schedulePollInterval(query.state.data) });
  const save = useSaveFollowSchedule();
  const data = status.data;
  const remembered = useRef(boundedPreference(Number(localStorage.getItem('peach.number.followScheduleSetting')), 15, 10080, 60));
  const [draft, setDraft] = useState('60');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (data?.enabled) {
      remembered.current = data.interval_minutes;
      setDraft(String(data.interval_minutes));
    }
  }, [data]);
  const blocked = !data?.available || status.isFetching || save.isPending;
  const commit = () => {
    const minutes = Number(draft);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 10080) { setInvalid(true); return }
    setInvalid(false);
    if (!data?.enabled || blocked || minutes === data.interval_minutes) return;
    remembered.current = minutes;
    localStorage.setItem('peach.number.followScheduleSetting', String(minutes));
    save.mutate(minutes);
  };
  const error = save.error || status.error;
  return (
    <>
      <SettingsRow label="'Auto-check for updates'" description="Sources updated in the last 7 days are checked at this interval; those not updated for a long time slow down step by step, at most once a day">
        {/* The interval box only appears when it's on; this row reserves the height with the box, so the lines below do not shift when the state is read back.
            The controls side never shrinks: on a narrow screen the description on the left wraps, so the toggle and interval box do not push onto it. */}
        <div id="followScheduleSetting" className="flex min-h-9 shrink-0 flex-wrap items-center justify-end gap-2">
          <Switch aria-label="'Auto-check for updates'" isSelected={data?.enabled === true} isDisabled={blocked}
            onChange={(on) => {
              localStorage.setItem('peach.number.followScheduleSetting', String(remembered.current));
              save.mutate(on ? remembered.current : 0);
            }} />
          {data?.enabled ? <div className="flex items-center gap-2">
            <Input type="number" inputMode="numeric" name="follow-interval" autoComplete="off"
              aria-label="'Auto-check interval'" className="w-21 sm:w-24"
              value={draft} onChange={(value) => { setDraft(value); setInvalid(false) }} onBlur={commit}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }}
              isDisabled={blocked} isInvalid={invalid} />
            <span className="text-body-2-regular text-text-secondary">min</span>
          </div> : null}
        </div>
      </SettingsRow>
      {invalid ? <Stack><ErrorText>Enter a whole number from 15 to 10080 (minutes).</ErrorText></Stack> : null}
      {save.isPending || data?.running
        ? <Stack><Help role="status">{save.isPending ? 'Saving…' : 'Checking source updates…'}</Help></Stack> : null}
      <ScheduleFailure kind="follow" status={data} title="The last auto-check failed" />
      {error ? <Stack><ErrorText>{errorMessage(error)}</ErrorText></Stack> : null}
    </>
  );
}

/* Subscription polling has no adjustable tier; this row only reads out the interval and the last round's failure. */
function FeedScheduleRow() {
  const status = useQuery({ queryKey: FEED_SCHEDULE_KEY, queryFn: ({ signal }) => fetchFeedSchedule(signal),
    refetchOnMount: 'always', refetchInterval: (query) => schedulePollInterval(query.state.data) });
  const data = status.data;
  /* On first read, hold this line open: fill in the text once the numbers arrive so the rows below do not jump down. */
  if (!data) {
    return status.isPending ? <SettingsRow label="Feed fetch">
      <span data-skeleton aria-busy="true" aria-label="Reading the follow source fetch interval"
        className="block h-4 w-16 rounded-2lg bg-background-tertiary-default" />
    </SettingsRow> : null;
  }
  const minutes = data.interval_minutes;
  const interval = minutes % 60 ? `Every ${minutes} minutes` : `Every ${minutes / 60} hours`;
  return (
    <>
      <SettingsRow label="Feed fetch">
        <span id="feedScheduleSetting">{!data.available ? 'Only available on the writer instance' : data.enabled ? interval : 'Closed'}</span>
      </SettingsRow>
      {data.running ? <Stack><Help role="status">Fetching follow sources…</Help></Stack> : null}
      <ScheduleFailure kind="feed" status={data} title="The last auto-fetch failed" />
    </>
  );
}

/* The server clears the previous round's reason when a new round starts, so the running round shows none; the next round's success clears it too.
   "Retry now" makes the scheduler run a round early: a manual check bypasses the scheduler, so this reason would not disappear when the run finishes. */
function ScheduleFailure({ kind, status, title }: {
  kind: keyof typeof SCHEDULE_RUNS; status: FollowScheduleStatus | undefined; title: string;
}) {
  const run = useRunSchedule(kind);
  if (!status?.enabled || status.running || !status.last_error) return null;
  const failures = status.consecutive_failures ?? 0;
  const next = momentText(status.next_run_at);
  const detail = [failures > 1 ? `Failed ${failures} times in a row` : '', next ? `Next round ${next}` : '']
    .filter(Boolean).join(', ');
  const reason = [status.last_error, detail, run.error ? `No retry: ${errorMessage(run.error)}` : '']
    .filter(Boolean).join('\n');
  return (
    <Stack>
      <Note tone="error" title={title} action={<Button variant="secondary" size="small"
        disabled={!status.available} {...busyProps(run.isPending)} onClick={() => run.mutate()}>Retry now</Button>}>
        {reason}
      </Note>
    </Stack>
  );
}
