/* The profile card at the top of the entity profile page, plus the row of new releases not yet added to the library that sits
 * between the card and the videos.
 *
 * The profile card follows Board's profile card layout: a secondary-background card with 18px radius, body being avatar plus
 * three identity lines (name, aliases and affiliation, external links), a data table column on the right when the performer
 * has profile data, and co-performers folded into the color-scale band at the card's bottom: that is a note about the person,
 * not this page's body. The intersection bar, filter bar and content area outside the card still belong to the shell.
 *
 * The avatar, co-performers' faces and new-release cards are preassembled HTML (the large slot and new-release cards come from
 * the shell, co-performers' faces from `@peach/card-art`): when an image fails, the fallback chain (`card-art/image-fallback.ts`)
 * removes the `<img>` from the DOM, face zoom (`avatarFrame`) writes inline sizing onto the image, and the waiting shimmer
 * hangs on the image's parent; all of these mutate nodes directly, so those cells use `dangerouslySetInnerHTML` and React does
 * not own the nodes inside. */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { entityFaceImg, facePos } from '@peach/card-art';
import { entityPath, esc, firstGrapheme, icon } from '@peach/legacy/core';
import { textLang } from '../../core/text-lang';
import { entityDisplayName, nameLanguage } from '../../core/entity-names';
import { useEntityNames } from '../use-entity-names';

import { Button } from '@/components/base/buttons/button';

import { AvatarPicker } from '../avatar-picker/avatar-picker-page';
import { Note } from '../components/note';
import { PendingWork } from '../components/pending-work';
import { FavoriteButton } from '../library-shortcuts/shortcut-controls';
import { busyProps } from '../settings/busy-props';
import { FeedNewRow } from '../feed-new/feed-new-row';
import { Glyph } from './glyph';
import { FeedSwitch, MorePop } from './hero-pop';
import { NamePicker } from './name-picker';
import {
  COMPANY_ALIASES_SHOWN, agencyOf, companyFactRows, entityFeedTip, entryMarks, factRows, heroLinks, isCompany, isPeople, nameChoices, nameLine, shownTags,
  type EntityHeroActions, type EntityHeroData, type EntityHeroHelpers, type EntityHeroProps,
  type HeroCostar, type HeroFollow, type LinkMark, type LinkView,
} from './entity-hero';

/** The image in a co-performer's circle: entity image first, falling back to the representative avatar, framed by the detected face. */
function costarImg(person: HeroCostar): string {
  return entityFaceImg({
    id: person.id, hasImage: person.has_image, version: person.image_version, rep: person.has_avatar ? person.rep : null,
    style: facePos(person.avatar_focus), focus: person.avatar_focus, standIn: person.avatar_stand_in,
  });
}

export function EntityHeroPage({ kind, name, entity, feedNew, feedHost, feedError, retryFeed, actions, helpers }: EntityHeroProps) {
  useEntityNames();
  const displayName = entityDisplayName(kind, entity.canonical_name, Number(entity.id));
  const people = isPeople(kind);
  const company = isCompany(kind);
  const facts = people ? factRows(entity.profile) : company ? companyFactRows(entity.company_profile) : [];
  const links = heroLinks(entity, kind);
  const marks = entryMarks(entity);
  const costars = kind === 'agency' ? [] : (entity.related_performers || []);
  const linkRow = useRef<HTMLDivElement>(null);
  const costarRow = useRef<HTMLDivElement>(null);
  /* Co-performers and the narrow-screen external links row are both `overflow-x:auto` with hidden scrollbars: they scroll, but the mouse has no reachable
     entry point, so they register the site-wide horizontal-row drag-and-wheel mapping. The external links row wraps on wide screens and the component measures that it does not overflow. */
  useEffect(() => { helpers.wireScroller(linkRow.current) }, [helpers, links.length]);
  useEffect(() => { helpers.wireScroller(costarRow.current) }, [helpers, costars.length]);

  return (
    <>
      <section data-entity-card="" aria-label="Details">
        <div data-entity-profile={facts.length ? 'facts' : ''}>
          <div data-entity-portrait-wrap="">
            <Portrait kind={kind} name={displayName} helpers={helpers} people={people} company={company} />
            {people && entity.id ? (
              <span data-avatar-picker="">
                <AvatarPicker kind={kind} entityId={Number(entity.id)} name={displayName || name}
                  onPicked={actions.avatarPicked} />
              </span>
            ) : null}
          </div>
          <div data-entity-identity="">
            <div data-entity-title="">
              <h2 lang={textLang(displayName)}>{displayName}</h2>
              {kind !== 'tag' ? <NamePicker current={entity.canonical_name} choices={nameChoices(entity, nameLanguage())}
                onChoose={actions.chooseName} onAddAlias={actions.addAlias} /> : null}
              {entity.id ? <FavoriteButton item={{ entity_id: Number(entity.id), kind, name: entity.canonical_name || name, favorite: entity.favorite }} /> : null}
            </div>
            <PendingWork work={entity.pending_work} />
            <AliasLine kind={kind} entity={entity} actions={actions} />
            {entity.related_identities?.length ? (
              <div className="flex min-w-0 flex-wrap gap-2 text-caption-1-regular text-text-secondary">
                {/* Account names are often long unbroken English strings, so on narrow screens they must wrap at any point. */}
                {entity.related_identities.map((identity) => {
                  const text = `${identity.relation === 'same_person' ? 'Same person' : 'Linked account'}: ${entityDisplayName(identity.kind, identity.canonical_name, identity.id)}`;
                  return (
                    <button type="button" key={identity.id} title={text}
                      className="min-w-0 max-w-full text-text-primary underline wrap-anywhere"
                      onClick={() => actions.openEntity(identity.kind, identity.canonical_name)}>
                      {text}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {links.length ? (
              <div ref={linkRow} data-entity-links="">{links.map((link, at) => <HeroLinkView key={at} link={link} />)}</div>
            ) : null}
            {marks.length || entity.feed ? <EntryMarks entity={entity} actions={actions} helpers={helpers} /> : null}
            {entity.follow?.held.length ? <HeldAuthors follow={entity.follow} displayName={displayName} actions={actions} /> : null}
          </div>
          {facts.length ? (
            <dl data-entity-facts="">
              {facts.map((row) => (
                <FactRowView key={row.label} glyph={row.glyph} label={row.label} clip={row.clip}>
                  {row.tags ? <FactTags tags={row.tags} />
                    : row.parts.map((part, at) => (
                      <span key={at} data-fact-tone={part.tone === 'plain' ? undefined : part.tone}>
                        {at ? ' ' : ''}{part.text}
                      </span>
                    ))}
                </FactRowView>
              ))}
            </dl>
          ) : null}
        </div>
        {costars.length ? (
          <div data-entity-foot="" aria-label="Co-stars">
            <div ref={costarRow} data-related-people="">
              {costars.map((person) => (
                <button key={person.k} type="button" data-related-performer={person.k}
                  onClick={() => actions.openEntity('performer', person.k)}>
                  <span data-hero-ring="" dangerouslySetInnerHTML={{
                    __html: `<span>${esc(firstGrapheme(entityDisplayName('performer', person.k, person.id)))}</span>${costarImg(person)}` }} />
                  <span data-hero-costar-name="">{entityDisplayName('performer', person.k, person.id)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      {/* The new releases row sits in the `section.feednew[data-feed-new]` the shell reserved, the same component as the home page row. */}
      {feedHost ? createPortal(<FeedNewRow feedNew={feedNew} host={feedHost} wire={helpers.wireFeedRow}
        act={(feedId, action) => actions.feedAction(feedId, action)} error={feedError} retry={retryFeed} />, feedHost) : null}
    </>
  );
}

/** Large slots: companies take their own mark (square frame), people take the entity image or a representative work's avatar (round frame); when nothing can be fetched at all, only the initial letter remains. */
function Portrait({ kind, name, helpers, people, company }: {
  kind: string; name: string; helpers: EntityHeroHelpers; people: boolean; company: boolean;
}) {
  /* The image is assembled once: the `<img>` removed by the fallback chain and the dimensions written by face zoom stay on the node, and repainting must not
     stamp the same HTML over again (`dangerouslySetInnerHTML` only rewrites when the string changed). */
  const portrait = useRef<HTMLDivElement>(null);
  const [html] = useState(() => `${helpers.portraitImg()}<span data-portrait-initial="">${esc(firstGrapheme(name))}</span>`);
  useLayoutEffect(() => {
    const initial = portrait.current?.querySelector('[data-portrait-initial]');
    if (initial) initial.textContent = firstGrapheme(name);
    for (const image of portrait.current?.querySelectorAll<HTMLImageElement>('img[alt]') || []) {
      if (image.alt) image.alt = name;
    }
  }, [name]);
  return (
    <div data-entity-portrait={people ? 'round' : 'square'} data-fit-native={company ? 'mark' : 'portrait'}
      ref={portrait} data-entity-kind={kind} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** Identity fields each carry an icon; aliases are laid out separately, and when one belongs to an entity an in-app entry is offered. */
function AliasLine({ kind, entity, actions }: { kind: string; entity: EntityHeroData; actions: EntityHeroActions }) {
  const agency = agencyOf(entity);
  const go = (target: string, to: string) => (event: MouseEvent) => {
    event.preventDefault();
    actions.openEntity(target, to);
  };
  const agencyNode = agency ? (agency.linked
    ? <a href={entityPath('agency', agency.name, agency.id)} data-agency={agency.name} onClick={go('agency', agency.name)}>{agency.name}</a>
    : agency.name) : null;
  const count = <><b>{entity.asset_count.toLocaleString()}</b> videos</>;
  if (kind === 'performer' || kind === 'creator') {
    const groups = entity.name_display?.groups[nameLanguage()] ?? entity.name_groups;
    const line = nameLine(groups);
    return (
      <div data-entity-alias="meta">
        <IdentityMeta entity={entity} />
        <span data-meta-item="" title="Videos"><Glyph name="film" /><span>{count}</span></span>
        {entity.follow?.key ? <FollowMeta follow={entity.follow} actions={actions} /> : null}
        {agencyNode ? <span data-meta-item="" title="Agency"><Glyph name="briefcase" /><span>{agencyNode}</span></span> : null}
        {line ? (
          <div data-meta-item="names">
            <Glyph name="id-card" />
            <span data-alias-names="" title="Aliases">{line.names.map((one, at) => <span key={at} lang={textLang(one)}>{one}</span>)}</span>
            {line.rest > 0 ? (
              <MorePop id="entityAliasPop" hook="alias" rest={line.rest} label={`${line.rest.toLocaleString()} more aliases`}
                heading={`${line.total.toLocaleString()} aliases`}>
                <dl>
                  {(groups?.groups || []).map((group, at) => (
                    <NameGroup key={at} label={group.label} names={group.names} />
                  ))}
                </dl>
              </MorePop>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
  const aliases = entity.display_aliases || [];
  /* The agency page counts people, not videos; the studio page is the same, where how many labels it owns is its own stat (ADR-0051). */
  const members = kind === 'agency'
    ? <> · <b>{(entity.member_count || 0).toLocaleString()}</b> artists</>
    : (entity.labels || []).length ? <> · <b>{entity.labels!.length.toLocaleString()}</b> labels</> : null;
  const maker = entity.maker;
  return (
    <div data-entity-alias="meta">
      {kind === 'creator' ? <IdentityMeta entity={entity} /> : null}
      <span data-meta-item="" title="Videos"><Glyph name="film" /><span>{count}{members}</span></span>
      {agencyNode ? <span data-meta-item="" title="Agency"><Glyph name="briefcase" /><span>{agencyNode}</span></span> : null}
      {maker ? <span data-meta-item="" title="Studios"><Glyph name="clapperboard" /><a href={entityPath('studio', maker.name, maker.id)} data-studio-link={maker.name}
        onClick={go('studio', maker.name)}>{maker.name}</a></span> : null}
      {aliases.length ? <CompanyAliases aliases={aliases} /> : null}
    </div>
  );
}

/** Company aliases: list a few first, fold the rest into "+N"; one name per line in the overlay. After a studio renames several rounds and runs a chain of
 *  labels, aliases can exceed thirty, and laying them all out would eat a dozen-plus rows of the profile card. */
function CompanyAliases({ aliases }: { aliases: string[] }) {
  const { shown, rest } = shownTags(aliases, COMPANY_ALIASES_SHOWN);
  return (
    <div data-meta-item="names" data-company-names="">
      <Glyph name="id-card" />
      <span data-alias-names="" title="Aliases">{shown.map((name, at) => <span key={at}>{name}</span>)}</span>
      {rest ? (
        <MorePop id="entityAliasPop" hook="alias" rest={rest} label={`Plus ${rest.toLocaleString()} more aliases`}
          heading={`${aliases.length.toLocaleString()} aliases`}>
          <dl><NameGroup names={aliases.map((name) => ({ name }))} /></dl>
        </MorePop>
      ) : null}
    </div>
  );
}

/** Sources bound to this person in follows: the count is updates not yet added to library, the whole block is an in-site destination (same tungsten blue as the agency link),
 *  and opening it switches to this page's online view. */
function FollowMeta({ follow, actions }: { follow: HeroFollow; actions: EntityHeroActions }) {
  const from = follow.providers.join(' · ');
  return (
    <span data-meta-item="" data-entity-follow="" title={from ? `Follows · ${from}` : 'Follows'}>
      <Glyph name="rss" />
      <a href="?media=online" onClick={(event) => { event.preventDefault(); actions.openFollowAuthor(follow.key) }}>
        {follow.n.toLocaleString()} updates
      </a>
    </span>
  );
}

/** Follows with same-named authors not yet confirmed as the same person: one prompt per group, and only confirming binds that group's sources to this person.
 *  A shared name is not evidence (ADR-0095), so this only asks and never binds for the user. */
function HeldAuthors({ follow, displayName, actions }: {
  follow: HeroFollow; displayName: string; actions: EntityHeroActions;
}) {
  const [busy, setBusy] = useState('');
  const confirm = async (key: string, name: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await actions.confirmFollowAuthor(key, name);
    } catch {
      /* The shell sends the failure toast and the button returns to pressable. */
    } finally {
      setBusy('');
    }
  };
  return (
    <div data-entity-held="" className="flex flex-col gap-2">
      {follow.held.map((group) => (
        <Note key={group.key} tone="info" title={`Follows contain a same-named author ${group.name}`}
          action={<Button size="small" {...busyProps(busy === group.key)}
            onClick={() => { void confirm(group.key, group.name) }}>Is the same person</Button>}>
          {[group.providers.join(' · '), `${group.n.toLocaleString()} updates`].filter(Boolean).join(' · ')}
          . and {displayName} the same person?
        </Note>
      ))}
    </div>
  );
}

/** The category is the first item in the identity row. */
function IdentityMeta({ entity }: { entity: EntityHeroData }) {
  if (!entity.identity_labels?.length) return null;
  return (
    <span data-meta-item="classification" data-identity-classification="">
      <Glyph name="user-round" /><span>{entity.identity_labels.join(' · ')}</span>
    </span>
  );
}

/** A group of names in the overlay: one name per line with its reading on the line below. Run together into one paragraph, names and readings become impossible to match up. */
function NameGroup({ label, names }: { label?: string; names: { name: string; reading?: string }[] }) {
  return (
    <>
      {label ? <dt>{label}</dt> : null}
      <dd data-wide={label ? undefined : ''}>
        {names.map((entry, at) => (
          <span key={at} data-pop-name="" lang={textLang(entry.name)}>{entry.name}{entry.reading ? <small>{entry.reading}</small> : null}</span>
        ))}
      </dd>
    </>
  );
}

function FactRowView({ glyph, label, clip, children }: { glyph: string; label: string; clip?: string; children: ReactNode }) {
  return (
    <>
      <dt><Glyph name={glyph} />{label}</dt>
      <dd data-fact={glyph === 'tags' ? 'tags' : clip ? 'clip' : glyph === 'calendar-range' ? 'num' : undefined}
        title={clip}>{children}</dd>
    </>
  );
}

/** The site's tags are just a reading, not a filter for this page, so they render as tag chips but take no clicks. */
function FactTags({ tags }: { tags: string[] }) {
  const { shown, rest } = shownTags(tags);
  return (
    <>
      {shown.map((tag) => <span key={tag} data-fact-tag="" title={tag}>{tag}</span>)}
      {rest ? (
        <MorePop id="entityTagPop" hook="fact" rest={rest} label={`Plus ${rest.toLocaleString()} more tags`}
          heading={`${tags.length.toLocaleString()} tags`}>
          <div data-fact-tags="">{tags.map((tag) => <span key={tag} data-fact-tag="" title={tag}>{tag}</span>)}</div>
        </MorePop>
      ) : null}
    </>
  );
}

/** The round badge in front of the link. A site badge is a bitmap on someone else's server; when it cannot load, `data-drop="self"` removes the img and
 *  reveals the globe underneath, so this cell is legacy-layer HTML. */
function LinkIcon({ mark }: { mark: LinkMark }) {
  if ('brand' in mark) return <span data-link-icon="brand"><Glyph name={mark.brand} /></span>;
  const html = icon('globe') + ('site' in mark
    ? `<img src="${esc(mark.site)}" alt="" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-drop="self">` : '');
  return <span data-link-icon="" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** External links line up as secondary buttons: 36px tall with an outline. Icon-only links carry no readable text of their own, so the name lives in the title and
 *  accessible name; only links like an official site, where you cannot tell who it is before clicking, get text. */
function HeroLinkView({ link }: { link: LinkView }) {
  switch (link.type) {
    case 'icon':
      return (
        <a data-link="icon" href={link.url} target="_blank" rel="noopener noreferrer" title={link.title} aria-label={link.title}>
          <LinkIcon mark={link.mark} />
        </a>
      );
    case 'gone':
      /* Dead links of retired performers stay in place and are not clickable: hitting a parked domain only invites antivirus warnings. */
      return (
        <span data-link="gone" tabIndex={0} title={link.title} aria-label={link.title}>
          <LinkIcon mark={{ globe: true }} />
        </span>
      );
    case 'private':
      return (
        <span data-link="private" title={link.sources ? link.sources.join('\n') : link.label}>
          <LinkIcon mark={{ globe: true }} />
          <span data-link-label="">{link.sources ? link.label : `Source · ${link.label}`}</span>
        </span>
      );
    default:
      return (
        <a data-link="url" href={link.url} target="_blank" rel="noopener noreferrer" title={link.title}>
          <LinkIcon mark={link.mark} /><span data-link-label="">{link.text}</span>
          <svg className="ui-externalmark" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-external-link" /></svg>
        </a>
      );
  }
}

/** The watch row: JavDB and MISSAV's own logos, followed by the subscribe-to-new-releases switch.
 *
 *  MISSAV has no graphic logo; its title is just set type: Halant 500, `MISS` in page ink, `AV` in its pink. One performer having two
 *  actress pages on javdb is common; the second one gets a server-assigned number appended after the logo. */
function EntryMarks({ entity, actions, helpers }: {
  entity: EntityHeroData; actions: EntityHeroActions; helpers: EntityHeroHelpers;
}) {
  const [following, setFollowing] = useState(!!entity.feed?.following);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  /* On a failed write the toggle stays put and the shell sends the failure receipt; the success receipt goes out only on success, and undo is another real write. */
  const write = async (on: boolean): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await actions.follow(on);
      setFollowing(on);
      return true;
    } catch {
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const toggle = async (on: boolean) => {
    if (!await write(on)) return;
    helpers.receipt(on ? 'Subscribed new releases' : 'Unsubscribed from new releases', { undo: async () => { await write(!on) } });
    if (on) actions.refreshFeedAfterCheck();
  };
  return (
    <div data-entry-marks="">
      {entryMarks(entity).map((mark, at) => (
        <a key={at} data-entry-mark="" href={mark.url} target="_blank" rel="noopener noreferrer" title={mark.label} aria-label={mark.label}>
          {mark.mark ? <Glyph name={mark.mark} /> : <span data-missav-mark=""><span>MISS</span><span>AV</span></span>}
          {mark.ordinal ? <span data-entry-ordinal="">{mark.ordinal}</span> : null}
        </a>
      ))}
      {entity.feed ? <FeedSwitch following={following} busy={busy} onToggle={(on) => { void toggle(on) }}
        tip={entityFeedTip(following)} /> : null}
    </div>
  );
}
