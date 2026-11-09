/* The entity profile page's top profile card and new-releases row (ADR-0031 step 10c): data shapes and pure functions.
 *
 * `/api/entity` is fetched by the shell and passed in as props together with this page's new releases; writes are all made
 * into `actions` by the shell and passed in, and the island never assembles requests itself. This only arranges the
 * server-delivered profile into the segments the page renders: the line under the name, the data table at right, external
 * links, external entries and co-performers. */
import { brandIcon, foldName, linkMarkUrl, officialLinkText } from '@peach/legacy/core';

import type { FeedNew } from '../feed-new/feed-new';
import type { PendingWorkItem } from '../components/pending-work';

/** An external link, shaped like `/api/entity`'s `links[]`. */
export interface HeroLink {
  link_id?: number | null;
  link_kind?: string;
  clickable?: boolean;
  gone?: boolean;
  retired_year?: number | string | null;
  label?: string;
  hostname?: string;
  url?: string;
}

/** External entries (`peach.entry_links`): `pill` joins the leftmost of the external link row, and `mark` prints the site badge on its own line. */
export interface HeroEntryLink {
  site: string;
  label: string;
  ordinal?: string;
  slot: string;
  mark?: string;
  url: string;
}

export interface HeroCostar {
  id: number;
  k: string;
  n?: number;
  rep?: number | null;
  has_image?: boolean;
  image_version?: string;
  has_avatar?: boolean;
  avatar_stand_in?: boolean;
  avatar_focus?: unknown;
}

/** The profile table on the right of the performer page header (ADR-0069). The server sends only fields with values. */
export interface HeroProfile {
  birth_date?: string;
  age?: number;
  height?: number;
  bust?: number;
  waist?: number;
  hip?: number;
  cup?: string;
  debut_date?: string;
  debut_title?: string;
  active?: { from?: string; to?: string; ongoing?: boolean };
  tags?: string[];
}

export interface HeroNameGroups {
  reading?: string;
  shown?: string[];
  total?: number;
  groups?: { label?: string; names: { name: string; reading?: string }[] }[];
}

/** Follow sources under a creator (ADR-0096). `key` is the follows page's author key, an empty string when no source is bound; `held` is
 *  the groups in follows with the same name, waiting for the user to confirm they are the same person. */
export interface HeroFollow {
  key: string;
  n: number;
  providers: string[];
  avatar: string;
  avatar_fallback: string;
  held: { key: string; name: string; providers: string[]; n: number; links: string[] }[];
}

/** The fields the profile card reads from `/api/entity`. */
export interface EntityHeroData {
  favorite?: boolean;
  /** 这位名下还在排队或正在跑的资料补全。 */
  pending_work?: PendingWorkItem[];
  company_profile?: Partial<Record<'legal_name' | 'founded' | 'launched' | 'country' | 'location' | 'operator' | 'parent' | 'group' | 'distributor', { value: string; source_url: string; evidence?: string }>>;
  identity_labels?: string[];
  external_refs?: { provider: string; external_kind: string; external_id: string }[];
  related_identities?: { id: number; kind: string; canonical_name: string; relation: string }[];
  id: number;
  canonical_name: string;
  aliases?: string[];
  display_aliases?: string[];
  name_display?: {
    choices: Record<'zh-CN' | 'ja', { value: string; label: string }[]>;
    groups: Record<'zh-CN' | 'ja', HeroNameGroups>;
  };
  user_aliases?: string[];
  asset_count: number;
  member_count?: number;
  labels?: unknown[];
  maker?: { name: string; id?: number } | null;
  agency?: { canonical_name: string; id?: number } | null;
  metadata?: { agency?: { name?: string } | null } | null;
  links?: HeroLink[];
  entry_links?: HeroEntryLink[];
  related_performers?: HeroCostar[];
  feed?: { following: boolean } | null;
  follow?: HeroFollow | null;
  profile?: HeroProfile | null;
  name_groups?: HeroNameGroups | null;
}

/** Writes and in-site navigation both belong to the shell. */
export interface EntityHeroActions {
  /** On-site navigation goes through the legacy router's single entry. */
  openEntity(kind: string, name: string): void;
  /** Renaming this person to the unified name: confirmation, write-back, receipt, and re-entering this page all live in the shell. */
  chooseName(name: string): void;
  /** Open the "Add alias" popover. */
  addAlias(): void;
  /** Subscribe to or unsubscribe from new releases. On failure the shell has already sent a failure receipt, and the thrown error arrives here. */
  follow(on: boolean): Promise<void>;
  /** Just subscribed: wait for the server's fetch round to finish, then refetch the new releases row once. */
  refreshFeedAfterCheck(): void;
  /** The new release card's "Not interested" and "Mark as watched". */
  feedAction(id: number, action: string): Promise<void>;
  /** After the avatar swap: re-enter this page; the avatar index has already been replaced on the server. */
  avatarPicked(): void;
  /** Watch updates for this person's sources: their own switches to this page's online view, another author's key goes to the follows page filtered to that one. */
  openFollowAuthor(key: string): void;
  /** 'Same person': bind the group of same-named follow authors under this one. On failure the shell has already sent a failure receipt. */
  confirmFollowAuthor(key: string, name: string): Promise<void>;
}

/** The HTML segments and wiring still assembled by the legacy layer. */
export interface EntityHeroHelpers {
  /** The big-slot image (`entityFaceImg`): an empty string when unavailable, with the initial letter underneath. */
  portraitImg(): string;
  /** The horizontal scroll row wires up drag and mouse wheel (`wireDrag`). */
  wireScroller(row: Element | null): void;
  /** The new releases row: drag and wheel, with auto scroll wired per settings. */
  wireFeedRow(row: Element | null): void;
  /** An action receipt (`actionReceipt`); with `undo` given it carries an undo button. */
  receipt(message: string, options?: { undo?: () => Promise<void> }): void;
}

export interface EntityHeroProps {
  kind: string;
  /** The name on the address bar: the initial-letter backdrop takes it, the same character as the skeleton. */
  name: string;
  entity: EntityHeroData;
  /** This page's new releases (the entries fetched by `feed-new/feed-new.ts` and the whole row HTML the shell assembles). */
  feedNew: FeedNew | null;
  feedError?: string;
  retryFeed?(): void;
  /** The `section.feednew[data-feed-new]` the shell leaves in `#index` for the new releases row. */
  feedHost: HTMLElement | null;
  /** Whether this page is in JAV context (`entityJavLayout`). */
  jav: boolean;
  actions: EntityHeroActions;
  helpers: EntityHeroHelpers;
}

export const FACT_TAGS_SHOWN = 4;

/** A company page (label, agency) fronts its own logo in a square frame; people get a round frame, with an avatar-change entry at the bottom right. */
export const isCompany = (kind: string) => kind === 'studio' || kind === 'agency';
export const isPeople = (kind: string) => kind === 'performer' || kind === 'creator';

export const entityFeedTip = (on: boolean) => on
  ? 'Subscribed to new releases, click to unsubscribe'
  : 'Subscribe to new releases';

/** The current language's selectable stage names, with the unified name kept as one option; the value still points at the registered name. */
export function nameChoices(entity: EntityHeroData, language: 'zh-CN' | 'ja' = 'zh-CN'): { value: string; label: string }[] {
  if (entity.name_display) return entity.name_display.choices[language];
  return [entity.canonical_name, ...(entity.aliases || [])]
    .filter((option, index, all) => option && all.indexOf(option) === index)
    .map(value => ({ value, label: value }));
}

/** Agency: links to the entity when one exists; with only `metadata.agency` it writes the name alone (that is the scraped raw text, no identity behind it yet). */
export function agencyOf(entity: EntityHeroData): { name: string; linked: boolean; id?: number } | null {
  if (entity.agency) return { name: entity.agency.canonical_name, linked: true, id: entity.agency.id };
  const name = entity.metadata?.agency?.name || '';
  return name ? { name, linked: false } : null;
}

/** The performer page's external links are always pure icons, with names only in title and screen-reader text. The link to her agency (NAX's
 *  label is `New Actor eXperience`) reads "<Agency> official profile": the icon cannot show it is her official archive page. */
export function performerLinkName(link: HeroLink, agency: string): string {
  const text = officialLinkText(link, 'performer'), home = foldName(agency);
  const own = home && [link.label, text].map(foldName).some((said) => said && (home.includes(said) || said.includes(home)));
  return own ? `${agency} official profile` : (text || link.label || '');
}

/** The roundel before a link: common social networks use the brand glyph from the sprite, the rest take the server-composed site roundel, and a globe shows when neither is available. */
export type LinkMark = { brand: string } | { site: string } | { globe: true };

export type LinkView =
  | { type: 'icon'; url: string; title: string; mark: LinkMark }
  | { type: 'gone'; title: string }
  | { type: 'private'; label: string; sources?: string[] }
  | { type: 'url'; url: string; title: string; text: string; mark: LinkMark };

const siteMark = (link: HeroLink): LinkMark => ({ site: linkMarkUrl(link) });

/** The external links row: the `pill`s from external entries first, then the database's links.
 *
 *  Social media collapses to pure icons; a company page's official site keeps its name; the performer page makes even the official site an icon, since the right side gains a profile table and the name column
 *  has no room for a row of labeled buttons. A retired performer's dead links stay in place, unclickable, and fetch no site icons. */
export function heroLinks(entity: EntityHeroData, kind: string): LinkView[] {
  const agency = agencyOf(entity)?.name || '';
  const pills: LinkView[] = (entity.entry_links || []).filter((x) => x.slot === 'pill')
    .map((x) => ({ type: 'icon', url: x.url, title: x.label, mark: { brand: x.mark || '' } }));
  const names = [entity.canonical_name, ...(entity.aliases || [])];
  const links = (entity.links || []).map((x): LinkView => {
    if (x.gone) {
      const why = x.retired_year ? `Retired in ${x.retired_year}` : 'Link expired';
      return { type: 'gone', title: `${performerLinkName(x, agency)} · ${why}` };
    }
    const url = x.url || '';
    if (!(x.clickable && /^https?:\/\//i.test(url))) return { type: 'private', label: x.label || x.hostname || 'Recorded' };
    if (isPeople(kind) && x.link_kind !== 'social') {
      return { type: 'icon', url, title: performerLinkName(x, agency), mark: siteMark(x) };
    }
    if (x.link_kind === 'social') {
      const brand = brandIcon(url);
      return { type: 'icon', url, title: x.label || '', mark: brand ? { brand } : siteMark(x) };
    }
    return { type: 'url', url, title: x.label || '', text: officialLinkText(x, kind, names), mark: siteMark(x) };
  });
  return [...pills, ...foldPrivate(links)];
}

/** Private sources are not clickable, just a record that such a place exists: two or more collapse into one "N private sources" entry at the end,
 *  with each place's name in the title. A private entry wedged between icons would take a whole row and cut a row of icon links into segments. */
function foldPrivate(links: LinkView[]): LinkView[] {
  const hidden = links.filter((link): link is Extract<LinkView, { type: 'private' }> => link.type === 'private');
  if (hidden.length < 2) return links;
  return [
    ...links.filter((link) => link.type !== 'private'),
    { type: 'private', label: `${hidden.length.toLocaleString()} hidden sources`, sources: hidden.map((link) => link.label) },
  ];
}

/** The watch row: the site's own horizontal logo. */
export const entryMarks = (entity: EntityHeroData) => (entity.entry_links || []).filter((x) => x.slot === 'mark');

export interface FactRow {
  glyph: string;
  label: string;
  /** Segments within the line: `num` for monospaced digits, `sub` for secondary text color. */
  parts: { text: string; tone: 'num' | 'sub' | 'plain' }[];
  /** Debut titles often run forty or fifty characters; truncate to one line and keep the full name in the title. */
  clip?: string | undefined;
  tags?: string[] | undefined;
}

/** Each company profile cell states one independent fact; cells without data are not shown. */
export function companyFactRows(profile: EntityHeroData['company_profile']): FactRow[] {
  const fields = [
    ['legal_name', 'Company name', 'briefcase'], ['founded', 'Company founded', 'calendar'],
    ['launched', 'Brand launched', 'flag'], ['country', 'Country/Region', 'globe'],
    ['location', 'Location', 'globe'], ['operator', 'Operating company', 'briefcase'], ['parent', 'Parent company', 'briefcase'],
    ['group', 'Parent group', 'briefcase'], ['distributor', 'Publisher', 'film'],
  ] as const;
  return fields.flatMap(([key, label, glyph]) => profile?.[key]?.value?.trim()
    ? [{ label, glyph, parts: [{ text: profile[key]!.value, tone: 'plain' as const }] }]
    : []);
}

/** The details table's five items: birthday, measurements, debut, career, tags. Render whichever exist. Still-active careers read "present". */
export function factRows(p: HeroProfile | null | undefined): FactRow[] {
  if (!p) return [];
  const rows: FactRow[] = [];
  // Age is computed server-side from the birthday and sent as a pair with it; when only the birthday arrives, the row shows just the birthday.
  if (p.birth_date) rows.push({ glyph: 'cake', label: 'Birthday', parts: [
    { text: p.birth_date, tone: 'num' },
    ...(Number.isFinite(p.age) ? [{ text: `· ${p.age} years old`, tone: 'sub' as const }] : [])] });
  const size = ([['T', p.height], ['B', p.bust], ['W', p.waist], ['H', p.hip]] as const)
    .filter(([, value]) => value).map(([letter, value]) => `${letter}${value}`).join(' · ');
  const cup = p.cup ? `${size ? '· ' : ''}${p.cup} cup` : '';
  if (size || cup) rows.push({ glyph: 'ruler', label: 'Figure', parts: [
    ...(size ? [{ text: size, tone: 'num' as const }] : []), ...(cup ? [{ text: cup, tone: 'sub' as const }] : [])] });
  if (p.debut_date || p.debut_title) rows.push({ glyph: 'flag', label: 'Debut', clip: p.debut_title || undefined, parts: [
    ...(p.debut_date ? [{ text: p.debut_date, tone: 'num' as const }] : []),
    ...(p.debut_title ? [{ text: p.debut_title, tone: 'sub' as const }] : [])] });
  const active = p.active || {};
  if (active.from) rows.push({ glyph: 'calendar-range', label: 'Career', parts: [{
    text: `${active.from}${active.ongoing ? ' – present' : active.to ? ` – ${active.to}` : ''}`, tone: 'num' }] });
  if ((p.tags || []).length) rows.push({ glyph: 'tags', label: 'Tags', parts: [], tags: p.tags });
  return rows;
}

/** The line under the company page name lists a few aliases first, folding the rest into '+N'. */
export const COMPANY_ALIASES_SHOWN = 3;

/** The tags cell lists only the first few, folding the rest into "+N"; when only one more exists it is listed directly, since "+1" would be as wide as that tag.
 *  Company aliases follow the same rule via `COMPANY_ALIASES_SHOWN`. */
export function shownTags(tags: string[], limit = FACT_TAGS_SHOWN): { shown: string[]; rest: number } {
  const cut = tags.length > limit + 1 ? limit : tags.length;
  return { shown: tags.slice(0, cut), rest: tags.length - cut };
}

/** The alias line under the name: readings come first, then the first few aliases, with the rest folded into '+N'. */
export function nameLine(groups: HeroNameGroups | null | undefined): { names: string[]; rest: number; total: number } | null {
  if (!groups) return null;
  const shown = groups.shown || [];
  const names = [groups.reading || '', ...shown].filter(Boolean);
  const rest = (groups.total || 0) - shown.length;
  return names.length || rest > 0 ? { names, rest, total: groups.total || 0 } : null;
}
