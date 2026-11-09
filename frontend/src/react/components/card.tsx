/* Board 的卡面。只有这一份出处。
 *
 * 旧样式表里的卡分两族，按页各有各的基线，不能一律画成同一种：
 *
 * - **填充**：`background:var(--ground);border:0`，圆角 16px（图表卡 20px），底下压一层
 *   1px 接触阴影。读数卡 `.metricstrip>button`、口味读数 `.tastesummary`、面板
 *   `.insightpanel`、分区 `.followmanage .fmain>.fsec`、图表卡 `.board-radial-card` 都是这一族。
 *   `--ground` 接的就是 `--color-background-secondary-default`（`web/board.css` 的 `:root`
 *   映射），阴影取上游同一用途的 `--shadow-card`（「1px contact shadow used on white cards
 *   sitting on the secondary background」）。
 * - **描边**：`border:1px solid var(--line-soft);background:var(--color-background-primary-default)`，
 *   复核页的 `body[data-surface="/review"] .reviewitem` 是这一族——卡浮在页面底上，靠一条
 *   发丝线收边，不靠换底色。
 *
 * 旧样式表里还有一批「填充再加一条描边」（活动页 `.cleanupfieldset`、高清版 `.qualityitem`）。
 * 直接摆在页面上的卡已统一成不描边：深色主题下那条线比填充亮得多，同一页里一半卡有框、
 * 一半没有。描边只留给底色和所在表面分不开的卡（白卡压在灰卡里、嵌在卡里的代码块），
 * 是填充之上的一档可选项（`bordered`），不是填充的对立面。
 *
 * 迁移时每页各拼一串 `rounded-2xl border border-separator-border`，同一种卡片在十个文件里
 * 长出二十种描边空心壳，页面整体掉了一层底色——卡面收在这里就是为了不再发生这件事。 */

/** Radii: metric cards, panels, and sections are 16px; chart cards one tier larger at 20px, matching the old `.board-radial-card`;
 *  outlined cards use Board's non-elevated surface tier `--surface-radius` (14px), which `outlined` takes by default. */
export type CardRadius = 'default' | 'chart' | 'surface' | 'plain';

/** Padding: `none` leaves the card's own header, body, and footer to arrange themselves; `default` is the 20px of the legacy chart card and panel body. */
export type CardPadding = 'none' | 'default';

/** The card face itself. Which tier is decided by that page's baseline CSS, not by "looks better".
 *
 *  - `filled`: `--ground` fill, no border. Board management's workhorse card.
 *  - `outlined`: `--color-background-primary-default` base plus one `--line-soft`. The review page's entry cards.
 *  - `raised`: primary base, no border. A card floating on another (the per-author group card in follow management). */
export type CardVariant = 'filled' | 'outlined' | 'raised';

export type CardOptions = {
  variant?: CardVariant;
  radius?: CardRadius;
  padding?: CardPadding;
  /** The card itself is clickable (the stat card doubling as a tab, the source card): add hover fill, focus ring, and cursor. */
  interactive?: boolean;
  /** Cards carry an exclusive selected state: when selected, the face switches to the overlay tier, the touch shadow drops away, and a 2px ring in focus ring color is pressed onto the top layer. */
  selectable?: boolean;
  /** The extra stroke added on top of the fill, only for cards whose background and surface can't be told apart: white cards inside gray cards use `--line`,
   *  code blocks and error excerpts embedded in cards use `--line-soft`. `outlined` carries its own stroke, so no need to add one.
   *  `error` is the failed round: the whole card's border switches to the danger color; the text inside the card isn't colored. It's drawn as an
   *  inset outline, not taking box space: within the same column, a failed card and a normal card must have aligned content starts; a real border would push content in by 1px. */
  bordered?: 'line' | 'soft' | 'error';
  className?: string;
};

const FACE = 'min-w-0';

const VARIANT: Record<CardVariant, string> = {
  filled: 'bg-background-secondary-default',
  outlined: 'border border-separator-border bg-background-primary-default',
  raised: 'bg-background-primary-default',
};

/* Radius and shadow are one thing: the only shadow in the old stylesheet is the metric card tier (`0 1px 2px #00000008`),
 * and the chart cards `.board-radial-card` / `.board-heat-card` / `.board-sankey-card` are all plain-faced. */
const RADIUS: Record<CardRadius, string> = {
  default: 'rounded-2xl shadow-card',
  chart: 'rounded-2-5xl',
  surface: 'rounded-surface',
  /* The data management row of plain-face count cards (legacy `.board-plain-stat`): the same 16px, but without the pressed shadow. */
  plain: 'rounded-2xl',
};

const BORDER = {
  line: 'border border-border-button-default',
  soft: 'border border-separator-border',
  error: 'outline-1 -outline-offset-1 outline-border-error-default',
};

const PADDING: Record<CardPadding, string> = {
  none: '',
  default: 'p-5',
};

/* Hover lifts the fill only when not selected: in the legacy rules the selected-state rule came after hover and beat it. Utility ordering is Tailwind's own,
 *  not the written order, so "not selected" goes into the variant instead of relying on order. */
const INTERACTIVE = 'cursor-pointer outline-none not-data-selected:hover:bg-card-hover'
  + ' focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-3';

/* The selection ring is painted on `::after`, stacked on top, without an inset box-shadow: an inner shadow paints beneath child elements,
 * and the metric card's footnote strip carries a background that covers the ring's lower half, leaving only the top three sides. The old
 * `.metricstrip>button[aria-selected=true]::after` was a 2px-stroke overlay, with the card's radius. */
const SELECTABLE = 'relative data-selected:bg-background-primary-default data-selected:shadow-none'
  + ' data-selected:after:pointer-events-none data-selected:after:absolute data-selected:after:inset-0'
  + ' data-selected:after:z-1 data-selected:after:rounded-[inherit]'
  + ' data-selected:after:border-2 data-selected:after:border-border-focus-ring';

/** The card face's class name. The host may be a `section`, `li`, React Aria's `Tab` or `Modal`, so only a class name is given. */
export function cardClass(options: CardOptions = {}) {
  const {
    variant = 'filled', padding = 'default', interactive, selectable, bordered, className,
  } = options;
  /* Radius follows the variant: the filled family is 16px plus a contact shadow, the outlined family a clean 14px face.
     The legacy stylesheet already binds these two together; splitting them would make every caller remember which pairs with which. */
  const radius = options.radius ?? (variant === 'outlined' ? 'surface' : 'default');
  return [
    FACE,
    VARIANT[variant],
    RADIUS[radius],
    PADDING[padding],
    bordered ? BORDER[bordered] : '',
    interactive ? INTERACTIVE : '',
    selectable ? SELECTABLE : '',
    className ?? '',
  ].filter(Boolean).join(' ');
}
