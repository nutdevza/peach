/* UI sounds: a soft blip each for buttons, switches, menus, overlays and action receipts.
 *
 * All sounds are synthesized on the spot by Web Audio, no audio files and no extra network request. The recipes come from
 * dannyjpwilliams/ui-sound-design-skill's `references/sound-recipes.md` (MIT): click is band-passed noise, switch a sine
 * sweep, success an ascending major third, error a darkened descending sawtooth, warning two short mid-frequency pulses,
 * menu filtered noise sweeping past, and overlay a sine with a sudden pitch drop. Volume is tuned to near the recipes'
 * stated floor by this library's own yardstick: they fire hundreds of times a day and must stay in the background.
 *
 * One AudioContext site-wide, created only when the first sound actually needs to play: browsers refuse sound before a user
 * gesture, creating it on page load gets it suspended and costs an extra system audio channel. The switch state is decided by
 * Application's `appSettings.uiSounds`, fed in through `setUiSoundsEnabled`; when off, this module never touches the
 * AudioContext at all.
 *
 * Ships with the main bundle and is imported from shared source: the switch state must have one copy, so the panel that opens
 * and the menu that toggles sound the same. */

type Recipe = (ctx: AudioContext, now: number) => void;

let audioContext:AudioContext|null=null;
let enabled=false;

/* Singleton: `exponentialRampToValueAtTime` cannot land on 0, so finishes always use 0.001, inaudible but legal.
   Each recipe reads `currentTime` once at the start and derives everything from it; reading again mid-way schedules nodes into the past. */
function context(){
  const Context=globalThis.AudioContext||(globalThis as typeof globalThis & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if(!Context)return null;
  if(!audioContext)audioContext=new Context();
  /* resume gets rejected without a user gesture: that sound was never supposed to play anyway, so swallow it instead of leaving an unhandled rejection in the console. */
  if(audioContext.state==='suspended')audioContext.resume()?.catch?.(()=>{});
  return audioContext;
}

interface ToneOptions {
  type?: OscillatorType; from: number; to?: number; duration: number; volume: number; attack?: number; start?: number;
  filter?: {type: BiquadFilterType; frequency: number; Q?: number} | null;
}
function tone(ctx:AudioContext,now:number,{type='sine',from,to=from,duration,volume,attack=0,start=0,filter=null}:ToneOptions){
  const at=now+start;
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(from,at);
  if(to!==from)osc.frequency.exponentialRampToValueAtTime(to,at+duration);
  if(attack){
    gain.gain.setValueAtTime(0.001,at);
    gain.gain.exponentialRampToValueAtTime(volume,at+attack);
  }else gain.gain.setValueAtTime(volume,at);
  gain.gain.exponentialRampToValueAtTime(0.001,at+duration);
  let tail:AudioNode=osc;
  if(filter){
    const shape=ctx.createBiquadFilter();
    shape.type=filter.type;
    shape.frequency.value=filter.frequency;
    shape.Q.value=filter.Q??1;
    osc.connect(shape);tail=shape;
  }
  tail.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at+duration+0.01);
}

interface NoiseOptions {
  duration: number; volume: number; filter: {frequency: number; Q: number}; sweepTo?: number | null; attack?: number;
}
/* The noise source is single-use: each sound builds a fresh buffer, and the whole chain is torn down after playback. An oscillator disconnects
   itself after stop; a BufferSource does not, so the filter and gain nodes would stay hanging on the graph. */
function noise(ctx:AudioContext,now:number,{duration,volume,filter,sweepTo=null,attack=0}:NoiseOptions){
  const length=Math.max(1,Math.round(ctx.sampleRate*duration));
  const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
  const source=ctx.createBufferSource();
  source.buffer=buffer;
  const shape=ctx.createBiquadFilter();
  shape.type='bandpass';
  shape.Q.value=filter.Q;
  shape.frequency.setValueAtTime(filter.frequency,now);
  if(sweepTo)shape.frequency.exponentialRampToValueAtTime(sweepTo,now+duration);
  const gain=ctx.createGain();
  if(attack){
    gain.gain.setValueAtTime(0.001,now);
    gain.gain.exponentialRampToValueAtTime(volume,now+attack);
  }else gain.gain.setValueAtTime(volume,now);
  gain.gain.exponentialRampToValueAtTime(0.001,now+duration);
  source.connect(shape);
  shape.connect(gain);
  gain.connect(ctx.destination);
  source.onended=()=>{source.disconnect();shape.disconnect();gain.disconnect()};
  source.start(now);
}

/** The name maps to a class of action in the UI, not to a specific control; the same class of action announces the same way on every page. */
const RECIPES:Record<string,Recipe>={
  /* Soft click: the recipe's Soft click variant, pressing the volume one tier lower again. */
  click:(ctx,now)=>noise(ctx,now,{duration:0.06,volume:0.12,filter:{frequency:1200,Q:1}}),
  /* The toggle: up is on, down is off, the recipe's Minimal toggle variant, with matching volume at both ends. */
  'toggle-on':(ctx,now)=>tone(ctx,now,{from:550,to:650,duration:0.08,volume:0.15}),
  'toggle-off':(ctx,now)=>tone(ctx,now,{from:650,to:550,duration:0.08,volume:0.15}),
  /* Success: start at C5 and rise a major third, with 80ms between the two notes. */
  success:(ctx,now)=>{
    tone(ctx,now,{from:523,duration:0.12,volume:0.18});
    tone(ctx,now,{from:523*1.25,duration:0.12,volume:0.18,start:0.2});
  },
  /* Warning: two short mid-frequency triangle-wave pulses; it means "pay attention", without the negativity of an error. */
  warning:(ctx,now)=>{
    tone(ctx,now,{type:'triangle',from:600,duration:0.08,volume:0.15});
    tone(ctx,now,{type:'triangle',from:600,duration:0.08,volume:0.15,start:0.16});
  },
  /* Error: a sawtooth darkened through a lowpass sweeps down, with the recipe's default parameters taken at the volume floor. */
  error:(ctx,now)=>tone(ctx,now,{type:'sawtooth',from:400,to:200,duration:0.25,volume:0.15,
    filter:{type:'lowpass',frequency:1500,Q:1}}),
  /* Menu and panel entrance: the recipe's Quick swipe variant. */
  whoosh:(ctx,now)=>noise(ctx,now,{duration:0.12,volume:0.08,attack:0.036,
    filter:{frequency:1000,Q:1},sweepTo:6000}),
  /* Popover entrance: the recipe's Light tap variant. */
  pop:(ctx,now)=>tone(ctx,now,{from:1500,to:500,duration:0.04,volume:0.15}),
};

export const UI_SOUNDS=Object.freeze(Object.keys(RECIPES));

export function setUiSoundsEnabled(on:unknown):void{enabled=on===true}
export function uiSoundsEnabled():boolean{return enabled}

/** Play one sound; when muted or the browser has no Web Audio, do nothing and return false. Throws for an unknown sound. */
export function playUiSound(name:string):boolean{
  const recipe=RECIPES[name];
  if(!recipe)throw new Error(`There is no "${name}" interface sound`);
  if(!enabled)return false;
  const ctx=context();
  if(!ctx)return false;
  recipe(ctx,ctx.currentTime);
  return true;
}

/* Interactive controls are recognized by role, not class name: buttons in the React subtree and the old shell's buttons look different but are both
   `button`. Switches go through change, not click: one click should fire once, and what fires depends on the post-click on/off state.
   Disabled ones (`disabled`, `aria-disabled`) do not fire; nothing happened to them. */
const CLICKABLE='button,[role="button"],[role="tab"],[role="menuitem"],[role="menuitemradio"],'
  +'[role="menuitemcheckbox"],[role="option"],summary,a[href]';
const SWITCH='input[type="checkbox"][role="switch"]';

function inert(control:Element){
  return (control as HTMLButtonElement).disabled===true||control.getAttribute('aria-disabled')==='true';
}

/** Attached to document: it uses the capture phase, so no page's `stopPropagation` within its own layer can stop this event. */
const soundRoots=new WeakSet<Document|Element>();
export function wireUiSounds(root:Document|Element=document):void{
  if(soundRoots.has(root))return;
  soundRoots.add(root);
  root.addEventListener('click',event=>{
    const control=(event.target as Element|null)?.closest?.(CLICKABLE);
    if(!control||inert(control))return;
    playUiSound('click');
  },{capture:true});
  root.addEventListener('change',event=>{
    const control=event.target as HTMLInputElement|null;
    if(!control?.matches?.(SWITCH)||inert(control))return;
    playUiSound(control.checked?'toggle-on':'toggle-off');
  },{capture:true});
}
