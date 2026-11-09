import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Button } from '@/components/base/buttons/button';
import { RiFolderLine, RiListCheck3, RiPlayCircleLine, RiRocketLine, RiRssLine, RiBarChartLine, RiDownloadCloudLine, RiSmartphoneLine, RiCheckboxCircleLine } from '@remixicon/react';
import { Radio } from 'react-aria-components';
import { toast } from 'sonner';
import { SEGMENT, SEGMENTED_TRACK, SegmentedRadioGroup } from '../components/segmented';
import { apiGet } from '../../api';
import { isPreferencePath, navigationBackground, peachHistory } from '../../history';
import { GUIDE_CHAPTERS, contextualChapter, type GuideChapter } from '../../onboarding/guide-catalog';
import { emptyProgress, guideChapterComplete, guideResumePosition, listenGuide, readGuideProgress, recordGuideStep, saveGuideProgress, type GuideAction, type GuideProgress } from '../../onboarding/guide-state';
import type { GuideSession } from '../../onboarding/guide-driver';
import type { ShellActions } from '../router/shell-actions';
import { Disclosure } from '../settings/section';
import { ModalFrame } from '../components/modal-frame';
import { GuideBanner, GuideDirectory } from './guide-directory';
import { Note } from '../components/note';
import { useOverlayScrollbar } from '../components/overlay-scrollbar';
import { SettingsDialogClose } from '../components/settings-dialog-close';
import { mountGuidePopover } from './guide-popover';
import { stageApi } from '../application-residents';

interface ProgressCounts {
  library: { total: number }; taste: { history_sources: number };
  follow: { sources: { provider: string; enabled: boolean }[] };
  credentials: { providers: { provider: string; requirement: string; present: boolean; missing?: string[] }[] };
  review: { counts: Record<string, number> };
}
function GettingStarted({ go }: { go(path: string): void }) {
  const [data, setData] = useState<ProgressCounts | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void apiGet<ProgressCounts>('/api/post-setup-tutorial', controller.signal).then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(() => { if (!controller.signal.aborted) setError('The install state could not be obtained. Retry, or open the matching page directly.') });
    return () => controller.abort();
  }, [attempt]);
  const sources = data?.follow.sources.filter(row => row.enabled !== false) || [];
  const required = data?.credentials.providers.filter(row => row.requirement === 'required' && sources.some(source => source.provider === row.provider)) || [];
  const ready = sources.length > 0 && required.every(row => row.present && !row.missing?.length);
  const reviews = Object.values(data?.review.counts || {}).reduce((total, value) => total + Number(value || 0), 0);
  return <div className="flex flex-col gap-4">
    <GuideBanner icon={RiRocketLine} title="Start from the first favorite" description="Connect a media directory, review ingestion results, then open the library.">
      <Button onClick={() => go('/settings/library')}>Connect a media directory</Button>
    </GuideBanner>
    {error ? <Note tone="error" action={<Button variant="secondary" size="small" onClick={() => setAttempt(attempt + 1)}>Retry</Button>}>{error}</Note> : null}
    <ol className="peach-guide-routes">
      <li><span className="peach-guide-topic-icon"><RiFolderLine aria-hidden className="size-5" /></span><div className="min-w-0 flex-1"><strong>Connect a media directory</strong><p>Confirm the media folder, its library, and the read policy.</p></div><Button variant="secondary" size="small" onClick={() => go('/settings/library')}>Review the configuration</Button></li>
      <li><span className="peach-guide-topic-icon"><RiListCheck3 aria-hidden className="size-5" /></span><div className="min-w-0 flex-1"><strong>Review the first scan</strong><p>{data ? data.library.total ? `${data.library.total.toLocaleString()} items ingested; follow the processing in the task center.` : 'The library is empty; check whether a scan task has started.' : 'Follow the actual scan progress in the task center.'}</p></div><Button variant="secondary" size="small" onClick={() => go('/tasks')}>Task center</Button></li>
      <li><span className="peach-guide-topic-icon"><RiPlayCircleLine aria-hidden className="size-5" /></span><div className="min-w-0 flex-1"><strong>Open the library</strong><p>Search and browse ingested content from the home page.</p></div><Button variant="secondary" size="small" onClick={() => go('/')}>Enter the library</Button></li>
    </ol>
    <Disclosure summary="More ways to connect">
    <div className="peach-guide-routes">
      {[
        { title: 'Follow creator', description: ready ? 'Every enabled source has the credentials it needs.' : sources.length ? 'Follow sources exist; check the credentials they require.' : 'Add the creators and sources you want to keep tracking.', path: '/subscriptions', icon: RiRssLine },
        { title: 'Taste and history', description: data?.taste.history_sources ? `Imported ${data.taste.history_sources} browser histories.` : 'Import browsing history or bookmarks as needed.', path: '/taste', icon: RiBarChartLine },
        { title: 'Cloud downloads and browser additions', description: 'Connect a channel, set the target directory, and pair the userscript as needed.', path: '/settings/downloads', icon: RiDownloadCloudLine },
        { title: 'Phone access', description: 'Review the access scope, address, and password.', path: '/settings/network', icon: RiSmartphoneLine },
        ...(reviews ? [{ title: 'Manual review', description: `${reviews.toLocaleString()} details are pending review.`, path: '/review', icon: RiCheckboxCircleLine }] : []),
      ].map(({title, description, path, icon: Icon}) => <div key={title}><span className="peach-guide-topic-icon"><Icon aria-hidden className="size-5" /></span><div className="min-w-0 flex-1"><strong>{title}</strong><p>{description}</p></div><Button variant="ghost" size="small" aria-label={`View ${title}`} onClick={() => go(path)}>View</Button></div>)}
    </div>
    </Disclosure>
  </div>;
}

const SYNC_TOAST = 'tutorial-sync';

export function TutorialCenter({ actions }: { actions: ShellActions }) {
  const [open, setOpen] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const [tab, setTab] = useState<'start' | 'interface' | 'settings'>('interface');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<GuideProgress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const body = useOverlayScrollbar<HTMLDivElement>();
  const session = useRef<GuideSession | null>(null);
  const invitationSession = useRef<GuideSession | null>(null);
  const epoch = useRef(0);
  const progressRef = useRef(progress); progressRef.current = progress;
  const position = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnPath = useRef('');
  const dirty = useRef(false);
  const startRequest = useRef<(chapter: GuideChapter, resume: boolean) => void>(() => {});
  const writes = useRef(Promise.resolve());
  const pendingWrites = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(true);
  const applyProgress = (next: GuideProgress) => { progressRef.current = next; setProgress(next) };
  const refresh = async (clearError = true) => {
    const ticket = revision.current;
    try {
      const next = await readGuideProgress();
      if (!mounted.current || ticket !== revision.current) return false;
      applyProgress(next); setReady(true);
      if (clearError) setSyncError('');
      if (!session.current) setInvitation(!next.invited && !next.completed);
      return true;
    } catch {
      if (mounted.current) setSyncError('The tour state in the ledger could not be obtained; reload it.');
      return false;
    }
  };
  const save = (next: GuideProgress, action: GuideAction) => {
    applyProgress(next);
    const ticket = ++revision.current;
    pendingWrites.current += 1;
    writes.current = writes.current.then(async () => {
      try {
        const saved = await saveGuideProgress(next.campaign, action);
        if (mounted.current && ticket === revision.current) applyProgress(saved);
      } catch {
        if (mounted.current) {
          setSyncError('Tour progress was not saved to this machine\'s ledger and other devices have not synced it. Reload before continuing.');
          if (ticket === revision.current) await refresh(false);
        }
      } finally { pendingWrites.current -= 1 }
    });
  };
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  /* With the tour window closed, sync failures go through the app-wide notification stack: stacked in the same column as receipts and background tasks, not each pinned to the bottom-right corner
     in a pile. When the window is open, the notice inside it takes over. */
  useEffect(() => {
    if (!syncError || open) { toast.dismiss(SYNC_TOAST); return }
    toast.error(syncError, {
      id: SYNC_TOAST, toasterId: 'receipts', duration: Infinity,
      action: { label: 'Reload', onClick: (event) => { event.preventDefault(); void refreshRef.current() } },
    });
  }, [syncError, open]);
  useEffect(() => () => { toast.dismiss(SYNC_TOAST) }, []);
  useEffect(() => {
    if (!ready && !syncError) return;
    const entry = document.getElementById('tutorialBtn');
    if (entry) entry.hidden = !syncError && progress.completed;
  }, [progress.completed, ready, syncError]);
  const dismissInvite = () => {
    invitationSession.current?.stop(); invitationSession.current = null;
    setInvitation(false); save({ ...progressRef.current, invited: true }, { action: 'dismiss' });
  };
  useEffect(() => {
    if (!invitation || open || syncError || !ready) return;
    let cancelled = false;
    let intro: GuideSession | null = null;
    void import('../../onboarding/guide-driver').then(({ createGuideSession }) => {
      if (cancelled) return;
      intro = createGuideSession({
        mountPopover: mountGuidePopover,
        invitation: true, navigate: actions.navigate, previous: () => {}, close: dismissInvite,
        next: () => { dismissInvite(); setOpen(true) },
      });
      invitationSession.current = intro;
      void intro.show({ id: 'tutorial-entry', title: 'Opens the guided tour from here',
        body: 'Click this compass for a four-step introduction to Peach. Everything else can wait until you need it.', target: '#tutorialBtn' }, 0, 1);
    }).catch(() => setSyncError('The tour tips failed to load; reload them.'));
    return () => {
      cancelled = true;
      const closing = intro;
      if (invitationSession.current === closing) invitationSession.current = null;
      queueMicrotask(() => closing?.stop());
    };
  }, [invitation, open, syncError, ready]);
  const restoreFocus = () => {
    const target = returnFocus.current;
    if (target?.isConnected && target.getBoundingClientRect().width) target.focus();
    else document.getElementById('settingsBtn')?.focus();
  };
  const stop = (reopen = false) => {
    epoch.current += 1; session.current?.stop(); session.current = null;
    document.body.classList.remove('peach-guiding'); setLoading(false);
    if (reopen) {
      actions.closeSettings?.();
      if (returnPath.current && returnPath.current !== `${location.pathname}${location.search}${location.hash}`) actions.navigate(returnPath.current);
      setOpen(true);
    }
    else restoreFocus();
  };
  useEffect(() => {
    mounted.current = true;
    const onChange = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.ui-configpage form')) dirty.current = true;
    };
    const releaseDraft = peachHistory.listen(() => { dirty.current = false });
    document.addEventListener('input', onChange); document.addEventListener('change', onChange);
    const unlisten = listenGuide(request => { void (async () => {
      const opener = document.activeElement as HTMLElement;
      await writes.current;
      if (!mounted.current) return;
      const loaded = await refresh();
      if (!loaded || request.invitation) return;
      stop(); returnFocus.current = opener;
      setNotice(''); setQuery('');
      const requested = GUIDE_CHAPTERS.find(item => item.id === request.chapter);
      if (request.reopen) {
        setInvitation(false);
        save({ ...progressRef.current, invited: true, completed: false }, { action: 'reopen' });
      } else dismissInvite();
      restoreFocus();
      if (requested) { setTab(requested.kind); startRequest.current(requested, false) }
      else setOpen(true);
    })() });
    const onFocus = () => {
      if (document.visibilityState === 'visible' && !session.current && !pendingWrites.current) void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      unlisten(); releaseDraft(); epoch.current += 1; session.current?.stop();
      document.body.classList.remove('peach-guiding');
      document.removeEventListener('input', onChange); document.removeEventListener('change', onChange);
    };
  }, []);
  useEffect(() => { if (body.current) body.current.scrollTop = 0 }, [tab]);
  const close = () => { epoch.current += 1; setLoading(false); setOpen(false); restoreFocus() };
  const go = (path: string) => {
    if (dirty.current && path !== location.pathname) { setNotice('The current settings form has unsaved edits. Deal with the form before opening other pages.'); return }
    close(); actions.navigate(path);
  };
  const start = async (chapter: GuideChapter, resume: boolean) => {
    if (!progressRef.current.campaign || syncError) { setNotice('Reload the tour state before starting the tour.'); return }
    if (document.querySelector('dialog[open]:not(.peach-guide-center)')) { setNotice('Close the current details view or dialog before starting the tour.'); return }
    if (chapter.steps.some(step => step.surface) && stageApi()?.miniplayerActive()) {
      setNotice('Close the playing mini-player first, then start the player tour.'); return;
    }
    const from = resume ? guideResumePosition(progressRef.current, chapter) : 0;
    if (dirty.current && chapter.steps.some(item => item.route && item.route !== location.pathname)) {
      setNotice('The current settings form has unsaved edits. Deal with the form before opening a section that switches pages.'); return;
    }
    const ticket = ++epoch.current; setLoading(true); setNotice('');
    try {
      const { createGuideSession } = await import('../../onboarding/guide-driver');
      if (ticket !== epoch.current) return;
      const background = isPreferencePath(location.pathname) ? navigationBackground() : null;
      const destination = new URL(isPreferencePath(location.pathname) ? `${background?.pathname || '/'}${background?.search || ''}` : location.href, location.origin);
      if (new URLSearchParams(location.search).has('edit')) destination.searchParams.set('edit', '');
      returnPath.current = `${destination.pathname}${destination.search}${destination.hash}`;
      position.current = Math.min(from, chapter.steps.length - 1);
      dismissInvite(); flushSync(() => setOpen(false)); document.body.classList.add('peach-guiding');
      const show = () => {
        const value = progressRef.current;
        const row = value.chapters[chapter.id] || { next: 0, read: [], skipped: [] };
        save({ ...value, chapters: { ...value.chapters, [chapter.id]: { ...row, next: position.current } } },
          { action: 'position', chapter: chapter.id, next: position.current });
        void session.current?.show(chapter.steps[position.current], position.current, chapter.steps.length);
      };
      session.current = createGuideSession({
        mountPopover: mountGuidePopover,
        navigate: actions.navigate,
        close: () => { stop(true); setTab(chapter.kind) },
        leave: () => stop(),
        previous: () => { if (position.current > 0) { position.current -= 1; show() } },
        next: async (skipped = false) => {
          const next = position.current + 1;
          save(recordGuideStep(progressRef.current, chapter.id, chapter.steps[position.current].id, next, skipped),
            { action: 'step', chapter: chapter.id, step: chapter.steps[position.current].id, next, skipped });
          if (next >= chapter.steps.length) {
            if (chapter.id === 'basics' && guideChapterComplete(progressRef.current, chapter)) save({ ...progressRef.current, completed: true }, { action: 'complete' });
            await writes.current;
            if (ticket !== epoch.current) return;
            stop(true); setTab(chapter.kind);
            setNotice(!guideChapterComplete(progressRef.current, chapter)
              ? 'This chapter has ended; steps not shown are unfinished and can be continued later.'
              : chapter.id === 'basics'
              ? progressRef.current.completed
                ? 'The tour is finished and the tour entry collapses on every device. Reopen it later under Settings → Peach configuration → App and maintenance → Guided tour, and view the rest as needed.'
                : 'The tour ended but its completion was not saved. Reload the tour state and try again.'
              : 'This tour section is done. Learn the other features when you need them.');
          } else { position.current = next; show() }
        },
      });
      show();
    } catch { setNotice('The tour failed to load; try again.') }
    finally { if (ticket === epoch.current) setLoading(false) }
  };
  startRequest.current = (chapter, resume) => { void start(chapter, resume) };
  const context = contextualChapter(location.pathname);
  return createPortal(<>
    <ModalFrame isOpen={open} onOpenChange={value => { if (!value) close() }} width="tutorial" label="Guided tour" surfaceClassName="peach-react peach-guide-center">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-separator-border px-6 py-4"><h2 id="guideTitle" className="text-title-2-medium text-text-primary">Guided tour</h2><SettingsDialogClose label="Close the guided tour" onPress={close} /></header>
      <div className="peach-guide-tools flex shrink-0 flex-col gap-4 px-6 pt-4 pb-3">
        <SegmentedRadioGroup aria-label="Tour path" name="guide-path" orientation="horizontal" className={SEGMENTED_TRACK}
          value={tab} onChange={value => { setTab(value as typeof tab); setQuery(''); setNotice('') }}>
          {([['start', 'Get started'], ['interface', 'Interface tour'], ['settings', 'Settings tour']] as const).map(([key, label]) => <Radio key={key} value={key} className={SEGMENT}>{label}</Radio>)}
        </SegmentedRadioGroup>
      </div>
      <div className="peach-guide-scroll-frame">
      <div ref={body} className="peach-guide-body">
        {syncError ? <Note tone="error" className="mb-4" action={<Button size="small" onClick={() => { void refresh() }}>Read again</Button>}>{syncError}</Note> : null}
        {notice ? <Note tone="neutral" className="mb-4">{notice}</Note> : null}
        {tab === 'start' ? <GettingStarted go={go} /> : <GuideDirectory key={tab} kind={tab} query={query} setQuery={setQuery} context={context} progress={progress} loading={loading} start={(item, resume) => { void start(item, resume) }} />}
      </div>
      </div>
    </ModalFrame>
  </>, document.body);
}
