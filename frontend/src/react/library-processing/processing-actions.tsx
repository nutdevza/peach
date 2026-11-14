import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RiArrowDownSLine, RiArrowRightLine } from '@remixicon/react';
import { Dialog, Popover } from 'react-aria-components';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { MENU_ITEM, MENU_ITEM_INTERACTIVE, MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';
import { cx } from '@/utils/cx';
import { formModal } from '@peach/legacy/ui';
import { useMovingSurface } from '../components/use-moving-surface';
import { busyProps } from '../settings/use-action';
import { errorMessage } from '../../api';
import { fetchProcessingEstimate, type LibraryProcessingCommand, type ProcessingSpeed, type ProcessingTraffic } from './library-processing';
import { ProcessingEffort } from './processing-effort';
import { TrafficProgress } from './processing-traffic';

interface ProcessingOption {
  label: string; description: string; command: LibraryProcessingCommand; disabled?: boolean;
}

function ProcessingMenuGroup({ label, maintenance = false, children }: {
  label: string; maintenance?: boolean; children: ReactNode;
}) {
  const ref = useMovingSurface('hover');
  return <div ref={ref} role="group" aria-label={label} data-processing-maintenance={maintenance || undefined}
    className={cx('flex flex-col gap-1', maintenance && 'mt-2')}>
    {children}
  </div>;
}

function ProcessingMenuOption({ option, metadataOnly, onRun }: {
  option: ProcessingOption; metadataOnly: boolean; onRun(command: LibraryProcessingCommand): void;
}) {
  const blocked = metadataOnly && option.command.stage === 'previews';
  const disabled = blocked || option.disabled;
  return <button type="button" disabled={disabled}
    title={blocked ? 'Turn on video preview generation in library settings first' : undefined}
    className={cx(MENU_ITEM, disabled ? 'cursor-not-allowed opacity-50' : MENU_ITEM_INTERACTIVE, 'text-body-2-medium')}
    onClick={() => onRun(option.command)}><span className="flex min-w-0 flex-col gap-1">
      <span>{option.label}</span><span className="text-caption-1-regular text-text-secondary">{option.description}</span>
    </span></button>;
}

function ProcessingPrompt({ command, speed, dialog, onSpeed, busy, libraryName }: {
  libraryName?: string;
  command: LibraryProcessingCommand; speed: ProcessingSpeed; dialog: ReturnType<typeof formModal>;
  onSpeed(value: ProcessingSpeed): void; busy: boolean;
}) {
  const [mode, setMode] = useState(speed);
  const [traffic, setTraffic] = useState<ProcessingTraffic>();
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async (inventory?: string) => {
      try {
        const result = await fetchProcessingEstimate(command, controller.signal, inventory);
        if (!result.traffic) throw new Error('The server provided no traffic estimate');
        if (controller.signal.aborted) return;
        setTraffic(result.traffic);
        dialog.confirmButton.disabled = false;
        if (result.traffic.inventory?.token) timer = setTimeout(() => { void load(result.traffic.inventory?.token) }, 250);
      } catch (error) {
        if (!controller.signal.aborted) {
          setFailure(errorMessage(error));
          dialog.confirmButton.disabled = false;
        }
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer) };
  }, [command, dialog]);
  const scope = command.incremental ? command.stage === 'scan' ? 'New files not yet registered' : 'New files and videos awaiting completion'
    : command.scope === 'new' ? 'Registered videos pending completion'
    : command.stage === 'previews' ? 'Videos already in the library (skips traffic-protected folders)' : 'All files and videos';
  return <div className="flex flex-col gap-4">
    <p data-processing-scope className="text-body-2-medium text-text-primary">Scope: {libraryName || 'All libraries'} · {scope}</p>
    <div className="flex justify-center"><ProcessingEffort value={mode} busy={busy} onChange={value => { setMode(value); onSpeed(value) }} /></div>
    {traffic ? <TrafficProgress traffic={traffic} initial /> : null}
    {failure || !traffic ? <p role="status" className="text-body-2-regular text-text-secondary">{failure ? `No traffic estimate available: ${failure}` : 'Estimating bandwidth…'}</p> : null}
  </div>;
}

/** Scanning and completion of existing works share the metadata pipeline; the video preview is decided by library settings.
 *
 * `busy` means this launch is still in flight: the button is marked `aria-busy` and the click is swallowed by the shared busy interceptor. `occupied` means an existing
 * task is running: the button is only marked `aria-disabled`, the click still arrives, and `onOccupied` tells the user why it didn't start. */
export function ProcessingActions({ busy, occupied = false, scan = false, metadataOnly = false, speedMode = 'standard', pendingCount = 0, libraryId, libraryName, onRun, onOccupied }: {
  libraryId?: string; libraryName?: string;
  busy: boolean; occupied?: boolean; scan?: boolean; metadataOnly?: boolean; speedMode?: ProcessingSpeed; pendingCount?: number;
  onRun(command: LibraryProcessingCommand): void | Promise<unknown>;
  onOccupied?(): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const prompt = useRef<ReturnType<typeof formModal> | null>(null);
  const [promptView, setPromptView] = useState<{ host: HTMLElement; footer: HTMLElement; dialog: ReturnType<typeof formModal>; command: LibraryProcessingCommand } | null>(null);
  const selectedSpeed = useRef(speedMode);
  useEffect(() => () => prompt.current?.close(), []);
  const [open, setOpen] = useState(false);
  const primary: ProcessingOption = { label: scan ? 'Sync new files' : 'Sync these videos', description: '',
    command: scan ? {incremental:true} : { stage: 'collect' as const } };
  const dailyOptions: ProcessingOption[] = [
    {label:'Discover new files only', description:'Scans and registers new files, keeping existing video details', command:{stage:'scan',incremental:true}},
    {label:'Complete pending videos', description:libraryId ? 'Completes the registered pending videos inside the chosen libraries'
      : pendingCount ? `${pendingCount.toLocaleString()} registered videos waiting to be completed` : 'No videos pending completion',
      command:{stage:'collect',scope:'new'}, disabled:!pendingCount},
  ];
  const options: ProcessingOption[] = [
    ...(scan ? [{label:libraryId ? 'Sync the chosen libraries' : 'Sync all libraries',description:'Checks every file in the chosen scope, completing missing details and previews',command:{}}] : []),
    ...(scan ? [{ label: 'Scan files only', description: 'Discovers files and reads video durations and resolutions', command: { stage: 'scan' as const } }] : []),
    ...(scan ? [{ label: 'Complete details and previews', description: metadataOnly ? 'Backfill profiles and video properties for existing videos' : 'Completes profiles and video properties and generates previews', command: { stage: 'collect' as const } }] : []),
    { label: 'Complete video details only', description: 'Backfill video profiles, covers and people profiles', command: { stage: 'metadata' as const } },
    { label: 'Complete preview images only', description: 'Generates the nine-grid for videos already in the library, skipping traffic-protected folders', command: { stage: 'previews' as const } },
  ];
  const blocked = busy || occupied;
  const blockedProps = busy ? busyProps(true) : occupied ? { 'aria-disabled': true } as const : {};
  const run = (command: LibraryProcessingCommand) => {
    if (busy) return;
    if (occupied) { onOccupied?.(); return }
    command = { ...command, ...(libraryId ? { library_id: libraryId } : {}) };
    setOpen(false);
    if (!scan) {
      void Promise.resolve(onRun(command)).catch(() => { /* Errors stay in place at the task entry */ });
      return;
    }
    if (prompt.current) return;
    selectedSpeed.current = speedMode;
    const previews = command.stage === 'previews';
    const title = command.scope === 'new' ? 'Complete pending videos'
      : command.incremental ? command.stage === 'scan' ? 'Discover new files' : 'Sync new files'
      : previews ? 'Complete preview images only' : command.stage === 'scan' ? 'Scan every file'
      : command.stage === 'metadata' ? 'Complete video details only' : command.stage === 'collect' ? 'Complete videos added to library' : libraryId ? 'Sync the chosen libraries' : 'Sync all libraries';
    const work = command.scope === 'new' ? 'Completes details and video properties for these registered videos and generates previews per settings'
      : command.incremental
      ? command.stage === 'scan' ? 'Detect and register new files not yet in the library, keeping existing video profiles'
      : `Found new files; completes details and video properties only for new and unfinished videos${metadataOnly ? '' : ' and generates local previews'}`
      : previews ? 'Completes nine-grid previews for videos already in the library, skipping traffic-protected folders; reads videos and uses the processor'
      : command.stage === 'scan' ? 'Scans folders and registers files, reading video duration and resolution per folder settings'
      : command.stage === 'metadata' ? 'Fetch companion profiles to fill in video profiles, covers, and people profiles'
      : `${command.stage === 'collect' ? 'Complete profiles and video properties for videos added to library' : 'Scan folders to find files, then complete profiles and video properties'}${metadataOnly ? '' : ' and generates local previews'}`;
    const dialog = formModal({
      title,
      description: `${libraryName ? `Library "${libraryName}": ` : 'All libraries: '}${work}, which can slow the computer down. If you need the computer at the same time, switch to the low-usage mode.`,
      body: '<div class="peach-react" data-processing-prompt></div>',
      confirmLabel: title,
      confirmDisabled: true,
      onConfirm: async () => {
        await onRun({ ...command, ...(selectedSpeed.current === speedMode ? {} : { speed_mode: selectedSpeed.current }) });
      },
    });
    const footer = document.createElement('span');
    footer.className = 'peach-react flex items-center';
    dialog.confirmButton.before(footer);
    prompt.current = dialog;
    setPromptView({ host: dialog.dialog.querySelector<HTMLElement>('[data-processing-prompt]')!, footer, dialog, command });
    void dialog.done.then(() => { if (prompt.current === dialog) { prompt.current = null; setPromptView(null) } });
  };
  return <>
    {promptView ? createPortal(<ProcessingPrompt libraryName={libraryName} command={promptView.command} dialog={promptView.dialog}
      speed={speedMode} busy={blocked} onSpeed={value => { selectedSpeed.current = value }} />, promptView.host) : null}
    {promptView ? createPortal(<LinkButton href="/settings/library" size="small" variant="primary" trailingIcon={RiArrowRightLine} disabled={blocked}
      onClick={event => {
        if (promptView.dialog.confirmButton.getAttribute('aria-busy') === 'true') { event.preventDefault(); return }
        promptView.dialog.close();
      }}>Manage media library</LinkButton>, promptView.footer) : null}
    <span data-button-group data-split-button data-variant="primary">
      <Button {...blockedProps} onClick={() => run(primary.command)}>{primary.label}</Button>
      <Button ref={trigger} iconOnly leadingIcon={RiArrowDownSLine} aria-label="More sync methods"
        aria-haspopup="dialog" aria-expanded={open} {...blockedProps} onClick={() => {
          if (busy) return;
          if (occupied) onOccupied?.(); else setOpen(!open);
        }} />
    </span>
    <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen} placement="bottom end" offset={4}
      className={MENU_POPOVER_SURFACE}>
      <Dialog aria-label="Sync method" className="flex w-80 flex-col gap-1 outline-none">
        {scan ? <ProcessingMenuGroup label="Routine sync">
          <p className="px-2 py-1 text-caption-1-medium text-text-secondary">Routine sync</p>
          {dailyOptions.map(option => <ProcessingMenuOption key={option.label} option={option} metadataOnly={metadataOnly} onRun={run} />)}
        </ProcessingMenuGroup> : null}
        <ProcessingMenuGroup label={scan ? 'Library maintenance' : 'Completion method'} maintenance={scan}>
          {scan ? <p className="px-2 py-1 text-caption-1-medium text-text-secondary">Library maintenance</p> : null}
          {options.map(option => <ProcessingMenuOption key={option.label} option={option} metadataOnly={metadataOnly} onRun={run} />)}
        </ProcessingMenuGroup>
      </Dialog>
    </Popover>
  </>;
}
