/* Sources and credentials page: how each collection source connects and with what identity, plus one pass to fetch better
 * covers by code.
 *
 * This is the first React page with write operations, and two things were settled here:
 * - **Writes are `useMutation`**, outside Query's cache rhythm. After a successful save, `setQueryData` swaps the
 *   server-returned entry into the list rather than refetching the page: the user may be filling another card, and a refetch
 *   would re-render it too. Failure leaves one line of reason inside the card, and the cached copy stays untouched.
 * - **Background jobs use `useBackgroundJob`**: every two seconds while running, silent once stopped, and an old terminal
 *   state read on first screen does not masquerade as a new result. Polling follows the component; when the legacy shell
 *   changes pages it unmounts the root and the polling stops with it. */
import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Radio } from 'react-aria-components';

import { SettingsRow } from '@/components/application/settings/settings-rows';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

import { apiSend, errorMessage } from '../../api';
import { momentText } from '../activity/tasks';
import { useBackgroundJob } from '../background-job';
import type { ScrapingProps } from '../bundle';
import { IssueRow } from '../components/issue-row';
import { LoadingDots } from '../components/loading-dots';
import { Note } from '../components/note';
import { Progress } from '../components/progress';
import { StatusLabel, type StatusTone } from '../components/status-label';
import { ConnectionStatus } from '../components/connection-status';
import { Page } from '../components/page';
import { SiteMark } from '../components/site-mark';
import { SEGMENT, SEGMENTED_TRACK, SegmentedRadioGroup as RadioGroup } from '../components/segmented';
import { queryClient } from '../query';
import {
  Disclosure, ErrorText, ExternalLink, Fact, FactList, FieldLabel, Footer, Help, Rows, Section, Stack,
} from '../settings/section';
import { busyProps } from '../settings/use-action';
import { CustomSources } from './custom-sources';
import {
  AMANE_BRIDGE_CHECK_URL, AMANE_BRIDGE_KEY, AMANE_BRIDGE_REBUILD_URL, CHECK_ALL_KEY,
  checkText, COOKIE_TEXT_LIMIT, COVER_JOB_KEY, fetchAmaneBridge, fetchCheckAllJob, fetchCoverJob,
  fetchSources, SCRAPING_CHECK_ALL_URL, SCRAPING_CHECK_URL, SCRAPING_COVER_URL, SCRAPING_KEY,
  SCRAPING_SETTINGS_URL, type AmaneBridge, type Check, type CheckAllJob, type CheckOutcome,
  type CoverJob, type ReportedCheck, type ScrapingData, type Source, type SourceReport,
} from './scraping';

const NETWORKS = [['peach', 'Peach proxy'], ['direct', 'Direct connection']] as const;

/** Connection method options. When the database holds a value other than these two (written by an older version, or hand-edited), list it verbatim as an option,
 *  so the select shows what is actually there instead of falling to an empty placeholder. */
export function networkOptions(current: string): (readonly [string, string])[] {
  return NETWORKS.some(([key]) => key === current) || !current ? [...NETWORKS] : [...NETWORKS, [current, current]];
}

/** Login page external links show only the host name: a full URL squeezes section titles into one character per line on narrow screens, and the path says nothing about which site it is. */
export function linkHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
const COOKIE_METHODS = [['paste', 'Paste cookies'], ['file', 'Import file']] as const;

function GitHubMark() {
  return <SiteMark source="github" />;
}

/** One card per source: how to connect and with what identity, plus three actions underneath. */
function SourceCard({ source, toast }: { source: Source } & ScrapingProps) {
  const [network, setNetwork] = useState(source.network);
  const [cookie, setCookie] = useState('');
  const [cookieText, setCookieText] = useState('');
  const [method, setMethod] = useState<string>(COOKIE_METHODS[0][0]);
  const [fileName, setFileName] = useState('');
  const [fileProblem, setFileProblem] = useState('');
  const file = useRef<HTMLInputElement>(null);

  /* The secret exists on the page only at the moment of submission: after the save returns, the input clears, leaving no copy of what was just
     submitted on the page. The file picker must be cleared too, or selecting the same file again fires no change. */
  function forgetSecrets() {
    setCookie('');
    setCookieText('');
    setFileName('');
    setFileProblem('');
    if (file.current) file.current.value = '';
  }

  const save = useMutation({
    mutationFn: (revoke: boolean) => apiSend<{ saved: Source }>(SCRAPING_SETTINGS_URL, {
      source: source.source, network, cookie, cookies_text: cookieText, revoke,
    }),
    onSuccess: (result, revoke) => {
      // The server returns this row's new form, so swap it into the list; never refetch the whole page for one save.
      queryClient.setQueryData<ScrapingData>(SCRAPING_KEY, (current) => current && {
        ...current,
        sources: current.sources.map(
          (row) => (row.source === result.saved.source ? result.saved : row)),
      });
      forgetSecrets();
      toast(revoke ? 'Cookies revoked' : 'Source settings saved');
    },
  });
  const check = useMutation({
    mutationFn: () => apiSend<{ results: Check[] }>(SCRAPING_CHECK_URL, { source: source.source }),
  });
  // The three actions on one card are mutually exclusive: they edit the same credential, and whichever lands first makes the other's outcome ambiguous.
  const busy = save.isPending || check.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    check.reset();
    save.mutate(false);
  };
  const revoke = () => {
    if (busy) return;
    check.reset();
    save.mutate(true);
  };
  const connect = () => {
    if (busy) return;
    save.reset();
    check.mutate();
  };

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    setCookieText('');
    setFileProblem('');
    if (!selected) {
      setFileName('');
      return;
    }
    if (selected.size > COOKIE_TEXT_LIMIT) {
      // Oversized uploads are usually not Cookie files at all. Block them in the browser instead of spending a request on them.
      input.value = '';
      setFileName('');
      setFileProblem('The cookie text exceeds 256 KiB');
      return;
    }
    try {
      const text = await selected.text();
      setCookieText(text);
      setFileName(selected.name);
    } catch {
      setFileProblem('The cookie file was not read; choose it again');
    }
  }

  const problem = fileProblem
    || (save.error ? errorMessage(save.error) : '')
    || (check.error ? errorMessage(check.error) : '');
  const results = check.data?.results ?? [];
  // When this block is empty it is skipped along with its divider: a direct-connect source that takes no cookies has only the connection-method row.
  const detailed = network === 'peach' || source.accepts_cookie || source.browser || !!problem || results.length > 0;

  return (
    <Section title={source.label} onSubmit={submit} aside={
      <span className="flex min-w-0 items-center gap-1">
        <SiteMark source={source.source} />
        {source.login ? <ExternalLink href={source.login}>{linkHost(source.login)}</ExternalLink> : null}
      </span>
    }>
      <Rows>
        <SettingsRow label="Connection method">
          {/* Fixed width: long database values stretching the column would squeeze the "connection method" on the left into vertical text; with a fixed width the value truncates inside the box. */}
          <Select aria-label="Connection method" className="w-44 min-w-0" selectedKey={network}
            onSelectionChange={(key) => { if (key !== null) setNetwork(String(key)) }}>
            {networkOptions(network).map(([key, name]) => <SelectItem key={key} id={key}>{name}</SelectItem>)}
          </Select>
        </SettingsRow>
      </Rows>
      {source.cooldown_until && source.cooldown_until > Date.now() / 1000 ? (
        <Note tone="warning"><span className="inline-flex flex-wrap items-center gap-2"><StatusLabel tone="warning">Cooling down</StatusLabel><span>Under {new Date(source.cooldown_until * 1000).toLocaleString('zh-CN')} then retry.</span></span></Note>
      ) : null}
      {detailed ? <Stack divided>
        {network === 'peach'
          ? <span className="self-start">
              <LinkButton href="/settings/library#peachProxy" size="small" trailingIcon={RiArrowRightLine}>
                Configure Peach proxy
              </LinkButton>
            </span>
          : null}
        {/* Sources verified by the local browser take no Cookie: the browser carries its own session. "Revoke Cookie" stays around so old ones can be cleared. */}
        {source.browser
          ? <p className="text-body-2-regular text-text-secondary">
              Human verification is completed automatically by the local browser; a window pops up when a click is needed. No cookies are needed on this machine.
            </p>
          : null}
        {source.accepts_cookie && !source.browser ? <>
          <div className="flex flex-col gap-2"><span className="self-start"><StatusLabel tone={source.cookie_saved ? 'success' : 'neutral'}>{source.cookie_saved ? 'Cookies saved' : 'Cookies not configured'}</StatusLabel></span>
            <p className="text-body-2-regular text-text-secondary">{source.cookie_saved ? 'Login validity pending verification.' : 'When login is required, provide a Cookie using any one of these methods.'}</p></div>
          {/* The two methods are mutually exclusive and only one can be submitted: clear the other's input on switch,
              keeping the hidden one from riding along on submit. */}
          <RadioGroup aria-label="How to provide cookies (choose one)" value={method}
            onChange={(next) => { setMethod(next); forgetSecrets() }}
            className={SEGMENTED_TRACK}>
            {COOKIE_METHODS.map(([value, label]) => (
              <Radio key={value} value={value} className={SEGMENT}>
                {label}
              </Radio>
            ))}
          </RadioGroup>
          {method === 'paste'
            ? <Input type="password" label="Cookie" autoComplete="off" value={cookie} onChange={setCookie} />
            : <div className="flex flex-col gap-2">
                <FieldLabel>Netscape Cookie file (.txt)</FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => file.current?.click()}>Choose file</Button>
                  <span className="min-w-0 text-body-2-regular break-all text-text-secondary">
                    {fileName || 'No file selected'}
                  </span>
                </div>
                {/* The native file picker's look is not controllable: the button is BoardUI's, and the input remains only to receive files. */}
                <input ref={file} type="file" accept=".txt" tabIndex={-1} aria-hidden
                  className="hidden" onChange={(event) => { void pickFile(event) }} />
              </div>}
        </> : null}
        {problem ? <ErrorText>{problem}</ErrorText> : null}
        {results.map((result) => (
          <Note key={result.label} tone={result.ok ? 'success' : 'error'}>
            <span className="flex flex-col items-start gap-1"><ConnectionStatus tone={result.ok ? 'success' : 'error'}>{result.ok ? 'Accessible' : 'Connection failed'}</ConnectionStatus><span>{checkText(result, source.label)}</span></span>
          </Note>
        ))}
      </Stack> : null}
      {/* The primary action sits at the far right. Secondary actions come first; Save is this card's only write and goes at the end of the row;
          it is the form's only `type=submit`, so moving it does not affect Enter to submit. */}
      <Footer>
        {source.accepts_cookie && source.cookie_saved
          ? <Button variant="secondary" onClick={revoke} {...busyProps(busy)}>Revoke Cookie</Button>
          : null}
        <Button variant="secondary" onClick={connect} {...busyProps(busy)}>Check connection</Button>
        <Button type="submit" {...busyProps(busy)}>Save</Button>
      </Footer>
    </Section>
  );
}

/** 报告口径的着色：要人去处理的标黄，连不上的标红，片商官网那种不在这里查的标灰。 */
const OUTCOME_TONES: Record<CheckOutcome, StatusTone> = {
  ok: 'success', auth: 'warning', http: 'error', cooldown: 'warning', network: 'error', skipped: 'neutral',
};
/** 摘要里各口径的先后：先可连接，再按要人动手的程度排。 */
const OUTCOME_ORDER: CheckOutcome[] = ['ok', 'auth', 'cooldown', 'http', 'network', 'skipped'];

/** 一项检查的名字：只查一跳的来源就是它本身。 */
function targetName(report: SourceReport, check: ReportedCheck): string {
  return check.label === 'Source page' ? report.label : `${report.label} images`;
}

/** 全部来源一次检查完，与 `peach check-sources` 同一检查、同一报告口径。这一趟在后台跑，
 *  离开页面再回来，读到的是服务端留着的那一份结果。 */
function CheckAllCard({ toast }: ScrapingProps) {
  const { job, running, start, query: taskQuery } = useBackgroundJob<CheckAllJob>({
    queryKey: CHECK_ALL_KEY,
    queryFn: ({ signal }) => fetchCheckAllJob(signal),
    start: () => apiSend<CheckAllJob>(SCRAPING_CHECK_ALL_URL, {}),
    onFinish: (state) => {
      // 限流与拒绝访问会记下冷却，各来源卡上的「冷却中」跟着重读。
      void queryClient.invalidateQueries({ queryKey: SCRAPING_KEY, exact: true });
      if (state.status === 'complete') toast(state.failed ? `Check finished, ${state.failed} failed` : 'Check finished, all reachable');
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskQuery.data || running || start.isPending) return;
    start.mutate();
  };

  const checks = (job?.results ?? []).flatMap(
    (report) => report.results.map((check) => ({ source: report.source, name: targetName(report, check), check })));
  // 站标跟名字走，同来源卡标题旁的那一枚。
  const titled = (source: string, name: string) =>
    <span className="inline-flex min-w-0 items-center gap-1.5"><SiteMark source={source} />{name}</span>;
  const passed = checks.filter(({ check }) => check.outcome === 'ok');
  // 按口径成组，组内保持来源顺序：要人去登录的排前面，不在这里查的片商官网垫底。
  const problems = checks.filter(({ check }) => check.outcome !== 'ok').sort(
    (a, b) => OUTCOME_ORDER.indexOf(a.check.outcome) - OUTCOME_ORDER.indexOf(b.check.outcome));
  const problem = start.error ? errorMessage(start.error)
    : taskQuery.error ? errorMessage(taskQuery.error)
    : job?.status === 'failed' ? (job.error || 'Check unfinished') : '';
  const finished = job?.status === 'complete' && job.completed_at
    ? [momentText(new Date(job.completed_at * 1000).toISOString()),
       job.elapsed_s !== undefined ? `Took ${job.elapsed_s.toFixed(1)} s` : ''].filter(Boolean).join(' · ')
    : '';

  return (
    <Section id="check-all" title="Connectivity check" onSubmit={submit}>
      <Stack>
        {taskQuery.isPending ? <div role="status" aria-label="Reading the connection check state" data-skeleton="" className="skeleton-sheen h-6 rounded-md" /> : null}
        {/* 说明写在一行里：拆行的 JSX 文本渲染时多出空格，改字工具就对不上源码。 */}
        <Help>Checks each source page and the DMM HD image servers. Reachable only means the address answers, not that the login works.</Help>
        {running
          ? <div className="flex flex-col gap-2">
              <Progress label="Connectivity check progress" value={job?.checked ?? 0} max={job?.total ?? 0} />
              <Help role="status">Checked {job?.checked ?? 0} / {job?.total ?? 0} sources</Help>
            </div>
          : null}
        {problem ? <Note tone="error">{problem}</Note> : null}
        {checks.length
          ? <div className="flex flex-wrap gap-2">
              {OUTCOME_ORDER.map((key) => {
                const count = checks.filter(({ check }) => check.outcome === key).length;
                return count ? <StatusLabel key={key} tone={OUTCOME_TONES[key]}>
                  {checks.find(({ check }) => check.outcome === key)?.check.outcome_label} {count}
                </StatusLabel> : null;
              })}
            </div>
          : null}
        {problems.length
          ? <ul className="flex min-w-0 flex-col">
              {problems.map(({ source, name, check }) => (
                <IssueRow key={name} title={titled(source, name)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusLabel tone={OUTCOME_TONES[check.outcome]}>{check.outcome_label}</StatusLabel>
                    {check.message
                      ? <span className="text-body-2-regular text-text-secondary">{check.message}</span>
                      : null}
                  </span>
                </IssueRow>
              ))}
            </ul>
          : null}
        {passed.length
          ? <Disclosure summary={`${passed.length} reachable`}>
              <FactList>
                {passed.map(({ source, name, check }) => (
                  <Fact key={name} term={titled(source, name)}>
                    {[check.width ? `${check.width} × ${check.height}` : '',
                      check.elapsed_s !== undefined ? `${check.elapsed_s.toFixed(2)} s` : ''].filter(Boolean).join(' · ')}
                  </Fact>
                ))}
              </FactList>
            </Disclosure>
          : null}
      </Stack>
      <Footer status={finished ? `Last check ${finished}` : undefined}>
        <Button type="submit" disabled={!taskQuery.data} {...busyProps(running || start.isPending)}>All checks</Button>
      </Footer>
    </Section>
  );
}

/** Fetch one HD cover by code. This run happens in the background with its state left on the page. */
function CoverCard({ toast }: ScrapingProps) {
  const [code, setCode] = useState('');
  const { running, outcome, start, query: taskQuery } = useBackgroundJob<CoverJob>({
    queryKey: COVER_JOB_KEY,
    queryFn: ({ signal }) => fetchCoverJob(signal),
    start: () => apiSend<CoverJob>(SCRAPING_COVER_URL, { code }),
    onFinish: (state) => {
      if (state.status === 'complete') toast(state.result || 'Cover scraping finished');
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskQuery.data || running || start.isPending || !code.trim()) return;
    start.mutate();
  };

  const problem = start.error ? errorMessage(start.error)
    : taskQuery.error ? errorMessage(taskQuery.error)
    : outcome?.status === 'failed' ? (outcome.error || 'Scrape not fetched') : '';
  return (
    <Section title="HD cover" onSubmit={submit}>
      <Stack>
        {taskQuery.isPending ? <div role="status" aria-label="Reading the cover task state" data-skeleton="" className="skeleton-sheen h-6 rounded-md" /> : null}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input aria-label="Library code" isRequired isDisabled={running} value={code} onChange={setCode}
              placeholder="Enter a library code, e.g. ABW-232" />
          </div>
            <Button type="submit" disabled={!taskQuery.data || !code.trim()} {...busyProps(running || start.isPending)}>
            Scrape cover
          </Button>
        </div>
        {/* This run asks several sites one by one and may go through a proxy; there is no countable total and inventing a percentage is out.
            It keeps running when the page closes and can be picked up on return, so the state has to live on the page, not in a spinning button. */}
        {running ? <LoadingDots label="Scraping covers" /> : null}
        {problem ? <Note tone="error">{problem}</Note> : null}
        {outcome?.status === 'complete'
          ? <Note tone="success">{outcome.result || 'Cover scraping finished'}</Note>
          : null}
      </Stack>
    </Section>
  );
}

/** The amane bridge: which revision is pinned, whether the venv exists, what upstream's latest is. Upgrades are a human reading the diff and editing the manifest;
 *  this card does two things: ask upstream for the latest version, and rebuild the venv at the pinned version. */
function AmaneBridgeCard({ toast }: ScrapingProps) {
  const { query: bridge, running, outcome, start: rebuild } = useBackgroundJob<CoverJob, void, AmaneBridge>({
    queryKey: AMANE_BRIDGE_KEY,
    queryFn: ({ signal }) => fetchAmaneBridge(signal),
    start: () => apiSend<CoverJob>(AMANE_BRIDGE_REBUILD_URL, {}),
    // This key caches the whole card; this run's snapshot only swaps into the `job` cell.
    jobOf: (card) => card.job,
    withJob: (card, started) => card && { ...card, job: started },
    onFinish: (state) => {
      if (state.status === 'complete') toast(state.result || 'The amane bridge was rebuilt');
    },
  });
  const check = useMutation({
    mutationFn: () => apiSend<{ latest: string }>(AMANE_BRIDGE_CHECK_URL, {}),
  });

  const data = bridge.data;

  if (!data) {
    return bridge.error
      ? <Section id="amane" title="amane"><Stack><Note tone="error">{errorMessage(bridge.error)}</Note></Stack></Section>
      : null;
  }
  const busy = running || rebuild.isPending || check.isPending;
  const problem = rebuild.error ? errorMessage(rebuild.error)
    : check.error ? errorMessage(check.error)
    : outcome?.status === 'failed' ? (outcome.error || 'Rebuild unfinished') : '';
  return (
    <Section id="amane" title="amane" aside={<ExternalLink href={data.repository} leadingIcon={GitHubMark}>{data.repository}</ExternalLink>}>
      <FactList>
        <Fact term="Installed version">{data.installed_version || 'Not installed'}</Fact>
        <Fact term="Latest upstream version">{check.data?.latest ?? 'Not checked yet'}</Fact>
        <Fact term="Runtime environment">{data.installed ? 'Installed' : 'Not installed'}</Fact>
        <Fact term="Built-in sites">{data.sites.length.toLocaleString()} items</Fact>
      </FactList>
      <Stack divided>
        {data.sites.length
          ? <Disclosure summary="View built-in sites">
              <p className="text-body-2-regular text-text-secondary">{data.sites.map((site) => site.label).join(', ')}</p>
            </Disclosure>
          : null}
        {data.problem
          ? <Note tone="error">{data.problem}</Note>
          : <Help>amane ({data.license}) provides resolution for these built-in sites. The first time one is needed, Peach automatically prepares the pinned {data.version} version; used directly when the installer already ships a working environment.
              Manual installs also use this version and do not auto-upgrade with upstream.
            </Help>}
        {running ? <LoadingDots label="Rebuilding the runtime environment" /> : null}
        {problem ? <Note tone="error">{problem}</Note> : null}
        {outcome?.status === 'complete' ? <Note tone="success">{outcome.result || 'The amane bridge was rebuilt'}</Note> : null}
      </Stack>
      <Footer>
        <Button variant="secondary" onClick={() => { if (!busy) check.mutate() }} {...busyProps(check.isPending)}>
          Check upstream version
        </Button>
        <Button disabled={Boolean(data.problem)} onClick={() => { if (!busy) rebuild.mutate() }}
          {...busyProps(running || rebuild.isPending)}>
          {data.installed ? 'Reinstall' : 'Install'}
        </Button>
      </Footer>
    </Section>
  );
}

export function ScrapingPage({ toast }: ScrapingProps) {
  const sources = useQuery({ queryKey: SCRAPING_KEY, queryFn: ({ signal }) => fetchSources(signal) });
  const data = sources.data;
  if (!data) {
    return (
      <Page>
        <Note tone="error" title="Reading scrape sources failed">
          {sources.error ? errorMessage(sources.error) : 'Reading scrape sources failed'}
        </Note>
      </Page>
    );
  }
  return (
    <Page>
      <p className="text-body-2-regular text-text-secondary">HD images may need the proxy to download; check the connection first.</p>
      <CheckAllCard toast={toast} />
      <CoverCard toast={toast} />
      <CustomSources receipt={toast} />
      {(data.sources || []).map(
        (source) => <SourceCard key={source.source} source={source} toast={toast} />)}
      <AmaneBridgeCard toast={toast} />
    </Page>
  );
}
