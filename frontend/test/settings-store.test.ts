/* The source of truth for UI preferences: the shell mutates fields in place and notifies subscribers on save; panels use the version number to know when to redraw. */
import { beforeEach, expect, it, vi } from 'vitest';

import { createSettingsStore } from '../src/settings-store';

beforeEach(() => localStorage.clear());

it('What is stored is the shell\'s own object, so in-place edits persist the edited values', () => {
  const value = { theme: 'system', batchSize: 60 };
  const store = createSettingsStore('peach.settings.v1', value);
  value.theme = 'dark';
  store.save();
  expect(store.value).toBe(value);
  expect(JSON.parse(localStorage.getItem('peach.settings.v1')!)).toEqual({ theme: 'dark', batchSize: 60 });
});

it('Each persist bumps a version and notifies subscribers; unsubscribing stops delivery', () => {
  const store = createSettingsStore('k', { on: true });
  const listener = vi.fn();
  const stop = store.subscribe(listener);
  const before = store.version();
  store.save();
  expect(store.version()).toBe(before + 1);
  expect(listener).toHaveBeenCalledTimes(1);
  stop();
  store.save();
  expect(listener).toHaveBeenCalledTimes(1);
});

it('When the value lives on another key, notify without persisting', () => {
  const store = createSettingsStore('k', { on: true });
  const listener = vi.fn();
  store.subscribe(listener);
  store.notify();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('k')).toBeNull();
});
