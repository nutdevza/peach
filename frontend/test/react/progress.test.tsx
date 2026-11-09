/* Both the progress bar's screen-reader value and its fill width are clamped to [0, max]: overruns, negatives, and bad values neither draw out of bounds nor read out as miscalculated numbers. */
import { expect, it } from 'vitest';

import { Progress } from '../../src/react/components/progress';
import { mountRoot } from './render';

const fillOf = (bar: Element) => Number(bar.querySelectorAll('rect')[1]?.getAttribute('width'));

it('Over-completion reads as full, and negatives and bad values as zero', async () => {
  const { host } = await mountRoot(
    <>
      <Progress label="Over 100%" value={150} max={100} />
      <Progress label="Negative" value={-5} max={100} />
      <Progress label="Bad value" value={Number.NaN} max={100} />
      <Progress label="Normal" value={25} max={50} />
    </>,
  );
  const bars = [...host.querySelectorAll('[role="progressbar"]')];
  expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['100', '0', '0', '25']);
  expect(bars.map(fillOf)).toEqual([100, 0, 0, 50]);
});

it('With a zero total there is no division by zero; full reads as 1', async () => {
  const { host } = await mountRoot(<Progress label="empty" value={3} max={0} />);
  const bar = host.querySelector('[role="progressbar"]')!;
  expect(bar.getAttribute('aria-valuemax')).toBe('1');
  expect(bar.getAttribute('aria-valuenow')).toBe('1');
});
