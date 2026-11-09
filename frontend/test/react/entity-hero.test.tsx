/* Profile card island: the row under the name, the profile table, how external links arrange; what clicks hand to the shell; what remains when the subscribe switch succeeds or fails;
 * the two keys on the new releases row; the open/close of the "+N" overlay.
 *
 * Appearance (round frame geometry, face zoom, narrow-screen single column, overlay position) is asserted by `frontend/e2e/design-*.test.ts` reading computed styles. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityHeroPage } from '../../src/react/entity-hero/entity-hero-page';
import { registerNameWritings, setNameLanguage } from '../../src/core/entity-names';
import {
  factRows, heroLinks, nameChoices, nameLine, shownTags,
  type EntityHeroActions, type EntityHeroData, type EntityHeroHelpers, type EntityHeroProps,
} from '../../src/react/entity-hero/entity-hero';
import { queryClient } from '../../src/react/query';
import { click, mount, settle } from './render';

afterEach(() => { queryClient.clear() });
beforeEach(() => { registerNameWritings([]); setNameLanguage('zh-CN') });
notifyManager.setScheduler((notify) => notify());

const performer = (extra: Partial<EntityHeroData> = {}): EntityHeroData => ({
  id: 7792, canonical_name: '葵つかさ', aliases: ['Tsukasa Aoi'], asset_count: 1234,
  agency: { canonical_name: 'New Actor eXperience' },
  name_groups: { reading: 'あおいつかさ', shown: ['Tsukasa Aoi'], total: 1, groups: [] },
  related_performers: [{ id: 1, k: '三上悠亜' }, { id: 2, k: '河北彩花' }],
  feed: { following: false },
  ...extra,
});

function actions(patch: Partial<EntityHeroActions> = {}): EntityHeroActions {
  return {
    openEntity: vi.fn(), chooseName: vi.fn(), addAlias: vi.fn(), follow: vi.fn(async () => {}),
    refreshFeedAfterCheck: vi.fn(), feedAction: vi.fn(async () => {}), avatarPicked: vi.fn(),
    openFollowAuthor: vi.fn(), confirmFollowAuthor: vi.fn(async () => {}), ...patch,
  };
}

function helpers(patch: Partial<EntityHeroHelpers> = {}): EntityHeroHelpers {
  return {
    portraitImg: () => '', wireScroller: vi.fn(), wireFeedRow: vi.fn(), receipt: vi.fn(), ...patch,
  };
}

function props(patch: Partial<EntityHeroProps> = {}): EntityHeroProps {
  return {
    kind: 'performer', name: '葵つかさ', entity: performer(), feedNew: null, feedHost: null, jav: true,
    actions: actions(), helpers: helpers(), ...patch,
  };
}

async function open(initial: EntityHeroProps) {
  const host = await mount(<QueryClientProvider client={queryClient}><EntityHeroPage {...initial} /></QueryClientProvider>);
  await settle();
  return host;
}

describe('Pure functions for layout', () => {
  it('Language switches keep the chosen stage name, and the name menu submits the canonical name with raw values', async () => {
    registerNameWritings([{ id: 7792, kind: 'performer', canonical_name: '枫花恋', zh_cn: '枫花恋', ja: '楓カレン' }]);
    const given = props({ name: '枫花恋', helpers: helpers({ portraitImg: () => '<img src="/avatar" alt="Kaede Karen">' }),
      entity: performer({ canonical_name: '枫花恋', aliases: ['楓カレン', '田中柠檬'],
      name_display: { choices: {
        'zh-CN': [{ value: '枫花恋', label: '枫花恋' }, { value: '田中柠檬', label: '田中柠檬' }],
        ja: [{ value: '枫花恋', label: '楓カレン' }, { value: '田中柠檬', label: '田中レモン' }],
      }, groups: { 'zh-CN': { shown: [], total: 0, groups: [] }, ja: { shown: [], total: 0, groups: [] } } },
    }) });
    const host = await open(given);
    expect(host.querySelector('h2')?.textContent).toBe('枫花恋');
    await act(async () => setNameLanguage('ja'));
    expect(host.querySelector('h2')?.textContent).toBe('楓カレン');
    expect(host.querySelector('[data-entity-portrait] img')?.getAttribute('alt')).toBe('楓カレン');
    expect(given.actions.chooseName).not.toHaveBeenCalled();
    await click(host.querySelector('[data-namepick-toggle]'));
    expect(document.querySelector('[data-namepick-name="枫花恋"]')?.textContent).toContain('楓カレン');
    await click(document.querySelector('[data-namepick-name="田中柠檬"]'));
    expect(given.actions.chooseName).toHaveBeenCalledWith('田中柠檬');
    expect(given.entity.canonical_name).toBe('枫花恋');
  });
  it('Labels and agencies show standalone company profiles without the source hover note', async () => {
    const host = await open(props({ kind: 'studio', name: 'Brand', entity: {
      id: 1, canonical_name: 'Brand', asset_count: 3,
      company_profile: {
        founded: { value: '2002-05', source_url: 'https://brand.example/company' },
        launched: { value: '2003', source_url: 'https://brand.example/company' },
        operator: { value: 'Brand Co., Ltd.', source_url: 'https://brand.example/company' },
      },
    } }));
    const facts = host.querySelector('[data-entity-facts]')!;
    expect(facts.textContent).toContain('Company founded2002-05Brand launched2003Operating companyBrand Co., Ltd.');
    expect(facts.textContent).toContain('Company founded2002-05Brand launched2003Operating companyBrand Co., Ltd.');
    expect(facts.textContent).toContain('Company founded2002-05Brand launched2003Operating companyBrand Co., Ltd.');
    expect(facts.querySelector('[title]')).toBeNull();
  });
  it('Real accounts and performers share the profile, alias, and mark rows', async () => {
    const host = await open(props({ kind: 'creator', name: 'RiaKurumi', entity: performer({
      canonical_name: 'RiaKurumi', identity_labels: ['Performers','Adult web creators'],
      profile: { height: 149 }, name_groups: { shown: ['Ria Kurumi', '百田くるみ'], total: 2 },
    }) }));
    expect(host.querySelector('[data-entity-facts]')?.textContent).toContain('T149');
    expect(host.querySelector('[data-alias-names]')?.textContent).toContain('百田くるみ');
    expect(host.querySelector('[data-meta-item][title="Video"] use')?.getAttribute('href')).toBe(undefined);
  });
  it('Label video count and aliases each carry an icon; profiles leave person fields empty', async () => {
    const host = await open(props({ kind: 'studio', name: 'MOODYZ', entity: performer({
      canonical_name: 'MOODYZ', display_aliases: ['ムーディーズ'], agency: undefined,
    }) }));
    expect(host.querySelector('[data-meta-item][title="Video"] use')?.getAttribute('href')).toBe(undefined);
    expect(host.querySelector('[data-company-names] use')?.getAttribute('href')).toBe('#i-id-card');
    expect(host.querySelector('[data-company-names]')?.textContent).toBe('ムーディーズ');
    expect(host.querySelector('[data-entity-facts]')).toBeNull();
  });
  it('The iconed category sits leftmost on the identity row, and details keep the cross-role identity entry', async () => {
    const given = props({ entity: performer({
      identity_labels: ['Performers','Western'],
      related_identities: [{ id: 2, kind: 'creator', canonical_name: 'Their own account', relation: 'operates_account' }],
    }) });
    const host = await open(given);
    const classification = host.querySelector('[data-identity-classification]')!;
    expect(classification.textContent).toBe('Performers · Western');
    expect(classification.querySelector('use')?.getAttribute('href')).toBe('#i-user-round');
    expect(classification.hasAttribute('title')).toBe(false);
    expect(host.querySelector('[data-entity-alias]')?.firstElementChild).toBe(classification);
    await click(host.querySelector('[data-entity-identity] button.underline'));
    expect(given.actions.openEntity).toHaveBeenCalledWith('creator', 'Their own account');
  });
  it('The line under the name: readings first, the rest folded into "+N"; when there is nothing, the row does not render', () => {
    expect(nameLine({ reading: 'あおい', shown: ['Tsukasa Aoi', 'Tsukasa Aoi'], total: 5 }))
      .toEqual({ names: ['あおい', 'Tsukasa Aoi', 'Tsukasa Aoi'], rest: 3, total: 5 });
    expect(nameLine({ shown: [], total: 0 })).toBeNull();
    expect(nameLine(null)).toBeNull();
  });

  it('Tags list the first four; with only one extra it lists it directly', () => {
    expect(shownTags(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c', 'd', 'e'], rest: 0 });
    expect(shownTags(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['a', 'b', 'c', 'd'], rest: 2 });
  });

  it('The profile table renders only the rows it has; still-active ones read "present", and the debut work truncates separately', () => {
    const rows = factRows({
      birth_date: '1990-08-14', age: 36, height: 163, bust: 88, cup: 'E',
      debut_date: '2012-03-01', debut_title: 'A very long debut title', active: { from: '2012', ongoing: true }, tags: ['Big breasts'],
    });
    expect(rows.map((row) => row.label)).toEqual(['Birthday', 'Figure', 'Debut', 'Career', 'Tags']);
    // One glyph means one thing: the tags item and the tags page share the same glyph.
    expect(rows.map((row) => row.glyph)).toEqual(['cake', 'ruler', 'flag', 'calendar-range', 'tags']);
    expect(rows[1]?.parts.map((part) => part.text)).toEqual(['T163 · B88', '· E cup']);
    expect(rows[2]?.clip).toBe('A very long debut title');
    expect(rows[3]?.parts[0]?.text).toBe('2012 – present');
    expect(factRows({ cup: 'C' })[0]?.parts).toEqual([{ text: 'C cup', tone: 'sub' }]);
    expect(factRows(null)).toEqual([]);
  });

  it('External links: external entries come first; on the performer page even the official site is an icon, the one linking back to her agency reads "Official profile", and dead and private sources are not clickable', () => {
    const links = heroLinks(performer({
      entry_links: [
        { site: 'minnano', label: 'minnano-av', slot: 'pill', mark: 'minnano', url: 'https://www.minnano-av.com/x' },
        { site: 'javdb', label: 'JavDB', slot: 'mark', mark: 'javdb', url: 'https://javdb.com/actors/x' },
      ],
      links: [
        { link_id: 3, link_kind: 'official', clickable: true, label: 'New Actor eXperience', url: 'https://www.nax.co.jp/talent/aoi' },
        { link_id: 4, link_kind: 'social', clickable: true, label: 'X', url: 'https://x.com/aoi' },
        { link_id: 5, gone: true, retired_year: 2024, label: 'Old blog', url: 'https://old.example' },
        { link_id: 6, clickable: false, label: 'Private records' },
      ],
    }), 'performer');
    expect(links).toEqual([
      { type: 'icon', url: 'https://www.minnano-av.com/x', title: 'minnano-av', mark: { brand: 'minnano' } },
      { type: 'icon', url: 'https://www.nax.co.jp/talent/aoi', title: 'New Actor eXperience official profile', mark: { site: '/link-mark?id=3' } },
      { type: 'icon', url: 'https://x.com/aoi', title: 'X', mark: { brand: 'brand-x' } },
      { type: 'gone', title: 'Legacy blog · Retired in 2024' },
      { type: 'private', label: 'Private records' },
    ]);
  });

  it('With a birthday present but no age delivered, only the birthday shows and "undefined years old" is never composed', () => {
    const [birth] = factRows({ birth_date: '1990-08-14' });
    expect(birth?.parts.map((part) => part.text)).toEqual(['1990-08-14']);
  });

  it('Two or more hidden sources merge into one entry at the end with each name kept in the title; a single one stays as before', () => {
    const links = heroLinks(performer({ links: [
      { link_id: 1, clickable: false, label: 'Private records' },
      { link_id: 2, link_kind: 'social', clickable: true, label: 'X', url: 'https://x.com/aoi' },
      { link_id: 3, clickable: false, label: 'Forum post' },
      { link_id: 4, clickable: false, label: 'Group chat screenshots' },
    ] }), 'performer');
    expect(links.map((link) => link.type)).toEqual(['icon', 'private']);
    expect(links[1]).toEqual({ type: 'private', label: '3 private sources', sources: ['Private records', 'Forum post', 'Group chat screenshots'] });
    expect(heroLinks(performer({ links: [{ link_id: 1, clickable: false, label: 'Private records' }] }), 'performer'))
      .toEqual([{ type: 'private', label: 'Private records' }]);
  });

  it('Company pages keep official-site names, with self-referencing ones reading "Official site"', () => {
    const [site] = heroLinks({
      id: 1, canonical_name: 'S1 NO.1 STYLE', asset_count: 1,
      links: [{ link_id: 9, link_kind: 'official', clickable: true, label: 'S1', url: 'https://www.s1s1s1.com/' }],
    }, 'studio');
    expect(site).toEqual({ type: 'url', url: 'https://www.s1s1s1.com/', title: 'S1', text: 'Official site', mark: { site: '/link-mark?id=9' } });
  });

  it('Without a language projection, existing aliases and original values are kept; the unified name sorts first with duplicates and blanks removed', () => {
    expect(nameChoices({ id: 1, canonical_name: '葵つかさ', asset_count: 0, aliases: ['Tsukasa Aoi', 'Tsukasa Aoi', 'Tsukasa Aoi', ''] }))
      .toEqual(['葵つかさ', 'Tsukasa Aoi', 'Tsukasa Aoi'].map(value => ({ value, label: value })));
  });
});

describe('What paints', () => {
  it('The company page name line shows the display alias, not every alias in the identity contract; the agency page counts people, draws no co-performers, and adds no category names', async () => {
    const studio = await open(props({ kind: 'studio', name: 'S1', entity: {
      id: 3, canonical_name: 'S1', asset_count: 9, aliases: ['Legacy search notation'], display_aliases: ['エスワン'],
    } }));
    const line = studio.querySelector('[data-entity-alias]')?.textContent ?? '';
    expect(line).toContain('エスワン');
    expect(line).not.toContain('Legacy search notation');
    const agency = await open(props({ kind: 'agency', name: 'NAX', entity: {
      id: 4, canonical_name: 'NAX', asset_count: 30, member_count: 12, related_performers: [{ id: 1, k: '三上悠亜' }],
    } }));
    expect(agency.querySelector('[data-entity-alias]')?.textContent).toContain('12 artists');
    expect(agency.querySelector('[data-entity-foot]')).toBeNull();
    const performerLine = (await open(props())).querySelector('[data-entity-alias]')?.textContent ?? '';
    expect(performerLine).not.toContain('Agency');
  });

  it('Company aliases list the first three and fold the rest into "+N", one name per line in the popover', async () => {
    const names = Array.from({ length: 30 }, (_, at) => `Old label ${at + 1}`);
    const host = await open(props({ kind: 'studio', name: 'S1', entity: {
      id: 3, canonical_name: 'S1', asset_count: 9, display_aliases: names,
    } }));
    const inline = host.querySelectorAll('[data-company-names] [data-alias-names] > span');
    expect([...inline].map((one) => one.textContent)).toEqual(['旧レーベル1', '旧レーベル2', '旧レーベル3']);
    expect(host.querySelector('[data-hero-more="alias"]')?.textContent).toBe('+27');
    const pop = document.getElementById('entityAliasPop')!;
    expect(pop.querySelectorAll('[data-pop-name]')).toHaveLength(30);
  });

  it('Merged private sources show a count, with each name on its own line inside the title attribute', async () => {
    const host = await open(props({ entity: performer({ links: [
      { link_id: 1, clickable: false, label: 'Private records' },
      { link_id: 3, clickable: false, label: 'Forum post' },
    ] }) }));
    const chip = host.querySelector('[data-link="private"]');
    expect(chip?.textContent).toContain('2 hidden sources');
    expect(chip?.getAttribute('title')).toBe('Private records\nForum post');
  });

  it('Icon-only external links carry their name in title and the accessible name; site roundels come from this machine with no source-page address, falling back to a plain link when unavailable; the official site shows text', async () => {
    const host = await open(props({ entity: performer({ links: [
      { link_id: 3, link_kind: 'official', clickable: true, label: 'New Actor eXperience', url: 'https://www.nax.co.jp/talent/aoi' },
    ] }) }));
    const icon = host.querySelector('a[data-link="icon"]')!;
    expect(icon.getAttribute('aria-label')).toBe(icon.getAttribute('title'));
    expect(icon.querySelector('[data-link-label]')).toBeNull();
    const mark = icon.querySelector('[data-link-icon] img')!;
    expect([mark.getAttribute('src'), mark.getAttribute('referrerpolicy'), mark.getAttribute('data-drop')])
      .toEqual(['/link-mark?id=3', 'no-referrer', 'self']);
    const studio = await open(props({ kind: 'studio', name: 'S1', entity: {
      id: 3, canonical_name: 'S1 NO.1 STYLE', asset_count: 9,
      links: [{ link_id: 9, link_kind: 'official', clickable: true, label: 'S1', url: 'https://www.s1s1s1.com/' }],
    } }));
    expect(studio.querySelector('a[data-link="url"] [data-link-label]')?.textContent).toBe('Official site');
  });

  it('The watch row follows the address and index the server sends; MISSAV has no icon, so it sorts by text', async () => {
    const host = await open(props({ entity: performer({ entry_links: [
      { site: 'javdb', label: 'JavDB', slot: 'mark', mark: 'mark-javdb', url: 'https://javdb.com/actors/NPD3' },
      { site: 'missav', label: 'MISSAV', slot: 'mark', mark: '', ordinal: '2', url: 'https://missav.ws/actresses/x' },
    ] }) }));
    const marks = [...host.querySelectorAll('a[data-entry-mark]')];
    expect(marks.map((a) => a.getAttribute('href'))).toEqual(['https://javdb.com/actors/NPD3', 'https://missav.ws/actresses/x']);
    expect(marks[0]?.querySelector('use')?.getAttribute('href')).toBe('#i-mark-javdb');
    expect(marks[1]?.querySelector('[data-missav-mark]')?.textContent).toBe('MISSAV');
    expect(marks[1]?.querySelector('[data-entry-ordinal]')?.textContent).toBe('2');
  });

  it('People with only one name still get a name menu: one row for the unified name, with add alias as the last item', async () => {
    const host = await open(props({ entity: performer({ aliases: [] }) }));
    await click(host.querySelector('[data-namepick-toggle]'));
    expect([...document.querySelectorAll('[data-namepick-name]')].map((item) => item.getAttribute('data-namepick-name')))
      .toEqual(['葵つかさ']);
    expect(document.querySelector('[data-namepick-alias]')?.getAttribute('role')).toBe('menuitem');
  });

  it('The external-links and co-stars rows hand dragging and wheel handling to the shell', async () => {
    const help = helpers();
    const host = await open(props({ helpers: help, entity: performer({ links: [
      { link_id: 4, link_kind: 'social', clickable: true, label: 'X', url: 'https://x.com/aoi' },
    ] }) }));
    const wired = vi.mocked(help.wireScroller).mock.calls.map(([row]) => row);
    expect(wired).toContain(host.querySelector('[data-entity-links]'));
    expect(wired).toContain(host.querySelector('[data-related-people]'));
  });

  it('Co-performers show images only when a real image is installed, with the image version in the URL; otherwise just an initial', async () => {
    const host = await open(props({ entity: performer({ related_performers: [
      { id: 1, k: '三上悠亜', has_image: true, image_version: '1727800000' }, { id: 2, k: '河北彩花' },
    ] }) }));
    expect(host.querySelector('[data-related-performer="三上悠亜"] img')?.getAttribute('src'))
      .toBe('/entity-image?kind=performer&id=1&thumb=1&v=1727800000');
    expect(host.querySelector('[data-related-performer="河北彩花"] img')).toBeNull();
  });
});

describe('Clicking hands over to the shell', () => {
  it('Co-stars and agencies use in-site jumps, and agency links never full-page refresh', async () => {
    const acts = actions();
    const host = await open(props({ actions: acts }));
    await click(host.querySelector('[data-related-performer="Kawakita Saika"]'));
    expect(acts.openEntity).toHaveBeenLastCalledWith('performer', '河北彩花');
    const agency = host.querySelector<HTMLAnchorElement>('a[data-agency]');
    expect(agency?.getAttribute('href')).toBe('/agencies/New%20Actor%20eXperience');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { agency!.dispatchEvent(event) });
    expect(event.defaultPrevented).toBe(true);
    expect(acts.openEntity).toHaveBeenLastCalledWith('agency', 'New Actor eXperience');
  });

  it('Agencies without a matching entity show the name only, and studio pages carry the parent company\'s destination', async () => {
    const host = await open(props({ entity: performer({ agency: null, metadata: { agency: { name: 'Unnamed agency' } } }) }));
    expect(host.querySelector('a[data-agency]')).toBeNull();
    expect(host.querySelector('[data-entity-alias]')?.textContent).toContain('Unnamed agency');
    const studio = await open(props({
      kind: 'studio', name: 'MOODYZ', entity: { id: 2, canonical_name: 'MOODYZ', asset_count: 9, maker: { name: 'WILL' } },
    }));
    expect(studio.querySelector('a[data-studio-link="WILL"]')?.getAttribute('href')).toBe('/studios/WILL');
  });

  it('Name dropdown: picking another spelling asks the shell to change the canonical name, picking the current one does nothing, and the last entry adds an alias', async () => {
    const acts = actions();
    const host = await open(props({ actions: acts }));
    await click(host.querySelector('[data-namepick-toggle]'));
    await click(document.querySelector('[data-namepick-name="葵つかさ"]'));
    expect(acts.chooseName).not.toHaveBeenCalled();
    await click(host.querySelector('[data-namepick-toggle]'));
    await click(document.querySelector('[data-namepick-name="葵司"]'));
    expect(acts.chooseName).toHaveBeenCalledWith('Tsukasa Aoi');
    await click(host.querySelector('[data-namepick-toggle]'));
    await click(document.querySelector('[data-namepick-alias]'));
    expect(acts.addAlias).toHaveBeenCalledTimes(1);
  });
});

describe('Sources among follows', () => {
  const creator = (follow: EntityHeroData['follow']): EntityHeroData => ({
    id: 51, canonical_name: 'Auxtasy', asset_count: 0, follow,
  });
  const held = { key: 'name:auxtasy', name: 'Auxtasy', providers: ['Kemono', 'Patreon'], n: 37, links: [] };

  it('Creators with a bound source show the count of updates not yet added to library; opening one hands off to the shell to filter the follows page to that person', async () => {
    const acts = actions();
    const host = await open(props({ kind: 'creator', name: 'Auxtasy', actions: acts, entity: creator({
      key: 'entity:51', n: 12, providers: ['Kemono'], avatar: '', avatar_fallback: '', held: [] }) }));
    const link = host.querySelector<HTMLAnchorElement>('[data-entity-follow] a')!;
    expect(link.textContent).toBe('12 updates');
    await click(link);
    expect(acts.openFollowAuthor).toHaveBeenCalledWith('entity:51');
    expect(host.querySelector('[data-entity-held]')).toBeNull();
  });

  it('The same-name group asks without binding: only pressing "Same person" hands it to the shell, and the button waits in its busy state', async () => {
    let finish: () => void = () => {};
    const acts = actions({ confirmFollowAuthor: vi.fn(() => new Promise<void>((resolve) => { finish = resolve })) });
    const host = await open(props({ kind: 'creator', name: 'Auxtasy', actions: acts, entity: creator({
      key: '', n: 0, providers: [], avatar: '', avatar_fallback: '', held: [held] }) }));
    expect(host.querySelector('[data-entity-follow]')).toBeNull();
    const note = host.querySelector('[data-entity-held]')!;
    expect(note.textContent).toContain('Follows contain a same-named author AuxtasyKemono · Patreon · 37 updates. and Auxtasy the same person?Is the same person');
    expect(note.textContent).toContain('Kemono · Patreon · 37 updates');
    const button = note.querySelector('button')!;
    await click(button);
    expect(acts.confirmFollowAuthor).toHaveBeenCalledWith('name:auxtasy', 'Auxtasy');
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => { finish() });
    expect(button.getAttribute('aria-busy')).toBeNull();
  });
});

describe('Subscribe to new releases', () => {
  const toggle = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[data-entity-feed]')!;

  it('The toggle flips only after the write succeeds, sends a receipt with undo and waits for this fetch round; undo is another write', async () => {
    const acts = actions();
    const help = helpers();
    const host = await open(props({ actions: acts, helpers: help }));
    await click(toggle(host));
    await settle();
    expect(acts.follow).toHaveBeenCalledWith(true);
    expect(toggle(host).checked).toBe(true);
    expect(acts.refreshFeedAfterCheck).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(help.receipt).mock.calls[0]!;
    expect(message).toBe('Subscribed new releases');
    await act(async () => { await options?.undo?.() });
    expect(acts.follow).toHaveBeenLastCalledWith(false);
    expect(toggle(host).checked).toBe(false);
  });

  it('On write failure the switch stays put without a receipt', async () => {
    const acts = actions({ follow: vi.fn(async () => { throw new Error('502') }) });
    const help = helpers();
    const host = await open(props({ actions: acts, helpers: help }));
    await click(toggle(host));
    await settle();
    expect(toggle(host).checked).toBe(false);
    expect(help.receipt).not.toHaveBeenCalled();
    expect(acts.refreshFeedAfterCheck).not.toHaveBeenCalled();
  });
});

describe('The new release row', () => {
  const row = '<div class="feednewrow">'
    + '<div data-feed-id="11"><button data-feed-action="ignore">Not interested</button></div>'
    + '<div data-feed-id="12"><button data-feed-action="read">Watched</button></div></div>';

  it('Whole block hidden when there are none', async () => {
    const feedHost = document.createElement('section');
    document.body.append(feedHost);
    await open(props({ feedHost, feedNew: { items: [], html: '' } }));
    expect(feedHost.hidden).toBe(true);
    expect(feedHost.querySelector('[data-feed-id]')).toBeNull();
  });

  it('Ignored ones vanish on the spot, watched ones fade in place, and dismissing the whole block hides everything', async () => {
    const feedHost = document.createElement('section');
    feedHost.hidden = true;
    document.body.append(feedHost);
    const acts = actions();
    const help = helpers();
    await open(props({ feedHost, actions: acts, helpers: help, feedNew: { items: [{ id: 11 }, { id: 12 }], html: row } }));
    expect(feedHost.hidden).toBe(false);
    expect(help.wireFeedRow).toHaveBeenCalledWith(feedHost.querySelector('.feednewrow'));
    await click(feedHost.querySelector('[data-feed-action="read"]'));
    await settle();
    expect(acts.feedAction).toHaveBeenLastCalledWith(12, 'read');
    expect(feedHost.querySelector('[data-feed-id="12"]')?.classList.contains('isread')).toBe(true);
    await click(feedHost.querySelector('[data-feed-action="ignore"]'));
    await settle();
    expect(acts.feedAction).toHaveBeenLastCalledWith(11, 'ignore');
    expect(feedHost.querySelector('[data-feed-id="11"]')).toBeNull();
    expect(feedHost.hidden).toBe(false);
    feedHost.querySelector<HTMLElement>('[data-feed-id="12"] button')!.dataset.feedAction = 'ignore';
    await click(feedHost.querySelector('[data-feed-id="12"] button'));
    await settle();
    expect(feedHost.querySelector('[data-feed-id]')).toBeNull();
    expect(feedHost.hidden).toBe(true);
  });

  it('Want is a toggle: the same button flips between want and unwant, and the card neither shrinks nor fades', async () => {
    const feedHost = document.createElement('section');
    document.body.append(feedHost);
    const acts = actions();
    const html = '<div class="feednewrow"><div data-feed-id="13">'
      + '<button data-feed-action="want" aria-pressed="false" title="Want">Want</button></div></div>';
    await open(props({ feedHost, actions: acts, feedNew: { items: [{ id: 13 }], html } }));
    const key = () => feedHost.querySelector<HTMLElement>('[data-feed-id="13"] button')!;
    await click(key());
    await settle();
    expect(acts.feedAction).toHaveBeenLastCalledWith(13, 'want');
    expect([key().dataset.feedAction, key().getAttribute('aria-pressed'), key().title]).toEqual(['unwant', 'true', 'Remove from wants']);
    await click(key());
    await settle();
    expect(acts.feedAction).toHaveBeenLastCalledWith(13, 'unwant');
    expect([key().dataset.feedAction, key().getAttribute('aria-pressed'), key().title]).toEqual(['want', 'false', 'Want']);
    expect(feedHost.querySelector('[data-feed-id="13"]')?.classList.contains('isread')).toBe(false);
    expect(feedHost.hidden).toBe(false);
  });
});

describe('The "+N" popover', () => {
  /* happy-dom has no native popover: top-layer open state is recorded in an attribute, which `:popover-open` reads. */
  beforeEach(() => {
    const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
      return selector === ':popover-open' ? this.hasAttribute('data-test-popover-open') : matches.call(this, selector);
    });
    proto.showPopover = function (this: HTMLElement) { this.setAttribute('data-test-popover-open', '') };
    proto.hidePopover = function (this: HTMLElement) { this.removeAttribute('data-test-popover-open') };
  });
  afterEach(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete proto.showPopover;
    delete proto.hidePopover;
  });

  it('Click to pin, click again to collapse; Escape also collapses', async () => {
    const host = await open(props({ entity: performer({
      name_groups: { shown: ['Tsukasa Aoi'], total: 4, groups: [{ label: 'Old name', names: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }] },
    }) }));
    const more = host.querySelector<HTMLButtonElement>('[data-hero-more="alias"]')!;
    expect(more.textContent).toBe('+3');
    expect(more.getAttribute('aria-label')).toBe('3 more aliases');
    const pop = document.getElementById('entityAliasPop')!;
    expect(pop.querySelector('[data-hero-pop-head]')?.textContent).toBe('4 aliases');
    await click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    await click(more);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    await click(more);
    await act(async () => { more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });
});
