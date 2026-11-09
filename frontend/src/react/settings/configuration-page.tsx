/* Configuration page (`/settings/library`): the multi-field forms needing "Save configuration" on the machine running Peach.
 * Each section takes one tab cell, one group on screen at a time; local configuration permission and database write
 * permission are judged separately by the server.
 * The settings overlay's "Peach configuration" entry points here.
 *
 * First layer of `.ui-configpage`: first the tab bar (`.ui-board-local-nav`), then each group's `h2.ui-configgroup` heading
 * immediately followed by that group's root node, the root node being that tab's panel. The heading is not displayed in
 * styles; its text already sits on the tab; groups with no content drop the heading and tab together. The tab bar is present
 * from the first frame, rendered in the same commit as the page. */
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { peachHistory, shellNavigate, settingsPath } from '@peach/history';

import { errorMessage } from '../../api';
import { Button } from '@/components/base/buttons/button';
import type { ConfigurationData, ConfigurationPanel, ConfigurationProps } from '../bundle';
import { Note } from '../components/note';
import { SortableBoardTabs } from '../components/navigation-order';
import { CONFIGURATION_KEY, fetchConfiguration } from './configuration';
import { DownloadGroup } from './download-settings';
import { GeneralSettings } from './general-settings';
import { MaintenanceSettings } from './maintenance-settings';
import { MediaSettings } from './media-settings';
import { MediaProcessingSettings, PlaybackTranscodeSettings } from './media-processing-settings';
import { TaskSpeedSettings } from './service-preferences';
import { CodePatternSettings } from './code-pattern-settings';
import { NetworkSettings } from './network-settings';
import { SourceSettings } from './source-settings';
import { groupRoot } from './configuration-panel';
import { downloadsShape, maintenanceShape, networkShape } from './configuration-shape';
import { rememberShape } from '../../configuration-skeleton';
import { busyProps } from './use-action';

export function ConfigurationPage({ receipt, reopenTutorial, section = '', diagnostics }: ConfigurationProps & { diagnostics?: ReactElement }) {
  const config = useQuery({
    queryKey: CONFIGURATION_KEY, queryFn: ({ signal }) => fetchConfiguration(signal),
  });
  const data = config.data;
  if (!data) {
    return (
      <div className="ui-configpage">
        <Note tone="error" title="Reading the configuration failed">
          {config.error ? errorMessage(config.error) : 'The configuration could not be fetched; refresh the page and retry.'}
        </Note>
      </div>
    );
  }
  return <ConfigurationGroups data={data} receipt={receipt} reopenTutorial={reopenTutorial} section={section} diagnostics={diagnostics}
    refreshing={config.isFetching} reload={() => { void config.refetch({ cancelRefetch: false }); }} />;
}

function ConfigurationIssues({ data, sections, reload, refreshing }: {
  data: ConfigurationData; sections: string[]; reload(): void; refreshing: boolean;
}) {
  return <>{sections.map(key => {
    const issue = data.section_errors?.[key];
    return issue ? <Note key={key} tone="error" title={issue.title}
      action={<Button variant="secondary" size="small" onClick={reload} {...busyProps(refreshing)}>Read again</Button>}>{issue.message}</Note> : null;
  })}</>;
}

interface Group { id: string; title: string; body(panel: ConfigurationPanel): ReactElement }

/* Tab and panel id prefixes are counted per tab bar: each newly rendered tab bar takes the next number. */
let tabSequence = 0;

/* The tab strip is a tablist: arrow keys walk the whole row and wrap at the ends, Home/End jump to the two ends, and moving to a tab selects it with focus following.
   The section URL stays in sync with the selection, and forms stay mounted. */
function ConfigurationGroups(
  { data, receipt, reopenTutorial, section, diagnostics, reload, refreshing }: Required<ConfigurationProps> & {
    data: ConfigurationData; diagnostics?: ReactElement; reload(): void; refreshing: boolean;
  },
) {
  const [prefix] = useState(() => `board-tabs-${++tabSequence}`);
  const [chosen, setChosen] = useState(section);
  const workspace = useRef<HTMLDivElement>(null);
  const previous = useRef(chosen);
  useEffect(() => { setChosen(section) }, [section]);
  /* Download channels, network and access, application and maintenance all paint with this config at once: record the structure, and the next full-page skeleton lays out by it. */
  useEffect(() => {
    const downloads = downloadsShape(data);
    if (downloads) rememberShape('downloads', downloads);
    rememberShape('network', networkShape(data));
    rememberShape('maintenance', maintenanceShape(data));
  }, [data]);
  useLayoutEffect(() => {
    if (previous.current === chosen) return;
    previous.current = chosen;
    const nav = workspace.current?.querySelector<HTMLElement>('.ui-board-local-nav');
    const panel = workspace.current?.querySelector<HTMLElement>('.ui-board-group-active');
    if (!nav || !panel) return;
    const boundary = parseFloat(getComputedStyle(nav).top);
    if (!Number.isFinite(boundary) || nav.getBoundingClientRect().top > boundary + 1) return;
    const top = matchMedia('(max-width:900px)').matches ? nav.getBoundingClientRect().bottom + 8 : boundary;
    window.scrollTo(0, Math.max(0, window.scrollY + panel.getBoundingClientRect().top - top));
  }, [chosen]);
  const choose = (title: string) => {
    setChosen(title);
    shellNavigate(settingsPath(title), { replace: true, state: peachHistory.navigation.location.state });
  };
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width:900px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width:900px)');
    const changed = () => setNarrow(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const group = { data, receipt };
  const issues = (sections: string[]) => <ConfigurationIssues data={data} sections={sections} reload={reload} refreshing={refreshing} />;
  const networkKeys = ['peach_proxy', 'access', 'tunnel', 'push_discovery',
    ...(data.editable && data.port_editable !== false ? ['media_sources'] : [])];
  const network = Boolean(data.peach_proxy || data.access || data.tunnel || (data.editable && data.port_editable !== false)
    || networkKeys.some(key => data.section_errors?.[key]));
  const downloads = data.downloads;
  const groups: Group[] = [
    { id: 'library', title: 'Library and imports', body: (panel) => <div {...groupRoot(panel)}>
      {issues(['media_sources', 'library_count', 'mount_dependencies'])}
      {!data.section_errors?.media_sources && !data.section_errors?.library_count ? <MediaSettings {...group} /> : null}
      <CodePatternSettings receipt={receipt} />
      <MediaProcessingSettings receipt={receipt} />
      <TaskSpeedSettings receipt={receipt} />
    </div> },
    { id: 'sources', title: 'Sources and subscriptions', body: (panel) => <SourceSettings {...group} panel={panel} issues={issues(['entry_links'])} /> },
    ...(downloads || data.section_errors?.downloads ? [{
      id: 'downloads', title: 'Download channels',
      body: (panel: ConfigurationPanel) => <DownloadGroup initial={downloads} receipt={receipt} panel={panel} issues={issues(['downloads'])} />,
    }] : []),
    ...(network ? [{ id: 'network', title: 'Network & access', body: (panel: ConfigurationPanel) => <NetworkSettings {...group} panel={panel} issues={issues(networkKeys)} /> }] : []),
    {
      id: 'maintenance', title: 'App and maintenance',
      body: (panel) => <div {...groupRoot(panel)}>
        {issues(['startup', 'uninstall', 'storage', 'remote_reporting', 'library_sharing', 'updates', 'update_job', 'automatic_updates', 'facts'])}
        <GeneralSettings {...group} />
        <PlaybackTranscodeSettings receipt={receipt} />
        <MaintenanceSettings {...group} reopenTutorial={reopenTutorial} />
      </div>,
    },
    { id: 'diagnostics', title: 'System diagnostics', body: panel => <div {...groupRoot(panel)}>{panel.active ? diagnostics : null}</div> },
  ];
  const at = Math.max(0, groups.findIndex((item) => item.title === chosen));
  return (
    <div ref={workspace} className="ui-configpage">
      <div className="ui-board-local-nav" data-section-nav="">
        <SortableBoardTabs group="configuration" label="Configuration sections" value={groups[at].id}
          tabs={groups.map(({ id, title }) => ({ value: id, label: title }))} sectionItems panelPrefix={prefix}
          orientation={narrow ? 'horizontal' : 'vertical'} className=""
          onChange={id => choose(groups.find(group => group.id === id)!.title)} />
      </div>
      {groups.map(({ id, title, body }, i) => (
        <Fragment key={title}>
          <h2 className="ui-configgroup">{title}</h2>
          {body({ index: i, id: `${prefix}-panel-${id}`, labelledBy: `${prefix}-tab-${id}`, active: i === at })}
        </Fragment>
      ))}
    </div>
  );
}
