/* The card, avatar and cover HTML sections: which image to take, which to fall back to, and where the framing data attaches. */
import { describe, expect, it, vi } from 'vitest';

import {
  avatarInner, cardArtwork, cardIdentity, coverImage, coverUrl, detailPosterUrl, entityAvatar, entityFaceImg,
  faceBoxAttrs, faceOrigin, facePos, javArtwork, logoUrl, mixFace, mixLabel, performerLabel, queueAvatarHtml,
  queueThumbHtml,
} from '../../src/card-art/markup';
import { rememberRepresentatives, representativeOf } from '../../src/card-art/representatives';
import { advanceImageFallback } from '../../src/card-art/image-fallback';

const parse = (html: string): HTMLImageElement | null => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box.querySelector('img');
};

const FOCUS = { axis: 'y', pct: 12, box: { cx: 0.44, cy: 0.22, faceW: 67, imgW: 640, imgH: 960 } };

describe('Western official covers', () => {
  it('Videos without a code use the asset cover key in cards, queues, and details', () => {
    const item = { id: 12, has_cover: true, cover_key: 'ASSET-ID-12', cover_version: 'abc' };
    const source = '/cover?code=ASSET-ID-12&thumb=2&v=abc';
    expect(parse(cardArtwork(item, 'big', false, 'cover').html)?.getAttribute('src')).toBe(source);
    expect(parse(queueThumbHtml(item, 'cover'))?.getAttribute('src')).toBe(source);
    expect(detailPosterUrl(item, 'cover')).toBe('/cover?code=ASSET-ID-12&v=abc');
  });
});

it('Creator card official avatars use the local proxy with archive fallback, preferring entity images', () => {
  const ref = { id: 7, has_image: false, source_avatar_url: '/follow-avatar?service=fanbox&id=123',
    source_avatar_fallbacks: ['/follow-avatar?provider=kemono&ref=fanbox%2F123'] };
  const image = parse(avatarInner('Creators', ref, null, 'creator'))!;
  expect(image.getAttribute('src')).toBe(ref.source_avatar_url);
  expect(image.dataset.fallbacks).toBe(ref.source_avatar_fallbacks[0]);
  expect(image.dataset.drop).toBe('self');
  expect(parse(avatarInner('Creators', { ...ref, has_image: true }, null, 'creator'))?.getAttribute('src'))
    .toBe('/entity-image?kind=creator&id=7&thumb=1');
});

describe('entityFaceImg: entity image first, falling back to the signature work avatar when unavailable', () => {
  it('When neither can be fetched not a single <img> renders', () => {
    expect(entityFaceImg({ id: 3, hasImage: false })).toBe('');
    expect(entityFaceImg({})).toBe('');
  });

  it('Without the server saying an entity image exists, /entity-image is not composed and only the representative avatar renders', () => {
    const img = parse(entityFaceImg({ id: 3, hasImage: false, rep: 41 }))!;
    expect(img.getAttribute('src')).toBe('/avatar?id=41');
    expect(img.dataset.fallbacks).toBeUndefined();
    expect(img.dataset.drop).toBe('self');
  });

  it('Entity images lead and representative avatars join the fallback chain; the final link removes the image', () => {
    const img = parse(entityFaceImg({ kind: 'creator', id: 3, hasImage: true, rep: 41 }))!;
    expect(img.getAttribute('src')).toBe('/entity-image?kind=creator&id=3&thumb=1');
    expect(img.dataset.fallbacks).toBe('/avatar?id=41');
    expect(img.dataset.drop).toBe('self');
  });

  it('Derived assets are the default; the profile page lead passes false for the original', () => {
    expect(parse(entityFaceImg({ id: 3, hasImage: true }))!.getAttribute('src'))
      .toBe('/entity-image?kind=performer&id=3&thumb=1');
    expect(parse(entityFaceImg({ id: 3, hasImage: true, thumb: false }))!.getAttribute('src'))
      .toBe('/entity-image?kind=performer&id=3');
  });

  it('Entity URLs with swapped images carry a version; URLs without a version stay unchanged', () => {
    const img = parse(entityFaceImg({ id: 3, hasImage: true, version: 'a b', rep: 41, thumb: true }))!;
    expect(img.getAttribute('src')).toBe('/entity-image?kind=performer&id=3&thumb=1&v=a%20b');
    // The featured avatar is a separate image and does not follow the entity image's version.
    expect(img.dataset.fallbacks).toBe('/avatar?id=41');
    expect(parse(entityFaceImg({ id: 3, hasImage: true, version: '' }))!.getAttribute('src'))
      .toBe('/entity-image?kind=performer&id=3&thumb=1');
    // Without physical artwork, the edition does not show up anywhere.
    expect(parse(entityFaceImg({ id: 3, hasImage: false, version: '7', rep: 41 }))!.getAttribute('src'))
      .toBe('/avatar?id=41');
  });

  it('Lazy-loaded with async decoding; the lead slot can demand an immediate fetch', () => {
    const lazy = parse(entityFaceImg({ id: 3, hasImage: true }))!;
    expect(lazy.getAttribute('loading')).toBe('lazy');
    expect(lazy.getAttribute('decoding')).toBe('async');
    expect(lazy.width).toBeGreaterThan(0);
    expect(lazy.height).toBeGreaterThan(0);
    expect(parse(entityFaceImg({ id: 3, hasImage: true, lazy: false }))!.hasAttribute('loading')).toBe(false);
  });

  it('Labels use their own mark, with entity images and representative works behind it, none face-framed', () => {
    const img = parse(entityFaceImg({ kind: 'studio', id: 3, hasImage: true, rep: 41, logo: 'S1 NO.1', logoVariant: 'icon', focus: FOCUS }))!;
    expect(img.getAttribute('src')).toBe('/logo?studio=S1%20NO.1&variant=icon');
    expect(img.dataset.fallbacks).toBe('/entity-image?kind=studio&id=3&thumb=1|/avatar?id=41');
    expect(img.hasAttribute('style')).toBe(false);
    expect(img.dataset.facebox).toBeUndefined();
    expect('dropStyle' in img.dataset).toBe(false);
  });

  it('Swapped logo URLs carry the version: logo_version on the studio reference is appended all the way through', () => {
    expect(parse(entityFaceImg({ kind: 'studio', logo: 'S1', logoVersion: '18f3a' }))!.getAttribute('src'))
      .toBe('/logo?studio=S1&variant=logo&v=18f3a');
    expect(parse(avatarInner('S1', { logo_version: '18f3b' }, null, 'studio', null, 'S1'))!.getAttribute('src'))
      .toBe('/logo?studio=S1&variant=icon&v=18f3b');
    expect(logoUrl('S1', 'icon')).toBe('/logo?studio=S1&variant=icon');
  });

  it('Without a variant it is the wordmark the profile page lead wants', () => {
    expect(parse(entityFaceImg({ kind: 'studio', logo: 'S1' }))!.getAttribute('src')).toBe('/logo?studio=S1&variant=logo');
  });

  it('Agencies without a mark file fall back to the official site\'s roundel', () => {
    expect(parse(entityFaceImg({ kind: 'agency', mark: 9 }))!.getAttribute('src')).toBe('/link-mark?id=9');
  });

  it('It moves on focus alone: the move and zoom attach to the entity image\'s ring, and the whole group is removed on fall-back', () => {
    const img = parse(entityFaceImg({ id: 3, hasImage: true, rep: 41, focus: FOCUS }))!;
    expect(img.style.objectPosition).toBe('50% 12%');
    expect(img.dataset.facebox).toBe('0.44 0.22 67 640 960');
    expect('dropStyle' in img.dataset).toBe(true);
  });

  it('With only a representative avatar no framing applies: it is a different photo', () => {
    const img = parse(entityFaceImg({ id: 3, hasImage: false, rep: 41, focus: FOCUS }))!;
    expect(img.hasAttribute('style')).toBe(false);
    expect(img.dataset.facebox).toBeUndefined();
  });

  it('Caller-provided style takes precedence over the one computed for focus', () => {
    const img = parse(entityFaceImg({ id: 3, hasImage: true, focus: FOCUS, style: ' style="object-position:10% 20%"' }))!;
    expect(img.style.objectPosition).toBe('10% 20%');
  });
});

describe('avatarInner: the initial sits underneath with the real image layered on', () => {
  it('A reference missing has_image counts as no image', () => {
    const html = avatarInner('三上悠亜', { id: 3 }, null);
    expect(html).toBe('<span class="ini">三</span>');
  });

  it('Names escape, and empty names back an question mark', () => {
    expect(avatarInner('<b>', null, null)).toBe('<span class="ini">&lt;</span>');
    expect(avatarInner('', null, null)).toBe('<span class="ini">?</span>');
  });

  it('Without a framing argument it reads from the reference; passing null explicitly means no framing', () => {
    const ref = { id: 3, has_image: true, avatar_focus: FOCUS };
    expect(parse(avatarInner('A', ref, null))!.dataset.facebox).toBe('0.44 0.22 67 640 960');
    const company = parse(avatarInner('A', ref, null, 'studio', null, '', 'icon', null))!;
    expect(company.dataset.facebox).toBeUndefined();
    expect(company.hasAttribute('style')).toBe(false);
  });

  it('kind follows identity: an image of a creator is never written as performer', () => {
    expect(parse(avatarInner('A', { id: 3, has_image: true }, null, 'creator'))!.getAttribute('src'))
      .toBe('/entity-image?kind=creator&id=3&thumb=1');
  });

  it('Seller citations carry their own signature work avatar, entity image first; an unavailable signature work renders no image', () => {
    const ref = { id: 80, rep: 18, has_avatar: true, avatar_stand_in: true };
    const avatar = parse(entityAvatar('Seller accounts', ref, 'creator'))!;
    expect(avatar.getAttribute('src')).toBe('/avatar?id=18');
    expect(avatar.getAttribute('title')).toBe('Representative work, not the performer');
    const installed = parse(entityAvatar('Seller accounts', { ...ref, has_image: true }, 'creator'))!;
    expect(installed.getAttribute('src')).toBe('/entity-image?kind=creator&id=80&thumb=1');
    expect(installed.hasAttribute('title')).toBe(false);
    expect(parse(entityAvatar('Seller accounts', { ...ref, has_avatar: false }, 'creator'))).toBeNull();
  });

  it('The image_version on the citation is appended into the entity image URL', () => {
    expect(parse(avatarInner('A', { id: 3, has_image: true, image_version: '1727800000' }, null))!.getAttribute('src'))
      .toBe('/entity-image?kind=performer&id=3&thumb=1&v=1727800000');
  });

  it('When a representative work stands in for an account it notes it is not the person; cells with an entity image do not', () => {
    const standIn = parse(avatarInner('A', { id: 3, avatar_stand_in: true }, 41, 'creator'))!;
    expect(standIn.getAttribute('src')).toBe('/avatar?id=41');
    expect(standIn.getAttribute('title')).toBe('Representative work, not the performer');
    expect(standIn.getAttribute('aria-label')).toBe('Representative work, not the performer');
    const installed = parse(avatarInner('A', { id: 3, has_image: true, avatar_stand_in: true }, 41, 'creator'))!;
    expect(installed.hasAttribute('title')).toBe(false);
    expect(parse(avatarInner('A', { id: 3 }, 41, 'creator'))!.hasAttribute('title')).toBe(false);
  });

  it('Falling back from a failed entity image to a representative work notes it is not the person; a real representative work adds no such note', () => {
    const standIn = parse(avatarInner('A', { id: 3, has_image: true, avatar_stand_in: true }, 41, 'creator'))!;
    expect(standIn.hasAttribute('title')).toBe(false);
    expect(advanceImageFallback(standIn)).toBe('retry');
    expect(standIn.getAttribute('src')).toBe('/avatar?id=41');
    expect(standIn.title).toBe('Representative work, not the performer');
    expect(standIn.getAttribute('aria-label')).toBe('Representative work, not the performer');
    const person = parse(avatarInner('A', { id: 3, has_image: true }, 41, 'creator'))!;
    advanceImageFallback(person);
    expect(person.hasAttribute('title')).toBe(false);
    expect(person.hasAttribute('aria-label')).toBe(false);
  });
});

describe('Face framing conversion', () => {
  it('It shifts by the detected axis, returning an empty string to keep geometric centering when nothing is detected', () => {
    expect(faceOrigin({ axis: 'x', pct: 30 })).toBe('30% 50%');
    expect(faceOrigin({ axis: 'y', pct: 0 })).toBe('50% 0%');
    expect(faceOrigin(null)).toBe('');
    expect(facePos({ axis: 'x', pct: 30 })).toBe(' style="object-position:30% 50%"');
    expect(facePos(undefined)).toBe('');
  });

  it('The face box packs five numbers into one attribute, and non-numbers cannot enter it', () => {
    expect(faceBoxAttrs(FOCUS)).toBe(' data-facebox="0.44 0.22 67 640 960"');
    expect(faceBoxAttrs({ box: { cx: '"x', cy: 0, faceW: 1, imgW: 1, imgH: 1 } })).toBe(' data-facebox="NaN 0 1 1 1"');
    expect(faceBoxAttrs({ axis: 'x', pct: 3 })).toBe('');
  });
});

describe('coverImage: official cover', () => {
  it('VR frame marks come from the title or framing records, and manual boxes keep their framing', () => {
    expect(parse(coverImage({ code: 'MDVR-276', title: '[VR] video' }, 'big'))!.dataset.coverLayout).toBe('still');
    expect(parse(coverImage({ code: 'MDVR-276', cover_frame: { layout: 'still' } }, 'big'))!.dataset.coverLayout).toBe('still');
    const manual = parse(coverImage({ code: 'MDVR-276', title: '[VR] video',
      poster_box: { x0: 0, y0: 0, x1: 300, y1: 600, px: [800, 600], method: 'manual' } }, 'big'))!;
    expect(manual.dataset.coverLayout).toBeUndefined();
    expect(manual.dataset.posterbox).toBeDefined();
    expect(parse(coverImage({ code: 'IENFE-5301' }, 'big'))!.dataset.coverLayout).toBe('still');
    expect(parse(coverImage({ code: 'IENFE-5301', cover_frame: { cy: .8 } }, 'big'))!.dataset.cy).toBe('0.8');
  });
  it('Source covers carry the video identity and an explicit Blu-ray edition', () => {
    const img = parse(coverImage({ code: 'MIDA-122', title: 'Video (Blu-ray Disc)' }, 'big'))!;
    expect(img.dataset.coverCode).toBe('MIDA-122');
    expect(img.dataset.wideSleeve).toBe('1');
    expect(parse(coverImage({ code: 'MIDA-159', title: 'Videos' }, 'big'))!.dataset.wideSleeve).toBeUndefined();
  });
  it('Face vertical is clamped to 5%–60%, and the six front-cover box numbers are applied to the element in order', () => {
    const img = parse(coverImage({
      code: 'SSIS-001', cover_frame: { cx: 0.81, cy: 0.9 },
      poster_box: { x0: 421, y0: 0, x1: 800, y1: 538, px: [800, 538] },
    }, 'big'))!;
    expect(img.getAttribute('src')).toBe('/cover?code=SSIS-001&thumb=2');
    expect(img.className).toBe('poster cover front');
    expect(img.dataset.cx).toBe('0.81');
    expect(img.dataset.cy).toBe('0.6');
    expect(img.dataset.posterbox).toBe('421 800 538 0 800 538');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(img.dataset.drop).toBe('self');
  });

  it('HD-upgraded and re-probed cover URLs carry a version, and the derived URL keeps it after thumb is stripped', () => {
    expect(parse(coverImage({ code: 'SSIS-001', cover_version: '18f3a' }, 'big'))!.getAttribute('src'))
      .toBe('/cover?code=SSIS-001&thumb=2&v=18f3a');
    expect(coverUrl({ code: 'SSIS-001', cover_version: '18f3a' })).toBe('/cover?code=SSIS-001&v=18f3a');
    expect(detailPosterUrl({ ...JAV, cover_version: '18f3a' }, 'cover')).toBe('/cover?code=SSIS-001&v=18f3a');
    expect(parse(javArtwork({ ...JAV, cover_version: '18f3a' }, 'big', false, 'thumbnail').html)!.dataset.javCover)
      .toBe('/cover?code=SSIS-001&thumb=2&v=18f3a');
  });

  it('On 1x screens cards start at the 800 tier, on denser screens at the 1600 tier; image swaps follow the same tier', () => {
    const shown = (dpr: number) => {
      vi.stubGlobal('devicePixelRatio', dpr);
      try {
        return [parse(coverImage({ code: 'SSIS-001' }, 'big'))!.getAttribute('src'),
          parse(javArtwork(JAV, 'big', false, 'cover').html)!.dataset.javCover];
      } finally { vi.unstubAllGlobals(); }
    };
    expect(shown(1)).toEqual(['/cover?code=SSIS-001&thumb=2', '/cover?code=SSIS-001&thumb=2']);
    expect(shown(1.5)).toEqual(['/cover?code=SSIS-001&thumb=2', '/cover?code=SSIS-001&thumb=2']);
    expect(shown(2)).toEqual(['/cover?code=SSIS-001&thumb=1', '/cover?code=SSIS-001&thumb=1']);
    expect(coverUrl({ code: 'SSIS-001' }, true)).toBe('/cover?code=SSIS-001&thumb=1');
    expect(coverUrl({ code: 'SSIS-001' }, 2)).toBe('/cover?code=SSIS-001&thumb=2');
  });

  it('Small images show the whole picture, and undetected faces carry no anchor', () => {
    const img = parse(coverImage({ code: 'A B' }, 'small', true))!;
    expect(img.className).toBe('poster cover whole');
    expect(img.getAttribute('src')).toBe('/cover?code=A%20B&thumb=2');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.dataset.cx).toBeUndefined();
    expect(img.dataset.cy).toBe(undefined);
  });
});

const JAV = {
  id: 5, code: 'SSIS-001', is_jav: true, has_cover: true, has_thumb: true,
  cover_frame: { cx: 0.7, cy: 0.3 }, poster_box: { x0: 421, y0: 0, x1: 800, y1: 538, px: [800, 538] },
};

describe('javArtwork: coded videos attach both sources to the element', () => {
  it('Preferred jacket: official cover with a source-set attribute', () => {
    const art = javArtwork(JAV, 'big', false, 'cover');
    expect(art.kind).toBe('cover');
    const img = parse(art.html)!;
    expect(img.dataset.javImage).toBe('5');
    expect(img.dataset.javCover).toBe('/cover?code=SSIS-001&thumb=2');
    expect(img.dataset.javThumb).toBe('/poster?id=5&c=4');
    expect(img.dataset.javImageLayout).toBe('big');
    expect(img.classList.contains('cover')).toBe(true);
  });

  it('Preference previews: framing data still travels with the element, so switching back to the cover finds its box', () => {
    const art = javArtwork(JAV, 'small', true, 'thumbnail');
    expect(art.kind).toBe('thumb');
    const img = parse(art.html)!;
    expect(img.getAttribute('src')).toBe('/poster?id=5&c=4');
    expect(img.className).toBe('poster');
    expect(img.dataset.cx).toBe('0.7');
    expect(img.dataset.posterbox).toBe('421 800 538 0 800 538');
    expect(img.getAttribute('loading')).toBe('eager');
  });

  it('Empty when both are missing', () => {
    expect(javArtwork({ ...JAV, has_cover: false, has_thumb: false }, 'big', false, 'cover')).toEqual({ kind: '', html: '' });
  });
});

describe('cardArtwork and queue thumbnails', () => {
  it('Follow sources use the source\'s own thumbnails, with addresses escaped and no source page attached', () => {
    const img = parse(cardArtwork({ id: 1, follow_thumb_url: 'https://x/a?b=1&c="2"' }, 'big', false, 'cover').html)!;
    expect(img.getAttribute('src')).toBe('https://x/a?b=1&c="2"');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('The rest take the local preview cell, or stay empty without one', () => {
    const img = parse(cardArtwork({ id: 1, has_local_poster: true }, 'big', false, 'cover').html)!;
    expect(img.getAttribute('src')).toBe('/poster?id=1&c=4');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(cardArtwork({ id: 1 }, 'big', false, 'cover').kind).toBe('');
  });

  it('The Mix stack\'s top card fetches immediately and the rest lazy-load', () => {
    expect(parse(mixFace({ id: 1, has_thumb: true }, 'big', true, 'cover').html)!.getAttribute('loading')).toBe('eager');
    expect(parse(mixFace({ id: 1, has_thumb: true }, 'big', false, 'cover').html)!.getAttribute('loading')).toBe('lazy');
    expect(mixFace({ id: 1 }, 'big', true, 'cover').kind).toBe('');
  });

  it('A queue row with no image writes "No preview" to hold the cell; coded videos fetch as thumbnails', () => {
    expect(queueThumbHtml({ id: 1 }, 'cover')).toBe('<span class="nopic">No preview</span>');
    expect(parse(queueThumbHtml(JAV, 'cover'))!.className).toBe('poster cover whole');
  });
});

describe('detailPosterUrl: the details opening poster slot', () => {
  it('Other media falls back to the local preview cell, or an empty string without one', () => {
    expect(detailPosterUrl({ id: 2, has_thumb: true }, 'cover')).toBe('/poster?id=2&c=4');
    expect(detailPosterUrl({ id: 2 }, 'cover')).toBe('');
  });

  it('Coded videos follow "JAV default cover": cases use the original artwork and previews use the preview cell', () => {
    expect(detailPosterUrl(JAV, 'cover')).toBe('/cover?code=SSIS-001');
    expect(detailPosterUrl(JAV, 'thumbnail')).toBe('/poster?id=5&c=4');
  });
});

describe('Identity inference for card bylines', () => {
  it('For coded videos the canonical performer wins over creator text in legacy projections', () => {
    const identity = cardIdentity({ is_jav: true, creator: 'Yua Mikami', performers: ['三上悠亜'] });
    expect(identity).toMatchObject({ kind: 'performer', name: '三上悠亜', coStarred: false });
  });

  it('Non-coded videos credit the creator first; co-starring never applies', () => {
    expect(cardIdentity({ creator: 'cc', performers: ['a', 'b'] })).toMatchObject({ kind: 'creator', name: 'cc', coStarred: false });
  });

  it('No credited person means "Unattributed"', () => {
    expect(cardIdentity({})).toMatchObject({ kind: '', name: 'Unassigned' });
  });

  it('Co-stars write only the first performer plus the total count', () => {
    expect(cardIdentity({ performers: ['a', 'b'], performer_total: 7 })).toMatchObject({ coStarred: true, total: 7 });
    expect(cardIdentity({ performers: ['a', 'b'] }).total).toBe(2);
  });

  it('Queue row avatars are not clickable: the whole row is the button and contains only <span>s; co-stars stack at most five deep', () => {
    const single = queueAvatarHtml({ performers: ['a'], performer_entities: [{ id: 3, has_image: true }] });
    expect(single).toBe(`<span class="mav">${avatarInner('a', { id: 3, has_image: true }, undefined)}</span>`);
    const stack = document.createElement('div');
    stack.innerHTML = queueAvatarHtml({ performers: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(stack.querySelectorAll('.mavstack>span.mav')).toHaveLength(5);
    expect(stack.querySelector('button')).toBeNull();
  });

  it('The creator cell takes creator_entity\'s image', () => {
    const html = queueAvatarHtml({ creator: 'cc', creator_entity: { id: 8, has_image: true } });
    expect(parse(html)!.getAttribute('src')).toBe('/entity-image?kind=creator&id=8&thumb=1');
  });

  it('The details queue gets co-star avatars, editions, and framing from entity_refs', () => {
    const host = document.createElement('div');
    host.innerHTML = queueAvatarHtml({ is_jav: true, performers: ['JULIA', 'Co-stars'], entity_refs: {
      performer: [{ id: 7846, has_image: true, image_version: 'portrait-v2', avatar_focus: { axis: 'y', pct: 15 } },
        { id: 9, has_image: false }],
    } });
    expect(host.querySelectorAll('.mav')).toHaveLength(2);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/entity-image?kind=performer&id=7846&thumb=1&v=portrait-v2');
    expect(host.querySelector('img')?.style.objectPosition).toBe('50% 15%');
    expect(host.querySelectorAll('.mav')[1]?.querySelector('img')).toBeNull();
  });

  it('Details queue creator avatars use the creator entity reference', () => {
    const html = queueAvatarHtml({ creator: 'Creators', entity_refs: { creator: [{ id: 8, has_image: true }] } });
    expect(parse(html)!.getAttribute('src')).toBe('/entity-image?kind=creator&id=8&thumb=1');
  });
});

describe('Honorifics and Mix bylines', () => {
  it('"Performer" applies only to code released titles', () => {
    expect(performerLabel({ is_jav: true })).toBe('Performers');
    expect(performerLabel({ is_jav: false })).toBe('Artists');
    expect(performerLabel(null)).toBe('Artists');
  });

  it('Coded videos credit the performer first, others the creator, then fall back to label, code, and first tag in order', () => {
    const label = (tag: string) => `#${tag}`;
    expect(mixLabel({ is_jav: true, creator: 'x', performers: ['p'] }, label)).toBe('p');
    expect(mixLabel({ creator: 'x', performers: ['p'] }, label)).toBe('x');
    expect(mixLabel({ studio: 's', code: 'c' }, label)).toBe('s');
    expect(mixLabel({ code: 'c' }, label)).toBe('c');
    expect(mixLabel({ tags: ['t'] }, label)).toBe('#t');
    expect(mixLabel({}, () => '')).toBe('Recommended for you');
  });
});

describe('Representative table', () => {
  it('Only keep representative works with a fetchable avatar', () => {
    rememberRepresentatives([{ k: 'has', rep: 11, has_avatar: true }, { k: 'none', rep: 12, has_avatar: false }, { k: 'zero', rep: 0, has_avatar: true }]);
    expect(representativeOf('has')).toBe(11);
    expect(representativeOf('none')).toBeUndefined();
    expect(representativeOf('zero')).toBeUndefined();
    expect(representativeOf('constructor')).toBeUndefined();
  });

  it('The card byline only falls back to the signature work when it carries an identity; with no credited person it renders an initial as a performer', () => {
    rememberRepresentatives([{ k: 'rep', rep: 21, has_avatar: true }]);
    expect(parse(entityAvatar('rep', null, 'performer'))!.getAttribute('src')).toBe('/avatar?id=21');
    expect(entityAvatar('rep', null, '')).toBe('<span class="ini">r</span>');
  });
});
