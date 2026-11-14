/* 检查更新：当前与最新版本、下载安装进度，准备好之后确认重启。
 *
 * 更新任务进行中每秒问一次状态，空闲时 30 秒一次；连续 120 次问不到就停下并说明原因。
 * Docker 镜像配好 Watchtower 时给「一键更新」，没配好时列出宿主机上的两步命令。 */
import { useEffect, useRef, useState } from 'react';
import { confirmModal } from '@peach/legacy/ui';

import { Button, ButtonLink } from '@/components/base/buttons/button';

import { apiGet, apiSend, errorMessage } from '../../api';
import type { ReleaseState, UpdateJob } from '../bundle';
import { Note } from '../components/note';
import { Progress } from '../components/progress';
import { StatusLabel } from '../components/status-label';
import { DockerUpdateProgress, useDockerUpdate } from './docker-update';
import { RELEASE_NOTICE_EVENT } from '../release-notice';
import { CommandSteps, ErrorText, ExternalLink, Fact, FactList, Footer, Help, Section, Stack } from './section';
import { busyProps, useAction } from './use-action';

const ACTIVE = new Set(['downloading', 'verifying', 'extracting', 'preparing', 'restarting', 'installing']);
const STOPS = [65, 75, 90];
const MAX_FAILURES = 120;
/** Where to go when the server provides no release page; after an update check the server gives that release's own page. */
const RELEASES_URL = 'https://github.com/peach-mitao/peach/releases';

export function ReleaseUpdates({ initial, initialJob }: { initial: ReleaseState; initialJob?: UpdateJob | undefined }) {
  const [data, setData] = useState(initial);
  const [job, setJob] = useState<UpdateJob>(initialJob || { state: 'idle', progress: 0 });
  const [pollError, setPollError] = useState('');
  const action = useAction();
  const prompted = useRef(false);
  const mounted = useRef(true);
  const running = ACTIVE.has(job.state);
  const container = useDockerUpdate(initial.current_version);
  const oneClick = data.state === 'available' && !!data.one_click?.available;
  const rebuilding = container.job.state === 'updating';
  const confirmDockerUpdate = () => void confirmModal({
    title: 'Update in one click', body: `Watchtower will pull the Peach ${data.latest_version || ''} image and recreate the container; the /data volume is kept.`
      + 'Peach disconnects during the rebuild; running tasks resume after startup. When database migrations are pending, the database is backed up before they run.',
    confirmLabel: 'Start the update', cancelLabel: 'Cancel', onConfirm: container.run,
  });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const restart = async () => {
    const result = await apiSend<UpdateJob>('/api/configuration/update-restart', {});
    if (mounted.current) setJob(result);
  };
  const confirmRestart = () => void confirmModal({
    title: 'The update is ready', body: `Peach ${job.version || ''} will be installed after a restart.`,
    confirmLabel: 'Restart now', cancelLabel: 'Later', onConfirm: restart,
  });

  useEffect(() => {
    if (job.state !== 'ready' || prompted.current) return;
    prompted.current = true;
    confirmRestart();
  }, [job.state]);

  useEffect(() => {
    const controller = new AbortController();
    const delay = ACTIVE.has(job.state) ? 1000 : 30000;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const result = await apiGet<UpdateJob>('/api/configuration/update-status', controller.signal);
        if (controller.signal.aborted) return;
        setJob(result);
        failures = 0;
        if (result.state === 'complete') {
          setData((current) => ({ ...current, current_version: result.version || current.current_version, state: 'current', message: 'Already the latest beta.' }));
        }
        const automatic = await apiGet<{ result?: ReleaseState }>('/api/configuration/automatic-updates', controller.signal);
        if (!controller.signal.aborted && automatic.result) setData(automatic.result);
      } catch {
        failures += 1;
        if (failures >= MAX_FAILURES && !controller.signal.aborted) setPollError('Not connected to Peach yet; check the tray, then refresh the page.');
      }
      if (!controller.signal.aborted && failures < MAX_FAILURES) timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, delay);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [job.state]);

  const download = () => {
    if (running) return;
    prompted.current = false;
    setPollError('');
    void action.run('download', (signal) => apiSend<UpdateJob>('/api/configuration/update', {}, 'POST', signal), setJob);
  };
  const check = () => void action.run('check', (signal) => apiGet<ReleaseState>('/api/configuration/updates', signal), setData,
    (cause) => { setData({ ...initial, state: 'error' }); action.setError(errorMessage(cause)); });

  const error = action.error || pollError || container.error;
  const reading = job.state === 'downloading' && job.total
    ? `${((job.downloaded || 0) / 1048576).toFixed(1)} / ${(job.total / 1048576).toFixed(1)} MB`
    : `${job.progress}%`;
  return (
    <Section id="releaseUpdates" guide="updates" title="Check updates" aside={<StatusLabel tone={error || data.state === 'error' || job.state === 'error' || container.job.state === 'timeout' ? 'error' : running || rebuilding ? 'progress' : container.job.state === 'done' ? 'success' : data.state === 'available' ? 'warning' : data.state === 'unchecked' ? 'neutral' : 'success'}>
      {error || data.state === 'error' || job.state === 'error' ? 'Check unfinished' : container.job.state === 'timeout' ? 'Update unfinished' : running ? 'Preparing update' : rebuilding ? 'Updating' : container.job.state === 'done' ? 'Updated' : job.state === 'ready' ? 'Installable' : data.state === 'available' ? 'Update available' : data.state === 'unchecked' ? 'Not checked yet' : 'Check finished'}</StatusLabel>}>
      <FactList>
        <Fact term="Current version">{container.job.state === 'done' ? container.job.version : data.current_version}</Fact>
        <Fact term="Install method">{data.installation}</Fact>
        <Fact term="Update channel">{data.channel}</Fact>
        <Fact term="Latest version">{data.latest_version || 'Not fetched'}</Fact>
        {data.package_kind ? <Fact term="Download contents">
          {data.package_kind === 'update' ? 'Apply update' : data.package_kind === 'installer' ? 'macOS install image' : 'Apps and tools'}
          {data.asset_size ? ` · ${(data.asset_size / 1048576).toFixed(1)} MB` : ''}
        </Fact> : null}
      </FactList>
      {data.package_kind === 'update'
        ? <Help>The app update package reuses installed tools; missing, damaged, or changed-version tools are downloaded separately as needed.</Help>
        : data.package_kind === 'full' ? <Help>This update includes media tools.</Help>
          : data.package_kind === 'installer' ? <Help>After downloading, open the image and drag Peach into Applications to replace the old version; the data directory and settings are kept. If macOS says it is damaged, follow the release page to clear the quarantine flag.</Help> : null}
      {data.state === 'unchecked' && !data.checked_at && !error && job.state === 'idle' ? null : <Stack divided>
        {data.checked_at ? <Help>Checked at {new Date(data.checked_at * 1000).toLocaleString()}</Help> : null}
        {container.job.state === 'done' ? null : data.state === 'available' && !error
          ? <Note tone="info" title="Update available">{data.message}</Note>
          : error || data.state === 'error'
            ? <ErrorText>{error || data.message}</ErrorText>
            : data.state === 'unchecked' ? null : <Help role="status">{data.message}</Help>}
        {/* 容器没启用 Watchtower 时没有应用内更新：在宿主机上拉镜像、重建容器，并说明怎样才能一键更新。 */}
        {data.state === 'available' && !error && !oneClick && container.job.state === 'idle' && data.steps?.length
          ? <>
              <CommandSteps label="Update on the host" steps={data.steps} />
              <Help>{data.one_click?.reason || 'Once Watchtower runs with the compose watchtower profile, you can update from here in one click; read the Docker deployment notes before enabling it.'}</Help>
            </> : null}
        <DockerUpdateProgress job={container.job} />
        {job.state === 'error' ? <ErrorText>{job.message}</ErrorText> : null}
        {job.state !== 'idle' && job.state !== 'error' ? (
          <div aria-live="polite" className="flex flex-col gap-2">
            <Progress label="Update preparation progress" value={job.progress} stops={STOPS} />
            <Help>Download → verify → extract → preparing install · {job.message}</Help>
            <Help>{reading}</Help>
          </div>
        ) : null}
      </Stack>}
      <Footer status={<div className="flex flex-wrap items-center gap-3">
        <ExternalLink href="https://peach.video/#download">Official site</ExternalLink>
        <ExternalLink href="https://github.com/peach-mitao/peach">GitHub</ExternalLink>
        <ExternalLink href={data.release_url || RELEASES_URL}>View release page</ExternalLink>
      </div>}>
        <Button variant="ghost" onClick={() => document.dispatchEvent(new Event(RELEASE_NOTICE_EVENT))}>Release notes for this version</Button>
        <Button variant={job.state === 'ready' || oneClick || (data.state === 'available' && data.installation === 'Standalone test package') ? 'secondary' : 'primary'}
          disabled={running || rebuilding} onClick={check} {...busyProps(action.busy === 'check')}>Check updates</Button>
        {container.job.state === 'done'
          ? <Button variant="primary" onClick={() => window.location.reload()}>Refresh the page</Button>
          : oneClick
            ? <Button variant="primary" onClick={confirmDockerUpdate} {...busyProps(rebuilding || container.busy)}>Update in one click</Button>
            : null}
        {data.state === 'available' && data.in_app_update && job.state !== 'ready'
          ? <Button variant="primary" onClick={download} {...busyProps(running || action.busy === 'download')}>Download and install</Button>
          : data.state === 'available' && data.installation === 'Standalone test package' && data.asset_url
            ? <ButtonLink variant="primary" href={data.asset_url}>Download the new version</ButtonLink>
            : null}
        {job.state === 'ready' ? <Button variant="primary" onClick={confirmRestart}>Restart to install</Button> : null}
      </Footer>
    </Section>
  );
}
