import { beforeEach, describe, expect, it } from 'vitest';
import {
  entityDisplayName, nameLanguage, registerNameWriting, registerNameWritings,
  setNameLanguage, type NameWriting,
} from '../src/core/entity-names';

const writing: NameWriting = {
  id: 1, kind: 'performer', canonical_name: '枫花恋', zh_cn: '枫花恋', ja: '楓カレン',
};

beforeEach(() => { registerNameWritings([]); setNameLanguage('zh-CN') });

describe('The read-only display projection of entity names', () => {
  it('A verified Japanese byline for the same stage name may display in Chinese, and historical stage names are never swapped for the current name', () => {
    registerNameWritings([writing]);
    expect(entityDisplayName('performer', '楓カレン', 1)).toBe('枫花恋');
    expect(entityDisplayName('performer', '楓カレン')).toBe('枫花恋');
    expect(entityDisplayName('performer', '田中レモン', 1)).toBe('田中レモン');
    setNameLanguage('ja');
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('楓カレン');
  });

  it('The shared logic must not select another person while identity is unresolved; explicit identity still uses its own source', () => {
    registerNameWritings([writing, { ...writing, id: 2, canonical_name: 'Another stage name', zh_cn: 'Another spelling' }]);
    expect(entityDisplayName('performer', '楓カレン')).toBe('楓カレン');
    expect(entityDisplayName('performer', '楓カレン', 1)).toBe('枫花恋');
    expect(entityDisplayName('performer', '楓カレン', 2)).toBe('Another spelling');
  });
  it('A raw hanzi-only byline uses the server glyph table, and simplified display is not missed even without a bound stage name', () => {
    const glyphs = { 宮: '宫', 澤: '泽', 寧: '宁', 鈴: '铃' };
    registerNameWritings([], glyphs);
    expect(entityDisplayName('performer', '宮澤寧音')).toBe('宫泽宁音');
    expect(entityDisplayName('performer', '山田鈴奈')).toBe('山田铃奈');
    expect(entityDisplayName('creator', '宮澤寧音')).toBe('宫泽宁音');
    expect(entityDisplayName('performer', '宮澤かな')).toBe('宮澤かな');
    expect(entityDisplayName('performer', 'Rin 鈴')).toBe('Rin 鈴');
    expect(entityDisplayName('studio', '宮澤寧音')).toBe('宮澤寧音');
    setNameLanguage('ja');
    expect(entityDisplayName('performer', '宮澤寧音')).toBe('宮澤寧音');
    expect(glyphs).toEqual({ 宮: '宫', 澤: '泽', 寧: '宁', 鈴: '铃' });
    registerNameWritings([]);
    setNameLanguage('zh-CN');
    expect(entityDisplayName('performer', '宮澤寧音')).toBe('宮澤寧音');
  });
  it('Switching display language keeps raw names, identity, and source objects', () => {
    const original = { ...writing };
    registerNameWritings([original]);
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('枫花恋');
    setNameLanguage('ja');
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('楓カレン');
    expect(original).toEqual(writing);
  });

  it('Other stage names under the same identity are never replaced by the current unified name; people and creators are indexed separately', () => {
    registerNameWriting(writing);
    setNameLanguage('ja');
    expect(entityDisplayName('performer', '田中柠檬', 1)).toBe('田中柠檬');
    expect(entityDisplayName('creator', '枫花恋', 1)).toBe('枫花恋');
  });

  it('Without a verified spelling the original name is kept', () => {
    registerNameWriting({ ...writing, zh_cn: null });
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('枫花恋');
  });

  it('A single-person writing refresh keeps the romanization the shapes roster delivered', () => {
    registerNameWritings([{ ...writing, en: 'Karen Yuzuki' }]);
    registerNameWriting({ ...writing });
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('枫花恋 (Karen Yuzuki)');
  });

  it('Rebuilding the whole roster replaces the romanization with the fresh value', () => {
    registerNameWritings([{ ...writing, en: 'Old spelling' }]);
    registerNameWriting({ ...writing });
    registerNameWritings([{ ...writing, en: 'New spelling' }]);
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('枫花恋 (New spelling)');
  });

  it('Refreshing the details set clears stale names while keeping the user\'s language preference', () => {
    registerNameWritings([writing]);
    setNameLanguage('ja');
    registerNameWritings([]);
    expect(nameLanguage()).toBe('ja');
    expect(entityDisplayName('performer', '枫花恋', 1)).toBe('枫花恋');
  });
});
