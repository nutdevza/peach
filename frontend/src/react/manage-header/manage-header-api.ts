/* 管理区页头（常驻组件 `manage-header`，`manage-header-island.tsx`）对壳的契约。
 *
 * 它画的是管理区正文上面那一块：管理条（一排下划线页签）、数据管理子页的面包屑、页面标题，以及
 * 回收站的说明行（读数与「清空回收站」）。当前在哪个管理区、菜单列哪几项、回收站读数由壳推进来
 * （`ManageHeaderProps`，定义与判据在 `src/manage-header.ts`，壳的启动骨架也用它）。
 *
 * 换页、确认弹层与写接口仍归壳：点下去回到 `openManage`、`openPath` 与清空回收站那条流程。
 * 页面标题的逐行揭示也由壳在每次推送之后做（换了页才放一遍），骨架阶段与路由树接手之后是同一处。 */
import type { SettingsStore } from '../../settings-store';
import type { ManageHeaderProps } from '../../manage-header';

export type { ManageEntry, ManageHeaderProps, TrashCount } from '../../manage-header';

export interface ManageHeaderHost {
  /** The layer the island renders into (`[data-manage-header]`, itself `display: contents`). */
  root: HTMLElement;
  store: SettingsStore<{ manageOrder: string[] }>;
  /** One item on the management bar. */
  openManage(section: string): void;
  /** The breadcrumb's parent level. Clicks with modifier keys or the middle button do not pass through here and follow the link's own href (new tab, context menu). */
  openPath(path: string): void;
  /** The key at the right end of the trash description row: confirm popover, write endpoint and receipt all live in the shell, and the page's readouts refetch after confirmation. */
  emptyTrash(): void;
}

export interface ManageHeaderApi {
  render(props: ManageHeaderProps): void;
}
