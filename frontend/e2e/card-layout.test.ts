import assert from 'node:assert/strict';
import {after,before,describe,it} from 'node:test';
import type {Browser,Page} from 'playwright-core';
import {launch,requiredEnv,settle,VIEWPORTS} from './harness.ts';
import {ITEM,openItemPage} from './item-fixture.ts';

const FRAMES='#grid [data-media-grid] > [data-media-card] [data-media-pic], #grid [data-mix-cover]';

/** A video whose home tab lays out 20 blank white preview images; `size` is the home layout, and `patch` changes a few of them by index. */
async function openHome(page:Page,size:string,patch:(i:number)=>Record<string,unknown>=()=>({})){
 await page.addInitScript(size=>localStorage.setItem('peach.settings.v1',JSON.stringify({detailAutoplay:false,homeLayout:size})),size);
 await page.route('**/api/items?*',route=>route.fulfill({json:{items:Array.from({length:20},(_,i)=>({
  id:91000+i,name:`Sample video ${i}`,creator:'Example creator',is_jav:i%2===0,has_thumb:true,has_cover:false,
  width:1600,height:900,location:'local',duration:120,...patch(i),
 })),total:20,has_more:false}}));
 await page.route('**/poster?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="white"/></svg>'}));
 await page.goto(requiredEnv('PEACH_E2E_ORIGIN')+'/',{waitUntil:'load'});
 await page.locator('#grid [data-mix-card]').waitFor();
}

/** The darkest channel value of a block in the screenshot, decoded from the PNG with the page's own canvas. */
async function darkest(page:Page,clip:{x:number,y:number,width:number,height:number}){
 const png=(await page.screenshot({clip})).toString('base64');
 return page.evaluate(async png=>{
  const img=new Image();
  img.src=`data:image/png;base64,${png}`;
  await img.decode();
  const canvas=document.createElement('canvas');
  canvas.width=img.width;canvas.height=img.height;
  const context=canvas.getContext('2d')!;
  context.drawImage(img,0,0);
  const data=context.getImageData(0,0,canvas.width,canvas.height).data;
  let min=255;
  for(let i=0;i<data.length;i+=4)min=Math.min(min,data[i],data[i+1],data[i+2]);
  return min;
 },png);
}

describe('Media frame for mixed-layout videos',()=>{
 let browser:Browser;
 before(async()=>{browser=await launch()});
 after(async()=>{await browser?.close()});
 for(const viewport of [...VIEWPORTS,{name:'compact',width:320,height:844,mobile:true}]){
  it(`${viewport.name} multi-column equal heights, single column natural height; byline and date stay inside the line box`,async()=>{
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:'reduce'});
   try{
    const page=await context.newPage();
    await openHome(page,'small',i=>({
     name:i%2?'PCH-021 coastal travel photo record: departing at dawn, the full route through mountain trails to the sea':'PCH-001 Seaside',
     is_jav:true,creator:'',performers:i%2?['青川遥','夏目明里','竹内里奈','水野葵','森田优'] :['青川遥'],performer_total:i%2?21:1,
     release_date:i%3?'2026-10-20':'',size:i%2?5*1024**4:0,play_count:1284,
     tags:i%2?['Travel records','Natural scenery','An early-morning coastline and the mountain trails along it']:[],
    }));
    await settle(page);
    for(const density of ['roomy','dense']){
     await page.evaluate(value=>{document.body.dataset.density=value},density);
     await page.waitForFunction(()=>[...document.querySelectorAll('[data-media-grid]')].every(grid=>
      grid.hasAttribute('data-single-column')===(getComputedStyle(grid).gridTemplateColumns.split(' ').length===1)));
     const shown=await page.locator('#grid [data-media-grid] > [data-media-card]').evaluateAll(nodes=>nodes.slice(0,6).map(node=>{
      const line=node.querySelector('[data-media-byline]')!,box=line.getBoundingClientRect(),meta=node.querySelector('[data-media-meta]')!;
      const visible=[...line.children].filter(child=>getComputedStyle(child).display!=='none').map(child=>child.getBoundingClientRect());
      return {height:node.getBoundingClientRect().height,meta:meta.getBoundingClientRect().height,single:node.closest('[data-media-grid]')!.hasAttribute('data-single-column'),
       line:box.height,wrapped:visible.some(child=>child.top<box.top-1||child.bottom>box.bottom+1),
       spill:visible.some(child=>child.right>box.right+1)};
     }));
     assert.ok(shown.length>=2);assert.ok(shown.every(row=>!row.wrapped&&!row.spill),JSON.stringify({density,shown}));
     if(shown[0].single)assert.ok(Math.max(...shown.map(row=>row.meta))-Math.min(...shown.map(row=>row.meta))>8,JSON.stringify(shown));
     else assert.ok(Math.max(...shown.map(row=>row.height))-Math.min(...shown.map(row=>row.height))<1,JSON.stringify(shown));
     assert.equal(await page.locator('[data-media-flags],[data-media-watch-count]').count(),0);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
   }finally{await context.close()}
  });
 }
 // File names for the trash resource card, folder breadcrumb, etc. use the shared middle ellipsis. The page has text-autospace on; kanji, kana and
 // Latin letters and digits add extra spacing at their junctions; measure that into the width, or the result judged as 'fits' actually overflows and the end gets clipped.
 it('A file name mixing Chinese/Japanese with letters and digits, when elided in the middle, keeps its ends intact and does not overflow the box',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  try{
   const page=await context.newPage();
   const name='PCH-031 あ1い2う3え4お5か6き7く8け9こ0さ1し2す3せ4そ5た6ち7つ8て9と0な1に2ぬ3ね4の5.mp4';
   await openHome(page,'small');
   await settle(page);
   const gap=await page.evaluate(()=>{
    const host=document.createElement('div');host.className='peach-react';host.dataset.autospaceHost='';
    const span=document.createElement('span');span.style.cssText='white-space:nowrap;font-size:var(--fs-md)';
    host.append(span);document.body.append(host);
    const width=(text:string)=>{span.textContent=text;return span.getBoundingClientRect().width};
    const value=width('あa')-width('あ')-width('a');span.remove();return value;
   });
   assert.ok(gap>0.5,`The browser didn't add autospace spacing (${gap}px), so the test case can't catch this kind of overflow`);
   await page.evaluate(name=>{
    const host=document.querySelector('[data-autospace-host]')!;
    for(const width of [168,240,333]){
     const box=document.createElement('span');box.dataset.middleTruncate='';box.dataset.autospaceCase='';
     box.style.cssText=`display:block;width:${width}px;overflow:hidden;white-space:nowrap;font-size:var(--fs-md)`;
     box.textContent=name;host.append(box);
    }
   },name);
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-autospace-case]')].every(node=>node.classList.contains('middle-truncated')));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const boxes=await page.locator('[data-autospace-case]').evaluateAll(nodes=>nodes.map(node=>{
    const range=document.createRange();range.selectNodeContents(node);
    return {text:node.textContent||'',scroll:node.scrollWidth,client:node.clientWidth,
     overflow:range.getBoundingClientRect().right-node.getBoundingClientRect().right};
   }));
   for(const box of boxes){
    const shown=JSON.stringify(box);
    assert.ok(box.text.startsWith('PCH-031 ')&&box.text.includes('…')&&box.text.endsWith('5.mp4'),shown);
    assert.ok(box.scroll<=box.client,shown);
    assert.ok(box.overflow<=.5,shown);
   }
  }finally{await context.close()}
 });
 // Watch-later is conveyed by the card's status icon; the card's base color belongs to the media library source color and does not change with watch-later.
 for(const theme of ['light','dark'])it(`${theme} watch-later state icon, button, and undo stay in sync`,async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:800},colorScheme:theme,reducedMotion:'reduce'});
  try{
   const page=await context.newPage();let later=false;
   await page.route('**/api/watch-later',route=>route.fulfill({json:{watch_later:later=!later}}));
   await openHome(page,'small',()=>({watch_later:false}));await settle(page);
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme==='dark')},theme);
   const card=page.locator('#grid [data-media-card]').first(),button=card.locator('[data-later]');
   const background=()=>card.evaluate(node=>getComputedStyle(node).backgroundColor);
   await page.locator('#filterBtn').focus();await page.mouse.move(0,0);const base=await background();
   await card.hover();await button.click();await page.locator('#filterBtn').focus();await page.mouse.move(0,0);
   await page.waitForFunction(()=>document.querySelector('#grid [data-media-card]')?.hasAttribute('data-watch-later'));
   const status=card.locator('[data-media-status] [data-status="later"]');
   assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await status.count(),1);assert.ok(await status.isVisible());assert.equal(await background(),base);
   await page.getByRole('button',{name:'Undo',exact:true}).last().click();await page.locator('#filterBtn').focus();await page.mouse.move(0,0);
   await page.waitForFunction(()=>!document.querySelector('#grid [data-media-card]')?.hasAttribute('data-watch-later'));
   assert.equal(await button.getAttribute('aria-pressed'),'false');assert.equal(await status.count(),0);assert.equal(await background(),base);
  }finally{await context.close()}
 });
 for(const viewport of VIEWPORTS)it(`${viewport.name} gives the Continue watching reason two full lines and can open the full text`,async()=>{
  const opened=await openItemPage(browser,`/assets/${ITEM.plain}`,viewport);
  try{
   const page=opened.page,reason='Same performer · similar tags · same label · same series';
   await page.route(url=>url.pathname==='/api/related',route=>route.fulfill({json:{items:[14,15].map((id,index)=>({
    id,name:index?'PCH-015 Complete chapters of a coastal travel photo journal':'PCH-014 Seaside',creator:'Travel photography creator',location:'local',has_thumb:true,
    size:4096,duration:120,why:reason,tags:[],
   }))}}));
   await page.reload({waitUntil:'load'});await page.locator('[data-media-next-reason]').first().waitFor();await settle(page);
   const rows=await page.locator('[data-media-next-row] [data-media-card]').evaluateAll(nodes=>nodes.map(node=>({
    height:node.getBoundingClientRect().height,why:node.querySelector('[data-media-next-reason]')!.getBoundingClientRect().top,
    byline:node.querySelector('[data-media-byline]')!.getBoundingClientRect().bottom,
   })));
   assert.ok(rows.every(row=>row.why>=row.byline));assert.ok(Math.abs(rows[0].height-rows[1].height)<1);
   const url=page.url();await page.locator('[data-media-next-reason]').first().click();
   const popup=page.getByRole('dialog',{name:'Recommendation reason',exact:true});await popup.waitFor();
   assert.equal((await popup.innerText()).trim(),reason);assert.equal(page.url(),url);
   assert.ok(await popup.evaluate(node=>{
    const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
    return !!hit&&(node===hit||node.contains(hit));
   }),'The recommendation reason overlay is visible and clickable');
   await popup.click();assert.equal(page.url(),url);await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'});
  }finally{await opened.close()}
 });
 for(const viewport of VIEWPORTS)for(const size of ['big','small']){
  it(`${viewport.name} ${size} videos match the Mix in height and keep landscape images`,async()=>{
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
   try{
    const page=await context.newPage();
    await openHome(page,size);
    const frames=await page.locator(FRAMES).evaluateAll(nodes=>nodes.map(node=>{
     const box=node.getBoundingClientRect(),img=node.querySelector('img')!;
     return {ratio:box.width/box.height,fit:getComputedStyle(img).objectFit,background:getComputedStyle(img).backgroundColor};
    }));
    assert.ok(frames.length>=20);
    for(const frame of frames){
     assert.ok(Math.abs(frame.ratio-(size==='big'?3/4:16/9))<.01,JSON.stringify(frame));
     assert.equal(frame.fit,'contain');
     assert.equal(frame.background,'rgb(0, 0, 0)');
    }
    if(viewport.mobile)for(const density of ['roomy','dense']){
     await page.evaluate(value=>{document.body.dataset.density=value},density);
     const meta=await page.locator('#grid [data-media-card] [data-media-meta]').first().evaluate(node=>{
      const box=node.getBoundingClientRect();
      const content=Math.max(...[...node.children].map(child=>child.getBoundingClientRect().height));
      return {height:box.height,content};
     });
     assert.ok(meta.height<=meta.content+17,JSON.stringify({density,...meta}));
    }
    if(size==='small')for(const density of ['roomy','dense']){
     await page.evaluate(value=>{document.body.dataset.density=value},density);
     const row=await page.locator('#grid [data-mix-card]').evaluate(mix=>{
      const mixCover=mix.querySelector('[data-mix-cover]')!.getBoundingClientRect();
      const peer=mix.parentElement!.querySelector(':scope > [data-media-card]')!;
      const peerCover=peer.querySelector('[data-media-pic]')!.getBoundingClientRect();
      return {mixBottom:mixCover.bottom-mix.getBoundingClientRect().top,peerBottom:peerCover.bottom-peer.getBoundingClientRect().top,
       mixTop:mixCover.top-mix.getBoundingClientRect().top,peerTop:peerCover.top-peer.getBoundingClientRect().top};
     });
     assert.ok(Math.abs(row.mixBottom-row.peerBottom)<1,JSON.stringify(row));
     assert.ok(Math.abs(row.mixTop-row.peerTop)<1,JSON.stringify(row));
    }
   }finally{await context.close()}
  });
 }
 /* A white image filling a 16:9 cell on a light page: the corners' antialiasing should only transition between white image and light page. If the black backing inside the cell
  * were clipped per layer by radius, the corners would pick up gray-black dots at 150-190. Per corner only a 6px square hugging the corner is measured; the arc's midpoint lies inside it, and badges sit farther from the edge. */
 for(const scale of [1,2]){
  it(`On light pages the white cover has four rounded corners that do not leak black (${scale}x pixels)`,async()=>{
   const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:scale,colorScheme:'light'});
   try{
    const page=await context.newPage();
    await openHome(page,'small');
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark')});
    const corners=[];
    for(const frame of ['#grid [data-media-grid] > [data-media-card] [data-media-pic]','#grid [data-mix-cover]']){
     // This cell scrolls to just below the sticky top bar and sort bar while waiting for its image; the point just inside the corner must land on this card itself, with nothing else covering it.
     const box=await page.locator(frame).first().evaluate(async node=>{
      scrollBy(0,node.getBoundingClientRect().top-240);
      const img=node.querySelector('img')!;
      if(!img.complete)await new Promise(done=>img.addEventListener('load',done,{once:true}));
      await new Promise(requestAnimationFrame);
      const box=node.getBoundingClientRect(),card=node.closest('[data-media-card],[data-mix-card]');
      const covers=[[box.left+8,box.top+8],[box.right-8,box.top+8],[box.left+8,box.bottom-8],[box.right-8,box.bottom-8]]
       .map(([x,y])=>document.elementFromPoint(x,y)).filter(hit=>!hit||!card?.contains(hit))
       .map(hit=>hit?`${hit.tagName} ${[...hit.attributes].map(a=>a.name).join(' ')}`:'Outside viewport');
      return {...box.toJSON(),covers};
     });
     assert.ok(!box.covers.length&&box.bottom<=800,`${frame} corners are not exposed: ${JSON.stringify(box)}`);
     await page.mouse.move(0,0);
     for(const [x,y] of [[box.left,box.top],[box.right-6,box.top],[box.left,box.bottom-6],[box.right-6,box.bottom-6]]){
      corners.push({frame,x:Math.round(x),y:Math.round(y),min:await darkest(page,{x,y,width:6,height:6})});
     }
    }
    // HiDPI pixel alignment and antialiasing allow light gray edges; the gray-to-black bleed range 150-190 must fail.
    const dark=corners.filter(corner=>corner.min<230);
    assert.deepEqual(dark,[],`${corners.length} corners were sampled and ${dark.length} show black bleeding through`);
   }finally{await context.close()}
  });
  /* Portrait cells are always 9:16, but the nine-grid's cropped posters are 480x850 (slightly wider) or 480x876 (slightly taller). Fit with contain and
   * the short axis leaves anywhere from under a pixel to a few pixels of black backing, present or not depending on the fractional landing point. Measure the middle of all four edges against the white image on the light page.
   * At default large-image density, 1280 wide fits two columns, each cell 470x836; center the target cell before the screenshot, leaving all four edges fully visible. */
  it(`Portrait video posters fill fully with no black edges on any side (${scale}x pixels)`,async()=>{
   const viewport={width:1280,height:1200};
   const context=await browser.newContext({viewport,deviceScaleFactor:scale,colorScheme:'light'});
   try{
    const page=await context.newPage();
    await page.addInitScript(()=>localStorage.setItem('peach.settings.v1',JSON.stringify({detailAutoplay:false})));
    await page.route('**/api/items?*',route=>route.fulfill({json:{items:Array.from({length:6},(_,i)=>({
     id:92000+i,name:`Portrait sample ${i}`,creator:'Example creator',is_jav:false,has_thumb:true,has_cover:false,
     width:1080,height:1920,location:'local',duration:120,
    })),total:6,has_more:false}}));
    await page.route('**/poster?*',route=>{
     const tall=Number(new URL(route.request().url()).searchParams.get('id'))%2===1;
     const [w,h]=tall?[480,876]:[480,850];
     return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/></svg>`});
    });
    await page.goto(requiredEnv('PEACH_E2E_ORIGIN')+'/?orient='+encodeURIComponent('Portrait'),{waitUntil:'load'});
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark')});
    const frames=page.locator('#grid [data-media-pic][data-pic-portrait]');
    await frames.first().waitFor();
    const edges=[];
    for(const index of [0,1]){
     const box=await frames.nth(index).evaluate(async node=>{
      const img=node.querySelector('img')!;
      if(!img.complete)await new Promise(done=>img.addEventListener('load',done,{once:true}));
      // Every pixel along the whole edge takes part in the check, so scroll the target frame into the viewport before reading screenshot coordinates.
      node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      await new Promise(requestAnimationFrame);
      return node.getBoundingClientRect().toJSON();
     });
     await page.mouse.move(0,0);
     assert.ok(box.width>40&&box.height>80&&box.top>=0&&box.bottom<=viewport.height,`Cell ${index+1} is outside the screenshot bounds: ${JSON.stringify(box)}`);
     for(const [side,clip] of Object.entries({
      top:{x:box.left+20,y:box.top,width:box.width-40,height:2},
      bottom:{x:box.left+20,y:box.bottom-2,width:box.width-40,height:2},
      left:{x:box.left,y:box.top+40,width:2,height:box.height-80},
      right:{x:box.right-2,y:box.top+40,width:2,height:box.height-80},
     }))edges.push({index,side,min:await darkest(page,clip)});
    }
    const dark=edges.filter(edge=>edge.min<230);
    assert.deepEqual(dark,[],`Black backing shows around the portrait cell edges: ${JSON.stringify(edges)}`);
   }finally{await context.close()}
  });
 }
 /* The large-image tier cell is 336px wide, wider than a 320px phone screen: the grid's minimum column width has to yield to the viewport so the whole card stays on screen. */
 for(const size of ['big','small']){
  it(`At 320 wide the ${size} layout's card grid never leaves the viewport`,async()=>{
   const context=await browser.newContext({viewport:{width:320,height:640}});
   try{
    const page=await context.newPage();
    await openHome(page,size);
    const box=await page.locator('#grid [data-media-grid]').first().evaluate(node=>({
     right:Math.round(node.getBoundingClientRect().right),
     card:Math.round(node.querySelector('[data-media-card]')!.getBoundingClientRect().right),
     page:document.documentElement.scrollWidth,
     view:document.documentElement.clientWidth,
     overflow:[...document.querySelectorAll('body *')].filter(element=>{
      const rect=element.getBoundingClientRect();
      if(rect.right<=document.documentElement.clientWidth||rect.width===0)return false;
      return true;
     }).slice(0,30).map(element=>({tag:element.tagName,attrs:[...element.attributes].map(a=>`${a.name}=${a.value}`).join(' '),right:Math.round(element.getBoundingClientRect().right)})),
    }));
    assert.ok(box.right<=box.view&&box.card<=box.view&&box.page<=box.view,JSON.stringify(box));
   }finally{await context.close()}
  });
 }
 it('In multi-select the check circle does not cover volume badges; with three edition badges on a code the whole group stays inside the title box',async()=>{
  const context=await browser.newContext({viewport:{width:320,height:720}});
  try{
   const page=await context.newPage();
   await openHome(page,'small',i=>i===0?{
    name:'FC2-PPV-4728193 夏の終わり',code:'FC2-PPV-4728193',display_title:'夏の終わり',edition_badges:['Chinese subs','Uncensored','Uncensored'],
    part_group:{key:'p',seed_id:91000,count:128},
   }:{});
   const first=page.locator('#grid [data-media-grid] > [data-media-card]').first();
   await first.click({modifiers:['Control']});
   await first.locator('[data-media-check]').waitFor();
   const box=await first.evaluate(card=>{
    const rect=(selector:string)=>card.querySelector(selector)!.getBoundingClientRect();
    const title=rect('[data-media-title]');
    return {
     group:rect('[data-media-group]').right,check:rect('[data-media-check]').left,
     count:card.querySelectorAll('[data-media-title] .javedition').length,title:title.right,badges:Math.max(...[...card.querySelectorAll('[data-media-title] .javedition')].map(node=>node.getBoundingClientRect().right)),
    };
   });
   assert.equal(box.count,3);
   assert.ok(box.group<=box.check,`The selection circle covers the volume badge: ${JSON.stringify(box)}`);
   assert.ok(box.badges<=box.title+0.5,`Edition badges leave the title box: ${JSON.stringify(box)}`);
  }finally{await context.close()}
 });
 for(const width of [1280,760,390,320])for(const pictures of ['none','all','mixed'])it(`At ${width} wide, co-star avatars ${pictures} stack tightly in the placeholder and expand above the text`,async()=>{
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  try{
   const page=await context.newPage();
   const names=['七海ひな','桜井まい','白石りん','水瀬ゆい','藤原あや','J','K','L','M','N','O','P'];
   await page.route('**/entity-image?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="white"/></svg>'}));
   await openHome(page,'small',()=>({creator:'',performers:names,performer_total:12,
    performer_entities:names.map((_,index)=>({id:index+1,has_image:pictures==='all'||pictures==='mixed'&&index%2===0})),
   }));
   const short=page.locator('[data-media-card][data-variant="short"]').first();
   await short.waitFor();
   /* Hit testing only accepts points in the viewport and not covered by the sticky bar: scroll the avatar row instantly to the viewport middle first, and measure after the scroll settles. */
   const measure=async(card:Element)=>{
    card.querySelector('[data-media-avatars]')!.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    for(let frame=0;frame<2;frame+=1)await new Promise(requestAnimationFrame);
    const avatars=[...card.querySelectorAll('[data-media-avatars] > [data-media-avatar]')]
     .filter(node=>getComputedStyle(node).display!=='none');
    const group=card.querySelector('[data-media-avatars]')!.getBoundingClientRect(),text=card.querySelector('[data-media-text]')!.getBoundingClientRect();
    return {shown:avatars.length,group:group.width,text:text.width,card:card.getBoundingClientRect().width,
     spread:avatars.at(-1)!.getBoundingClientRect().left-avatars[0]!.getBoundingClientRect().left,
     spilled:avatars.some(node=>node.getBoundingClientRect().right>group.right+1),overlap:group.right>text.left+1,
     outsideCard:avatars.some(node=>node.getBoundingClientRect().right>card.getBoundingClientRect().right+1)};
   };
   const gridCard=page.locator('#grid [data-media-grid] > [data-media-card]').first();
   const grid=await gridCard.evaluate(measure);
   const portrait=await short.evaluate(measure);
   for(const row of [grid,portrait]){
    assert.ok(row.shown>=1&&row.shown<=5,JSON.stringify(row));
    assert.ok(row.group<=Math.min(109,Math.max(45,row.card*.3))+1,JSON.stringify(row));
    assert.ok(row.text>=row.card*.55&&!row.spilled&&!row.overlap,JSON.stringify(row));
   }
   assert.ok(grid.text>=grid.card*.65,JSON.stringify(grid));
   assert.equal(grid.shown,5);assert.equal(portrait.shown,2);
   await gridCard.evaluate(measure);await gridCard.locator('[data-media-avatars]').hover();
   const expanded=await gridCard.evaluate(measure);
   assert.ok(expanded.spread>grid.spread&&!expanded.outsideCard,JSON.stringify({grid,expanded}));
   assert.ok(Math.abs(expanded.group-grid.group)<1&&Math.abs(expanded.text-grid.text)<1,JSON.stringify({grid,expanded}));
   await page.mouse.move(0,0);await page.keyboard.press('Tab');
   const avatars=gridCard.locator('[data-media-avatars] > [data-media-avatar]:visible');
   for(const index of [0,await avatars.count()-1]){
    const avatar=avatars.nth(index);await avatar.focus();
    assert.ok(await avatar.evaluate(async node=>{
     await new Promise(requestAnimationFrame);
     const box=node.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
     return hit?.closest('[data-media-avatar]')===node;
    }),'The focused stacked avatar shows fully and stays operable');
   }
  }finally{await context.close()}
 });
 it('Shift-selecting several cards does not turn the text in between into a selection',async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  try{
   const page=await context.newPage();
   await openHome(page,'big');
   const titles=page.locator('#grid [data-media-grid] > [data-media-card] [data-media-title]');
   await titles.nth(0).click({modifiers:['Control']});
   assert.equal(await titles.nth(0).evaluate(node=>getComputedStyle(node.closest('[data-media-card]')!).userSelect),'none');
   /* Beyond multi-select's `user-select: none`, the Shift keydown itself must not start a selection: remove the former and click again, verifying each separately. */
   await page.addStyleTag({content:'.peach-react [data-media-card]{user-select:text !important}'});
   await titles.nth(3).click({modifiers:['Shift']});
   await page.locator('#grid [data-media-card][data-selected]').nth(3).waitFor();
   assert.equal(await page.evaluate(()=>String(getSelection())),'');
  }finally{await context.close()}
 });
});
