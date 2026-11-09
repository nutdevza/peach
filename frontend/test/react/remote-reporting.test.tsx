import { describe, expect, it, vi } from 'vitest';

import { RemoteReportingSettings, type RemoteReportingState } from '../../src/react/settings/remote-reporting-settings';
import { click, mount, settle, switches } from './render';

const initial: RemoteReportingState = {
  usage: false, errors: false, available: false,
  fields: { usage: 'Peach version and operating system type', errors: 'Error chains, code locations, and structured error codes' },
  notice: 'Never sends log bodies or media info automatically.',
};

describe('Version stats and error diagnostics', () => {
  it('Shows the last-sent date; a new request still queued keeps the earlier sent date', async () => {
    const sent = '2026-11-06T09:40:48Z';
    const host = await mount(<RemoteReportingSettings initial={{ ...initial, delivery: {
      usage: { status: 'queued', last_sent_at: sent }, errors: { status: 'unknown' },
    } }} receipt={vi.fn()} />);
    expect(host.textContent).toContain(`Last sent: ${new Date(sent).toLocaleDateString()}`);
    const rules = host.querySelector('summary');
    await click(rules);
    expect(host.querySelector('details')?.open).toBe(true);
    expect(host.textContent).toContain(initial.fields.usage);
    expect(host.textContent).toContain(initial.notice);
  });
  it('The two statistic kinds show one date, the most recent successful send', async () => {
    const latest = '2026-11-08T10:00:00Z';
    const host = await mount(<RemoteReportingSettings initial={{ ...initial, delivery: {
      usage: { status: 'accepted', last_sent_at: '2026-11-06T10:00:00Z' },
      errors: { status: 'accepted', last_sent_at: latest },
    } }} receipt={vi.fn()} />);
    const dates = [...host.querySelectorAll('p')].filter(node => node.textContent?.startsWith('Last sent: '));
    expect(dates.map(node => node.textContent)).toEqual([`Last sent: ${new Date(latest).toLocaleDateString()}`]);
  });
  it('The individual telemetry switch keeps its saved off choice; once on, version statistics and error diagnostics save together', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ...initial, usage: true, errors: true }) }));
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<RemoteReportingSettings initial={initial} receipt={receipt} />);
    expect(switches(host).map((node) => node.checked)).toEqual([false]);
    expect(host.textContent).toContain('Upload service not configured');
    expect(host.textContent).toContain('Uploads version, system info, failure type, code location, and occurrence count.');
    await click(switches(host)[0]!);
    await settle();
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/configuration/remote-reporting');
    expect(JSON.parse(String(init.body))).toEqual({ usage: true, errors: true });
    expect(receipt).toHaveBeenCalledWith('Diagnostic options saved');
    expect(switches(host).map((node) => node.checked)).toEqual([true]);
  });

  it('A failed save keeps the saved state and the error, and can be closed again', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Save on this machine' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => initial });
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await mount(<RemoteReportingSettings initial={{ ...initial, usage: true, errors: true }} receipt={receipt} />);
    for (const toggle of switches(host)) await click(toggle);
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('This device does not have permission for this action. Do it on the computer running Peach.');
    expect(receipt).not.toHaveBeenCalled();
    await click(switches(host)[0]);
    await settle();
    expect(JSON.parse(String(fetcher.mock.calls[1]![1].body))).toEqual({ usage: false, errors: false });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
