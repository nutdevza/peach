/* On hovering a stack of cards, flips through its first few images one by one, saying it is a stack and not one video.
 *
 * Timing and thresholds (`frontend/test/react/use-stack-flip.test.tsx`): starts after the pointer rests 340ms, flips first
 * 420ms after the panel builds, then one image every 1100ms; the flipped-out image's exit state is removed only after it
 * finishes playing (interval minus 120ms), otherwise it snaps back on the spot. Multi-select, occlusion, reduced motion and
 * mid-scroll never start it; those criteria belong to the shell and arrive via `canFlip`, asked again before and after fetching
 * images. Leaving stops it and restores the static cover.
 *
 * What flips is given by the caller: playlists flip their own covers, the home Mix pulls related videos on the fly. With
 * fewer than two usable images it does not flip: flipping one image over is still itself. */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a card stays before flipping away. */
export const MIX_FLIP_MS = 1100;
/** From panel creation to the first flip. Waiting for the first face on a plain 1.1 s interval takes nearly two seconds from pointer stop to reaction. */
export const MIX_FLIP_LEAD_MS = 420;
/** Prepare at most a few; one hover does not pull a whole batch of covers. */
export const MIX_FLIP_FACES = 9;
/** How long the pointer must rest to count as looking at this stack; a passing sweep does not start it. */
const MIX_FLIP_ARM_MS = 340;
/** How long to wait for an image before dropping it if it has not decoded. */
const MIX_FLIP_READY_MS = 5000;

export interface StackFlipOptions {
  /** The URLs of the images in this stack to flip through, in flip order. */
  load(): Promise<readonly string[]>;
  /** Whether flipping is allowed right now: multi-select, occlusion, reduced motion, and mid-scroll all return false. */
  canFlip(): boolean;
  /** The referrer policy carried during prefetch decode; it must match the `<img>`s on stage, otherwise the decoded and displayed images are two requests.
   *  External images on the follows page carry no referrer. */
  referrerPolicy?: ReferrerPolicy;
}

export interface StackFlip {
  /** The frames already decoded; an empty array means not flipping, and the still cover keeps showing as usual. */
  faces: readonly string[];
  /** The card currently on stage. */
  current: number;
  /** The card that just flipped out and is still playing its exit. */
  leaving: number | null;
  onPointerEnter(): void;
  onPointerLeave(): void;
}

interface Run {
  live: boolean;
  generation: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  cycle: ReturnType<typeof setInterval> | null;
  cancels: Set<() => void>;
  /** The 340ms wait after the pointer enters. */
  armed: ReturnType<typeof setTimeout> | null;
  count: number;
  at: number;
}

/** Wait for an image to load and decode. Unfetchable, zero width, or a timeout all count as unusable. */
function readyImage(url: string, run: Run, referrerPolicy?: ReferrerPolicy): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    if (referrerPolicy) image.referrerPolicy = referrerPolicy;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      run.cancels.delete(cancel);
      resolve(ok);
    };
    const cancel = () => finish(false);
    const timeout = setTimeout(cancel, MIX_FLIP_READY_MS);
    run.cancels.add(cancel);
    image.onerror = cancel;
    image.onload = () => {
      if (!image.naturalWidth) { finish(false); return }
      if (typeof image.decode === 'function') image.decode().then(() => finish(true), cancel);
      else finish(true);
    };
    image.src = url;
  });
}

export function useStackFlip({ load, canFlip, referrerPolicy }: StackFlipOptions): StackFlip {
  const [faces, setFaces] = useState<readonly string[]>([]);
  const [current, setCurrent] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const run = useRef<Run>({
    live: false, generation: 0, timers: new Set(), cycle: null, cancels: new Set(), armed: null, count: 0, at: 0,
  });
  /* The callback reads the latest `load` and `canFlip`: a re-render swaps the closure, and the run in progress swaps with it. */
  const latest = useRef({ load, canFlip });
  latest.current = { load, canFlip };

  const clear = useCallback(() => {
    const state = run.current;
    state.live = false;
    state.generation += 1;
    state.timers.forEach(clearTimeout);
    state.timers.clear();
    state.armed = null;
    if (state.cycle !== null) clearInterval(state.cycle);
    state.cycle = null;
    state.cancels.forEach((cancel) => cancel());
    state.count = 0;
    state.at = 0;
  }, []);

  const later = (ms: number, task: () => void) => {
    const timer = setTimeout(() => { run.current.timers.delete(timer); task() }, ms);
    run.current.timers.add(timer);
    return timer;
  };

  const step = () => {
    const state = run.current;
    if (!state.live || state.count < 2) return;
    const out = state.at;
    state.at = (out + 1) % state.count;
    setLeaving(out);
    setCurrent(state.at);
    later(MIX_FLIP_MS - 120, () => setLeaving((now) => (now === out ? null : now)));
  };

  const start = async () => {
    const state = run.current;
    if (state.live || !latest.current.canFlip()) return;
    state.live = true;
    const generation = ++state.generation;
    const alive = () => state.live && generation === state.generation;
    let pool: readonly string[] = [];
    try {
      pool = (await latest.current.load()).slice(0, MIX_FLIP_FACES);
    } catch {
      return;
    }
    if (!alive() || !latest.current.canFlip() || pool.length < 2) return;
    const ready = await Promise.all(pool.map((url) => readyImage(url, state, referrerPolicy)));
    if (!alive() || !latest.current.canFlip()) return;
    const usable = pool.filter((_url, index) => ready[index]);
    if (usable.length < 2) return;
    state.count = usable.length;
    state.at = 0;
    setFaces(usable);
    setCurrent(0);
    setLeaving(null);
    later(MIX_FLIP_LEAD_MS, () => {
      step();
      state.cycle = setInterval(step, MIX_FLIP_MS);
    });
  };

  const onPointerEnter = () => {
    const state = run.current;
    if (state.armed !== null) { clearTimeout(state.armed); state.timers.delete(state.armed) }
    state.armed = later(MIX_FLIP_ARM_MS, () => { state.armed = null; void start() });
  };
  const onPointerLeave = () => {
    clear();
    setFaces([]);
    setCurrent(0);
    setLeaving(null);
  };

  /* On unmount, only timers and in-flight images are collected; no more state changes. */
  useEffect(() => clear, [clear]);

  return { faces, current, leaving, onPointerEnter, onPointerLeave };
}
