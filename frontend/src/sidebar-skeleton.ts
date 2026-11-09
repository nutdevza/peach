/* The sidebar nav's skeleton: the shell writes it synchronously into `#drawerScroll` at startup, and the moment the route
 * tree renders the resident component `sidebar` (`react/sidebar/`) it is swapped wholesale.
 *
 * The left nav only reads the address and local settings and waits for no request; before the React bundle loads this column
 * cannot be empty. The skeleton and the component render the same structure (the header row's empty slot, the nav column), so
 * the handover between them has no shift. */
import { resetSidebarOrder } from './sidebar';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** `order` is `appSettings.sidebarOrder`, `catalog` is every entry as `[key, name, glyph]`, and `pressed` is the shell's `navOn`. */
export function sidebarSkeletonHtml(
  order: readonly string[], catalog: readonly (readonly [string, string, string])[], pressed: (key: string) => boolean,
): string {
  const byKey = new Map(catalog.map((item) => [item[0], item]));
  const buttons = order.map((key) => byKey.get(key)).filter((item) => item !== undefined).map(([key, label, glyph]) => {
    const mark = key === ''
      ? '<img data-sidebar-home-logo="" src="/peach-logo-64.png" srcset="/peach-logo-64.png 64w, /peach-logo-128.png 128w"'
        + ' sizes="24px" width="24" height="24" alt="" decoding="async">'
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${escape(glyph)}"/></svg>`;
    return `<button type="button" data-nav="${escape(key)}" aria-pressed="${pressed(key)}" aria-label="${escape(label)}">`
      + `${mark}<span>${escape(label)}</span></button>`;
  });
  const reset = order.join(',') === resetSidebarOrder(order).join(',') ? '' : '<button type="button" disabled data-navigation-menu="" aria-label="Left navigation order settings" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-ellipsis"/></svg></button>';
  return `<div data-sidebar-head=""></div><div data-sidebar-nav="">${buttons.join('')}${reset}</div>`;
}
