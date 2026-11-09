/* Learning progress comes from the local ledger; the tour session is independent of install state. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, guideChapterComplete, guideResumePosition, listenGuide, openGuide, readGuideProgress, recordGuideStep, saveGuideProgress } from '../src/onboarding/guide-state';
import { createGuideSession, findGuideTarget, resolveGuideTarget } from '../src/onboarding/guide-driver';
import { GUIDE_CHAPTERS, GUIDE_TOPICS } from '../src/onboarding/guide-catalog';
import { guideEntry } from '../src/onboarding/guide-entry';
import { isPlayerGuidePreview } from '../src/player/guide-preview';

const mocks = vi.hoisted(() => ({ driver: vi.fn(), unlisten: vi.fn(), listen: vi.fn(), popover: vi.fn(() => vi.fn()), disposeStage: vi.fn() }));
vi.mock('driver.js', () => ({ driver: mocks.driver }));
vi.mock('../src/history', () => ({ peachHistory: { listen: mocks.listen } }));
vi.mock('../src/application/layout', () => ({ closeDrawerAfterNav: vi.fn() }));
vi.mock('../src/application/media', () => ({ disposeStage: mocks.disposeStage }));
beforeEach(() => {
  localStorage.clear();
  mocks.driver.mockReset(); mocks.unlisten.mockReset();
  mocks.popover.mockClear();
  mocks.disposeStage.mockClear();
  mocks.listen.mockReset().mockReturnValue(mocks.unlisten);
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren();
});

describe('Chapter progress', () => {
  it('Reaching the end is not completion; missing steps resume from the first unread position, and a replay is possible only once everything is read', () => {
    const chapter = GUIDE_CHAPTERS.find(item => item.id === 'basics')!;
    let progress = emptyProgress();
    chapter.steps.forEach((step, index) => { progress = recordGuideStep(progress, chapter.id, step.id, index + 1, index === 1) });
    expect(guideChapterComplete(progress, chapter)).toBe(false);
    expect(guideResumePosition(progress, chapter)).toBe(1);
    progress = recordGuideStep(progress, chapter.id, chapter.steps[1]!.id, 2, false);
    expect(guideChapterComplete(progress, chapter)).toBe(true);
    expect(guideResumePosition(progress, chapter)).toBe(0);
  });
  it('The page steps give real operation paths while settings and data management keep their necessary hierarchy', () => {
    for (const chapter of GUIDE_CHAPTERS) for (const step of chapter.steps) {
      if (step.route) expect(guideEntry(step)?.path.length, `${chapter.id}/${step.id}`).toBeGreaterThan(1);
    }
    const entry = (route: '/review' | '/quality-goals' | '/settings/network' | '/settings/appearance') => guideEntry({ id: 'entry', title: '', body: '', route })?.path;
    expect(entry('/review')).toEqual(['Sidebar', 'Manage', 'Data management', 'Manual review']);
    expect(entry('/quality-goals')).toEqual(['Sidebar', 'Manage', 'Data management', 'HD version']);
    expect(entry('/settings/network')).toEqual(['Settings at the bottom of the sidebar', 'Peach configuration', 'Network & access']);
    expect(entry('/settings/appearance')).toEqual(['Settings at the bottom of the sidebar', 'Appearance & navigation']);
  });
  it('The quick tour ends with four steps on the home page; every detailed chapter is reachable from the topic directory', () => {
    const quick = GUIDE_CHAPTERS.find(chapter => chapter.id === 'basics')!;
    expect(quick.steps).toHaveLength(4);
    expect(quick.steps.every(step => step.route === '/')).toBe(true);
    for (const kind of ['interface', 'settings'] as const) {
      const topics = GUIDE_TOPICS.filter(topic => topic.kind === kind);
      expect(topics).toHaveLength(4);
      const covered = topics.flatMap(topic => topic.chapters);
      expect(new Set(covered).size).toBe(covered.length);
      expect([...covered].sort()).toEqual(GUIDE_CHAPTERS.filter(chapter => chapter.kind === kind && chapter.id !== 'basics').map(chapter => chapter.id).sort());
    }
  });
  it('Before starting, no chapter is recorded as complete', () => {
    expect(emptyProgress()).toEqual({ version: 1, campaign: '', invited: false, completed: false, chapters: {} });
  });
  it('Read and skip are mutually exclusive, a replay never counts twice, and other chapters stay untouched', () => {
    const original = recordGuideStep(emptyProgress(), 'settings', 'network', 1, false);
    const skipped = recordGuideStep(original, 'basics', 'search', 1, true);
    expect(skipped.chapters.basics).toEqual({ next: 1, read: [], skipped: ['search'] });
    const read = recordGuideStep(skipped, 'basics', 'search', 1, false);
    const reread = recordGuideStep(read, 'basics', 'search', 1, false);
    expect(reread.chapters.basics).toEqual({ next: 1, read: ['search'], skipped: [] });
    expect(reread.chapters.settings).toEqual(original.chapters.settings);
    expect(original.chapters.basics).toBeUndefined();
    expect(recordGuideStep(read, 'basics', 'search', 1, true).chapters.basics!.read).toEqual([]);
  });
  it('After a page switch, progress still reads the ledger rather than the stale browser progress', async () => {
    const saved = { ...recordGuideStep(emptyProgress(), 'basics', 'search', 1, false), campaign: 'welcome-1', invited: true };
    localStorage.setItem('peach.guides.v1', JSON.stringify(emptyProgress()));
    const fetcher = vi.fn(async () => new Response(JSON.stringify(saved), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    for (const path of ['/', '/settings/library', '/taste']) {
      history.replaceState({}, '', path); expect(await readGuideProgress()).toEqual(saved);
    }
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('Read or save failures are reported to the caller, never mistaken for empty progress or a successful write', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503 })));
    await expect(readGuideProgress()).rejects.toThrow();
    await expect(saveGuideProgress('welcome-1', { action: 'dismiss' })).rejects.toThrow();
  });
  it('Saving sends only the current action and never overwrites other devices\' chapters with this device\'s snapshot', async () => {
    const done = { ...emptyProgress(), campaign: 'welcome-1', invited: true, completed: true };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(done), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await saveGuideProgress('welcome-1', { action: 'complete' })).toEqual(done);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ campaign: 'welcome-1', action: 'complete' });
  });
  it('Reopening only notifies the entry; it never resets learning or install state and sends no requests', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    localStorage.setItem('peach.post-setup-tutorial.v1', 'complete');
    const listener = vi.fn(), close = listenGuide(listener);
    try {
      openGuide(); openGuide({ chapter: 'basics' });
      expect(listener.mock.calls).toEqual([[{}], [{ chapter: 'basics' }]]);
      expect(localStorage.getItem('peach.post-setup-tutorial.v1')).toBe('complete');
      expect(fetcher).not.toHaveBeenCalled();
    } finally { close() }
  });
  it('Requests before mount are delivered once, and an unmounted entry never receives queued requests', async () => {
    openGuide({ chapter: 'settings' });
    const listener = vi.fn(), close = listenGuide(listener);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledExactlyOnceWith({ chapter: 'settings' }); close();
    const later = vi.fn(), unsubscribe = listenGuide(later);
    await Promise.resolve(); expect(later).not.toHaveBeenCalled(); unsubscribe();
    openGuide({ invitation: true });
    const discarded = vi.fn(); listenGuide(discarded)();
    await Promise.resolve(); expect(discarded).not.toHaveBeenCalled();
  });
});

describe('A read-only tour session', () => {
  const step = { id: 'search', title: 'Search the library', body: 'Type your keywords.', target: '#guide-target' };
  const callbacks = () => ({ mountPopover: mocks.popover, navigate: vi.fn(), next: vi.fn(), previous: vi.fn(), close: vi.fn() });
  const visibleTarget = () => {
    const target = document.createElement('button'); target.id = 'guide-target'; document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ width: 100, height: 40 }));
    return target;
  };
  it('The first invitation spotlights the tour button while keeping keyboard access to the entry, and the overlay can be dismissed', async () => {
    const entry = visibleTarget(); entry.id = 'tutorialBtn';
    const instance = { destroy: vi.fn(), highlight: vi.fn(), refresh: vi.fn() };
    mocks.driver.mockReturnValue(instance);
    const actions = callbacks(), session = createGuideSession({ ...actions, invitation: true });
    try {
      await session.show({ id: 'tutorial-entry', title: 'Open the tour', body: 'Meet the entries', target: '#tutorialBtn' }, 0, 1);
      expect(instance.highlight.mock.calls[0]![0].element).toBe(entry);
      expect(mocks.driver.mock.calls[0]![0].disableActiveInteraction).toBe(false);
      const panel = document.createElement('div'); panel.className = 'peach-guide-popover'; document.body.append(panel);
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      entry.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      mocks.driver.mock.calls[0]![0].overlayClickBehavior();
      expect(actions.close).toHaveBeenCalledOnce();
      expect(actions.next).not.toHaveBeenCalled();
    } finally { session.stop() }
  });

  it('Opens real details from the library; when done the temporary playback mode releases and no mini-player remains', async () => {
    history.replaceState({}, '', '/taste');
    const target = visibleTarget(); target.dataset.guideVideo = ''; target.dataset.id = '42';
    mocks.driver.mockReturnValue({ destroy: vi.fn(), highlight: vi.fn(), refresh: vi.fn() });
    const actions = callbacks();
    actions.navigate.mockImplementation(path => history.replaceState({}, '', path));
    const session = createGuideSession(actions);
    try {
      await session.show({ ...step, route: '/', surface: 'player' }, 0, 1);
      expect(actions.navigate.mock.calls.map(call => call[0])).toEqual(['/', '/assets/42']);
      expect(isPlayerGuidePreview()).toBe(true);
    } finally { session.stop() }
    expect(isPlayerGuidePreview()).toBe(false);
    expect(mocks.disposeStage).toHaveBeenCalledExactlyOnceWith(false, false, { miniplayer: false });
  });
  it('A missing target has a wait deadline, and after the wait is cancelled no timer is left behind', async () => {
    vi.useFakeTimers(); const controller = new AbortController();
    const timed = findGuideTarget('#missing', controller.signal, 160);
    await vi.advanceTimersByTimeAsync(160); expect(await timed).toBeUndefined();
    const cancelled = findGuideTarget('#missing', controller.signal); controller.abort();
    await vi.advanceTimersByTimeAsync(80); expect(await cancelled).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('Skeletons and inert areas are never targets, and once shown the target is locatable', async () => {
    const target = visibleTarget(); target.setAttribute('inert', '');
    expect(await findGuideTarget('#guide-target', new AbortController().signal, 0)).toBeUndefined();
    target.removeAttribute('inert'); target.setAttribute('data-skeleton', '');
    expect(await findGuideTarget('#guide-target', new AbortController().signal, 0)).toBeUndefined();
    target.removeAttribute('data-skeleton');
    expect(await findGuideTarget('#guide-target', new AbortController().signal, 0)).toBe(target);
  });
  it('The collapsed search box and the off-screen sidebar yield to the visible entries', async () => {
    const hidden = visibleTarget(); hidden.style.opacity = '0';
    const fallback = document.createElement('button'); fallback.id = 'fallback'; document.body.append(fallback);
    vi.spyOn(fallback, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 20, width: 40, height: 40 }));
    expect(await findGuideTarget('#guide-target,#fallback', new AbortController().signal, 0)).toBe(fallback);
    hidden.style.opacity = '1';
    vi.mocked(hidden.getBoundingClientRect).mockReturnValue(DOMRect.fromRect({ x: -110, width: 100, height: 40 }));
    expect(await findGuideTarget('#guide-target,#fallback', new AbortController().signal, 0)).toBe(fallback);
  });
  it('Explains that it only highlights and navigates, never clicking business controls or sending requests', async () => {
    const target = visibleTarget(), clicked = vi.fn(), fetcher = vi.fn();
    target.addEventListener('click', clicked); vi.stubGlobal('fetch', fetcher);
    const instance = { destroy: vi.fn(), highlight: vi.fn(), refresh: vi.fn(), isActive: () => true };
    mocks.driver.mockReturnValue(instance);
    const actions = callbacks(), session = createGuideSession(actions);
    try {
      await session.show({ ...step, route: '/tasks', title: '<Search>', body: 'A & B' }, 0, 2);
      expect(actions.navigate).toHaveBeenCalledWith('/tasks');
      expect(mocks.driver).toHaveBeenCalledWith(expect.objectContaining({ disableActiveInteraction: true, allowKeyboardControl: false }));
      expect(instance.highlight.mock.calls[0]![0]).toMatchObject({ element: target, popover: { side: 'bottom' } });
      mocks.driver.mock.calls[0]![0].onPopoverRender({ wrapper: document.createElement('div'), arrow: document.createElement('div') });
      expect(mocks.popover).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ step: expect.objectContaining({ title: '<Search>', body: 'A & B' }), missing: false }));
      mocks.driver.mock.calls[0]![0].onNextClick(); expect(actions.next).toHaveBeenCalledWith(false);
      mocks.driver.mock.calls[0]![0].overlayClickBehavior(); expect(actions.close).toHaveBeenCalledOnce();
      expect(clicked).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    } finally { session.stop() }
    expect(instance.destroy).toHaveBeenCalledOnce(); expect(mocks.unlisten).toHaveBeenCalledOnce();
  });
  it('Ending a session that is still waiting for its target leaves no stray overlay', async () => {
    vi.useFakeTimers(); const session = createGuideSession(callbacks());
    const showing = session.show(step, 0, 2); session.stop();
    await vi.advanceTimersByTimeAsync(80); await showing;
    expect(mocks.driver).not.toHaveBeenCalled(); expect(mocks.unlisten).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('Inside in-place text editing, Escape belongs to the editor\'s cancel and never exits the tour', () => {
    const actions = callbacks(), session = createGuideSession(actions);
    const input = document.createElement('span'); input.dataset.copyInline = ''; document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(actions.close).not.toHaveBeenCalled(); session.stop();
  });
  it('While the target is still waiting, both Escape and external navigation end the session', async () => {
    vi.useFakeTimers();
    for (const cancel of ['escape', 'navigate']) {
      const actions = callbacks(), session = createGuideSession(actions);
      const showing = session.show(step, 0, 2);
      if (cancel === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else mocks.listen.mock.calls.at(-1)![0]();
      expect(actions.close).toHaveBeenCalledOnce();
      session.stop(); await vi.advanceTimersByTimeAsync(80); await showing;
    }
    expect(mocks.driver).not.toHaveBeenCalled();
  });
  it('A missing target keeps the tour readable and the next step is recorded as skipped', async () => {
    vi.useFakeTimers();
    const instance = { destroy: vi.fn(), highlight: vi.fn(), refresh: vi.fn(), isActive: () => true }; mocks.driver.mockReturnValue(instance);
    const actions = callbacks(), session = createGuideSession(actions);
    try {
      const showing = session.show(step, 0, 2); await vi.advanceTimersByTimeAsync(4000); await showing;
      expect(instance.highlight.mock.calls[0]![0].element).toBeUndefined();
      mocks.driver.mock.calls[0]![0].onPopoverRender({ wrapper: document.createElement('div'), arrow: document.createElement('div') });
      expect(mocks.popover).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ missing: true }));
      mocks.driver.mock.calls[0]![0].onNextClick(); expect(actions.next).toHaveBeenCalledWith(true);
    } finally { session.stop() }
  });
  it('The spotlight covers the whole row holding the setting\'s label and control, not just the switch', () => {
    const row = document.createElement('label'); row.setAttribute('data-setting-row', ''); document.body.append(row);
    const target = visibleTarget(); row.append(target);
    expect(resolveGuideTarget('#guide-target')).toBe(row);
  });
  it('Position refreshes on internal scrolling, window changes, and target remounts; the tracking cleans up when done', async () => {
    let frame: FrameRequestCallback | undefined;
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }));
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const target = visibleTarget();
    const instance = { destroy: vi.fn(), highlight: vi.fn(), refresh: vi.fn() }; mocks.driver.mockReturnValue(instance);
    const session = createGuideSession(callbacks());
    await session.show(step, 0, 2);
    frame!(0); instance.refresh.mockClear();
    vi.mocked(target.getBoundingClientRect).mockReturnValue(DOMRect.fromRect({ y: 120, width: 100, height: 40 }));
    document.dispatchEvent(new Event('scroll')); frame!(16);
    expect(instance.refresh).toHaveBeenCalledOnce();
    instance.refresh.mockClear(); vi.stubGlobal('innerWidth', 390); frame!(32);
    expect(instance.refresh).toHaveBeenCalledOnce();
    target.remove(); const replacement = visibleTarget(); frame!(48);
    expect(instance.highlight.mock.calls.at(-1)![0].element).toBe(replacement);
    replacement.remove(); frame!(64);
    expect(instance.highlight.mock.calls.at(-1)![0].element).toBeUndefined();
    session.stop(); expect(cancel).toHaveBeenCalled();
    instance.refresh.mockClear(); frame!(80); expect(instance.refresh).not.toHaveBeenCalled();
  });
});
