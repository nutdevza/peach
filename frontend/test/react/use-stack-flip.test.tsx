/* Hovering a stack of cards flips through them one by one: timing, discarding in-flight requests, dequeuing broken images, and stopping on leave.
 *
 * `Image` is replaced with a controllable double: after assigning `src`, the test decides whether that image decoded fine or broke, measuring the hook's own
 * timers and state, not the browser's decoding. */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MIX_FLIP_LEAD_MS, MIX_FLIP_MS, useStackFlip, type StackFlip } from '../../src/react/components/use-stack-flip';
import { mount } from './render';

/** How long the pointer must dwell before it starts, same as `MIX_FLIP_ARM_MS` in the hook. */
const ARM_MS = 340;

let decoders: Array<{ url: string; resolve(): void; reject(): void }> = [];
let autoDecode: ((url: string) => boolean) | null = null;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 320;
  referrerPolicy = '';
  #src = '';
  get src() { return this.#src }
  set src(url: string) {
    this.#src = url;
    queueMicrotask(() => this.onload?.());
  }
  decode(): Promise<void> {
    const url = this.#src;
    if (autoDecode) return autoDecode(url) ? Promise.resolve() : Promise.reject(new Error('image'));
    return new Promise((resolve, reject) => { decoders.push({ url, resolve, reject }) });
  }
}

let flip!: StackFlip;
function Probe({ load, canFlip = () => true }: { load(): Promise<readonly string[]>; canFlip?(): boolean }) {
  flip = useStackFlip({ load, canFlip });
  return <div data-faces={flip.faces.join(' ')} data-current={flip.current} />;
}

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });
const enter = () => act(async () => flip.onPointerEnter());
const leave = () => act(async () => flip.onPointerLeave());
const onStage = () => flip.faces[flip.current];

describe('Hover to flip card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', FakeImage);
    decoders = [];
    autoDecode = () => true;
  });
  afterEach(() => { autoDecode = null });

  it('The static cover is covered only after every image decodes, and leaving clears all timers', async () => {
    autoDecode = null;
    await mount(<Probe load={async () => ['/a.jpg', '/b.jpg']} />);
    await enter();
    await advance(ARM_MS);
    expect(flip.faces).toEqual([]);
    await act(async () => decoders[0]!.resolve());
    await advance(0);
    expect(flip.faces).toEqual([]);
    await act(async () => decoders[1]!.resolve());
    await advance(0);
    expect(flip.faces).toEqual(['/a.jpg', '/b.jpg']);
    await leave();
    expect(flip.faces).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('On remove and re-insert, old requests are dropped and only one set of flip timers remains', async () => {
    let stale!: (value: string[]) => void;
    const load = vi.fn<() => Promise<readonly string[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => { stale = resolve }))
      .mockResolvedValue(['/a.jpg', '/b.jpg', '/c.jpg']);
    await mount(<Probe load={load} />);
    await enter();
    await advance(ARM_MS);
    await leave();
    await enter();
    await advance(ARM_MS);
    await act(async () => stale(['/stale.jpg', '/old.jpg']));
    await advance(MIX_FLIP_LEAD_MS);
    expect(flip.faces).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    expect(onStage()).toBe('/b.jpg');
    await advance(MIX_FLIP_MS);
    expect(onStage()).toBe('/c.jpg');
    await leave();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Images that fail to decode never enter the flip queue', async () => {
    autoDecode = (url) => url !== '/b.jpg';
    await mount(<Probe load={async () => ['/a.jpg', '/b.jpg', '/c.jpg']} />);
    await enter();
    await advance(ARM_MS + MIX_FLIP_LEAD_MS);
    expect(flip.faces).toEqual(['/a.jpg', '/c.jpg']);
    expect(onStage()).toBe('/c.jpg');
    await leave();
  });

  it('Under two images it never flips, and when the gate blocks it does not even fetch images', async () => {
    await mount(<Probe load={async () => ['/a.jpg']} />);
    await enter();
    await advance(10_000);
    expect(flip.faces).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    const load = vi.fn(async () => ['/a.jpg', '/b.jpg']);
    await mount(<Probe load={load} canFlip={() => false} />);
    await enter();
    await advance(10_000);
    expect(load).not.toHaveBeenCalled();
    expect(flip.faces).toEqual([]);
  });
});
