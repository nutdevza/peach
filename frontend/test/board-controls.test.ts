import { describe,it,expect } from 'vitest';
import { syncBoardRange, wireBoardSegments, wireBoardTabs } from '../src/board-controls';

describe('The range control',()=>{
  it('The view switch keeps native radios and rewiring creates only one thumb',()=>{
    document.body.innerHTML='<div class="iconswitch"><label><input type="radio" name="view" value="large" checked>Large</label><label><input type="radio" name="view" value="small">Small</label></div>';
    wireBoardSegments(document);wireBoardSegments(document);
    expect(document.querySelectorAll('.board-segment-thumb')).toHaveLength(1);
    const inputs=[...document.querySelectorAll<HTMLInputElement>('input')];
    inputs[1]!.click();
    expect(inputs[0]!.checked).toBe(false);expect(inputs[1]!.checked).toBe(true);
    expect(document.querySelector('.board-segment-thumb')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('The evidence switch on the taste page is also a segmented control and gets the same thumb',()=>{
    document.body.innerHTML='<div class="insightswitch" role="radiogroup"><label><input type="radio" name="e" value="browser" checked><span>Browser history</span></label><label><input type="radio" name="e" value="peach"><span>Peach itself</span></label></div>';
    wireBoardSegments(document);wireBoardSegments(document);
    expect(document.querySelectorAll('.insightswitch .board-segment-thumb')).toHaveLength(1);
    expect(document.querySelector('.insightswitch')?.getAttribute('data-board-segments')).toBe('true');
  });
  it('In-page underline navigation gets a sliding indicator; review and configuration categories use pills',()=>{
    document.body.innerHTML='<div class="reviewtabs" role="tablist"><button role="tab" aria-selected="true">Metadata fields</button><button role="tab" aria-selected="false">Label logo</button></div><nav class="ui-board-local-nav" aria-label="Configuration sections"><button aria-pressed="true">Appearance</button></nav>';
    const config=document.createElement('div');config.className='ui-board-local-nav';config.dataset.sectionNav='';
    document.body.append(config);
    wireBoardTabs(document);wireBoardTabs(document);
    expect([...document.querySelectorAll('[data-board-tabs]')].map(group=>group.getAttribute('aria-label'))).toEqual(['Configuration sections']);
  });
  it('The range input converts the current value into a track percentage written into the style variable',()=>{
    document.body.innerHTML='<input type="range" min="0" max="180" value="45">';
    const input=document.querySelector('input')!;syncBoardRange(input);
    expect(input.style.getPropertyValue('--board-range-value')).toBe('25%');
    input.value='180';syncBoardRange(input);
    expect(input.style.getPropertyValue('--board-range-value')).toBe('100%');
  });
});
