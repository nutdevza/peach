/* JAV titles: compute the code, edition badge, and title from the item.
 * Pure string logic depending only on core's esc and the language flag; touches no DOM and reads no state.
 * Application and React pages reference this module directly, so title rules exist only once.
 * The suffix is stripped only for is_jav; the official title prefers the entry containing Japanese, then falls back by field order. */

import { esc } from './index';
import { langAttr } from './text-lang';

/** The fields read to compute the title. */
export interface JavTitleSource {
  name?: string | null;
  code?: string | null;
  display_code?: string | null;
  is_jav?: boolean | number | null;
  catalog_title?: string | null;
  original_title?: string | null;
  display_title?: string | null;
  edition_badges?: string[] | null;
  width?: number | null;
  height?: number | null;
}
type Item = JavTitleSource | null | undefined;

const JAV_MEDIA_SUFFIX=/\.(?:mp4|mkv|avi|wmv|mov|m4v|webm|ts|m2ts|mts|mpg|mpeg|flv|rm|rmvb|iso)$/i;

export const javFileDisplayName=(it:Item,value=it?.name)=>{
  const name=String(value||'').trim();
  return it?.is_jav?name.replace(JAV_MEDIA_SUFFIX,''):name;
};

export const hasJapaneseText=(value:unknown)=>/[぀-ヿ㐀-鿿]/.test(String(value||''));

export const javPreferredTitle=(it:Item)=>{
  const titles=[it?.catalog_title,it?.original_title].map(value=>String(value||'').trim()).filter(Boolean);
  return titles.find(hasJapaneseText)||titles[0]||'';
};

export function javTitleParts(it:Item,value=it?.name):{code:string;title:string;badges?:string[]}{
  const name=javFileDisplayName(it,value),code=String(it?.code||'').trim().toUpperCase();
  if(!it?.is_jav||!code)return {code:'',title:name};
  const displayCode=String(it?.display_code||code).trim().toUpperCase();
  const upper=name.toUpperCase(),hasPrefix=upper===code||upper===displayCode
    ||(upper.startsWith(code)&&/^[\s._\-[\]]/.test(name.slice(code.length)))
    ||(upper.startsWith(displayCode)&&/^[\s._\-[\]]/.test(name.slice(displayCode.length)));
  const prefixLength=upper.startsWith(displayCode)?displayCode.length:code.length;
  const filenameTitle=(hasPrefix?name.slice(prefixLength):name).replace(/^[\s._-]+/,'').trim();
  const officialTitle=javPreferredTitle(it);
  // An API-returned empty display_title is also meaningful "cleaned, no title", and must not fall back to the dirty file name again.
  const cleanFallback=Object.prototype.hasOwnProperty.call(it||{},'display_title')
    ?String(it.display_title||'').trim():filenameTitle;
  const title=officialTitle||cleanFallback;
  const badges=Array.isArray(it?.edition_badges)?it.edition_badges.filter(
    label=>['Chinese subs','Uncensored','无码流出','Uncensored'].includes(label)):[];
  const dimensions=[Number(it?.width)||0,Number(it?.height)||0];
  if(Math.min(...dimensions)>=2160&&Math.max(...dimensions)>=3840)badges.push('4K');
  return {code:displayCode,title,badges};
}

/** The plain text form of the same entry, for the accessible name. */
export const javDisplayName=(it:Item,value=it?.name)=>{
  const {code,title,badges=[]}=javTitleParts(it,value);
  return code?[code,...badges,title].filter(Boolean).join(' '):title;
};

/** HTML of code + edition badge + title. Non-JAV entries degrade to the escaped file name. */
export function javTitleHtml(it:Item,value=it?.name){
  const {code,title,badges=[]}=javTitleParts(it,value);
  if(!code)return esc(title);
  const edition=badges.map(label=>`<small class="javedition ${label==='Chinese subs'?'subtitle':label==='Uncensored'?'uncensored':label==='leaked'?'leaked':label==='decensored'?'cracked':'quality'}">${esc(label)}</small>`).join('');
  return `<span class="ui-javidentity"><strong class="ui-javcode">${esc(code)}</strong>${edition}</span>${title?` <span class="ui-javtitle"${langAttr(title)}>${esc(title)}</span>`:''}`;
}
