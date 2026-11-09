/* Language marks for library text: titles, synopses and aliases come from Japanese or English sites while the page is
 * `lang="zh-CN"`.
 * With `lang` marked, the browser picks fonts and glyphs by language (the `:lang(ja)` font stack in `react/base.css` and
 * `web/css/01-base.css`), and long paragraphs also align by language.
 *
 * Only two cases are recognizable: kana present means Japanese; no kanji at all, only Latin letters, means English. Pure
 * kanji cannot be told apart between Chinese and Japanese (performer canonical names are already Simplified Chinese), so it
 * keeps the page's language rather than guessing. */

const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;
const LATIN = /[A-Za-z]/;

export function textLang(value: unknown): 'ja' | 'en' | undefined {
  const text = String(value ?? '');
  if (KANA.test(text)) return 'ja';
  if (!HAN.test(text) && LATIN.test(text)) return 'en';
  return undefined;
}

/** For assembling HTML: emit ` lang="…"` when the language is recognized, otherwise an empty string. */
export const langAttr = (value: unknown): string => {
  const lang = textLang(value);
  return lang ? ` lang="${lang}"` : '';
};
