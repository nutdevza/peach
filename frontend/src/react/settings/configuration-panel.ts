/* The root node of one configuration page group: one vertical stack, 24px between blocks. When the configuration page
 * switches groups by tab, the root node is also that tab's panel (`data-board-group`, `role="tabpanel"`,
 * `aria-labelledby`), and the selected group adds `ui-board-group-active`: the same directory's `configuration-page.css`
 * shows only the group carrying it. */
import type { ConfigurationPanel } from '../bundle';

const GROUP = 'flex flex-col gap-6';

export function groupRoot(panel?: ConfigurationPanel) {
  if (!panel) return { className: GROUP };
  return {
    className: panel.active ? `${GROUP} ui-board-group-active` : GROUP,
    'data-board-group': String(panel.index),
    id: panel.id,
    role: 'tabpanel',
    'aria-labelledby': panel.labelledBy,
  };
}
