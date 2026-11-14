import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmModal } from '@peach/legacy/ui';
import { TagManager, type ManagedTag } from '../../src/react/index/tag-manager';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, mountRoot, settle, submit, type } from './render';

vi.mock('@peach/legacy/ui', async original => ({
  ...await original<typeof import('@peach/legacy/ui')>(),
  confirmModal: vi.fn(async ({ onConfirm }: { onConfirm(): Promise<unknown> }) => ({ confirmed: true, result: await onConfirm() })),
}));
vi.mock('../../src/react/toaster', () => ({ showToast: vi.fn() }));
notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

const initial = (): ManagedTag[] => [
  { entity_id: 1, k: 'Glasses', aliases: ['Glasses'], n: 2, hidden: false },
  { entity_id: 2, k: 'Travel', aliases: [], n: 1, hidden: false },
  { entity_id: 3, k: 'Old tag', aliases: [], n: 1, hidden: true },
];

function inventoryPage(rows: ManagedTag[], url: string) {
  const params = new URL(url, 'http://localhost').searchParams;
  const state = params.get('state') || 'active';
  const q = (params.get('q') || '').toLocaleLowerCase();
  const matches = rows.filter(row => (state === 'blocked' ? row.blocked : !row.blocked && row.hidden === (state === 'hidden'))
    && [row.k, ...row.aliases].some(name => name.toLocaleLowerCase().includes(q)));
  const categories = Object.fromEntries(matches.map(row => [row.cat || 'general', 1]));
  const filtered = matches.filter(row => !params.get('category') || params.get('category') === 'all' || row.cat === params.get('category'));
  const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 20);
  return { items:filtered.slice(offset, offset + limit), total:filtered.length, categories, duplicate_groups:[] };
}

function backend(failPreview = false) {
  let rows = initial();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const command = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith('/preview')) return { ok: !failPreview, status: failPreview ? 400 : 200, json: async () =>
      failPreview ? { error: 'The target name already exists; use merge tag instead' } : { token: 'plan', assets: 2, overlap: 0, tags: rows.filter(row => command.ids.includes(row.entity_id)) } };
    if (command) rows = rows.map(row => !command.ids.includes(row.entity_id) ? row :
      { ...row, k: command.operation === 'rename' ? command.name : row.k,
        hidden: command.operation === 'hide' || (command.operation !== 'restore' && row.hidden) });
    return { ok: true, status: 200, json: async () => command ? { ok: true } : inventoryPage(rows, url) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function open() {
  const host = await mount(<QueryClientProvider client={queryClient}><TagManager /></QueryClientProvider>);
  await settle(); return host;
}

describe('Manage tags', () => {
  it('Requests go per page with selection kept across pages, and category filters return to page one', async () => {
    const rows = Array.from({ length:230 }, (_, index) => ({ entity_id:index + 1, k:`tag-${index}`, n:230-index,
      aliases:[], hidden:false, cat:index < 120 ? 'general' : 'role' }));
    const fetcher = vi.fn(async (url: string) => ({ ok:true, json:async () => inventoryPage(rows, url) }));
    vi.stubGlobal('fetch', fetcher);
    const host = await open();
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(100);
    expect(new URL(fetcher.mock.calls[0]![0], 'http://localhost').searchParams.get('limit')).toBe('100');
    await click(host.querySelector('[data-tag-chip][data-k="tag-0"]'));
    await click(buttonNamed('Next page', host)); await settle();
    expect(host.querySelector('[data-tag-chip][data-k="tag-0"]')).toBeNull();
    await click(host.querySelector('[data-tag-chip][data-k="tag-100"]'));
    expect(host.querySelector('[aria-label="Tag management actions"]')?.textContent).toContain('2 tags selectedRenameMergeHide');
    await click(buttonNamed('Previous page', host)); await settle();
    expect(host.querySelector('[data-tag-chip][data-k="tag-0"]')?.getAttribute('aria-pressed')).toBe('true');
    await click(buttonNamed('Next page', host)); await settle();
    await click(buttonNamed('Character roles', host)); await settle();
    expect(host.querySelector('[data-tag-chip][data-k="tag-120"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Tag management actions"]')).toBeNull();
    const last = new URL(fetcher.mock.calls.at(-1)![0], 'http://localhost');
    expect(last.searchParams.get('offset')).toBe('0');
    expect(last.searchParams.get('category')).toBe('role');
  });

  it('Online content blocking and tag hiding keep separate states and restore with preview schedules', async () => {
    let blocked = false;
    const commands: Record<string, unknown>[] = [];
    const row = () => ({ id: 'outdoors', k: 'outdoors', n: 2, aliases: [], hidden: false, blocked, cat: 'general' });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const command = init?.body ? JSON.parse(String(init.body)) : null;
      if (command) commands.push(command);
      if (url.endsWith('/preview')) return { ok: true, json: async () => ({ token: 'content-plan', assets: 2, overlap: 0, tags: [row()] }) };
      if (command) blocked = command.operation === 'block';
      return { ok: true, json: async () => command ? { ok: true } : inventoryPage([row()], url) };
    }));
    const host = await mount(<QueryClientProvider client={queryClient}><TagManager scope="online" /></QueryClientProvider>);
    await settle();
    await click(host.querySelector('[data-tag-chip]'));
    await click(buttonNamed('Block content', host)); await settle();
    expect(commands).toEqual([{ operation: 'block', ids: ['outdoors'], scope: 'online' },
      { operation: 'block', ids: ['outdoors'], scope: 'online', token: 'content-plan' }]);
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(0);
    await click(buttonNamed('Hidden', host));
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(0);
    await click(buttonNamed('Blocked content', host));
    await click(host.querySelector('[data-tag-chip]'));
    await click(buttonNamed('Restore content', host)); await settle();
    expect(commands.at(-1)).toEqual({ operation: 'unblock', ids: ['outdoors'], scope: 'online', token: 'content-plan' });
    await click(buttonNamed('In use', host));
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(1);
  });

  it('Search registers aliases and distinguishes active from hidden tags', async () => {
    backend();
    const view = await mountRoot(<QueryClientProvider client={queryClient}><TagManager search="Glasses" /></QueryClientProvider>);
    const host = view.host;
    await settle();
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(1);
    expect(host.textContent).toContain('Glasses');
    await view.rerender(<QueryClientProvider client={queryClient}><TagManager search="" /></QueryClientProvider>);
    await click(buttonNamed('Hidden', host));
    expect(host.querySelectorAll('[data-tag-chip]')).toHaveLength(1);
    expect(host.textContent).toContain('Old tag');
  });

  it('Online tags keep their string identity and rename through the online vocabulary', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const command = init?.body ? JSON.parse(String(init.body)) : null;
      if (command) calls.push(command);
      return { ok: true, json: async () => url.endsWith('/preview')
        ? { token: 'online-plan', assets: 2, overlap: 0, tags: [{ id: 'outdoors', k: 'outdoors' }] }
        : inventoryPage([{ id: 'outdoors', k: 'outdoors', n: 2, aliases: [], hidden: false, cat: 'general' }], url) };
    }));
    const host = await mount(<QueryClientProvider client={queryClient}><TagManager scope="online" /></QueryClientProvider>);
    await settle();
    await click(host.querySelector('[aria-label="Edit tag outdoors"]'));
    await type(document.querySelector('input[aria-label="Tag name"]'), 'Outdoor');
    await submit(document.querySelector('form')); await settle();
    expect(calls).toEqual([{ operation: 'rename', scope: 'online', ids: ['outdoors'], name: 'Outdoor' },
      { operation: 'rename', scope: 'online', ids: ['outdoors'], name: 'Outdoor', token: 'online-plan' }]);
  });

  it('Renaming previews first, then submits with the same plan and refreshes tags', async () => {
    const fetcher = backend(); const host = await open();
    await click(host.querySelector('[data-tag-chip][data-k="Glasses"]'));
    await click(buttonNamed('Rename'));
    await type(document.querySelector('input[aria-label="Tag name"]'), 'My tags');
    await submit(document.querySelector('form'));
    await settle();
    expect(confirmModal).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('2 resources') }));
    const bodies = fetcher.mock.calls.filter(([, init]) => init?.body).map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([{ operation: 'rename', ids: [1], name: 'My tags' },
      { operation: 'rename', ids: [1], name: 'My tags', token: 'plan' }]);
    expect(host.querySelector('[data-tag-chip][data-k="My tags"]')).not.toBeNull();
  });

  it('Conflicts keep input and error without sending a write', async () => {
    const fetcher = backend(true); const host = await open();
    await click(host.querySelector('[data-tag-chip][data-k="Glasses"]'));
    await click(buttonNamed('Rename'));
    await type(document.querySelector('input[aria-label="Tag name"]'), 'Travel');
    await submit(document.querySelector('form')); await settle();
    expect((document.querySelector('input[aria-label="Tag name"]') as HTMLInputElement).value).toBe('Travel');
    expect(document.body.textContent).toContain('The target name already exists; use merge tag instead');
    expect(fetcher.mock.calls.filter(([url, init]) => url === '/api/tag-management' && init?.body)).toHaveLength(0);
  });
});
