import {describe,expect,it} from 'vitest';
import {requestErrorMessage} from '../src/core';
import {noteHtml,projectBannerHtml,gaugeHtml,progressHtml,configurationSkeletonHtml} from '../src/ui-kit';

describe('Chinese error feedback',()=>{
  it.each(['Failed to fetch','NetworkError when attempting to fetch resource.','Load failed'])('Network error %s says how to check the connection',message=>{
    expect(requestErrorMessage(new TypeError(message))).toBe('Could not connect to the Peach service. Check the network connection and make sure the tray service is running.');
  });
  it.each([[401,'session expired'],[403,'does not have permission'],[404,'no longer exists'],[429,'Too many requests'],[503,'temporarily unavailable'],[504,'timed out']])('HTTP %s uses an explicit reason', (code,reason)=>{
    expect(requestErrorMessage('request failed',code)).toContain(reason);
  });
  it('The word timeout in a body never reads a 500 as a timeout',()=>{
    expect(requestErrorMessage('Traceback: httpx.ReadTimeout raised in handler (timeout=30)',500))
      .toBe('The Peach service failed to handle the request. Try again; if it keeps failing, check the tray logs.');
    expect(requestErrorMessage('read timed out')).toContain('Waiting for the service response timed out; check the connection and retry.');
  });
  it('A 502 from the local API speaks about the Peach service and never mentions a proxy',()=>{
    const text=requestErrorMessage('Bad Gateway',502);
    expect(text).toContain('Peach service');
    expect(text).not.toContain('Proxy');
  });
  it('Keep the explicit server side Chinese reason',()=>{
    expect(requestErrorMessage('The current state does not allow this action; refresh and try again.',409)).toBe('The media drive is not mounted; connect it first.');
  });
});
describe('Persistent note control',()=>{
  it('The config skeleton title and cards share the real page grid and body bottom bar',()=>{
    const host=document.createElement('div');host.innerHTML=configurationSkeletonHtml();
    const page=host.querySelector('.ui-configpage')!;
    expect(page.querySelectorAll(':scope > .ui-configgroup')).toHaveLength(5);
    expect(page.querySelectorAll(':scope > .configfieldset')).toHaveLength(12);
    for(const card of page.querySelectorAll('.configfieldset')){
      expect(card.querySelector(':scope > .geist-fieldset-content')).not.toBeNull();
      expect(card.querySelector(':scope > .geist-fieldset-footer')).not.toBeNull();
    }
    expect(host.children).toHaveLength(1);
  });
  it.each([[79,'normal'],[80,'warning'],[94,'warning'],[95,'error']])('Capacity %s uses a consistent threshold', (value,level)=>{
    const host=document.createElement('div');host.innerHTML=gaugeHtml('Space usage',value,100,{usage:true});
    expect(host.querySelector('.ui-geist-gauge')?.getAttribute('data-level')).toBe(level);
    expect(gaugeHtml('Completion rate',value,100)).toContain('data-level="normal"');
  });
  it('The failure note contains a secondary-styled inner action button',()=>{
    const host=document.createElement('div');host.innerHTML=noteHtml('Sources offline',{variant:'error',filled:true,actionLabel:'Retry now'});
    const buttons=host.querySelectorAll('[role=alert] button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.classList.contains('primary')).toBe(false);
  });
  it('Capacity ratios and task counts use real limits, and unknown capacity never displays as zero',()=>{
    const host=document.createElement('div');host.innerHTML=gaugeHtml('Usage rate',25,50);
    expect(host.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(gaugeHtml('Usage rate',0,0)).toContain('<span>Usage rate: not obtained</span>');
    host.innerHTML=progressHtml('Analysis records',3,10,{stops:[{value:5,label:'Analysis finished'}],variant:'warning'});
    expect(host.querySelector('[role=progressbar]')?.getAttribute('aria-valuemax')).toBe('10');
    expect(host.querySelector('[aria-label="Analysis finished"]')).not.toBeNull();
  });
  it('Note errors never print raw English network exceptions',()=>{
    const host=document.createElement('div');host.innerHTML=noteHtml('Failed to fetch',{variant:'error',size:'small',filled:true});
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not reach Peach');
    expect(host.querySelector('.geist-note-small.geist-note-filled')).not.toBeNull();
    expect(host.querySelector('button')).toBeNull();
  });
  it('The project banner carries the processing entry and has no close key',()=>{
    const host=document.createElement('div');host.innerHTML=projectBannerHtml('Scan unfinished',{variant:'warning',href:'/data-cleanup',label:'View and handle'});
    expect(host.querySelector('.ui-project-banner-warning')).not.toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/data-cleanup');
    expect(host.querySelector('button')).toBeNull();
  });
});
