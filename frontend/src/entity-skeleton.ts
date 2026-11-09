/** The entity profile's wait state uses the profile header, tag bar and matching body layout.
 *
 * The filter bar and video header are the top and bottom cells of one overlay on this page (`entity-filter` island), so the
 * wait state must be one block too: each of the two carries glass material and a 22px radius, and without the outer frame
 * they would be drawn as two independent overlays with a seam between and arcs at four corners. The skeleton is a string, so
 * it writes the outer frame's and both slots' markers itself, with geometry aligned one-to-one to the island's overlay, so
 * takeover does not jump.
 */
export function entitySkeletonHtml(kind: string, head: string, body: string, top = '') {
  const square = kind === 'studio' || kind === 'agency';
  const params = new URLSearchParams(location.search);
  const folders = params.get('browse') === 'folders' || !!params.get('folder');
  const content = folders ? `<div class="peach-react entity-folder-workspace" data-folder-workspace data-folder-browse><aside data-folder-tree-host><div class="flex flex-col gap-3"><span class="skeleton ui-configuration-skeleton-input"></span>${'<span class="skeleton" style="width:75%;height:32px"></span>'.repeat(8)}</div></aside><div class="min-w-0"><div data-folder-header-host><span class="skeleton" style="width:160px;height:32px"></span></div>${body}</div></div>` : body;
  return `<section data-skeleton="entity/${kind}" role="status" aria-label="Loading profile">
    <span class="sr-only">Loading profile</span><div aria-hidden="true" inert><div class="peach-react contents">
    <section class="entityhero" data-entity-card><div class="entityprofile" data-entity-profile><div data-entity-portrait-wrap><div class="entityportrait ${square ? 'square ' : ''}skeleton" data-entity-portrait="${square ? 'square' : 'round'}"></div></div>
      <div class="ui-entityidentity entityskeletontext" data-entity-identity><div class="entitytitle" data-entity-title><h2 class="skeleton">&nbsp;</h2></div>
      <div class="alias" data-entity-alias><span class="skeleton"></span></div>
      <div class="entitylinks" data-entity-links><span class="skeleton"></span></div></div></div></section>
    <div class="board-filter-frame sticky top-topbar z-10 mb-5.5 flex flex-col" data-filter-frame data-filter-glass data-glass-pane data-entity-filter-glass>
      <section class="flex h-12 min-w-0 items-center overscroll-x-contain px-3 py-2 gap-1.5 overflow-visible" data-filter-row="top">${top}<div data-entity-tags data-skeleton-tier="filter-pill"></div>${top ? '</div>' : ''}</section>
      ${head}</div></div>
    <div class="entitysection">${content}</div></div></section>`;
}
