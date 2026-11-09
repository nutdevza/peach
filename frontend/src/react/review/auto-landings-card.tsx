/* 复核页元数据分类下的「自动写入的资料」（ADR-0141）。
 *
 * 资料处理按确定判据自动写下的标题、发行日期与标签，一行一条：先看是哪部作品、写了什么、
 * 原来是什么，规则与时间排在后面。勾选后先读一次撤回预览，弹层里逐条列出会改回的值、会删的
 * 标签和之后被人改过、不动的作品，确认后才写账本。撤回的回执留在表上方，被跳过的作品可以
 * 点开核对。没有自动写入也没有回执时整块不出现。 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { VisuallyHidden } from 'react-aria-components';
import { confirmModal } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { errorMessage } from '../../api';
import { DataTable, type DataColumn } from '../components/data-table';
import { Note } from '../components/note';
import { queryClient } from '../query';
import { busyProps } from '../settings/use-action';
import {
  AUTO_LANDINGS_KEY, fetchAutoLandings, previewAutoLandings, previewBody, previewLines, previousText,
  resultText, revertAutoLandings, workLabel, writeTime, writtenText,
  type AutoLandingResult, type AutoLandingWrite,
} from './auto-landings';
import { REVIEW_KEY } from './review';

const DESCRIPTION = 'Titles, release dates, and tags that metadata processing wrote in by fixed rules, one per row. Withdrawing restores the overwritten value to what was there before and removes added tags; works edited after the write keep their current values.';

function Work({ item, openItem }: { item: AutoLandingWrite; openItem(id: number): void }) {
  const open = item.asset_id && !item.gone ? () => openItem(item.asset_id!) : undefined;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <button type="button" disabled={!open} onClick={open}
        className="flex aspect-card-cover w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-background-tertiary-default outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-default">
        {item.preview_url
          ? <img src={item.preview_url} alt="" loading="lazy" className="size-full object-cover" />
          : <span className="text-caption-1-regular text-text-secondary">No cover</span>}
        <VisuallyHidden>{`Open ${workLabel(item)}`}</VisuallyHidden>
      </button>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-medium text-text-primary">
          {workLabel(item)}
          {item.assets > 1 ? <small className="ml-1 text-caption-1-regular text-text-secondary">{`${item.assets} files`}</small> : null}
        </span>
        <small title={item.name} className="truncate text-caption-1-regular text-text-secondary">
          {item.gone ? 'The work is no longer in the ledger' : item.name}
        </small>
      </span>
    </span>
  );
}

function Written({ item }: { item: AutoLandingWrite }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span title={writtenText(item)} className="truncate text-body-regular text-text-primary">
        <span className="text-text-secondary">{`${item.field}: `}</span>{writtenText(item)}
      </span>
      <small title={previousText(item)} className="truncate text-caption-1-regular text-text-secondary">{previousText(item)}</small>
    </span>
  );
}

export function AutoLandingsCard(
  { locked, openItem, toast }: { locked: boolean; openItem(id: number): void; toast(message: string): void },
) {
  const [selected, setSelected] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<AutoLandingResult | null>(null);
  const query = useQuery({ queryKey: AUTO_LANDINGS_KEY, queryFn: ({ signal }) => fetchAutoLandings(signal) });
  const items = query.data?.items ?? [];
  const revert = useMutation({
    mutationFn: async (keys: string[]) => {
      const preview = await previewAutoLandings(keys);
      const { confirmed, result } = await confirmModal({
        title: 'Withdraw auto-writes', body: previewBody(preview), items: previewLines(preview),
        confirmLabel: 'Withdraw', onConfirm: () => revertAutoLandings(preview.items, preview.token),
      });
      return confirmed ? result as AutoLandingResult : null;
    },
    onSuccess: (result) => {
      if (!result) return;
      setReceipt(result);
      setSelected([]);
      toast(resultText(result));
      void queryClient.invalidateQueries({ queryKey: REVIEW_KEY });
    },
    onError: (error) => toast(errorMessage(error)),
  });
  if (!items.length && !receipt && !query.isError) return null;
  const columns: DataColumn<AutoLandingWrite>[] = [
    { id: 'work', label: 'Videos', width: 300, min: 240, value: (item) => workLabel(item),
      render: (item) => <Work item={item} openItem={openItem} /> },
    { id: 'written', label: 'Write', width: 320, min: 220, value: (item) => `${item.field}${writtenText(item)}`,
      render: (item) => <Written item={item} /> },
    // 规则与时间是次要信息，叠成一列，桌面宽度下整张表不必横向滚动。
    { id: 'rule', label: 'Rules and timing', width: 176, min: 144, value: (item) => item.at ?? 0,
      render: (item) => (
        <span title={item.batch} className="flex min-w-0 flex-col gap-0.5 text-text-secondary">
          <span className="truncate text-body-2-regular">{item.label}</span>
          <small className="tabular-nums text-caption-1-regular">{writeTime(item) || 'Time unknown'}</small>
        </span>
      ) },
  ];
  return (
    <section aria-labelledby="auto-landings-title" className="flex flex-col gap-4">
      {receipt ? (
        <Note tone="success" title={resultText(receipt)}>
          <p className="text-body-2-regular">{`The ledger was backed up to ${receipt.backup} before the withdrawal.`}</p>
          {receipt.changed.length ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-2-regular">
              {`${receipt.changed.length} entries were edited after the write or the work is gone, untouched:`}
              {receipt.changed.map((row) => row.gone ? (
                <span key={`${row.asset_id}:${row.field}`} className="text-text-secondary">{`#${row.asset_id} (deleted)`}</span>
              ) : (
                <LinkButton key={`${row.asset_id}:${row.field}`} size="small" onClick={() => openItem(row.asset_id)}>
                  {workLabel(row)}
                </LinkButton>
              ))}
            </p>
          ) : null}
        </Note>
      ) : null}
      {query.isError ? (
        <Note tone="error" title="Failed to read the auto-written metadata">{errorMessage(query.error)}</Note>
      ) : items.length ? (
        <DataTable label="Auto-written metadata" items={items} columns={columns}
          title="Auto-written metadata" titleId="auto-landings-title" unit="items"
          description={DESCRIPTION}
          rowId={(item) => item.item_key} rowLabel={(item) => `${workLabel(item)} ${item.field}`}
          selected={selected} onSelected={setSelected}
          actions={(chosen) => (
            <Button variant="secondary" size="small" disabled={locked || !chosen.length}
              {...busyProps(revert.isPending)} onClick={() => revert.mutate(chosen.map((item) => item.item_key))}>
              {`Withdraw selected (${chosen.length})`}
            </Button>
          )} />
      ) : null}
    </section>
  );
}
