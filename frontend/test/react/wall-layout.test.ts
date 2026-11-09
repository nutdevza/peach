import { describe, expect, it } from 'vitest';
import { clampWall, expandedWallTiles, finiteWallFilters, finiteWallTile, visibleWallTiles, wallExtent, wallHasCover, wallTileAt, WallExploration } from '../../src/react/video-wall/wall-layout';

const view = { width: 1280, height: 720 };
const camera = { x: 16, y: 16, scale: 1 };
describe('2D video wall', () => {
  it('Explore videos are assigned in four-way browse order; both returning to an existing position and paging onward preserve identity and geometry', () => {
    const pool = new WallExploration(), positions = new Map<string, number>();
    for (const point of [{ x:0,y:0 },{ x:3000,y:0 },{ x:3000,y:3000 },{ x:-3000,y:3000 },{ x:-3000,y:-3000 }]) {
      const visible = visibleWallTiles(12, false, { ...camera,x:point.x,y:point.y }, view);
      for (const tile of pool.assign(visible, 200, true)) {
        if (positions.has(tile.key)) expect(tile.index).toBe(positions.get(tile.key));
        else { expect([...positions.values()]).not.toContain(tile.index); positions.set(tile.key, tile.index) }
        expect(pool.tile(tile.key, 400)).toEqual(tile);
      }
    }
    expect(pool.size).toBeGreaterThan(60);
    const returned = pool.assign(visibleWallTiles(12, false, camera, view), 400, true);
    for (const tile of returned) expect(tile.index).toBe(positions.get(tile.key));
  });
  it('Tiles waiting to be filled are kept until the next page is fetched; looping starts only after the range runs out', () => {
    const pool = new WallExploration(), visible = visibleWallTiles(12, false, camera, view);
    const first = pool.assign(visible, 3, true);
    expect(first.filter(tile => tile.index >= 0)).toHaveLength(3);
    expect(first.some(tile => tile.index === -1)).toBe(true);
    const next = pool.assign(visible, 40, true);
    expect(new Set(next.map(tile => tile.index)).size).toBe(next.length);
    expect(next.slice(0, 3)).toEqual(first.slice(0, 3));
    const ended = new WallExploration().assign(visible, 3, false);
    expect(ended.every(tile => tile.index >= 0 && tile.index < 3)).toBe(true);
    expect(new WallExploration().assign(visible, 0, false).every(tile => tile.index === -1)).toBe(true);
  });
  it('The queue can target an unshown video and later allocation will not reuse it; shuffles prefer newly added pages', () => {
    const pool = new WallExploration(), point = { x:-2500,y:1800 };
    const chosen = pool.nearest(100, 77, point)!;
    expect(chosen.index).toBe(77);
    expect(pool.nearest(140, 77, point)).toEqual(chosen);
    pool.prefer(100);
    const tiles = pool.assign(visibleWallTiles(12, false, camera, view), 140, true);
    expect(tiles[0]!.index).toBe(100);
    expect(tiles.map(tile => tile.index)).not.toContain(77);
  });
  it('Only videos with cover references enter the wall; a thumbnail does not substitute for eligibility', () => {
    expect(wallHasCover({ id:1, is_jav:true, code:'PCH-001', has_cover:true })).toBe(true);
    expect(wallHasCover({ id:2, cover_key:'custom', has_cover:true })).toBe(true);
    expect(wallHasCover({ id:3, has_cover:false, has_thumb:true })).toBe(false);
    expect(wallHasCover({ id:4, has_cover:true })).toBe(false);
    expect(wallHasCover({ id:5, has_cover:true, code:'PCH-005', medium:'photo' })).toBe(false);
  });
  it('The expanded block yields fully, the selected tile becomes a square 6×6, and the collapsed position can be rebuilt', () => {
    for (const position of ['0:0:0','1:0:2','2:1:11','-1:-2:5']) {
      const active = wallTileAt(60, false, position)!;
      const expanded = expandedWallTiles(60, false, active);
      const focus = expanded.get(position)!;
      expect(expanded.size).toBe(12);
      expect(focus.width).toBeCloseTo(614.08);
      expect(focus.height).toBe(focus.width);
      const rects = [...expanded.values()];
      for (let a = 0; a < rects.length; a += 1) for (let b = a + 1; b < rects.length; b += 1) {
        const one = rects[a]!, two = rects[b]!;
        expect(one.x < two.x + two.width && one.x + one.width > two.x && one.y < two.y + two.height && one.y + one.height > two.y).toBe(false);
      }
      expect(wallTileAt(60, false, position)).toEqual(active);
    }
  });
  it('Empty sets produce no tiles', () => {
    expect(visibleWallTiles(0, false, camera, view)).toEqual([]);
  });
  it('The finite wall queue selection keeps a single position', () => {
    expect(finiteWallTile(0, 0)).toBeNull();
    expect(finiteWallTile(25, 17)).toEqual(wallTileAt(25, true, '1:0:5'));
  });
  it('The explore wall loops in both directions with unique instance keys', () => {
    for (const position of [-100_000, -3000, 16, 3000, 100_000]) {
      const tiles = visibleWallTiles(25, false, { ...camera, x: position, y: -position }, view);
      expect(tiles.length).toBeGreaterThan(0);
      expect(new Set(tiles.map(tile => tile.key)).size).toBe(tiles.length);
      expect(tiles.every(tile => tile.index >= 0 && tile.index < 25)).toBe(true);
    }
  });
  it('Within the bounded wall each entry holds exactly one position, and continuations never move existing ones', () => {
    const huge = { width: 3000, height: 3000 };
    const first = visibleWallTiles(17, true, camera, huge);
    const next = visibleWallTiles(53, true, camera, huge);
    expect(first.length).toBe(17);
    expect(new Set(next.map(tile => tile.index)).size).toBe(next.length);
    for (const tile of first) expect(next.find(other => other.index === tile.index)).toEqual(tile);
  });
  it('Only tiles near the viewport render; the count does not grow with the library', () => {
    expect(visibleWallTiles(80_000, true, camera, view).length).toBeLessThan(100);
    expect(visibleWallTiles(80_000, false, camera, view).length).toBeLessThan(100);
  });
  it('The bounded wall blocks dragging into empty space and locks the origin when content is smaller than the screen', () => {
    expect(clampWall({ ...camera, x: 4000, y: 4000 }, view, wallExtent(12), true)).toEqual(camera);
    const clamped = clampWall({ ...camera, x: -1e8, y: -1e8 }, view, wallExtent(49), true);
    expect(clamped.x).toBe(view.width - wallExtent(49).width - 16);
    expect(clamped.y).toBe(view.height - wallExtent(49).height - 16);
    expect(clampWall({ ...camera, x: -1e8 }, view, wallExtent(49), false).x).toBe(-1e8);
  });
  it('Explore tile geometry never shifts as fetches grow', () => {
    for (const key of ['-2:3:0','3:-2:4','8:6:11']) {
      const { index:_, ...first } = wallTileAt(12, false, key)!;
      const { index:__, ...next } = wallTileAt(1800, false, key)!;
      expect(next).toEqual(first);
    }
  });
  it('Search, entity filters, states, and duration use a bounded wall, while default sources and the JAV context stay explorable', () => {
    for (const key of ['q','performer','series','creator','studio','owner','tag','state','orient','len','dur_min','dur_max','region']) {
      expect(finiteWallFilters({ [key]: 'value' })).toBe(true);
    }
    expect(finiteWallFilters({ jav: '1', loc: 'local', sort: 'seed' })).toBe(false);
  });
});
