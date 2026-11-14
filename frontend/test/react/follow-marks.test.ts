/* Attribution, avatar, source icons, and a few wordmarks shared by follow cards and details (`follow-marks.ts`).
 *
 * What it builds is an HTML string, compared here as a string: cards and details drop it in directly, and the class names and `data-drop` family attributes are
 * the contract the legacy styles and image fallback hook into. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FollowContext, FollowGroup, FollowItem, FollowSource } from '../../src/react/follow-feed/follow-feed';
import {
  FOLLOW_UNTITLED, authorAvatarHtml, followAuthorEntity, followAuthorName, followBadges, followCompactWhen, followIdentity, followMediaIssue,
  followTitle, followTitleMarks, followWhen, learnFollowDims, sourceIcon, sourceMark,
} from '../../src/react/follow-feed/follow-marks';

const item = (id: number, extra: Partial<FollowItem> = {}): FollowItem =>
  ({ id, title: `Update ${id}`, status: 'new', provider: 'kemono', provider_label: 'Kemono', ...extra });
const group = (primary: FollowItem, extra: Partial<FollowGroup> = {}): FollowGroup =>
  ({ primary, variants: [], duplicates: [], ...extra });
const source = (id: number, extra: Partial<FollowSource> = {}): FollowSource =>
  ({ id, provider: 'kemono', provider_label: 'Kemono', ...extra });
const context = (extra: Partial<FollowContext> = {}): FollowContext =>
  ({ sources: [], aliases: [], credentials: new Set(), ...extra });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() });

describe('Source icon', () => {
  it('Archived sites show the local mark and drop it when unavailable; unarchived sites are empty strings', () => {
    expect(sourceIcon('kemono')).toBe(
      '<img data-follow-site-icon="" src="/source-icon?provider=kemono" alt="" loading="lazy" data-drop="self">');
    expect(sourceIcon('f95zone', 'F95 <zone>')).toBe('<img data-follow-site-icon="" src="/source-icon?provider=f95zone" '
      + 'alt="F95 &lt;zone&gt;" title="F95 &lt;zone&gt;" loading="lazy" data-drop="self">');
    expect(sourceIcon('nowhere', 'Some site')).toBe('');
  });

  it('Site badges are a single icon cell: when the image is unavailable a fallback script swaps in the site initial, and unregistered sites render the initial directly', () => {
    expect(sourceMark('gofile', 'Gofile')).toBe('<img data-follow-site-icon="" src="/source-icon?provider=gofile" alt="" '
      + 'loading="lazy" data-drop="initial" data-initial="G" data-drop-class="follow-site-initial">');
    expect(sourceMark('itchio', 'itch.io')).toBe('<span class="follow-site-initial" aria-hidden="true">I</span>');
    expect(sourceMark('itchio')).toBe('<span class="follow-site-initial" aria-hidden="true">I</span>');
  });
});

describe('Creators', () => {
  it('Author navigation accepts only unique entities and follows the actual uploader', () => {
    const bound = source(1, { entity_id: 90, entity_name: 'Kou', author_key: 'entity:90', author_name: 'Kou' });
    expect(followAuthorEntity([bound, source(2)])).toBe('Kou');
    expect(followAuthorEntity([source(2)])).toBe('');
    expect(followAuthorEntity([bound, source(3, { entity_id: 91, entity_name: 'Mira' })])).toBe('');
    expect(followIdentity(item(1), [bound], context()).entityName).toBe('Kou');
    const poster = source(4, { entity_id: 92, entity_name: 'Poster', ref: 'poster', author_key: 'entity:92' });
    expect(followIdentity(item(2, { credit: { poster: 'poster' } }), [bound],
      context({ sources: [bound, poster] })).entityName).toBe('Poster');
    expect(followIdentity(item(3, { credit: { poster: 'stranger' } }), [bound],
      context({ sources: [bound] })).entityName).toBe('');
  });
  it('Names are taken in order: the unified name after merging aliases, then the official source spelling', () => {
    const sources = [source(1, { author_key: 'name:lazy', label: 'lazyprocrastinator · fanbox' }),
      source(2, { author_key: 'name:lazy', label: 'LazyProcrastinator Collection', official_avatar_url: '/a.png' })];
    expect(followAuthorName(sources, context())).toBe('LazyProcrastinator');
    expect(followAuthorName(sources, context({
      aliases: [{ canonical_key: 'lazy', canonical_name: 'Lazy P', aliases: [] }] }))).toBe('Lazy P');
    /* F95's label is the whole thread title: which part is a person's name is decided server-side (`author_name`); the page does not parse it itself. */
    expect(followAuthorName([source(3, { label: 'Strauzek Collection [2026-09-04] [Mr_Strauz]',
      author_name: 'Mr_Strauz' })], context())).toBe('Mr_Strauz');
  });

  it('Avatars prefer official sources with archive-site fallback; the fallback chain and initial are written to attributes; with neither, the initial cell shows', () => {
    const both = [source(1, { avatar_url: '/mirror.png' }), source(2, { official_avatar_url: '/official.png' })];
    expect(authorAvatarHtml(both, 'kou')).toBe('<img class="favatar" src="/official.png" alt="" loading="lazy" '
      + 'referrerpolicy="no-referrer" data-drop="initial" data-fallbacks="/mirror.png" data-initial="K" '
      + 'data-drop-class="favatar none">');
    expect(authorAvatarHtml([source(1, { avatar_url: '/mirror.png' })], 'Hatsune')).not.toContain('data-fallbacks');
    expect(authorAvatarHtml([], 'Hatsune')).toBe('<span class="favatar none" title="No avatar available">H</span>');
  });

  it('When a booru post has a recognized publisher, credit the publisher and the followed party falls back to "credit contains"; if the publisher was never followed, only the initial shows', () => {
    const followed = [source(1, { author_key: 'name:kou', author_name: 'kou', avatar_url: '/kou.png' })];
    const poster = source(2, { ref: 'Poster_One', author_key: 'name:poster', author_name: 'Poster One' });
    const credited = item(3, { credit: { poster: 'poster-one', credited: 'kou' } });
    const known = followIdentity(credited, followed, context({ sources: [...followed, poster] }));
    expect(known).toEqual({ author: 'Poster One', avatar: '<span class="favatar none" title="No avatar available">P</span>',
        credited: 'kou', entityName: '' });
    const stranger = followIdentity(item(4, { credit: { poster: 'someone' } }), followed, context({ sources: followed }));
    expect(stranger.author).toBe('someone');
    expect(stranger.avatar).toBe('<span class="favatar none" title="No avatar available">S</span>');
    const plain = followIdentity(item(5), followed, context());
    expect(plain.author).toBe('kou');
    expect(plain.avatar).toContain('src="/kou.png"');
    expect(followIdentity(item(6, { author: 'Post author' }), [], context()).author).toBe('Post author');
    expect(followIdentity(item(7), [], context()).author).toBe('Creator unfetched');
  });
});

describe('Text before and after the title', () => {
  it('WIP speaks for this entry, "includes" when a group member has WIP; edition and audio edition get one badge each', () => {
    expect(followTitleMarks(group(item(1, { variant_kind: 'wip' })))).toBe(
      '<small class="javedition" data-follow-edition="wip">WIP</small>');
    const shown = item(2, { audio: 'voiced' });
    expect(followTitleMarks(group(item(1, { version: 'v<2>' }), { has_wip: true }), shown)).toBe(
      '<small class="javedition" data-follow-edition="has-wip">Has WIP</small>'
      + '<small class="javedition" data-follow-edition="version">v&lt;2&gt;</small>'
      + '<small class="javedition" data-follow-edition="voiced">Dubbed version</small>');
    expect(followTitleMarks(group(item(1)), item(3, { audio: 'silent' })))
      .toContain('data-follow-edition="silent">Silent version');
    expect(followTitleMarks(group(item(1)))).toBe('');
  });

  it('The also-on row relative to the card face: other sites list, and unmarked ones write the site name', () => {
    const primary = item(1, { provider: 'patreon', provider_label: 'Patreon' });
    const mirror = item(2);
    const forum = item(3, { provider: 'somewhere', provider_label: 'A forum' });
    const badges = followBadges(group(primary, { duplicates: [mirror, forum] }), primary);
    expect(badges).toBe('<span data-follow-seealso="" title="See also Kemono, A forum"><span data-follow-seealso-label="">See also</span> '
      + '<img data-follow-site-icon="" src="/source-icon?provider=kemono" alt="Kemono" title="Kemono" loading="lazy" data-drop="self">'
      + '<span>A forum</span></span>');
    expect(followBadges(group(primary, { duplicates: [mirror] }), mirror)).toContain('See also Patreon');
    expect(followBadges(group(primary))).toBe('');
  });

  it('When media is not obtained the reason is stated; without an F95 session it distinguishes "partial" from "all"', () => {
    expect(followMediaIssue(item(1, { media_error: '404' }), context())).toBe('Media not fetched: 404');
    const needs = item(2, { provider: 'f95zone', media_needs_credential: true });
    expect(followMediaIssue(needs, context())).toBe('Media not fetched: an F95 sign-in session is needed to resolve');
    expect(followMediaIssue({ ...needs, playable: true }, context())).toBe('Some media not fetched: F95 login session required for parsing');
    expect(followMediaIssue(needs, context({ credentials: new Set(['f95zone']) }))).toBe('');
  });

  it('Times render in the local timezone; when none is given it says so plainly without an approx. mark', () => {
    expect(followWhen(item(1))).toBe('Time not fetched');
    const when = followWhen(item(2, { published_at: '2026-09-04T00:00:00Z' }));
    expect(when).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(when).not.toContain('~');
    /* The database stores UTC: strings without a timezone marker are read as UTC too, not as local time, otherwise every time is 8 hours early for someone in UTC+8. */
    expect(followWhen(item(3, { published_at: '2026-09-04T00:00:00' }))).toBe(when);
  });

  it('When the source gives only an approximate time, show it to the day with "approx." and do not show the converted hours and minutes', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    const old = item(1, { published_at: '2009-03-01T12:00:00Z', published_precision: 'approximate' });
    expect(followWhen(old, now)).toBe('~2009-03-01');
    expect(followCompactWhen(old, now)).toBe('~2009-03-01');
    expect(followWhen({ ...old, published_precision: 'exact' }, now)).toMatch(/^2009-03-01 \d\d:\d\d$/);
  });

  it('Times more than a day ahead render as-is with an "ahead of now" marker; clock skew within a day is not marked', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    const future = item(1, { published_at: '2031-01-01T12:00:00Z' });
    expect(followWhen(future, now)).toMatch(/^2031-01-01 \d\d:\d\d · ahead of now$/);
    expect(followCompactWhen(future, now)).toBe('2031-01-01 · ahead of now');
    expect(followWhen(item(2, { published_at: '2026-10-08T20:00:00Z' }), now)).not.toContain('Ahead of now');
  });

  it('Short form in lists: this year drops the year, past years keep it', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(followCompactWhen(item(1, { published_at: '2026-09-04T12:00:00Z' }), now)).toBe('09-04');
    expect(followCompactWhen(item(2, { published_at: '2024-09-04T12:00:00Z' }), now)).toBe('2024-09-04');
    expect(followCompactWhen(item(3), now)).toBe('Time not fetched');
  });

  it('Empty or whitespace-only titles all get the same "Untitled content" text', () => {
    expect(followTitle(item(1, { title: '' }))).toBe(FOLLOW_UNTITLED);
    expect(followTitle(item(2, { title: '   ' }))).toBe('Untitled content');
    expect(followTitle({})).toBe('Untitled content');
    expect(followTitle(item(3, { title: ' Feature ' }))).toBe('Feature');
  });
});

describe('Write image dimensions back', () => {
  it('The same image reports once per session, batches up every 800ms before sending, and failures stay silent', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('{}', { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    learnFollowDims(9001, null, 300, 500);
    learnFollowDims(9001, null, 300, 500);
    learnFollowDims(9002, 1, 640, 480);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/follow/image-dims');
    expect(JSON.parse(String(init.body))).toEqual({ entries: [
      { item: 9001, width: 300, height: 500 }, { item: 9002, width: 640, height: 480, media: 1 }] });
    learnFollowDims(9001, null, 300, 500);
    await vi.advanceTimersByTimeAsync(800);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
