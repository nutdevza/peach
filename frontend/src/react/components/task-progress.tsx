import { cx } from '@/utils/cx';
import { LoadingDots } from './loading-dots';
import { Progress } from './progress';

/** Standalone tasks get a box; the box shares its base color and corners with the neutral notice bar (`Note`), with one step more padding, so lined up next to them it reads as the same kind of bar;
 * tasks inside a card or a result section reuse the enclosing container. */
export function TaskProgress({ label, value = 0, total, embedded = false }: {
  label: string; value?: number; total?: number | null; embedded?: boolean;
}) {
  return (
    <div data-task-progress={embedded ? 'embedded' : 'framed'} className={cx('flex flex-col gap-1.5',
      !embedded && 'gap-2 rounded-2lg bg-background-tertiary-default px-4 py-3 text-text-secondary')}>
      {total && total > 0 ? <>
        <Progress label={label} value={value} max={total} tinted={!embedded} />
        <p className="text-caption-1-regular text-text-secondary wrap-anywhere">{label}</p>
      </> : <LoadingDots label={label} />}
    </div>
  );
}
