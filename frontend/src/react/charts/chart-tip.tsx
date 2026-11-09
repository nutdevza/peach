/* The charts' hover overlay: bar, radial, radar and heatmap share this one surface.
 *
 * Surface, border, shadow, type scale and the row layout follow EvilCharts' `ChartTooltipContent`. That one's container uses
 * the `grid` class, colliding with the legacy stylesheet's card-grid `.grid`: on the page, the overlay would be stretched into
 * a row of card-wide cells with 24px row gaps. Tailwind here does not generate `grid` either (`../styles.css`), so this
 * reassembles the same class set with the container as `flex flex-col`, and Recharts' side still connects via upstream's
 * `ChartTooltip`.
 * Differences registered in `../evilcharts/ORIGIN.md`. */
import type { ReactNode } from 'react';
import type { TooltipContentProps } from 'recharts';

import { getPayloadConfigFromPayload, useChart } from '@/registry/ui/recharts-chart';
import { ChartTooltip } from '@/registry/ui/recharts-tooltip';

/** The overlay faces. The heatmap's overlay positions itself and is appended after this list. */
export const TIP_SURFACE =
  'flex min-w-32 flex-col gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl';

/** One row in the overlay: the color dot, what this group of numbers is called, and the number. */
export function TipRow({ swatch, name, value, format = (at) => at.toLocaleString() }:
  { swatch: ReactNode; name: ReactNode; value: number; format?: (value: number) => string }) {
  return (
    <div className="flex w-full items-center gap-2">
      {swatch}
      <div className="flex flex-1 items-center justify-between gap-4 leading-none">
        <span className="text-muted-foreground">{name}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{format(value)}</span>
      </div>
    </div>
  );
}

export const TIP_SWATCH = 'size-2.5 shrink-0 rounded-xs';

type TipProps = Partial<Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'>> & {
  nameKey?: string; valueKey?: string; hideLabel?: boolean; format?: (value: number) => string;
};

function TipContent({ active, payload, label, nameKey, valueKey, hideLabel, format }: TipProps) {
  const { config } = useChart();
  const items = (payload ?? []).filter((item) => item.type !== 'none');
  /* Same as upstream: leave an empty placeholder when there is no content, so the overlay does not slide in from the image's top-left corner on its next appearance. */
  if (!active || !items.length) return <span className="p-4" />;
  const title = hideLabel || typeof label !== 'string' ? null : (config[label]?.label ?? label);
  return (
    <div className={TIP_SURFACE}>
      {title ? <div className="font-medium text-foreground">{title}</div> : null}
      {items.map((item, index) => {
        const row = (item.payload ?? {}) as Record<string, unknown>;
        const named = nameKey ? row[nameKey] : undefined;
        const key = `${named ?? item.name ?? item.dataKey ?? 'value'}`;
        const entry = getPayloadConfigFromPayload(config, item, key);
        const value = valueKey ? row[valueKey] : item.value;
        return (
          <TipRow key={key + index} name={entry?.label ?? item.name} value={Number(value ?? 0)} format={format}
            swatch={(
              // oxlint-disable-next-line shadcn/no-inline-styles -- the color dot takes the CSS variable ChartStyle generates per series key; the variable name changes with the key
              <i className={TIP_SWATCH} style={{ background: `var(--color-${key}-0)` }} />
            )} />
        );
      })}
    </div>
  );
}

/** Tooltips wired into EvilCharts charts. `nameKey` is the radial chart's one-name-per-segment data column; `valueKey` is
 * the raw-number column the tooltip should read when the plotted column passes through scale conversion (radar chart); `format` writes numbers as readings with units (bytes). */
export function ChartTip(
  { nameKey, valueKey, hideLabel, format }:
  { nameKey?: string; valueKey?: string; hideLabel?: boolean; format?: (value: number) => string },
) {
  return (
    <ChartTooltip cursor={false}
      content={<TipContent nameKey={nameKey} valueKey={valueKey} hideLabel={hideLabel} format={format} />} />
  );
}
