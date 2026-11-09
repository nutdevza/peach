/* The test double for `@peach/legacy/ui` (the main UI points at `src/ui-kit/index.ts`) (aliased in vitest.config.ts).
 *
 * Only the structural markers the assertions actually depend on are kept (`data-geist-empty-state`, `geist-note-error`); the
 * pieces needing the real implementation are re-exported from `src/ui-kit`, sharing source with the main UI as one module
 * instance. Full pages' structure and styles are verified against the real modules by `frontend/e2e`. */
export const emptyStateHtml = (
  iconName: string,
  title: string,
  description: string,
  options: { actions?: string } = {},
): string => `<div class="ui-emptystate" data-geist-empty-state role="status">`
  + `<div class="ui-es-icon" data-icon="${iconName}"></div>`
  + `<div class="ui-es-copy"><h3>${title}</h3><p>${description}</p></div>${options.actions || ''}</div>`;

// The index page's entry skeleton header (Tabs and the filter box) uses the production template.
export {boardTabsHtml, formModal, searchInputHtml} from '../../src/ui-kit';
// The index skeleton reuses the production template; collapse toggling, overlay scrollbars, badge and stat bounce, text swap, scroll criteria, and the supplementary info card all use the production implementations.
export {attachOverlayScrollbar, growCollapse, iconSwapHtml, indexSkeletonHtml, popBadges, popCount, revealTexts, scrollMovesAnchor, setCollapseOpen, setIconSwap, swapText, wireContextCard} from '../../src/ui-kit';
// The settings panel reuses the real implementations for the exclusive view, sliders, anchored menus and horizontal scroll layers.
export {closeAnchoredMenu, dialSliderHtml, iconSwitchHtml, wireAnchoredMenu, wireDialSlider, wireHorizontalScroller, wireIconSwitch} from '../../src/ui-kit';
// The skeleton's visibility wait threshold uses the production number; the manage area's loading state uses the production template, and the skeleton handed to the page-wide fade-out uses the production implementation.
export {configurationSkeletonHtml, revealSkeleton, SKELETON_REVEAL_DELAY, skeletonHtml} from '../../src/ui-kit';
// The shimmer's viewport tending and the backing animation's undo use the production implementations.
export {cancelGlide, gateSweep, releaseSweep} from '../../src/ui-kit';
// 封面格「抓取中」的不定进度圆环用正式模板。
export {gaugeHtml} from '../../src/ui-kit';
/* The test environment has no layout and skeleton fill-in measures nothing, so this does nothing. */
export const fitSkeleton = (_root: Element | null): void => {};
export const loadingDotsHtml = (label: string): string => `<span>${label}</span>`;
export {LOAD_MORE_STATUS} from '../../src/ui-kit';
export const spinnerHtml = (label: string): string => `<span role="status" aria-label="${label}"></span>`;
export const checkboxHtml = (attrs = ''): string => `<span class="ui-pcheck"><input type="checkbox" ${attrs}></span>`;
export const progressHtml = (label: string, value: number, max = 100): string =>
  `<progress role="progressbar" aria-label="${label}" value="${value}" max="${max}" aria-valuenow="${value}" aria-valuemax="${max}"></progress>`;
export const confirmModal = async (_options: unknown) => ({confirmed:false});
/* Menu open and close: no animation in the test environment; the exit hides immediately. */
export const presentMenu = (menu: HTMLElement): void => { menu.hidden = false };
export const dismissMenu = (menu: HTMLElement, finish?: () => void): void => {
  if (menu.hidden) return;
  menu.hidden = true;
  finish?.();
};

export const MEDIA_SOURCE_ICONS: Record<string,string> = {local:'hard-drive','115':'fixture-115',pikpak:'fixture-pikpak'};
export const selectOptionIconHtml = (mark?: string): string => mark ? `<i data-source-icon="${mark}"></i>` : '';

// The settings panel's option, change and persistence regressions use the real dropdown control.
export {selectFieldHtml, wireSelectField} from '../../src/ui-kit';
export const wireCollapse = (_root: ParentNode, _selector: string, _idPrefix: string): void => {};
/* Positions land but nothing animates: jsdom has no layout, everything measures zero, and the spring has nothing to run on.
   The motion itself is verified in the browser by `frontend/e2e/design-*.test.ts`. */
export const moveGlidePane = (
  pane: HTMLElement,
  _from: unknown,
  box: { x: number; y: number; w: number; h: number },
): void => {
  pane.style.width = `${box.w}px`;
  pane.style.height = `${box.h}px`;
  pane.style.translate = `${box.x}px ${box.y}px`;
};

export const setActionBusy = (control: Element | null, busy = true): void => {
  if (!control) return;
  if (busy) {
    control.setAttribute('aria-busy', 'true');
    control.setAttribute('aria-disabled', 'true');
  } else {
    control.removeAttribute('aria-busy');
    control.removeAttribute('aria-disabled');
  }
};

// Use the official Note to verify internal operations.
export {noteHtml} from '../../src/ui-kit';

export const badgeHtml = (text: string): string => `<span class="ui-geist-badge">${text}</span>`;
