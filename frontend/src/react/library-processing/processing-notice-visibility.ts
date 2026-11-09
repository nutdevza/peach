import { useSyncExternalStore } from 'react';

const KEY = 'peach.library-processing.visibility';
const listeners = new Set<() => void>();
let fallback = '';

function snapshot(): string {
  try { return sessionStorage.getItem(KEY) || '' }
  catch { return fallback }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** Only controls the task toast for the current browser tab; task queries and run state are independent. */
export function setProcessingNoticeVisible(jobId: string, visible: boolean): void {
  fallback = `${visible ? 'shown' : 'hidden'}:${jobId}`;
  try { sessionStorage.setItem(KEY, fallback) } catch { /* When storage is unavailable, keep the current page's selection. */ }
  listeners.forEach(listener => listener());
}

export function useProcessingNoticeVisibility(jobId: string) {
  const choice = useSyncExternalStore(subscribe, snapshot, () => '');
  return { hidden: choice === `hidden:${jobId}`, requested: choice === `shown:${jobId}` };
}
