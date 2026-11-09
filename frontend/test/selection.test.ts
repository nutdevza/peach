import { expect, it } from 'vitest';
import { selectRange, selectGroup, selectionSummary, syncSelectionToolbar } from '../src/selection';

it('Multi-select follows display order; clearing one group keeps the other groups\' selections', () => {
  const selected=new Set([9]),order=[4,2,7,1];
  const anchor=selectRange(selected,order,null,2,false);
  selectRange(selected,order,anchor,1,true);
  expect([...selected]).toEqual([9,2,7,1]);
  selectGroup(selected,[2,7],false);expect([...selected]).toEqual([9,1]);
  expect(selectionSummary(selected,order)).toEqual({count:1,all:false,mixed:true});
  selectRange(selected,order,7,1,false,false);expect([...selected]).toEqual([9]);
});
it('An empty list has no select-all state; the toolbar follows only the current range and business lock', () => {
  const selected=new Set([1]),all=document.createElement('input'),action=document.createElement('button');
  expect(selectionSummary(selected,[])).toEqual({count:0,all:false,mixed:false});
  syncSelectionToolbar({all,label:'',summary:selectionSummary(selected,[1,2]),actions:[action]});
  expect(all.indeterminate).toBe(true);expect(action.disabled).toBe(false);
  syncSelectionToolbar({all,label:'',summary:selectionSummary(selected,[1]),actions:[action],locked:true});
  expect(all.checked).toBe(true);expect(all.indeterminate).toBe(false);expect(action.disabled).toBe(true);
});
