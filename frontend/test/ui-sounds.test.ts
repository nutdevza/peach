/* UI sound module behavior: the switch, recipe safety bounds, and the two listeners on document.
 * happy-dom has no Web Audio, so a fake AudioContext that only records scheduling is set up here. The module's
 * AudioContext is a singleton; the whole file should build exactly this one, so tests share it in order. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UI_SOUNDS, playUiSound, setUiSoundsEnabled, uiSoundsEnabled, wireUiSounds } from '../src/ui-kit/sounds';

interface Ramp { value: number; at: number }
interface Param {
  sets: Ramp[];
  ramps: Ramp[];
  value: number;
  setValueAtTime(value: number, at: number): void;
  exponentialRampToValueAtTime(value: number, at: number): void;
}
interface Node {
  kind: string;
  params: Record<string, Param>;
  connected: unknown[];
  started?: number;
  stopped?: number;
  onended?: () => void;
  connect(target: unknown): void;
  disconnect(): void;
  start(at: number): void;
  stop(at: number): void;
}

function param(): Param {
  const created: Param = {
    sets: [], ramps: [], value: 0,
    setValueAtTime(value, at) { created.sets.push({ value, at }); },
    exponentialRampToValueAtTime(value, at) {
      if (value <= 0) throw new RangeError('Exponential ramp must not reach 0');
      created.ramps.push({ value, at });
    },
  };
  return created;
}

class FakeContext {
  static created = 0;
  static current: FakeContext | null = null;
  state = 'suspended';
  currentTime = 10;
  sampleRate = 48000;
  destination = { kind: 'destination' };
  nodes: Node[] = [];
  constructor() { FakeContext.created += 1; FakeContext.current = this; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createOscillator() { return this.node('oscillator', ['frequency'], { type: 'sine' }); }
  createGain() { return this.node('gain', ['gain']); }
  createBiquadFilter() { return this.node('filter', ['frequency', 'Q'], { type: 'lowpass' }); }
  createBuffer(channels: number, length: number, rate: number) {
    const data = new Float32Array(length);
    return { channels, length, rate, getChannelData: () => data };
  }
  createBufferSource() { return this.node('source', []); }
  private node(kind: string, names: string[], extra: Record<string, unknown> = {}) {
    const created: Node & Record<string, unknown> = {
      kind, params: {}, connected: [], ...extra,
      connect(target) { created.connected.push(target); },
      disconnect() { created.connected.length = 0; },
      start(at) { created.started = at; },
      stop(at) { created.stopped = at; },
    };
    for (const name of names) {
      const value = param();
      created.params[name] = value;
      created[name] = value;
    }
    this.nodes.push(created);
    return created;
  }
}

(globalThis as Record<string, unknown>).AudioContext = FakeContext;
const nodes = () => FakeContext.current!.nodes;
const kind = (name: string) => nodes().filter((node) => node.kind === name);

beforeEach(() => { FakeContext.current?.nodes.splice(0); });
afterEach(() => {
  setUiSoundsEnabled(false);
  document.body.replaceChildren();
});

describe('Switches', () => {
  it('No sound and no AudioContext while off', () => {
    setUiSoundsEnabled(false);
    expect(uiSoundsEnabled()).toBe(false);
    expect(playUiSound('click')).toBe(false);
    expect(FakeContext.created).toBe(0);
  });
  it('Throw on unknown names; do not treat a misspelled sound name as silence', () => {
    expect(() => playUiSound('ding')).toThrow('ding');
  });
});

describe('Recipe', () => {
  it('All sound effects share one AudioContext, volume never exceeds 0.8, and tails decay to 0.001', () => {
    setUiSoundsEnabled(true);
    expect(UI_SOUNDS).toEqual(['click', 'toggle-on', 'toggle-off', 'success', 'warning', 'error', 'whoosh', 'pop']);
    for (const name of UI_SOUNDS) expect(playUiSound(name)).toBe(true);
    expect(FakeContext.created).toBe(1);
    const gains = kind('gain');
    expect(gains.length).toBeGreaterThanOrEqual(UI_SOUNDS.length);
    for (const gain of gains) {
      const level = gain.params.gain!;
      const peak = Math.max(...level.sets.map((set) => set.value), ...level.ramps.map((ramp) => ramp.value));
      expect(peak).toBeLessThanOrEqual(0.8);
      expect(level.ramps.at(-1)!.value).toBe(0.001);
    }
    for (const osc of kind('oscillator')) expect(osc.stopped!).toBeGreaterThan(osc.started!);
  });
  it('The toggle sound\'s direction is the state: on rises, off falls', () => {
    setUiSoundsEnabled(true);
    playUiSound('toggle-on');
    const rising = kind('oscillator')[0]!.params.frequency!;
    expect(rising.ramps[0]!.value).toBeGreaterThan(rising.sets[0]!.value);
    nodes().splice(0);
    playUiSound('toggle-off');
    const falling = kind('oscillator')[0]!.params.frequency!;
    expect(falling.ramps[0]!.value).toBeLessThan(falling.sets[0]!.value);
  });
  it('After the noise source finishes the whole chain tears down', () => {
    setUiSoundsEnabled(true);
    playUiSound('click');
    const source = kind('source')[0]!;
    expect(source.connected).toHaveLength(1);
    source.onended!();
    expect(nodes().every((node) => node.connected.length === 0)).toBe(true);
  });
});

describe('document listeners', () => {
  it('Buttons click once per press, disabled ones stay silent, and switches fire on change rather than click', () => {
    setUiSoundsEnabled(true);
    const root = document.createElement('div');
    document.body.append(root);
    wireUiSounds(root);
    const button = document.createElement('button');
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const busy = document.createElement('button');
    busy.setAttribute('aria-disabled', 'true');
    const label = document.createElement('label');
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    label.append(toggle);
    root.append(button, disabled, busy, label);

    button.click();
    expect(kind('source')).toHaveLength(1);
    nodes().splice(0);
    disabled.click();
    busy.click();
    expect(nodes()).toHaveLength(0);

    toggle.click();
    expect(kind('source')).toHaveLength(0);
    const oscillators = kind('oscillator');
    expect(oscillators).toHaveLength(1);
    const sweep = oscillators[0]!.params.frequency!;
    expect(sweep.ramps[0]!.value).toBeGreaterThan(sweep.sets[0]!.value);
  });
  it('Even stopPropagation at the page level cannot stop this event', () => {
    setUiSoundsEnabled(true);
    const root = document.createElement('div');
    document.body.append(root);
    wireUiSounds(root);
    const button = document.createElement('button');
    button.addEventListener('click', (event) => event.stopPropagation());
    root.append(button);
    button.click();
    expect(kind('source')).toHaveLength(1);
    expect(FakeContext.created).toBe(1);
  });
});
