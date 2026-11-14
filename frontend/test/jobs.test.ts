import { describe, it, expect, vi, afterEach } from 'vitest';
import { watchJob, followJobProgress, jobActivityHtml } from '../src/jobs';

afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); document.body.innerHTML = ''; });

describe('Background task state recovery', () => {
  it('The default task panel shows real progress and keeps failure reasons visible', async () => {
    vi.useFakeTimers();const host=document.createElement('div');document.body.append(host);const complete=vi.fn();
    let state={status:'running',job_id:'default',checked:2,total:5,error:''};
    followJobProgress({host,active:()=>true,read:async()=>state,busy:()=>{},complete});
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('[data-geist-fieldset]')).not.toBeNull();
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');
    state={...state,status:'failed',error:'Source unavailable'};await vi.advanceTimersByTimeAsync(4000);
    expect(host.hidden).toBe(false);expect(host.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.');expect(complete).toHaveBeenCalledOnce();
    expect(jobActivityHtml('Scanning')).not.toContain('role="progressbar"');
  });
  it('Background stage notes update with polling while keeping real counts', async () => {
    vi.useFakeTimers();
    const host=document.createElement('div');document.body.append(host);
    let state={status:'running',job_id:'taste',checked:0,total:3,message:'Analyzing browsing data: processed 0 / 3'};
    followJobProgress({host,active:()=>true,read:async()=>state,busy:()=>{},complete:()=>{},
      title:'Read browsing data',note:text=>text,loading:text=>text,progress:(value,max,label)=>`${label} ${value}/${max}`});
    await vi.advanceTimersByTimeAsync(0);
    expect(host.textContent).toContain(state.message);
    state={...state,checked:2,message:'Analyzing browsing data: processed 2 / 3'};
    await vi.advanceTimersByTimeAsync(4000);
    expect(host.textContent).toContain(state.message);
    expect(host.textContent).toContain('2/3');
  });
  it('After the page is rebuilt, source progress is restored and the completion receipt arrives exactly once', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div'); document.body.append(host);
    const complete = vi.fn();
    let state = {status: 'running', job_id: 'same', checked: 1, total: 3,
      current: {label: 'Demo source', attempt: 3, max_attempts: 5, retry_in: 2}};
    const mount = (element: HTMLElement) => followJobProgress({host: element,
      active: () => true, read: async () => state, busy: () => {}, complete,
      note: text => text, loading: text => text, progress: (_value,_max,label) => label||'',
      container: content => `<section data-geist-fieldset>${content}</section>`});
    mount(host); await vi.advanceTimersByTimeAsync(0);
    expect(host.textContent).toContain('1/3');
    expect(host.querySelector('[data-geist-fieldset]')).not.toBeNull();
    expect(host.textContent).toContain('Check for updates: completed 1/3 sources · Demo source · Attempt 3/5, retrying in 2 sec');
    host.remove();
    const fresh = document.createElement('div'); document.body.append(fresh);
    mount(fresh); await vi.advanceTimersByTimeAsync(0);
    expect(fresh.textContent).toContain('Demo source');
    state = {...state, status: 'complete', checked: 3};
    await vi.advanceTimersByTimeAsync(4000);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('peach-follow-job')).toBeNull();
  });
  it('After a connection drop it keeps reading the same task to its terminal state', async () => {
    const states: string[] = [], waits: number[] = [];
    let calls = 0, failures = 0;
    await watchJob({ active: () => true,
      read: async () => { calls++; if (calls === 2) throw new Error('offline');
        return { status: calls < 3 ? 'running' : 'complete', job_id: 'one' }; },
      render: state => states.push(state.status),
      disconnected: () => { failures++; }, pause: async ms => { waits.push(ms); },
    });
    expect(states).toEqual(['running', 'complete']);
    expect(failures).toBe(1);
    expect(waits).toEqual([2000, 4000]);
  });
  it('In-flight responses drop after leaving the page', async () => {
    let active = true, rendered = false;
    await watchJob({ active: () => active,
      read: async () => { active = false; return { status: 'running' }; },
      render: () => { rendered = true; }, disconnected: () => {},
    });
    expect(rendered).toBe(false);
  });
  it('First read restore hands over running tasks exactly once', async () => {
    let calls = 0;
    await watchJob({ active: () => true, once: true,
      read: async () => { calls++; return { status: 'running' }; },
      render: () => {}, disconnected: () => {},
    });
    expect(calls).toBe(1);
  });
});
