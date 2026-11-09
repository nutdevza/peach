/** Native scrolling keeps the browser's duration and curve; with reduced motion it jumps straight to the position. */
export const routeScrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

/** Scrolls in a layout frame once page content and fonts are ready; if navigation has already changed, it does not scroll. */
export async function scrollToAnchor(hash: string, isCurrent: () => boolean): Promise<void> {
  let id: string;
  try { id = decodeURIComponent(hash.slice(1)) } catch { return }
  if (!id) return;
  const pending = () => document.getElementById(id)?.querySelector('[data-content-transition][data-pending]');
  if (isCurrent() && pending()) {
    await new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (!isCurrent() || !pending()) { observer.disconnect(); resolve() }
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pending'] });
    });
  }
  await document.fonts?.ready;
  await new Promise<void>(resolve => { requestAnimationFrame(() => { requestAnimationFrame(() => resolve()) }) });
  if (!isCurrent()) return;
  const target = document.getElementById(id);
  if (target?.getClientRects().length) target.scrollIntoView({ block: 'start', behavior: routeScrollBehavior() });
}
