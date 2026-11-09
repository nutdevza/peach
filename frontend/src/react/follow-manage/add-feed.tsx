/* 添加 JAV 订阅：输入女优名，到 JavDB 搜她的演员卡，勾选后登记到她名下并订上（ADR-0083）。
 *
 * 查找只是列出候选、不写任何东西：同名的人站上可能不止一位，替用户决定「就是这个」是错的。
 * 名字对得上、又只有一个人的那几张先勾上，其余的要用户自己点。地址仍由服务端按勾选的 id 拼，
 * 页面从头到尾不送地址。这位在数据库里不存在也可以订：服务端会新建她。
 *
 * 数据库里认得出、又已有 JavDB 演员页或 DMM 编号的人不必靠搜索：JavDB 冷却搜不成或搜不到时，
 * 照样给出「订阅库里的她」，和人物页的开关是同一个动作。 */
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { RiSearchLine } from '@remixicon/react';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';

import { cardClass } from '../components/card';
import { Note } from '../components/note';
import { ExternalLink, FieldLabel, Help } from '../settings/section';
import { busyProps, useAction } from '../settings/use-action';
import { composingKey } from '../components/ime';
import { followFeedByName, followFeedEntity, lookupFeedActor, type FeedCandidate, type FeedLookup } from './follow-manage';

const PLACEHOLDER = 'Enter a performer name to find her performer page on JavDB';
const TITLE = 'Add JAV subscription';

export interface AddFeedProps {
  readOnly: boolean;
  toast(message: string): void;
  /** After subscribing, make the list refetch. */
  onAdded(): void;
}

/** Who a check registers under: first see who the checked cards are already attributed to, then who the database can recognize by name; when neither, create a new one. */
function destination(result: FeedLookup, picked: ReadonlySet<string>): { text: string; blocked: boolean } {
  const holders = new Map<number, string>();
  for (const card of result.candidates) {
    if (picked.has(card.id) && card.held_by) holders.set(card.held_by.id, card.held_by.name);
  }
  if (holders.size > 1) {
    return { text: `The checked cards belong to different people in the database: ${[...holders.values()].join(', ')}. Merge them first, then subscribe.`, blocked: true };
  }
  const [holder] = holders.values();
  if (holder) return { text: `It will file under "${holder}"`, blocked: false };
  if (result.known) return { text: `It will be filed under "${result.known.name}" in the database`, blocked: false };
  return { text: `"${result.q}" is not in the database yet; a new person will be created`, blocked: false };
}

function CandidateRow({ card, picked, onPick }: { card: FeedCandidate; picked: boolean; onPick(on: boolean): void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Checkbox isSelected={picked} onChange={onPick}>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words">{card.names.join('、')}</span>
          {card.record ? <Chip variant="caption" color="neutral">{card.record}</Chip> : null}
          {card.held_by ? (
            <small className="text-caption-1-regular text-text-secondary">{`Already filed under "${card.held_by.name}"`}</small>
          ) : null}
        </span>
      </Checkbox>
      <ExternalLink href={card.url}>{card.id}</ExternalLink>
    </div>
  );
}

export function AddFeed({ readOnly, toast, onAdded }: AddFeedProps) {
  const [name, setName] = useState('');
  const [result, setResult] = useState<FeedLookup | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set<string>());
  const action = useAction();

  const search = () => {
    const q = name.trim();
    if (!q || readOnly) return;
    void action.run('lookup', (signal) => lookupFeedActor(q, signal), (found) => {
      setResult(found);
      setPicked(new Set(found.suggested));
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !composingKey(event.nativeEvent)) { event.preventDefault(); search() }
  };
  const close = () => { setResult(null); setPicked(new Set()); action.setError('') };
  const add = () => {
    if (!result) return;
    void action.run('follow', (signal) => followFeedByName(result.q, [...picked], signal), (done) => {
      toast(done.created
        ? `Created "${done.entity_name}" and subscribed to her new releases`
        : `Subscribed to new releases of "${done.entity_name}"`);
      setName('');
      close();
      onAdded();
    });
  };

  const followKnown = () => {
    const known = result?.known;
    if (!known) return;
    void action.run('known', (signal) => followFeedEntity(known.id, signal), () => {
      toast(`Followed new releases for "${known.name}"`);
      setName('');
      close();
      onAdded();
    });
  };

  const where = result ? destination(result, picked) : null;
  /* 没有可勾的卡（搜不成或搜不到）时，库里能直接订的她就是这一次的去处。 */
  const direct = result && !result.candidates.length && result.known?.subscribable ? result.known : null;

  return (
    /* Same shape as the 'Add follows' block: one filled card with the title inside it. */
    <section aria-label={TITLE} className={cardClass({ padding: 'none', className: 'flex flex-col gap-4 px-6 py-5 max-sm:px-4' })}>
      <h3 className="text-title-2-medium text-text-primary">{TITLE}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 grow">
          <Input aria-label="Performer name" placeholder={PLACEHOLDER} value={name} leadingIcon={RiSearchLine}
            enterKeyHint="search" isDisabled={readOnly} onChange={setName} onKeyDown={onKeyDown} />
        </div>
        <Button variant="primary" disabled={readOnly || !name.trim()} {...busyProps(action.busy === 'lookup')}
          onClick={search}>Find</Button>
      </div>

      {action.error ? <Note tone="error" title="This run did not finish">{action.error}</Note> : null}

      {result ? (
        <div className="flex flex-col gap-3">
          {result.unavailable ? <Note tone="warning" title="JavDB did not return a result this time">{result.unavailable}</Note> : null}
          <FieldLabel>Performer card on JavDB</FieldLabel>
          {result.candidates.length ? result.candidates.map((card) => (
            <CandidateRow key={card.id} card={card} picked={picked.has(card.id)}
              onPick={(on) => setPicked((now) => {
                const next = new Set(now);
                if (on) next.add(card.id); else next.delete(card.id);
                return next;
              })} />
          )) : <Help>{result.unavailable ? 'No performer card came back this time.' : 'That name returned nothing on JavDB.'}</Help>}
          {result.candidates.length ? (
            <Help role="status">{picked.size ? where!.text : 'Check her performer card; if both the censored and uncensored records are her, check both.'}</Help>
          ) : null}
          {direct ? (
            <Help role="status">{direct.following
              ? `The database entry "${direct.name}" is already followed for new releases.`
              : `The database entry "${direct.name}" already has a JavDB or DMM code and can be followed directly.`}</Help>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="small" onClick={close}>Off</Button>
            {result.candidates.length ? (
              <Button variant="primary" size="small" disabled={readOnly || !picked.size || where!.blocked}
                {...busyProps(action.busy === 'follow')} onClick={add}>{`Add subscriptions (${picked.size})`}</Button>
            ) : null}
            {direct && !direct.following ? (
              <Button variant="primary" size="small" disabled={readOnly}
                {...busyProps(action.busy === 'known')} onClick={followKnown}>{`Follow "${direct.name}"`}</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
