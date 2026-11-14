import { describe, expect, it, vi } from 'vitest';

import { LibrarySharingSettings, type LibrarySharingState } from '../../src/react/settings/library-sharing-settings';
import { actionOrder, buttonNamed, click, mount, settle, switches } from './render';

const initial: LibrarySharingState = { enabled: false, available: true, schema: 4,
  fields: ['Video code, tags, rating, and every preference dimension'], notice: 'Uploads library and preference details after anonymization.' };

describe('Explicit consent for library and taste sharing', () => {
  it.each([
    [{ status: 'waiting-data', attempted: false }, 'Waiting for library or preference data to analyze.'],
    [{ status: 'failed', attempted: false }, 'Library and taste uploads did not finish and will re-prepare automatically.'],
    [{ status: 'failed', attempted: true }, 'Library and taste uploads failed; nothing more sends this week.'],
    [{ status: 'unknown', attempted: true }, 'No upload result received; not sending again this week.'],
  ])('Feedback renders by actual send state %j', async (last_attempt, message) => {
    const host = await mount(<LibrarySharingSettings initial={{ ...initial, enabled: true, last_attempt }} receipt={vi.fn()} />);
    expect(host.textContent).toContain(message);
  });

  it('The switch stays visible, enabling only after preview upload and explicit full consent', async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/preview')
      ? { data: { library: [{ code: 'EXM-001' }], preferences: {}, coverage: { uncoded_items: 0 } }, bytes: 80, token: 'preview-token', schema: 4 }
      : { ...initial, enabled: true } }));
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<LibrarySharingSettings initial={initial} receipt={receipt} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain(initial.notice);
    expect(switches(host)[0]?.checked).toBe(false);
    await click(switches(host)[0]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(switches(host)[0]?.checked).toBe(false);
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('input[type="checkbox"]:not([role="switch"])')).toBeNull();
    await click(buttonNamed('Preview the upload contents', host));
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('The random ID deduplicates instances');
    expect((buttonNamed('Agree and enable upload', host) as HTMLButtonElement).disabled).toBe(true);
    expect(actionOrder(buttonNamed('Agree and enable upload', host)!.parentElement)).toEqual(['Cancel', 'Preview the upload contents', 'Agree and enable upload']);
    await click(host.querySelector('input[type="checkbox"]:not([role="switch"])'));
    await click(buttonNamed('Agree and enable upload', host));
    await settle();
    const call = fetcher.mock.calls[1]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({ enabled: true, schema: 4, consent: true, preview_token: 'preview-token' });
    expect(receipt).toHaveBeenCalledWith('Saved library and taste upload options');
    expect(switches(host)[0]?.checked).toBe(true);
    expect(host.querySelector('details')?.open).toBe(false);
    expect(host.querySelector('pre')).toBeNull();
    expect(host.querySelector('input[type="checkbox"]:not([role="switch"])')).toBeNull();
    expect(buttonNamed('Preview the upload contents', host)).not.toBeNull();
  });

  it('Turning off needs no re-preview or re-check', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => initial }));
    vi.stubGlobal('fetch', fetcher);
    const host = await mount(<LibrarySharingSettings initial={{ ...initial, enabled: true }} receipt={vi.fn()} />);
    await click(switches(host)[0]!);
    await settle();
    const call = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body)).enabled).toBe(false);
    expect(switches(host)[0]?.checked).toBe(false);
  });

  it('On preview failure the closed state is kept; retry is possible and no save success is reported', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Load failed' }) }));
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<LibrarySharingSettings initial={initial} receipt={receipt} />);
    await click(switches(host)[0]);
    await click(buttonNamed('Preview the upload contents', host));
    await settle();
    expect(switches(host)[0]?.checked).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Load failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(receipt).not.toHaveBeenCalled();
  });

  it('When a refresh does not arrive the original participation state is kept; a missing response is not treated as off or success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ section_errors: {} }) })));
    const host = await mount(<LibrarySharingSettings initial={{ ...initial,
      participation: { status: 'unknown', pending_state: null } }} receipt={vi.fn()} />);
    await click(buttonNamed('Refresh the send state', host));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.');
    expect(host.querySelector('[aria-label="Participation state"]')?.textContent).toBe('Results not obtained');
    expect(host.querySelector('[aria-label="Participation state"]')?.getAttribute('data-status-tone')).toBe('warning');
  });
});
