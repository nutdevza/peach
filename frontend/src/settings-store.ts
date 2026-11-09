/* UI preferences' source of truth on this browser (`peach.settings.v1`).
 *
 * The value is the object itself, normalized by the shell at startup (`appSettings` in `application/preferences.js`): some
 * sixty read/write sites in the shell mutate its fields directly and call `save()` to persist. Persisting also bumps a
 * version number and notifies subscribers: the settings panel (`react/settings-panel/`) reads the version via
 * `useSyncExternalStore`, so wherever the shell changes an item, the open panel follows on the spot. Both sides read the same
 * object; neither keeps its own copy.
 *
 * The snapshot is the version number, not the object: the shell's writes mutate fields in place and the object reference
 * never changes, so using it as the snapshot would make React think nothing ever changed. Application and the React pages
 * import this module directly, and it is synchronously available at startup; the panel only takes the instance the shell
 * passes in and never builds a second one. */
export interface SettingsStore<T extends object> {
  /** The live settings object; what you read is the current value. */
  readonly value: T;
  /** Incremented on every `save()` or `notify()`. */
  version(): number;
  subscribe(listener: () => void): () => void;
  /** Writes to localStorage, then notifies subscribers. */
  save(): void;
  /** For values outside this object that still require the panel to re-render (high contrast and SFW each have their own key), notify only without persisting. */
  notify(): void;
}

export function createSettingsStore<T extends object>(key: string, value: T): SettingsStore<T> {
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };
  return {
    value,
    version: () => version,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener) };
    },
    save() {
      localStorage.setItem(key, JSON.stringify(value));
      notify();
    },
    notify,
  };
}
