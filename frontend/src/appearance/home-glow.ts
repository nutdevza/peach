/* The pure data layer of appearance color: glow parameters, presets, named palette, accent color list and legacy
 * normalization.
 * Current settings and the target element are passed in by glow.ts and settings.ts; paintHomeGlow writes only the target
 * element.
 * @peach/appearance resolves directly to shared source, and the main UI ships one preset table and one normalization
 * implementation.
 * glowNumber and number-setting.ts's boundedPreference both require integers in range, else the default value.
 * Glow is written to a local element to avoid a whole-document style recalc during drags; measurements recorded in
 * web/css/01-base.css. */

export interface GlowSpot { color: string; alpha: number }
/** One glow setting. */
export interface HomeGlow {
  on: boolean; preset: string; strength: number; noise: number; speed: number; soften: number; size: number;
  spot1: GlowSpot; spot2: GlowSpot; spot3: GlowSpot;
}
type SpotKey = 'spot1' | 'spot2' | 'spot3';
type GlowPalette = Pick<HomeGlow, SpotKey>;
type GlowField = 'strength' | 'noise' | 'speed' | 'soften' | 'size';

/* One color scheme is the colors and opacities of three glows; the switch, intensity and grain are not part of the scheme and
   do not move when it changes. The ellipse semi-axes and feather position are not here; web/css/01-base.css holds the only
   copy, user-unadjusted and unstored; centers do not exist at all: the three glows are pushed along continuously by the
   glowdrift animations, which are the sidebar glass's own drift.
   This shape is borrowed from feralui.dev/gradients' JSON export (registered in docs/HANDOFF.md), the parameter model only;
   rendering stays those three layers of pure CSS radial gradients, no Canvas.
   Each glow feathers to transparent and lands on the sidebar's glass, so each one must be able to carry its own light: a
   darkened color is invisible on the dark sidebar and a smear on the light one.
   `ash` is the default scheme, matching the :root defaults to the letter.
   Each scheme also carries one matching accent color: changing the scheme changes the whole look, and buttons, focus rings
   and links following along is what makes it one face.
   A single accent pick can override it; that click changes only the accent color and leaves the glow alone. */
const HOME_GLOW_SPOTS:readonly SpotKey[]=['spot1','spot2','spot3'];
const GLOW_SPOT_LABELS:readonly string[]=['Glow 1','Glow 2','Glow 3'];
/* "Glass original color" is each glass pane's own two reflections, colored by the light/dark theme: near-white in dark, one
   blue and one gray in light.
   It does not ride the glow layer: the two blobs, their sizes and paths all live in board.css's `--glass-drift-a/b`, and
   repainting them after the three glows would produce a differently shaped imitation. With this scheme selected, the glow
   layer's intensity computes to 0 and `--glass-tint-*` is not written to the root, so each pane falls back to its own theme
   tier.
   The three kept colors are the model's fill, so "three glows" has legal values under any scheme; this scheme's UI does not
   display them. */
const GLASS_NATIVE_PRESET='native';
/* The default tier sorts first: gray mist with blue. Gray is the glow least tied to a theme, and blue is BoardUI's own accent;
   together they are how this shell looks untouched, with the warm tiers left for the user to pick. */
/** `[key, name, three glows, paired accent color]`. */
const HOME_GLOW_PRESETS:readonly (readonly [key:string,label:string,palette:GlowPalette,accent:string])[]=[
  ['ash','Mist gray',{
    spot1:{color:'#8f98a4',alpha:52},spot2:{color:'#b6bcc4',alpha:38},spot3:{color:'#6f7783',alpha:50}},'blue'],
  ['amber','Filament warmth',{
    spot1:{color:'#e08a2f',alpha:62},spot2:{color:'#c4544a',alpha:52},spot3:{color:'#a86a52',alpha:52}},'amber'],
  ['plum','Night cherry',{
    spot1:{color:'#b455a0',alpha:64},spot2:{color:'#6a4fd0',alpha:54},spot3:{color:'#7a4f96',alpha:56}},'violet'],
  ['pine','Deep forest',{
    spot1:{color:'#3f9e57',alpha:66},spot2:{color:'#7fae4a',alpha:48},spot3:{color:'#4f9463',alpha:56}},'emerald'],
  /* The twelve schemes below take their colors from the twelve chips in feralui.dev/gradients' preset area, recorded per
     scheme in docs/reference-snapshots/feralui-gradients-measured.md. Each has four color stops, and the first is always the
     canvas-filling base (near-white on eleven, near-black on Midnight bloom); Peach has no base layer: the three glows each
     feather to transparent over the page's own surface, so importing that stop is invisible on the dark sidebar and a smear
     on the light one. So the second, third and fourth stops are taken, the ones it actually uses as light blobs. Opacity
     does not follow: that is this glass's own density, and the default scheme's set is used throughout.
     Scheme names are coined by color, not copied from the English names. */
  ['iris','Glass glow',{
    spot1:{color:'#1e50a2',alpha:62},spot2:{color:'#f09199',alpha:52},spot3:{color:'#895b8a',alpha:52}},'indigo'],
  ['opal','Opal',{
    spot1:{color:'#9be0e8',alpha:62},spot2:{color:'#c4b5f7',alpha:52},spot3:{color:'#f8b8d9',alpha:52}},'sky'],
  ['lagoon','Lagoon',{
    spot1:{color:'#5ce3e6',alpha:62},spot2:{color:'#0f9cc2',alpha:52},spot3:{color:'#274a78',alpha:52}},'teal'],
  ['jade','Jade',{
    spot1:{color:'#8fe3b0',alpha:62},spot2:{color:'#22c79a',alpha:52},spot3:{color:'#0b5f51',alpha:52}},'emerald'],
  ['flare','Flare',{
    spot1:{color:'#ffc24b',alpha:62},spot2:{color:'#f4664d',alpha:52},spot3:{color:'#8a2e5e',alpha:52}},'orange'],
  ['orchid','Orchid',{
    spot1:{color:'#e794c9',alpha:62},spot2:{color:'#9678ce',alpha:52},spot3:{color:'#4a3894',alpha:52}},'violet'],
  ['peach','Peach glow',{
    spot1:{color:'#ffc9a3',alpha:62},spot2:{color:'#f08a8c',alpha:52},spot3:{color:'#b65e8c',alpha:52}},'rose'],
  ['tide','Electric blue',{
    spot1:{color:'#6fd8f2',alpha:62},spot2:{color:'#4c5be0',alpha:52},spot3:{color:'#2a2450',alpha:52}},'blue'],
  ['sunset','Sunset',{
    spot1:{color:'#ffae3f',alpha:62},spot2:{color:'#f0574d',alpha:52},spot3:{color:'#5d2a66',alpha:52}},'amber'],
  ['mint','Mint ice',{
    spot1:{color:'#a8f0dc',alpha:62},spot2:{color:'#52cbb0',alpha:52},spot3:{color:'#147a5f',alpha:52}},'emerald'],
  ['bloom','Night bloom',{
    spot1:{color:'#4c3894',alpha:62},spot2:{color:'#b387e8',alpha:52},spot3:{color:'#f6c6e2',alpha:52}},'fuchsia'],
  ['rosegold','Rose gold',{
    spot1:{color:'#fbc9ac',alpha:62},spot2:{color:'#e79ba7',alpha:52},spot3:{color:'#8e5a74',alpha:52}},'rose'],
  [GLASS_NATIVE_PRESET,'Glass native color',{
    spot1:{color:'#6686b8',alpha:52},spot2:{color:'#8f98a4',alpha:44},spot3:{color:'#6686b8',alpha:52}},'blue'],
];
/** The 'glass original color' tier: no three glows; what drifts on the surface are each pane's own two highlights. */
const isNativeGlass=(key:string):boolean=>key===GLASS_NATIVE_PRESET;
/* After hand-tuning the color, the current tier is no longer any preset; the sidebar cell and the badge atop the panel must say so honestly,
   and cannot keep wearing the previous tier's name. */
const HOME_GLOW_CHOICES:readonly (readonly [key:string,label:string])[]=[...HOME_GLOW_PRESETS.map(([key,label])=>[key,label] as const),['custom','Custom']];
const glowPresetName=(key:string):string=>(HOME_GLOW_CHOICES.find(([name])=>name===key)||HOME_GLOW_CHOICES[0]!)[1];
/** A preset's three glows (deep copy); an unknown key falls back to the default preset. */
const glowPalette=(key:string):GlowPalette=>structuredClone((HOME_GLOW_PRESETS.find(([name])=>name===key)||HOME_GLOW_PRESETS[0]!)[2]);
/* The accent color is the button, focus ring, link and data tier; it rides BoardUI's accent mechanism: the eleven-step scale
   swaps wholesale and the components change not a character (the accent section of
   `frontend/src/react/boardui/styles/theme.css`). Only the scheme name is stored here; the eleven actual values live in
   `web/board.css`, one rule per tier under `:root[data-accent=...]`. Copying the scale into JS would make two palettes bound to
   drift, and the balls themselves are painted from these very variables.
   The twelve schemes are twelve hues taken around the color wheel of Tailwind v4's palette; six columns by two rows fill it
   exactly. Neutrals are not included: gray links and gray focus rings do not read as "clickable" in this UI. */
/** `[key, name]`, the twelve accent color tiers. */
const ACCENTS:readonly (readonly [key:string,label:string])[]=[['red','red'],['orange','orange'],['amber','Amber'],['lime','Lime'],['emerald','Emerald'],['teal','Teal green'],
  ['sky','Sky blue'],['blue','blue'],['indigo','Indigo'],['violet','Violet'],['fuchsia','Magenta'],['rose','Rose red']];
const DEFAULT_ACCENT:string='blue';
const normalizeAccent=(value:unknown):string=>ACCENTS.some(([key])=>key===value)?value as string:DEFAULT_ACCENT;
/** The accent color paired with a preset tier. */
const glowAccent=(key:string):string=>(HOME_GLOW_PRESETS.find(([name])=>name===key)||[])[3]||DEFAULT_ACCENT;
/* The palette that picks colors. Names follow the color itself, not where it is used: the same color on another glow keeps
   the same name. Every preset's colors all land in this table, so after picking a preset in the sidebar and opening the color
   popover, the selected ring can point at the current cell; any color missing from the table would forever read as
   "unselected".
   The first seven hue families carry six lightness tiers as the base, and the rest are colors the presets brought in, filed
   by hue into the matching family, which is why the families differ in length. Teal is its own family: the water-toned
   feralui presets' main colors all land here, and on dark glass it is indeed a cold hue, but a cold you can choose, not a
   color that must not appear. */
/** `[color family, name]`, the first item is "All". */
const GLOW_SWATCH_FAMILIES:readonly (readonly [key:string,label:string])[]=[['all','All'],['gray','gray'],['red','red'],['yellow','yellow'],
  ['green','green'],['cyan','cyan'],['blue','blue'],['purple','purple'],['brown','brown']];
/** `[color family, name, #rrggbb]`. */
const GLOW_SWATCHES:readonly (readonly [family:string,name:string,hex:string])[]=[
  ['gray','Cloud gray','#d8dade'],['gray','Haze gray','#b6bcc4'],['gray','Limestone','#8f98a4'],
  ['gray','Iron gray','#6f7783'],['gray','Ink gray','#4a4e56'],['gray','Dark gray','#2e3138'],
  ['red','Cherry red','#f08a8a'],['red','Coral','#e26a62'],['red','Brick red','#c4544a'],
  ['red','Vermilion','#b5322f'],['red','Wine red','#8e2a2c'],['red','Dark red','#6b2224'],
  ['yellow','Wheat','#f2d48a'],['yellow','Amber','#e8b451'],['yellow','Filament','#e08a2f'],
  ['yellow','Golden','#cf8a20'],['yellow','Ginger','#a9701c'],['yellow','Chestnut yellow','#7d5216'],
  ['green','Sprout','#a9cf7e'],['green','Leaf green','#7fae4a'],['green','Grass green','#5da34f'],
  ['green','Forest green','#3f9e57'],['green','Moss green','#4f9463'],['green','Ink green','#27563a'],
  ['blue','Sky blue','#9fc2e8'],['blue','Lake blue','#6a9fd8'],['blue','Indigo','#4478c0'],
  ['blue','Sapphire','#2f5ba3'],['blue','Deep blue','#27467c'],['blue','Midnight blue','#1c3358'],
  ['purple','Lilac','#c3a7e0'],['purple','Magenta','#b455a0'],['purple','Lavender','#a67fd2'],
  ['purple','Grape','#6a4fd0'],['purple','Eggplant','#7a4f96'],['purple','Deep purple','#432c6d'],
  ['brown','Sand brown','#d6b492'],['brown','Clay brown','#bd8f68'],['brown','Ochre brown','#a86a52'],
  ['brown','Chestnut brown','#8c5340'],['brown','Cocoa brown','#6d3f31'],['brown','Deep brown','#4e2d23'],
  ['red','Rosy dawn','#f09199'],['red','Lotus pink','#f8b8d9'],['red','Fire red','#f4664d'],
  ['red','Peach red','#f08a8c'],['red','Dusk red','#f0574d'],['red','Pink cherry','#f6c6e2'],
  ['red','Rose pink','#e79ba7'],
  ['yellow','Sunny yellow','#ffc24b'],['yellow','Tangerine','#ffae3f'],
  ['green','Jade green','#8fe3b0'],['green','Emerald','#22c79a'],['green','Deep emerald','#0b5f51'],
  ['green','Pine green','#147a5f'],
  ['cyan','Light cyan','#9be0e8'],['cyan','Azure wave','#5ce3e6'],['cyan','Peacock','#0f9cc2'],
  ['cyan','Ice cyan','#6fd8f2'],['cyan','Mint','#a8f0dc'],['cyan','Viridian','#52cbb0'],
  ['blue','Lapis','#1e50a2'],['blue','Navy','#274a78'],['blue','Electric blue','#4c5be0'],
  ['purple','Antique purple','#895b8a'],['purple','Wisteria','#c4b5f7'],['purple','Plum purple','#8a2e5e'],
  ['purple','Orchid pink','#e794c9'],['purple','Orchid','#9678ce'],['purple','Violet indigo','#4a3894'],
  ['purple','Berry purple','#b65e8c'],['purple','Ink purple','#2a2450'],['purple','Twilight purple','#5d2a66'],
  ['purple','Night purple','#4c3894'],['purple','Pale purple','#b387e8'],['purple','Mauve','#8e5a74'],
  ['brown','Apricot orange','#ffc9a3'],['brown','Light apricot','#fbc9ac'],
  /* This one is the color of the glass's builtin blue reflection under the light theme; the other is the lime of the gray set above. The "glass native"
     tier shows no color in the UI, but it still has three legal colors in the model, so "every color used by presets is in the table" must hold for it too. */
  ['blue','Clear-sky blue','#6686b8'],
];
const glowNumber=(value:number,min:number,max:number,fallback:number):number=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
/** A valid `#rrggbb` is returned lowercased as-is, otherwise `fallback` is given. */
const glowColor=(value:unknown,fallback:string):string=>/^#[0-9a-f]{6}$/i.test(String(value))?String(value).toLowerCase():fallback;
const glowRgba=(hex:string,alpha:number)=>`rgba(${[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)).join(',')},${(alpha/100).toFixed(2)})`;
/* Speed, softening, and size are all stored as integers in the 0-100 tier, converted to the multiplier CSS needs inside paintHomeGlow in
   one pass: storing the multiplier would make "default" be 1 in the data but have to display as the middle slot in the UI, and the two sides would
   eventually each follow their own understanding. Speed is the exception: its midpoint is 100 and its cap 300; full tilt on that tier is three times as fast,
   and 0 is stopped. */
const GLOW_RANGES:Record<GlowField,[min:number,max:number,fallback:number]>={strength:[0,100,100],noise:[0,100,0],speed:[0,300,100],soften:[0,100,50],size:[0,100,50]};
const DEFAULT_HOME_GLOW:HomeGlow={on:true,preset:'ash',strength:100,noise:0,speed:100,soften:50,size:50,
  ...glowPalette('ash')};
/* Glow parameters come whole from localStorage and neither shape nor range can be trusted: colors as arbitrary strings break
   that gradient layer entirely, and out-of-range percentages smear the glow into a wash or shrink it to nothing. Each item
   is clamped back into range and unrecognized ones fall back to the default scheme, rather than discarding the whole thing:
   one broken number must not wipe out the other schemes the user tuned.
   Only one situation swaps the colors too: the stored scheme name is no longer in the list. That means the scheme was
   retired, the three colors sitting next to it are exactly that retired version's, and clamping them back item by item would
   leave them on the page as-is.
   Custom is exempt: those three colors were picked by the user, the scheme name is recognizable, and they stay.
   Keys that no longer exist need no separate cleanup: values are read per the current model only, and the rebuilt object
   simply does not contain them. The old version's centers and semi-axes sprawled across the top of the home page were lost
   exactly this way: geometry now comes only from CSS, and if the stored copy had been clamped back in, long-time users would
   still see half a glow. */
/** Normalization when reading stored data back; passing null yields the factory set. */
function normalizeHomeGlow(raw:unknown):HomeGlow{
  const stored:any=raw&&typeof raw==='object'?raw:{};
  const known=HOME_GLOW_CHOICES.some(([key])=>key===stored.preset);
  const preset:string=known?stored.preset:'ash';
  const seed=glowPalette(preset==='custom'?'ash':preset);
  const glow={on:stored.on!==false,preset} as HomeGlow;
  for(const [field,[min,max,fallback]] of Object.entries(GLOW_RANGES) as [GlowField,[number,number,number]][])
    glow[field]=glowNumber(+stored[field],min,max,fallback);
  for(const key of HOME_GLOW_SPOTS){
    const spot=known&&stored[key]&&typeof stored[key]==='object'?stored[key]:{},fallback=seed[key];
    glow[key]={color:glowColor(spot.color,fallback.color),
      alpha:glowNumber(+spot.alpha,0,100,fallback.alpha)};
  }
  return glow;
}
/* The preset ball ring: as many equal segments as there are colors. A function because the custom tier has exactly as many colors as the presets,
   yet must compute them on the spot inside the popover. */
const glowChipFill=(colors:readonly string[]):string=>`conic-gradient(from -90deg,${colors.map((color,index)=>
  `${color} ${(index*100/colors.length).toFixed(3)}% ${((index+1)*100/colors.length).toFixed(3)}%`).join(',')})`;
/* Writes values only; how glow is drawn stays in one place, web/css/01-base.css. Both the off state and the "glass original
   color" preset zero out intensity and grain, `.glowlayer::before`'s opacity multiplies to 0, and no separate "off" branch
   exists; otherwise "off", "glass original color" and "intensity 0" would be three independently evolving paths.

   Before writing, compare against the last value written into this element. Dragging any one slider changes one variable;
   without the comparison every step would rewrite all nine, and the eight in between would be wasted writes.
   Bookkeeping is stored per element, so when multiple shells each paint their layer they do not mistake each other's values
   for "already written".

   Three geometric parameters convert to multipliers here: blur 0-100 maps to 0.7-1.3 with the feather position scaling by it;
   size likewise maps to 0.5-1.5, multiplying both ellipse semi-axes. Speed is the inverse of duration: 100 on the slider is
   original speed, so the multiplier is `100/speed`; at 0 there is no inverse, and that tier pauses the two drift animations
   directly while the fade-in is not stopped with them, otherwise the whole layer would freeze at opacity 0 and look like the
   glow was turned off. */
const glowWritten=new WeakMap<HTMLElement,Map<string,string>>();
/** The glow layer's variables are written onto `el` (unchanged values are not rewritten). */
function paintHomeGlow(el:HTMLElement|null,glow:HomeGlow):void{
  if(!el)return;
  let written=glowWritten.get(el);
  if(!written){written=new Map();glowWritten.set(el,written)}
  const live=glow.on&&!isNativeGlass(glow.preset);
  const write=(name:string,value:string)=>{
    if(written.get(name)===value)return;
    written.set(name,value);el.style.setProperty(name,value);
  };
  write('--glow-strength',String(live?glow.strength/100:0));
  write('--glow-noise',String(live?glow.noise/100:0));
  write('--glow-soften',(0.7+glow.soften/100*0.6).toFixed(3));
  write('--glow-size',(0.5+glow.size/100).toFixed(3));
  write('--glow-drift-scale',glow.speed?(100/glow.speed).toFixed(3):'1');
  write('--glow-drift-play',glow.speed?'running':'paused');
  HOME_GLOW_SPOTS.forEach((key,index)=>{
    const spot=glow[key];
    write(`--glow-spot-${index+1}-color`,glowRgba(spot.color,spot.alpha));
  });
}

/* The hues of the two slowly drifting reflections on the glass surfaces. The sidebar's pane of glass is left to the glow
   layer; every other pane (search box, top bar icon buttons, filter overlays, the settings card's section nav, media library
   popover, color popover, narrow rail, selection toolbar) still runs on `--glass-drift-a/b`, only the color is no longer
   hard-coded: the two blobs take the first and second glow's colors, while size, alpha tiers and the Lissajous path stay
   untouched. Only the hue changes.
   It writes the root element, the opposite of the glow layer, because those panes are scattered across the tree with no
   common host. The cost is paid too: one root write is a style recalc of the whole tree. So this only fires on color picks,
   preset changes, toggles and the release of the speed slider; never once during a drag. During a drag only the sidebar's
   layer follows along.
   Only drift speed follows. Blur and size do not: those blobs' semi-axes and feathering were measured per control's own
   size; a search box and a whole sidebar sharing one multiplier would blur the small one into a wash first.
   "Glass original color" and turning the item off take the same path: the two hue variables are removed, and each pane falls
   back to its own theme tier in the stylesheet. Removing rather than writing the theme color back, because there are two
   theme palettes that follow light/dark; the one written back would freeze in place across a theme switch. Speed is not
   removed: the original-color blobs drift too, and whether they stop is the user's slider's call. */
/** The hues of the two reflections on the remaining glass surfaces are written onto `el` (the root element). */
function paintGlassFaces(el:HTMLElement|null,glow:HomeGlow):void{
  if(!el)return;
  const native=!glow.on||isNativeGlass(glow.preset);
  el.toggleAttribute('data-glow-native',native);
  el.style.setProperty('--glow-drift-scale',glow.speed?(100/glow.speed).toFixed(3):'1');
  el.style.setProperty('--glow-drift-play',glow.speed?'running':'paused');
  if(native){el.style.removeProperty('--glass-tint-a');el.style.removeProperty('--glass-tint-b');return}
  el.style.setProperty('--glass-tint-a',glow.spot1.color);
  el.style.setProperty('--glass-tint-b',glow.spot2.color);
}

export {ACCENTS, DEFAULT_ACCENT, DEFAULT_HOME_GLOW, GLASS_NATIVE_PRESET, GLOW_SPOT_LABELS,
  GLOW_SWATCHES, GLOW_SWATCH_FAMILIES, HOME_GLOW_CHOICES, HOME_GLOW_PRESETS, HOME_GLOW_SPOTS,
  glowAccent, glowChipFill, glowColor, glowPalette, glowPresetName, isNativeGlass,
  normalizeAccent, normalizeHomeGlow, paintGlassFaces, paintHomeGlow};
