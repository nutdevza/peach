/* Creator aliases: checkboxes decide the merge scope, every merge waits for a confirm click, and an interrupted run must say how many groups remain.
 *
 * Merging means "treating two names as one person" and changes the grouping, so this tests scope and confirmation only, not layout. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import { queryClient } from '../../src/react/query';
import { AliasManager, type AliasManagerProps } from '../../src/react/follow-manage/alias-manager';
import {
  FOLLOW_ALIAS_URL, type AliasGroup, type AliasSuggestion,
} from '../../src/react/follow-manage/follow-manage';

import { buttonNamed, click, mountRoot, settle, type } from './render';

afterEach(() => queryClient.clear());
notifyManager.setScheduler((notify) => notify());

const GROUPS: AliasGroup[] = [
  {
    canonical_key: 'name:Author A', canonical_name: 'Author A',
    aliases: [{ key: 'name:Saved alias', name: 'Saved aliases' }],
  },
];

const SUGGESTIONS: AliasSuggestion[] = [
  { canonical: 'Author A', alias: 'Alias A', evidence: 'Source A' },
  { canonical: 'Author B', alias: 'Alias B', evidence: 'Source B' },
];

type Confirmation = { title: string; body: string; items?: readonly string[]; onConfirm(): Promise<unknown> };

/** The confirm dialog only records parameters and never clicks itself: a human always clicks the merge, and that is what this must guard. */
function stubConfirm() {
  const asked: Confirmation[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    asked.push(options);
    return { confirmed: false };
  }) as typeof legacyUi.confirmModal);
  return asked;
}

async function open(fetcher: ReturnType<typeof vi.fn>, over: Partial<AliasManagerProps> = {}) {
  vi.stubGlobal('fetch', fetcher);
  const toast = vi.fn();
  const render = (props = over) => (
    <QueryClientProvider client={queryClient}>
      <AliasManager groups={GROUPS} suggestions={SUGGESTIONS} readOnly={false} toast={toast} {...props} />
    </QueryClientProvider>);
  const mounted = await mountRoot(render());
  await settle();
  return { toast, ...mounted, renderProps: (props: Partial<AliasManagerProps>) =>
    mounted.rerender(render({ ...over, ...props })) };
}

const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));

const box = (root: ParentNode, name: string) =>
  root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${name}"]`);

const aliasWrites = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls.filter(([input]) => String(input) === FOLLOW_ALIAS_URL)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

it('Checks define the merge scope, and header select-all can cancel them together', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host } = await open(fetcher);

  expect(buttonNamed('Merge selected (0)', host)).toBeNull();

  await click(box(host, 'Choose alias Alias B to merge into Author B'));
  expect(box(host, 'Select all pending-merge aliases')?.indeterminate).toBe(true);

  await click(buttonNamed('Merge selected (1)', host));
  // Confirm was not clicked yet, so nothing should be sent.
  expect(aliasWrites(fetcher)).toHaveLength(0);
  expect(asked[0]!.body).toContain('"Alias B" into "Author B"');
  expect(asked[0]!.body).not.toContain('Alias A');

  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher).map((sent) => sent.alias)).toEqual(['Alias B']);

  await click(box(host, 'Select all pending-merge aliases'));
  expect(buttonNamed('Merge selected (2)', host)).not.toBeNull();
  expect(box(host, 'Select all pending-merge aliases')?.checked).toBe(true);
  expect(box(host, 'Select all pending-merge aliases')?.indeterminate).toBe(false);
  await click(box(host, 'Select all pending-merge aliases'));
  expect(buttonNamed('Merge selected (0)', host)).toBeNull();
});

it('Reordering and extending the merge list keeps checks by alias; the merge uses the current canonical name', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host, renderProps } = await open(fetcher);
  await click(box(host, 'Choose alias Alias B to merge into Author B'));
  await renderProps({ suggestions: [
    { ...SUGGESTIONS[1]!, canonical: 'Canonical name of Author B' },
    { canonical: 'Author C', alias: 'Alias C', evidence: 'Source C' },
    SUGGESTIONS[0]!,
  ] });
  expect(box(host, 'Choose alias Alias B to merge into Canonical name of Author B')?.checked).toBe(true);
  expect(box(host, 'Choose alias Alias C to merge into Author C')?.checked).toBe(false);
  expect(box(host, 'Select all pending-merge aliases')?.indeterminate).toBe(true);
  await click(buttonNamed('Merge selected (1)', host));
  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher)).toEqual([
    { action: 'add', canonical: 'Canonical name of Author B', alias: 'Alias B' },
  ]);
  expect(buttonNamed('Merge selected (0)', host)).toBeNull();
});

it('Vanished candidates never join the merge scope, and reselecting all processes only the current list', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host, renderProps } = await open(fetcher);
  await click(box(host, 'Choose alias Alias B to merge into Author B'));
  await renderProps({ suggestions: [SUGGESTIONS[0]!] });
  expect(buttonNamed('Merge selected (0)', host)).toBeNull();
  expect(box(host, 'Select all pending-merge aliases')?.indeterminate).toBe(false);
  await click(box(host, 'Select all pending-merge aliases'));
  expect(box(host, 'Select all pending-merge aliases')?.checked).toBe(true);
  await click(buttonNamed('Merge selected (1)', host));
  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher).map((sent) => sent.alias)).toEqual(['Alias A']);
});

it('Saved alias list refreshes and read-only state both update through cell actions', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host, renderProps } = await open(fetcher);
  const groups = [{ ...GROUPS[0]!, canonical_name: 'Canonical name of Author A',
    aliases: [{ key: 'name:new alias', name: 'New alias' }] }];
  await renderProps({ groups, readOnly: true });
  const remove = () => host.querySelector<HTMLButtonElement>('button[aria-label="Remove alias New alias"]');
  expect(host.querySelector('button[aria-label="Remove alias Saved aliases"]')).toBeNull();
  expect(host.textContent).toContain('Canonical name of Author A');
  expect(remove()?.disabled).toBe(true);
  await renderProps({ groups, readOnly: false });
  expect(remove()?.disabled).toBe(false);
  await click(remove());
  expect(asked[0]!.body).toContain('"New alias"');
  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher)).toEqual([{ action: 'remove', alias: 'New alias' }]);
});

it('Manually saving an alias submits the input and clears it on success', async () => {
  const fetcher = okFetch();
  const { host, toast } = await open(fetcher);
  const canonical = () => host.querySelector<HTMLInputElement>('input[aria-label="Canonical name"]');
  const alias = () => host.querySelector<HTMLInputElement>('input[aria-label="Platform alias"]');
  await type(canonical(), 'Canonical name');
  await type(alias(), 'Names on platforms');
  await click(buttonNamed('Save alias', host));
  await settle();
  expect(aliasWrites(fetcher)).toEqual([{ action: 'add', canonical: 'Canonical name', alias: 'Names on platforms' }]);
  expect(canonical()?.value).toBe('');
  expect(alias()?.value).toBe('');
  expect(toast).toHaveBeenCalledWith('Saved creator aliases');
});

it('Merge-all sends one by one, following the pending-merge list order', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { toast } = await open(fetcher);

  await click(buttonNamed('Merge all (2)', document));
  expect(asked[0]!.title).toBe('Merge all creator aliases');
  await asked[0]!.onConfirm();
  await settle();

  expect(aliasWrites(fetcher)).toEqual([
    { action: 'add', canonical: 'Author A', alias: 'Alias A' },
    { action: 'add', canonical: 'Author B', alias: 'Alias B' },
  ]);
  expect(toast).toHaveBeenCalledWith('Merged 2 creator alias groups');
});

it('The merge broke midway, reporting how many groups remain unmerged', async () => {
  const asked = stubConfirm();
  let call = 0;
  const fetcher = vi.fn(async () => {
    call += 1;
    if (call === 2) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  const { host, toast } = await open(fetcher);

  await click(buttonNamed('Merge all (2)', document));
  await expect(asked[0]!.onConfirm()).rejects.toThrow('1 group still unmerged');
  await settle();

  expect(aliasWrites(fetcher)).toHaveLength(2);
  expect(toast).not.toHaveBeenCalled();
  expect(host.textContent).toContain('1 group still unmerged');
});

it('Removing a saved alias asks first too', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host, toast } = await open(fetcher);

  await click(host.querySelector('button[aria-label="Remove alias Saved aliases"]'));
  expect(aliasWrites(fetcher)).toHaveLength(0);
  expect(asked[0]!.body).toContain('"Saved aliases"');

  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher)).toEqual([{ action: 'remove', alias: 'Saved aliases' }]);
  expect(toast).toHaveBeenCalledWith('Removed the creator alias');
});

it('Alias pagination keeps cross-page selection, and bulk-removing saved aliases processes only the selected groups', async () => {
  const asked = stubConfirm();
  const fetcher = okFetch();
  const { host, renderProps } = await open(fetcher);
  const groups = Array.from({ length: 22 }, (_, index) => ({
    canonical_key: `name:${index}`, canonical_name: `Creator ${index}`,
    aliases: [{ key: `alias:${index}`, name: `Alias ${index}` }],
  }));
  await renderProps({ groups });
  const saved = () => host.querySelector('[aria-label="Saved creator aliases"]')!;
  expect(saved().querySelectorAll('tbody tr')).toHaveLength(20);
  await click(box(host, 'Select saved alias Creator 0'));
  await click(buttonNamed('Next page', host));
  await click(box(host, 'Select saved alias Creator 20'));
  await click(buttonNamed('Remove selected aliases (2)', host));
  expect(aliasWrites(fetcher)).toEqual([]);
  expect(asked[0]!.items).toEqual(['Alias 0', 'Alias 20']);
  await asked[0]!.onConfirm();
  await settle();
  expect(aliasWrites(fetcher)).toEqual([
    { action: 'remove', alias: 'Alias 0' }, { action: 'remove', alias: 'Alias 20' },
  ]);
  await renderProps({ groups: groups.slice(0, 2) });
  expect(saved().querySelectorAll('tbody tr')).toHaveLength(2);
  expect(host.textContent).toContain('1–2 / 2 groups');
});

it('Clicking blank space in an alias row selects the group, editing the canonical name is its own write operation, and failure keeps the popover open', async () => {
  const fetcher = okFetch();
  const { host, toast } = await open(fetcher);
  const saved = host.querySelector('[aria-label="Saved creator aliases"]')!;
  await click(saved.querySelector('tbody [data-table-space]'));
  expect(box(saved, 'Select saved alias Author A')?.checked).toBe(true);
  await click(saved.querySelector('tbody [data-table-space]'));
  await click(saved.querySelector('button[aria-label="Edit the canonical name of Author A"]'));
  expect(box(saved, 'Select saved alias Author A')?.checked).toBe(false);
  const dialog = document.querySelector('[role="dialog"][aria-label="Edit the canonical name"]')!;
  await click(buttonNamed('Saved aliases', dialog));
  fetcher.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ ok: false, error: 'Name already taken' }) });
  await click(buttonNamed('Edit the canonical name', dialog));
  await settle();
  expect(dialog.textContent).toContain('Name already taken');
  expect(document.contains(dialog)).toBe(true);
  await click(buttonNamed('Edit the canonical name', dialog));
  await settle();
  expect(aliasWrites(fetcher)).toEqual([
    { action: 'rename', canonical_key: 'name:Author A', canonical: 'Saved aliases' },
    { action: 'rename', canonical_key: 'name:Author A', canonical: 'Saved aliases' },
  ]);
  expect(toast).toHaveBeenCalledWith('Changed the canonical name to Saved aliases');
});
