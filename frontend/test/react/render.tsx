/* Mount, input and fake fetch shared by the React subtree cases. */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Mounts a root and leaves re-rendering and unmounting to the test case: use it when the case needs to re-render with a new set of props or to check whether requests still fire after unmount. */
export async function mountRoot(element: ReactElement): Promise<{
  host: HTMLElement; rerender(next: ReactElement): Promise<void>; unmount(): Promise<void>;
}> {
  const host = document.createElement('div');
  host.className = 'peach-react';
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return {
    host,
    rerender: async (next) => { await act(async () => root.render(next)) },
    unmount: async () => {
      const at = roots.indexOf(root);
      if (at >= 0) roots.splice(at, 1);
      await act(async () => root.unmount());
    },
  };
}

export async function mount(element: ReactElement): Promise<HTMLElement> {
  return (await mountRoot(element)).host;
}

/** The request chain has several `await` hops (fetch, json, setState); wait for all of them to land before asserting. */
export const settle = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
});

/** A server response still in flight: the test releases it manually, simulating the gap in a real network between clicking and the refetch coming back.
 *  A fake fetch answering within the same act would cover up defects only visible in that gap. */
export function pending<T>() {
  let release!: (value: T) => void;
  const answer = new Promise<T>((done) => { release = done });
  return { answer, release: (value: T) => act(async () => { release(value) }) };
}

/** React tracks the input's value itself and ignores a dispatch that fires the event without going through the native setter. */
export async function type(input: HTMLInputElement | null | undefined, value: string) {
  if (!input) throw new Error('The input never painted');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export const click = (el: Element | null | undefined) => act(async () => {
  if (!el) throw new Error('Element to click was not rendered');
  (el as HTMLElement).click();
});

export const submit = (form: Element | null | undefined) => act(async () => {
  if (!form) throw new Error('Form not rendered');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});

/** Finds the button by visible text. The popup mounts at the end of `body`, so it searches the whole page by default. */
export const buttonNamed = (name: string, root: ParentNode = document) =>
  [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) ?? null;

/** Finds a link by its visible text, also searching the whole page by default. */
export const linkNamed = (name: string, root: ParentNode = document) =>
  [...root.querySelectorAll('a')].find((link) => link.textContent?.trim() === name) ?? null;

/** The names of a group of actions in document order, buttons and links included, icon-only keys read from `aria-label`: used to assert that links sit left and the primary action rightmost. */
export const actionOrder = (root: ParentNode | null | undefined) =>
  root ? [...root.querySelectorAll('button, a[href]')]
    .map((node) => node.textContent?.trim() || node.getAttribute('aria-label') || '') : [];

/** Sections use the title as the accessible name. */
export const section = (root: ParentNode, title: string) =>
  root.querySelector(`:is(form,section)[aria-label="${title}"]`);

export const switches = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('input[role="switch"]')];

/** Opens a React Aria dropdown and clicks an option. */
export async function choose(trigger: Element | null | undefined, option: string) {
  await click(trigger);
  await click([...document.querySelectorAll('[role="option"]')].find((node) => node.textContent?.trim() === option));
}

type FetchCall = [string, RequestInit | undefined];
export const fetchMock = (status: number, body: unknown) => vi.fn<(...call: FetchCall) => Promise<unknown>>(
  async () => ({ ok: status < 400, status, json: async () => body }),
);

export const sentBody = (fetcher: ReturnType<typeof fetchMock>, index = 0) =>
  JSON.parse(String(fetcher.mock.calls[index]?.[1]?.body));
