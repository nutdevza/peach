/* 管理区那张「一件要在这一页上做的事」的卡：填充底、16px 圆角、一层接触阴影，不描边，
 * 卡里分成正文和一条放按钮的页脚。页面上的卡一律靠填充底和页面分开，深色下再加一圈描边
 * 就成了同一页里一半卡有框、一半没有。
 *
 * 旧样式表里数据管理页的四块（`.cleanupfieldset`、`[data-cleanup-processing]`、
 * `.resourcesyncbox`）本来就是同一副卡面（`web/board.css` 把它们并进同一条规则），只在排法上
 * 分两档：
 * - `split`：左说明、右按钮，两列竖向居中，正文与页脚各 24px 内边距；1000px 以下按钮落到说明
 *   下面，页脚靠左、不再留上内边距。媒体修复、空文件夹与资源同步。
 * - `stack`：正文在上、页脚在下，正文 `20px 20px 16px`、最矮 120px；页脚是一条比卡面暗一点点
 *   的带子（`--board-card-foot`），上边一条线、`12px 20px`、最矮 56px。扫描与采集、整理和链接管理。
 *
 * 它和 `../settings/section.tsx` 的 `Section` 不是同一张：那一张是设置弹层的分组，标题在卡外；
 * 这一张的标题是卡内的 Title 2。 */
import type { ReactNode } from 'react';

import { cardClass } from './card';
import { FIELDSET_BODY, FIELDSET_FOOT, fieldsetClass, type FieldsetLayout } from './fieldset-layout';

/** The result panel under the card: the same filled background, 14px corners, no elevation.
 * Link check and resource sync place the conclusion of a background run here, stacked section by section, with a hairline between sections. */
export const RESULT_PANEL = cardClass({
  padding: 'none', radius: 'surface', className: 'overflow-hidden',
});

/** A section in the result panel: 16px padding, with a top border on every section except the first. */
export const RESULT_SECTION = 'border-t border-border-button-default p-4 first:border-t-0';

/** The section title row outside the cards (link management, resource sync), Title 2, 16px from the card below.
 *
 *  This page hangs in `#stats`, and the legacy sheet's `.stats h2` gives all second-level headings 24px and a 4px bottom margin.
 *  It is not in a layer, so utilities cannot win; hence the `!` on both the type and margin groups. */
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="text-title-2-medium! m-0! text-text-primary">{children}</h2>;
}

/** The card's title. `gap` is the distance to the paragraph below: 12px for Organize and Empty folders, 8px for Links and Resource sync;
 *  the scan-and-collect pair's body is itself a column with 8px spacing, so the title reserves nothing extra. */
export function FieldsetTitle(
  { id, gap = 'none', children }: { id?: string; gap?: 'none' | 'small' | 'medium'; children: ReactNode },
) {
  const margin = gap === 'medium' ? 'mb-3' : gap === 'small' ? 'mb-2' : '';
  return <h3 id={id} className={`text-title-2-medium text-text-primary ${margin}`}>{children}</h3>;
}

export function Fieldset(
  { layout, label, labelledBy, id, footer, children, attributes }:
  {
    layout: FieldsetLayout;
    /** Use it when there is no visible heading to point at (the scan-and-collect cards keep their titles in the body column). */
    label?: string;
    labelledBy?: string;
    id?: string;
    footer?: ReactNode;
    children: ReactNode;
    /** The `data-*` attributes smoke and appearance tests use to find cards. Class names cannot do it: generated names would collide with the legacy stylesheet. */
    attributes?: Record<`data-${string}`, string>;
  },
) {
  return (
    <section id={id} aria-label={label} aria-labelledby={labelledBy} {...attributes}
      className={fieldsetClass(layout)}>
      <div className={FIELDSET_BODY[layout]}>{children}</div>
      {footer ? <footer className={FIELDSET_FOOT[layout]}>{footer}</footer> : null}
    </section>
  );
}
