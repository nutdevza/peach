import {afterEach,expect,it,vi} from 'vitest';
import {exportProcessingIssues} from '../../src/react/library-processing/issue-export';

afterEach(()=>vi.unstubAllGlobals());

it('Full export walks every page past 200 entries and pins the record version',async()=>{
  const rows=Array.from({length:451},(_,asset_id)=>({asset_id,message:`Issue ${asset_id}`}));
  const calls:URLSearchParams[]=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string)=>{
    const params=new URL(path,'https://peach.invalid').searchParams;
    calls.push(params);
    const offset=Number(params.get('offset'));
    return {ok:true,json:async()=>({job_id:'one',revision:'fixed',offset,total:451,rows:rows.slice(offset,offset+200)})};
  }));
  const result=JSON.parse(await exportProcessingIssues({status:'failed',job_id:'one'},new AbortController().signal));
  expect(result.rows).toEqual(rows);
  expect(calls.map(params=>params.get('offset'))).toEqual(['0','200','400']);
  expect(calls[1].get('revision')).toBe('fixed');
});

it('Mixed exports are refused when a task resumes or the total changes',async()=>{
  let calls=0;
  vi.stubGlobal('fetch',vi.fn(async()=>{
    calls++;
    return {ok:true,json:async()=>({job_id:'one',revision:calls===1?'first':'changed',offset:(calls-1)*200,
      total:201,rows:Array.from({length:calls===1?200:1},()=>({asset_id:1,message:'Issues'}))})};
  }));
  await expect(exportProcessingIssues({status:'failed',job_id:'one'},new AbortController().signal))
    .rejects.toThrow('Issue records have changed');
});

it('Canceled pagination or missing rows never return partial content',async()=>{
  const controller=new AbortController();
  vi.stubGlobal('fetch',vi.fn(async()=>{
    controller.abort();
    return {ok:true,json:async()=>({job_id:'one',revision:'fixed',offset:0,total:1,rows:[{asset_id:1,message:'Issues'}]})};
  }));
  await expect(exportProcessingIssues({status:'failed',job_id:'one'},controller.signal)).rejects.toThrow();
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({job_id:'one',revision:'fixed',offset:0,total:2,
    rows:[{asset_id:1,message:'Issues'}]})})));
  await expect(exportProcessingIssues({status:'failed',job_id:'one'},new AbortController().signal))
    .rejects.toThrow('Incomplete');
});
