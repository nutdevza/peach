/** 「应用与维护 › 修复与迁移」子页：升级后的各项修复做了什么、改了多少；开销大或可能改错的在这里等用户确认。
 *
 *  历史里列出每次修复前留下的账本备份：还在的去「账本备份」恢复，清退了的照实写。页头的面包屑由管理区页头画。
 *  首屏数据随路由预取（`repair-center-data.ts`），等待时画路由骨架；有项在跑或还在统计时每 2 秒重读，做完就停。
 *  等确认的项还没开始，只写待处理的量和「开始」；开始之后才有进度条，「开始」换成状态标签。 */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { fmtSize } from '@peach/legacy/core';
import { confirmModal } from '@peach/legacy/ui';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { apiSend } from '../../api';
import { repairCenterPanelSkeleton } from '../../management-skeletons';
import { RESULT_PANEL, RESULT_SECTION, SectionHeading } from '../components/fieldset';
import { Note } from '../components/note';
import { Page } from '../components/page';
import { Progress } from '../components/progress';
import { StatusLabel, type StatusTone } from '../components/status-label';
import { queryClient } from '../query';
import {
  fetchRepairs, REPAIRS_KEY, type RepairCenterData, type RepairHistory, type RepairItem,
} from './repair-center-data';
import { useAction } from './use-action';

const STATES: Record<string, [string, StatusTone]> = {
  done: ['Completed', 'success'], succeeded: ['Completed', 'success'], complete: ['Completed', 'success'],
  running: ['In progress', 'progress'], pending: ['Waiting to run', 'neutral'], waiting: ['Waiting for you', 'warning'],
  failed: ['Needs retry', 'error'], none: ['Nothing to do', 'neutral'],
};
const number = (value = 0) => value.toLocaleString();
const stamp = (seconds: number) => new Date(seconds * 1000).toLocaleString('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const reclaimable = (item: RepairItem) => `${number(item.files)} files · ${fmtSize(item.bytes || 0)}`;
/** 在跑且知道总量的项画进度条；件数写在条旁边，右侧只留状态，手机宽度下才不挤说明列。 */
const progressing = (item: RepairItem) => item.state === 'running' && !!item.total;
/** 页面开着时要跟进的后台进度：在跑的项与还在统计的删除类确认项。补测要跑几天，正因为久才要看得到进度。 */
const inFlight = (item: RepairItem) => !!item.estimating || item.state === 'running';

function reading(item: RepairItem) {
  if (item.estimating) return 'Measuring';
  if (item.state === 'failed' && item.error) return item.error;
  // 行里只写体积，手机宽度下才不挤说明列；文件数在确认弹层里点名。
  if (item.files) return `Reclaimable ${fmtSize(item.bytes || 0)}`;
  if (item.state === 'waiting') return item.pending ? `${number(item.pending)} videos pending recheck` : '';
  if (progressing(item)) return '';
  if (item.total) return `${number(item.done)} / ${number(item.total)}`;
  if (item.mode === 'confirm') return '';
  return item.changed ? `${number(item.changed)} changes` : '';
}

function Row({ title, description, progress, children }: {
  title: string; description: string; progress?: ReactNode; children: ReactNode;
}) {
  return (
    <div className={`${RESULT_SECTION} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-medium text-text-primary">{title}</span>
        <span className="text-body-2-regular text-text-secondary">{description}</span>
        {progress ? <div className="pt-2">{progress}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

function ItemProgress({ item }: { item: RepairItem }) {
  return <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1"><Progress label={`${item.title} progress`} value={item.done || 0} max={item.total} /></div>
    <span className="shrink-0 text-caption-1-regular text-text-secondary tabular-nums">
      {number(item.done)} / {number(item.total)}</span>
  </div>;
}

export function RepairCenterPage() {
  const query = useQuery({
    queryKey: REPAIRS_KEY,
    queryFn: ({ signal }) => fetchRepairs(signal),
    refetchInterval: ({ state }) => (state.data?.items.some(inFlight) ? 2000 : false),
  });
  const data = query.data;
  const action = useAction();
  const update = (next: RepairCenterData) => queryClient.setQueryData(REPAIRS_KEY, next);
  const post = (item: RepairItem, signal?: AbortSignal) => apiSend<RepairCenterData>(
    `/api/configuration/repairs/${item.id}`, {}, 'POST', signal);
  const start = (item: RepairItem) => item.files === undefined
    ? void action.run(item.id, signal => post(item, signal), update)
    : void confirmModal({
      title: `Delete ${item.title}`,
      body: `Will delete ${reclaimable(item)}; deletion cannot be undone. The latest 3 snapshots per followed source and snapshots referenced by entries are kept.`,
      confirmLabel: 'Delete snapshots', danger: true,
      onConfirm: async () => update(await post(item)),
    });
  const backupNote = (row: RepairHistory) => !row.backups.length ? null : row.backups.some(backup => backup.exists)
    ? <LinkButton href="/settings/maintenance#ledgerBackups" size="small" trailingIcon={RiArrowRightLine}>The pre-repair ledger backup</LinkButton>
    : <span className="text-body-2-regular text-text-tertiary">The pre-repair backup was cleared</span>;
  const failure = action.error || (query.error ? query.error.message : '');

  return <Page>
    {failure ? <Note tone="error">{failure}</Note> : null}
    <section aria-labelledby="repair-items" className="flex flex-col gap-4">
      <SectionHeading id="repair-items">Repair items</SectionHeading>
      {!data
        // 预取失败后在页内重取：画与路由骨架同一份占位，不留一张空卡。
        ? <div className="contents" data-skeleton="" aria-busy="true" aria-label="Reading repair items"
            dangerouslySetInnerHTML={{ __html: repairCenterPanelSkeleton() }} />
        : !data.items.length
        ? <p className="text-body-2-regular text-text-secondary">Nothing on this machine needs repairing or migrating.</p>
        : <div className={RESULT_PANEL}>
        {data.items.map(item => {
          const [label, tone] = STATES[item.state] || STATES.none;
          const text = reading(item);
          return (
            <Row key={item.id} title={item.title} description={item.summary}
              progress={progressing(item) ? <ItemProgress item={item} /> : null}>
              {text ? <span className="text-body-2-regular text-text-secondary">{text}</span> : null}
              {item.mode === 'confirm' && item.state === 'waiting'
                ? <Button size="small" disabled={!data.available || !!action.busy || item.estimating}
                    onClick={() => start(item)}>开始</Button>
                : <StatusLabel tone={tone}>{label}</StatusLabel>}
            </Row>
          );
        })}
      </div>}
    </section>
    {data?.history.length ? <section aria-labelledby="repair-history" className="flex flex-col gap-4">
      <SectionHeading id="repair-history">历史记录</SectionHeading>
      <div className={RESULT_PANEL}>
        {data.history.map(row => (
          <Row key={row.id} title={row.title}
            description={`${stamp(row.at)} · ${row.changed ? `${number(row.changed)} changes` : 'No changes'}`}>
            {backupNote(row)}
          </Row>
        ))}
      </div>
    </section> : null}
  </Page>;
}
