/* Peach controls attached to the Video.js control bar: settings menu (ambience mode, playback speed, quality), theater mode key,
 * control bar layout and morphing icons, drag preview, Media Session, spinner and external subtitles, plus the stage's ambience light sampling.
 *
 * Control styling is taken from YouTube delhi-modern (player 9470c977); each piece's provenance is written on its own function. */
import { api, esc, fmtClock, icon, realDuration } from '@peach/legacy/core';

import { playerHost } from './host';
import { detailPlayer, resizeSoon } from './registry';
import { PLAYER_PANEL_EVENT } from './stats';
import type { PlayerItem, SourceQuality, VjsPlayer } from './types';
import { SubtitleControls, subtitleIcon } from './subtitles';
import { createSeekPreview } from './seek-preview';
import { mountPlayerRotation } from './rotation';
import { mountPlayerPipControl } from './pip';
import { mountPlaybackRate, playerMemory } from './memory';

type TooltipSync = (label?: string, aria?: string) => void;

/** Every control bar button's tooltip comes from here: label plus shortcut badge, styled after YouTube delhi-modern.
 *  The native title and the status hints share one sync entry point. */
export function playerControlTooltip(button: Element | null | undefined, label: string, shortcut = ''): TooltipSync {
  if (!button) return () => {};
  let tip = button.querySelector<HTMLElement>(':scope>.vjs-peach-tooltip');
  if (!tip) {
    tip = document.createElement('span'); tip.className = 'vjs-peach-tooltip'; tip.setAttribute('role', 'tooltip');
    tip.innerHTML = '<span class="vjs-peach-tooltip-text"></span><kbd hidden></kbd>';
    button.append(tip);
  }
  const text = tip.querySelector('.vjs-peach-tooltip-text')!, key = tip.querySelector('kbd')!;
  if (shortcut) button.setAttribute('aria-keyshortcuts', shortcut);
  const sync: TooltipSync = (nextLabel = label, aria = '') => {
    text.textContent = nextLabel; key.textContent = shortcut; key.hidden = !shortcut;
    button.setAttribute('aria-label', aria || nextLabel); button.removeAttribute('title');
  };
  sync(); return sync;
}

/** Keyboard shortcuts reuse the buttons' own click paths: fullscreen, picture-in-picture and mute each keep fallback logic on the button, and reimplementing it in the keyboard branch
 *  would drift from the buttons. The mini player sits outside the media frame; find its control bar through Video.js's own shell. */
export function clickPlayerControl(video: Element | null, selector: string): void {
  video?.closest('.video-js')?.querySelector<HTMLElement>(`.vjs-control-bar ${selector}`)?.click();
}

export function applyAmbientMode(enabled: boolean, save = true): void {
  const host = playerHost(), settings = host.settings();
  settings.ambientMode = !!enabled; if (save) host.saveSettings();
  host.stage()?.toggleAttribute('data-ambient', settings.ambientMode);
  document.dispatchEvent(new CustomEvent('peachambientchange', { detail: { enabled: settings.ambientMode } }));
}

const theaterSyncs = new WeakMap<Element, TooltipSync>();

function syncPlayerTheaterButton(button: Element | null | undefined): void {
  if (!button) return;
  const theater = playerHost().settings().theaterMode;
  button.setAttribute('aria-pressed', String(theater));
  button.querySelector('use')?.setAttribute('href', theater ? '#i-theater-exit' : '#i-theater-enter');
  theaterSyncs.get(button)?.(theater ? 'Default view' : 'Theater mode');
}

export function applyTheaterMode(enabled: boolean, save = true): void {
  const host = playerHost(), settings = host.settings();
  settings.theaterMode = !!enabled; if (save) host.saveSettings();
  const stage = host.stage(); stage?.toggleAttribute('data-theater', settings.theaterMode);
  syncPlayerTheaterButton(stage?.querySelector('[data-player-theater]'));
  resizeSoon(detailPlayer());
}

/** Ambient light: writes `--video-glow` to the stage from the picture's average color.
 *
 *  Sampling has two entries: during playback it follows frame callbacks, and `start` takes one frame immediately. A paused
 *  picture is still a frame that can be drawn; following only frame callbacks would mean turning ambient mode off while paused
 *  can never be turned back on, since switching off erased the light and frame callbacks only arrive with new frames. Each
 *  sampling chain carries a run number: the callback queued while paused or hidden may never come, and deduplicating with an
 *  "already queued" boolean would be locked out forever by it; with a run number, a stale callback wakes and exits directly,
 *  and only one chain ever runs. */
export function mountPlayerAmbient(video: HTMLVideoElement): () => void {
  const stage = playerHost().stage(), canvas = stage?.querySelector<HTMLCanvasElement>('[data-ambient-canvas]');
  if (!stage || !canvas) return () => {};
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};
  let stopped = false, last = 0, run = 0;
  let glow: number[] | null = null;
  const clear = () => { glow = null; ctx.clearRect(0, 0, canvas.width, canvas.height); stage.style.removeProperty('--video-glow') };
  const sample = () => {
    if (video.readyState < 2) return;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 16) { r += px[i]!; g += px[i + 1]!; b += px[i + 2]!; n++ }
      if (n) {
        const next = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        // Jitter of the average color stays stable; the inherited color refreshes the whole details only on a visible change.
        if (!glow || next.some((value, index) => Math.abs(value - glow![index]!) >= 6)) {
          glow = next; stage.style.setProperty('--video-glow', `rgb(${next.join(' ')})`);
        }
      }
    } catch { /* Cross-origin frames yield no pixels */ }
  };
  const queue = (id: number) => {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback((now) => paint(id, now));
    else requestAnimationFrame((now) => paint(id, now));
  };
  const paint = (id: number, now: number) => {
    if (stopped || id !== run) return;
    if (!playerHost().settings().ambientMode) { clear(); return }
    if (video.paused) return;
    if (!document.hidden && now - last > 480) { last = now; sample() }
    queue(id);
  };
  const start = () => { if (stopped || !playerHost().settings().ambientMode) return; sample(); if (!video.paused) queue(++run) };
  const onChange = (event: Event) => {
    const enabled = !!(event as CustomEvent<{ enabled: boolean }>).detail.enabled;
    stage.toggleAttribute('data-ambient', enabled);
    if (enabled) start(); else { run++; clear() }
  };
  document.addEventListener('peachambientchange', onChange);
  video.addEventListener('play', start); video.addEventListener('loadeddata', start); start();
  return () => {
    stopped = true; run++; document.removeEventListener('peachambientchange', onChange);
    video.removeEventListener('play', start); video.removeEventListener('loadeddata', start); clear();
  };
}

/** Settings menu: ambient mode, playback speed, quality. The returned function swaps the source quality table.
 *
 *  `sourceQualities` is the source's own quality table ([{height,label}], high to low). rule34video writes each tier as its
 *  own field, invisible to videojs's qualityLevels, which only knows HLS/DASH adaptive tracks, while these are four
 *  independent mp4s. So the caller looks them up and passes them in. */
export function mountPlayerQualityControl(
  player: VjsPlayer, video: HTMLVideoElement, fallbackHeight: unknown = 0, initialSourceQualities: SourceQuality[] | null = null,
): ((next: SourceQuality[] | null) => void) | undefined {
  const controlBar = player.el().querySelector<HTMLElement>('.vjs-control-bar');
  if (!controlBar || controlBar.querySelector('[data-player-quality]')) return undefined;
  const root = document.createElement('div');
  root.className = 'vjs-peach-settings vjs-control'; root.dataset.playerQuality = '';
  root.innerHTML = `<button type="button" class="vjs-peach-settings-toggle" aria-label="Player settings" aria-expanded="false">
    ${icon('settings')}<span data-player-quality-badge hidden></span></button>
    <div class="vjs-peach-settings-menu" role="menu" aria-label="Player settings" aria-hidden="true"></div>`;
  const fullscreen = controlBar.querySelector('.vjs-fullscreen-control');
  controlBar.insertBefore(root, fullscreen || null);
  const toggle = root.querySelector('button')!, badge = root.querySelector<HTMLElement>('[data-player-quality-badge]')!;
  playerControlTooltip(toggle, 'Settings');
  const menu = root.querySelector<HTMLElement>('.vjs-peach-settings-menu')!;
  const rotation = mountPlayerRotation(player, video);
  const rememberRate = mountPlaybackRate(player, video);
  const memory = playerMemory(player);
  let subtitleControls: SubtitleControls | undefined;
  const levels = typeof player.qualityLevels === 'function' ? player.qualityLevels() : null;
  let sourceQualities = initialSourceQualities;
  let selectedQuality = 'auto';
  const resolution = (width: unknown, height: unknown) => {
    const values = [Number(width), Number(height)].filter((value) => value > 0);
    return values.length ? Math.min(...values) : 0;
  };
  interface Row { key: string; label: string; pixels: number }
  const rows = (): Row[] => {
    const result: Row[] = [];
    if (levels?.length) {
      if (levels.length > 1) result.push({ key: 'auto', label: 'Auto', pixels: 0 });
      for (let index = 0; index < levels.length; index++) {
        const level = levels[index]!;
        const pixels = resolution(level.width, level.height)
          || (levels.length === 1 ? resolution(video.videoWidth, video.videoHeight) : 0);
        result.push({ key: String(index), label: pixels ? `${pixels}p` : (levels.length === 1 ? 'Current quality' : `Route ${index + 1}`), pixels });
      }
      return result;
    }
    if (sourceQualities?.length) {
      return sourceQualities.map((quality) => ({ key: `h${quality.height}`, label: quality.label || `${quality.height}p`, pixels: quality.height }));
    }
    const pixels = resolution(video.videoWidth, video.videoHeight) || Number(fallbackHeight) || 0;
    return [{ key: 'original', label: pixels ? `${pixels}p` : 'Original', pixels }];
  };
  const qualityRows = () => {
    const options = rows();
    const active = options.find((option) => option.key === selectedQuality) || options[0]!;
    const playing = levels?.[levels.selectedIndex ?? -1];
    const activePixels = active.key === 'auto'
      ? resolution(playing?.width, playing?.height) || resolution(video.videoWidth, video.videoHeight)
      : active.pixels;
    badge.textContent = activePixels >= 2160 ? '4K' : activePixels >= 720 ? 'HD' : ''; badge.hidden = !badge.textContent;
    return { options, active };
  };
  const isOpen = () => menu.getAttribute('aria-hidden') !== 'true';
  const setOpen = (open: boolean) => {
    menu.setAttribute('aria-hidden', String(!open)); toggle.setAttribute('aria-expanded', String(open));
    if (!open) subtitleControls?.hide();
    if (open) document.dispatchEvent(new CustomEvent(PLAYER_PANEL_EVENT, { detail: 'settings' }));
  };
  const close = () => setOpen(false);
  const closeSettingsForOtherPanel = (event: Event) => { if ((event as CustomEvent<string>).detail !== 'settings') close() };
  document.addEventListener(PLAYER_PANEL_EVENT, closeSettingsForOtherPanel);
  /* Panel switching follows YouTube player 9470c977's www-player.css: the popup itself changes height over .25s
     cubic-bezier(.4,0,.2,1), with the old panel sliding out toward where it goes and the new one sliding in from there.
     The old panel must leave layout before sliding, otherwise the two contents would stretch the menu to double height
     during the animation; height must also be pinned to the old value first and the new value written the next frame,
     because writing twice in one frame jumps straight to the new value with no transition visible. */
  const PANEL_MS = 250;
  let panelTimer: ReturnType<typeof setTimeout> | null = null;
  let panelRun = 0;
  const renderPanel = (html: string, direction: number): HTMLElement => {
    const run = ++panelRun;
    if (panelTimer) {
      clearTimeout(panelTimer); panelTimer = null;
      menu.classList.remove('vjs-peach-popup-animating'); menu.style.height = '';
    }
    menu.querySelectorAll('.vjs-peach-panel-leaving').forEach(panel => panel.remove());
    menu.scrollTop = 0;
    const current = menu.querySelector<HTMLElement>('.vjs-peach-panel');
    const next = document.createElement('div'); next.className = 'vjs-peach-panel'; next.innerHTML = html;
    if (!current || !direction || !isOpen() || matchMedia('(prefers-reduced-motion:reduce)').matches) { menu.replaceChildren(next); menu.style.height = ''; return next }
    const from = menu.getBoundingClientRect().height;
    current.classList.add('vjs-peach-panel-leaving'); current.inert = true; current.setAttribute('aria-hidden', 'true');
    next.classList.add(direction > 0 ? 'vjs-peach-panel-animate-forward' : 'vjs-peach-panel-animate-back');
    menu.append(next); menu.style.height = `${from}px`;
    const to = next.scrollHeight;
    requestAnimationFrame(() => {
      if (run !== panelRun) return;
      menu.classList.add('vjs-peach-popup-animating'); menu.style.height = `${to}px`;
      next.classList.remove('vjs-peach-panel-animate-forward', 'vjs-peach-panel-animate-back');
      current.classList.add(direction > 0 ? 'vjs-peach-panel-animate-back' : 'vjs-peach-panel-animate-forward');
      panelTimer = setTimeout(() => {
        panelTimer = null; current.remove();
        menu.classList.remove('vjs-peach-popup-animating'); menu.style.height = '';
      }, PANEL_MS);
    });
    return next;
  };
  const button = (panel: HTMLElement, selector: string) => panel.querySelector<HTMLElement>(selector)!;
  /** Which face the menu is currently showing; track and size changes update that face in place (`refreshPanel`). */
  let view: 'main' | 'speed' | 'quality' | 'subtitles' | 'rotation' = 'main';
  const showMain = (direction = 0) => {
    view = 'main';
    const { active } = qualityRows(), speed = rememberRate.current();
    const panel = renderPanel(`<div class="vjs-peach-panel-menu"><button type="button" class="vjs-peach-menu-row" role="menuitemcheckbox" data-player-ambient aria-checked="${playerHost().settings().ambientMode}">
      ${icon('player-ambient')}<span>Ambient mode</span><i class="vjs-peach-switch" aria-hidden="true"></i></button>
      <button type="button" class="vjs-peach-menu-row" role="menuitem" data-player-speed>${icon('player-speed')}<span>Playback speed</span><b>${speed === 1 ? 'Normal' : `${speed}×`}</b>${icon('player-menu-next')}</button>
      <button type="button" class="vjs-peach-menu-row" role="menuitem" data-player-subtitles><span class="vjs-peach-menu-cc" aria-hidden="true">${subtitleIcon()}</span><span>Subtitles</span><b>${esc(subtitleControls?.label() || 'Off')}</b>${icon('player-menu-next')}</button>
      <button type="button" class="vjs-peach-menu-row" role="menuitem" data-player-rotation>${icon('rotate-cw', 'vjs-peach-menu-line-icon')}<span>Rotation</span><b>${rotation.angle()}°</b>${icon('player-menu-next')}</button>
      <button type="button" class="vjs-peach-menu-row" role="menuitem" data-player-quality-view>${icon('player-quality')}<span>Quality</span><b>${esc(active.label)}</b>${icon('player-menu-next')}</button>
      <div data-player-memory-error hidden><p class="vjs-peach-subtitle-status" role="status"></p><button type="button" class="vjs-peach-menu-row" data-player-memory-retry>Retry saving playback position</button></div></div>`, direction);
    button(panel, '[data-player-ambient]').onclick = () => { applyAmbientMode(!playerHost().settings().ambientMode); showMain() };
    button(panel, '[data-player-speed]').onclick = () => showSpeed();
    button(panel, '[data-player-subtitles]').onclick = () => subtitleControls?.show();
    button(panel, '[data-player-quality-view]').onclick = () => showQuality();
    button(panel, '[data-player-rotation]').onclick = () => showRotation();
    button(panel, '[data-player-memory-retry]').onclick = () => { void memory.retry() };
    syncMemoryError();
  };
  const syncMemoryError = () => {
    const message = menu.querySelector<HTMLElement>('[data-player-memory-error]');
    if (!message) return;
    message.hidden = !memory.error;
    message.querySelector('p')!.textContent = memory.error;
  };
  const showRotation = () => {
    view = 'rotation';
    const panel = renderPanel(`<div class="vjs-peach-panel-header"><button type="button" class="vjs-peach-menu-back" data-player-menu-back aria-label="Back to previous menu">${icon('player-menu-back')}</button><strong>Rotation</strong></div><div class="vjs-peach-panel-menu">${[0, 90, 180, 270].map(angle =>
      `<button type="button" class="vjs-peach-menu-option" role="menuitemradio" data-player-rotation-option="${angle}" aria-checked="${angle === rotation.angle()}"><span class="vjs-peach-option-check">${angle === rotation.angle() ? icon('player-option-check') : ''}</span><span class="vjs-peach-option-label">${angle}°${angle === 0 ? ' (original orientation)' : ''}</span></button>`).join('')}</div>`, 1);
    button(panel, '[data-player-menu-back]').onclick = () => showMain(-1);
    panel.querySelectorAll<HTMLElement>('[data-player-rotation-option]').forEach(option => {
      option.onclick = () => { rotation.set(Number(option.dataset.playerRotationOption)); showMain(-1) };
    });
  };
  /* The speed panel follows YouTube delhi-modern (player 9470c977's base.js): the slider's ends take the lowest and highest
     speeds the player supports, step 0.05, the plus and minus keys each move 0.05 and converge to two decimals, and the
     readout writes 1.00x. Preset pills take effect on the spot and the panel does not step back. The fifth cell, 3.0, is
     Premium-only upstream; the locally installed Peach has no membership tiers, so that cell stays as upstream has it minus
     the badge, and the slider's ceiling rises to 3, otherwise clicking 3.0 would converge back to 2. */
  const SPEED_MIN = .25, SPEED_MAX = 3, SPEED_STEP = .05, SPEED_PRESETS = [1, 1.25, 1.5, 2, 3];
  const speedLabel = (speed: number) => Number.isInteger(speed) ? speed.toFixed(1) : String(speed);
  const showSpeed = (direction = 1) => {
    view = 'speed';
    const min = SPEED_MIN, max = SPEED_MAX;
    const clampSpeed = (value: number) => Math.min(max, Math.max(min, Number(value.toFixed(2))));
    const panel = renderPanel(`<div class="vjs-peach-panel-header"><button type="button" class="vjs-peach-menu-back" data-player-menu-back aria-label="Back to previous menu">${icon('player-menu-back')}</button><strong>Playback speed</strong></div>
      <div class="vjs-peach-speed-panel"><div class="vjs-peach-speed-display"><output data-player-speed-display></output></div>
      <div class="vjs-peach-speed-slider"><button type="button" class="vjs-peach-speed-button" data-player-speed-step="-1" aria-label="Decrease playback speed by 0.05">${icon('minus')}</button>
      <input type="range" class="vjs-peach-speed-range" data-player-speed-range min="${min}" max="${max}" step="${SPEED_STEP}" aria-label="Playback speed">
      <button type="button" class="vjs-peach-speed-button" data-player-speed-step="1" aria-label="Increase playback speed by 0.05">${icon('plus')}</button></div>
      <div class="vjs-peach-speed-chips">${SPEED_PRESETS.map((speed) =>
        `<span class="vjs-peach-speed-preset"><button type="button" class="vjs-peach-speed-button" data-player-speed-option="${speed}" aria-pressed="false">${speedLabel(speed)}</button>${speed === 1 ? '<span class="vjs-peach-speed-preset-label">Normal</span>' : ''}</span>`).join('')}</div></div>`, direction);
    const display = panel.querySelector<HTMLOutputElement>('[data-player-speed-display]')!;
    const range = panel.querySelector<HTMLInputElement>('[data-player-speed-range]')!;
    // player.playbackRate() reads a cache that is written only after ratechange, so the panel remembers this speed change itself.
    let rate = clampSpeed(rememberRate.current());
    const syncSpeed = () => {
      display.textContent = `${rate.toFixed(2)}x`; range.value = String(rate);
      range.style.setProperty('--peach-speed-percent', `${(rate - min) / (max - min) * 100}%`);
      panel.querySelectorAll<HTMLElement>('[data-player-speed-option]').forEach((option) =>
        option.setAttribute('aria-pressed', String(Number(option.dataset.playerSpeedOption) === rate)));
    };
    const setSpeed = (value: number) => { rate = clampSpeed(value); rememberRate.set(rate); syncSpeed() };
    button(panel, '[data-player-menu-back]').onclick = () => showMain(-1);
    range.oninput = () => setSpeed(Number(range.value));
    panel.querySelectorAll<HTMLElement>('[data-player-speed-step]').forEach((step) => {
      step.onclick = () => setSpeed(rate + Number(step.dataset.playerSpeedStep) * SPEED_STEP);
    });
    panel.querySelectorAll<HTMLElement>('[data-player-speed-option]').forEach((option) => {
      option.onclick = () => setSpeed(Number(option.dataset.playerSpeedOption));
    });
    syncSpeed();
  };
  /** The quality column: painted once when the panel opens, repainted in place when tracks are added or removed or auto quality switches tracks, keeping focus on the same entry. */
  const fillQualityOptions = (list: HTMLElement) => {
    const { options, active } = qualityRows();
    const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.playerQualityOption : undefined;
    list.innerHTML = options.map((option) =>
      `<button type="button" class="vjs-peach-menu-option" role="menuitemradio" data-player-quality-option="${esc(option.key)}" aria-checked="${option.key === active.key}"><span class="vjs-peach-option-check">${option.key === active.key ? icon('player-option-check') : ''}</span><span class="vjs-peach-option-label">${esc(option.label)}</span></button>`).join('');
    const buttons = [...list.querySelectorAll<HTMLElement>('[data-player-quality-option]')];
    buttons.find((option) => focused !== undefined && option.dataset.playerQualityOption === focused)?.focus();
    buttons.forEach((option) => {
      option.onclick = () => {
        selectedQuality = option.dataset.playerQualityOption || 'auto';
        if (levels?.length) {
          for (let index = 0; index < levels.length; index++) levels[index]!.enabled = selectedQuality === 'auto' || selectedQuality === String(index);
        }
        /* The source tiers are four separate mp4 files, not multiple tracks of one stream, so only the src can be swapped.
           Remember the current position and playing state before switching: a source change reloads, and without resuming it means starting over. */
        if (sourceQualities?.length && selectedQuality.startsWith('h')) {
          const height = selectedQuality.slice(1);
          const at = player.currentTime() || 0, wasPlaying = !player.paused();
          const next = new URL(player.currentSrc() || video.src, location.origin);
          next.searchParams.set('quality', height);
          player.src({ src: next.pathname + next.search, type: 'video/mp4' });
          player.one('loadedmetadata', () => {
            if (at > 0) player.currentTime(at);
            if (wasPlaying) player.play()?.catch(() => {});
          });
        }
        showMain(-1);
      };
    });
  };
  const showQuality = (direction = 1) => {
    view = 'quality';
    const panel = renderPanel(`<div class="vjs-peach-panel-header"><button type="button" class="vjs-peach-menu-back" data-player-menu-back aria-label="Back to previous menu">${icon('player-menu-back')}</button><strong>Quality</strong></div><div class="vjs-peach-panel-menu"></div>`, direction);
    button(panel, '[data-player-menu-back]').onclick = () => showMain(-1);
    fillQualityOptions(button(panel, '.vjs-peach-panel-menu'));
  };
  /* With HLS adaptive bitrate, tracks register one by one at startup and the bitrate shifts with bandwidth, changing the video size as well: these events update only the badge and
     the surface currently open. Otherwise they would return to the main menu and kick someone out of the quality panel mid-choice with every track change. */
  const refreshPanel = () => {
    if (!isOpen()) { qualityRows(); return }
    const panel = menu.lastElementChild as HTMLElement | null;
    if (view === 'quality' && panel) { fillQualityOptions(button(panel, '.vjs-peach-panel-menu')); return }
    const { active } = qualityRows();
    const label = view === 'main' ? panel?.querySelector('[data-player-quality-view] b') : null;
    if (label) label.textContent = active.label;
    const angle = view === 'main' ? panel?.querySelector('[data-player-rotation] b') : null;
    const speed = view === 'main' ? panel?.querySelector('[data-player-speed] b') : null;
    if (angle) angle.textContent = `${rotation.angle()}°`;
    if (speed) speed.textContent = rememberRate.current() === 1 ? 'Normal' : `${rememberRate.current()}×`;
  };
  toggle.onclick = (event) => { event.stopPropagation(); const open = !isOpen(); if (open) showMain(); setOpen(open) };
  const outside = (event: Event) => { if (!root.contains(event.target as Node)) close() };
  document.addEventListener('pointerdown', outside);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) { event.preventDefault(); event.stopPropagation(); close(); toggle.focus() }
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && isOpen() && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      const buttons = [...menu.querySelectorAll<HTMLElement>('button:not([disabled]),input,a[href]')].filter(node => node.offsetParent !== null && !node.closest('[inert]'));
      const current = buttons.indexOf(document.activeElement as HTMLElement);
      buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }
  });
  video.addEventListener('loadedmetadata', refreshPanel);
  video.addEventListener('resize', refreshPanel);
  video.addEventListener('ratechange', refreshPanel);
  levels?.on?.(['addqualitylevel', 'removequalitylevel', 'change'], refreshPanel);
  const unsubscribeMemory = memory.subscribe(() => { syncMemoryError(); refreshPanel() });
  player.on('dispose', () => {
    unsubscribeMemory();
    video.removeEventListener('loadedmetadata', refreshPanel);
    video.removeEventListener('resize', refreshPanel);
    video.removeEventListener('ratechange', refreshPanel);
    panelRun++;
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener(PLAYER_PANEL_EVENT, closeSettingsForOtherPanel);
    if (panelTimer) clearTimeout(panelTimer);
  });
  subtitleControls = new SubtitleControls(player, video, {
    render: renderPanel, open: () => { view = 'subtitles'; setOpen(true) }, close,
    back: () => { subtitleControls?.hide(); showMain(-1) },
  });
  qualityRows();
  mountPlayerTheaterControl(player, root);
  mountPlayerChromeLayout(player);
  return (next) => { sourceQualities = next?.length ? next : null; refreshPanel() };
}

function mountPlayerTheaterControl(player: VjsPlayer, settingsRoot: Element): void {
  const controlBar = player.el().querySelector<HTMLElement>('.vjs-control-bar');
  if (!controlBar || controlBar.querySelector('[data-player-theater]')) return;
  const theater = playerHost().settings().theaterMode;
  const root = document.createElement('div'); root.className = 'vjs-peach-theater vjs-control';
  root.innerHTML = `<button type="button" data-player-theater aria-pressed="${theater}">${icon(theater ? 'theater-exit' : 'theater-enter')}</button>`;
  controlBar.insertBefore(root, settingsRoot.nextSibling);
  const theaterButton = root.querySelector('button')!;
  theaterSyncs.set(theaterButton, playerControlTooltip(theaterButton, 'Theater mode', 'T'));
  syncPlayerTheaterButton(theaterButton);
  theaterButton.onclick = (event) => { event.stopPropagation(); applyTheaterMode(!playerHost().settings().theaterMode) };
}

function mountPlayerChromeLayout(player: VjsPlayer): void {
  const controlBar = player.el().querySelector<HTMLElement>('.vjs-control-bar');
  if (!controlBar || controlBar.querySelector('.vjs-peach-right-controls')) return;
  const play = controlBar.querySelector<HTMLElement>(':scope>.vjs-play-control');
  if (play && !play.querySelector(':scope>.vjs-peach-hover')) play.insertAdjacentHTML('beforeend', '<span class="vjs-peach-hover" aria-hidden="true"></span>');
  const explicitIcon = (button: HTMLElement | null, name: string) => {
    if (!button) return null;
    button.dataset.peachExplicitIcon = '';
    button.insertAdjacentHTML('beforeend', icon(name, 'vjs-peach-control-icon'));
    return button.querySelector(':scope>.vjs-peach-control-icon use');
  };
  /* The play and mute keys' icons must morph themselves and cannot be swapped wholesale: what `<use>` clones is a shadow tree
     whose `d` cannot be edited and which takes no transitions. So these two keys move the sprite's <path> into their own svg,
     and CSS decides how the icon changes. Following YouTube delhi-modern (player 9470c977's base.js): play and pause are the
     same path with numbers interpolated over 200ms (upstream `eST` splits `d` into numbers and separators and interpolates
     digit by digit), and the volume arcs each scale over 250ms (upstream `jjc`: inner arc around (18,12), outer around
     (22,12)); both curves are `qn3`, that is cubic-bezier(.4,0,.2,1). */
  const morphIcon = (button: HTMLElement | null | undefined, name: string) => {
    if (!button) return null;
    const symbol = document.getElementById(`i-${name}`); if (!symbol) return null;
    button.dataset.peachExplicitIcon = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', symbol.getAttribute('viewBox') || '');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'vjs-peach-control-icon vjs-peach-morph-icon');
    svg.innerHTML = symbol.innerHTML; button.append(svg); return svg;
  };
  const spritePaths = (name: string) => [...(document.getElementById(`i-${name}`)?.querySelectorAll('path') || [])];
  const playIcon = morphIcon(play, 'player-play'), playPath = playIcon?.querySelector('path');
  const playD = spritePaths('player-play')[0]?.getAttribute('d') || '', pauseD = spritePaths('player-pause')[0]?.getAttribute('d') || '';
  const syncPlayTooltip = playerControlTooltip(play, 'Play', 'K');
  /* WebKit (Safari and every browser on iOS) does not support the CSS `d` property; writing it in style does nothing and the icon
     stays on the play glyph. There the path attribute is changed directly: no interpolation, an instant switch. */
  const cssPathD = CSS.supports('d', 'path("M0 0")');
  const syncPlayIcon = () => {
    const paused = player.paused() || player.ended(), d = paused ? playD : pauseD;
    if (playPath) { if (cssPathD) playPath.style.setProperty('d', `path("${d}")`); else playPath.setAttribute('d', d) }
    syncPlayTooltip(paused ? 'Play' : 'Paused');
  };
  player.on(['play', 'pause', 'ended'], syncPlayIcon); syncPlayIcon();
  const volume = controlBar.querySelector<HTMLElement>(':scope>.vjs-volume-panel');
  const mute = volume?.querySelector<HTMLElement>(':scope>.vjs-mute-control'), muteIcon = morphIcon(mute, 'player-volume');
  /* The muted icon moves into the same svg: the hollow speaker and the cross share a home with the solid speaker and the two arcs, and only when the arcs finish shrinking
     do the others fade in on top, swapped by opacity rather than replacing the whole svg. */
  if (muteIcon) spritePaths('player-volume-muted').forEach((path) => muteIcon.append(path.cloneNode(true)));
  const syncMuteTooltip = playerControlTooltip(mute, 'Muted', 'M');
  /* The outer arc follows volume: upstream `setVolume` gives 1 only above 50, else 0, and muting collapses both arcs together. */
  const syncVolumeIcon = () => {
    const silent = player.muted() || player.volume() === 0;
    if (muteIcon) { muteIcon.dataset.silent = String(silent); muteIcon.dataset.loud = String(!silent && player.volume() > .5) }
    syncMuteTooltip(silent ? 'Unmute' : 'Muted');
  };
  player.on('volumechange', syncVolumeIcon); syncVolumeIcon();
  /* The center flash follows YouTube delhi-modern (player 9470c977's www-player.css and base.js): a 78px frosted circle flashes
     the current action's icon, scaling 0 to 1.33 to 1 with a fade over 1s. Capture phase reads the state before the switch, so
     what flashes is exactly what was just done: while paused, clicking play flashes play. Keyboard shortcuts go through the
     same button's click path, so the keyboard needs no separate hook.
     Only this one flash circle may exist in the frame: every play-toggling entry in the player, the control bar's play and
     mute keys and the frame itself, funnels into this flashBezel. Hang a second 78px circle on the same frame, each reading
     state on its own timing, and one click would flash play on one and pause on the other, overlapping so neither is legible
     as the last action. */
  const bezel = document.createElement('div');
  bezel.className = 'vjs-peach-bezel'; bezel.setAttribute('role', 'status'); bezel.hidden = true;
  bezel.innerHTML = `<span class="vjs-peach-bezel-icon">${icon('player-play')}</span>`;
  const bezelUse = bezel.querySelector('use'); let bezelTimer: ReturnType<typeof setTimeout> | null = null;
  const flashBezel = (name: string, label: string) => {
    bezelUse?.setAttribute('href', `#i-${name}`); bezel.setAttribute('aria-label', label);
    bezel.hidden = false; bezel.classList.remove('vjs-peach-bezel-run');
    void bezel.offsetWidth; bezel.classList.add('vjs-peach-bezel-run');
    if (bezelTimer) clearTimeout(bezelTimer);
    bezelTimer = setTimeout(() => { bezel.hidden = true; bezel.classList.remove('vjs-peach-bezel-run') }, 1000);
  };
  controlBar.parentElement!.insertBefore(bezel, controlBar);
  player.el().addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('.vjs-mute-control')) {
      const silent = player.muted() || player.volume() === 0;
      flashBezel(silent ? 'player-volume' : 'player-volume-muted', silent ? 'Unmute' : 'Muted');
    } else if (target.closest('.vjs-play-control,.vjs-tech,.vjs-poster')) {
      const paused = player.paused() || player.ended();
      flashBezel(paused ? 'player-play' : 'player-pause', paused ? 'Play' : 'Paused');
    }
  }, true);
  player.on('dispose', () => { if (bezelTimer) clearTimeout(bezelTimer) });
  const time = document.createElement('button'); let remaining = false;
  time.type = 'button'; time.className = 'vjs-peach-time vjs-control'; time.dataset.playerTime = '';
  time.innerHTML = '<span class="vjs-peach-time-text"></span>';
  const timeText = time.querySelector('.vjs-peach-time-text')!;
  const syncTimeTooltip = playerControlTooltip(time, 'Show remaining time');
  const syncTime = () => {
    const current = Math.max(0, Number(player.currentTime()) || 0), duration = Math.max(0, Number(player.duration()) || 0);
    const left = fmtClock(Math.max(0, duration - current));
    timeText.textContent = `${remaining ? `-${left}` : fmtClock(current)} / ${fmtClock(duration)}`;
    time.dataset.remaining = String(remaining);
    syncTimeTooltip(remaining ? 'Show elapsed time' : 'Show remaining time', remaining
      ? `${left} remaining of ${fmtClock(duration)} total; click to show elapsed time`
      : `Played ${fmtClock(current)} of ${fmtClock(duration)}; click to show the time remaining`);
  };
  time.onclick = (event) => { event.stopPropagation(); remaining = !remaining; syncTime() };
  player.on(['timeupdate', 'durationchange', 'loadedmetadata'], syncTime); syncTime();
  if (volume) volume.insertAdjacentElement('afterend', time); else controlBar.append(time);
  const pip = controlBar.querySelector<HTMLElement>(':scope>.vjs-picture-in-picture-control');
  playerControlTooltip(controlBar.querySelector('.vjs-subtitles-control>button'), 'Subtitles');
  explicitIcon(pip, 'player-pip');
  // The i key belongs to the mini player (YouTube's aria-keyshortcuts="i"); picture-in-picture keeps only the button.
  const syncPipTooltip = playerControlTooltip(pip, 'Picture in picture');
  mountPlayerPipControl(player, pip, syncPipTooltip, text => playerHost().toast(text, { warn: true }));
  const fullscreen = controlBar.querySelector<HTMLElement>(':scope>.vjs-fullscreen-control');
  const fullscreenUse = explicitIcon(fullscreen, 'player-fullscreen-enter');
  const syncFullscreenTooltip = playerControlTooltip(fullscreen, 'Fullscreen', 'F');
  /* CSS's `.vjs-fullscreen` can only cover the paths where Video.js has already synced state classes. The browser may in
     practice take the full-window fallback, or fire fullscreenchange first and finish the class update a frame later.
     Registering the player's own `isFullscreen()` result into the DOM means filling the frame no longer depends on any one
 * implementation-detail class name. */
  const syncFullscreenState = () => {
    const active = !!player.isFullscreen();
    player.el().toggleAttribute('data-peach-fullscreen', active);
    fullscreenUse?.setAttribute('href', active ? '#i-player-fullscreen-exit' : '#i-player-fullscreen-enter');
    syncFullscreenTooltip(active ? 'Exit fullscreen' : 'Fullscreen');
    resizeSoon(player);
  };
  player.on(['fullscreenchange', 'enterFullWindow', 'exitFullWindow'], syncFullscreenState);
  syncFullscreenState();
  const controls = [
    pip,
    controlBar.querySelector<HTMLElement>(':scope>.vjs-subtitles-control'),
    controlBar.querySelector<HTMLElement>(':scope>.vjs-peach-settings'),
    controlBar.querySelector<HTMLElement>(':scope>.vjs-peach-theater'),
    fullscreen,
  ].filter((control): control is HTMLElement => !!control);
  if (!controls.length) return;
  const group = document.createElement('div'); group.className = 'vjs-peach-right-controls'; group.setAttribute('aria-label', 'Player view controls');
  controlBar.insertBefore(group, controls[0]!);
  controls.forEach((control) => {
    control.insertAdjacentHTML('beforeend', '<span class="vjs-peach-hover" aria-hidden="true"></span>');
    group.append(control);
  });
  /* Narrow-screen collapsing follows YouTube's criterion: in base.js 9470c977, player width `v.width<528` turns on
     ytp-xsmall-width-mode, collapsing the right side into "settings + expand", with the rest of the buttons spreading out on click. The criterion must be the
     player's own width, not the viewport; at the same viewport, theater mode and normal view differ greatly in player width. */
  const expand = document.createElement('div'); expand.className = 'vjs-peach-expand vjs-control';
  /* The highlight layer must hang at the `.vjs-control` tier: the lit rule is `>.vjs-peach-hover`, and stuffing it into the
     button is one tier short, leaving the expand key as the only one in the row without hover. It sits at the row's left end:
     the row is right-aligned overall, and when expanded the new buttons grow out of its right side, so an arrow pointing left
     matches what is about to happen. The arrow uses `i-player-expand`: the menu row's `>` is a 24 viewbox one-unit-thick
     hairline, only 1.3px at 32px; upstream's expand key ships a 32-viewbox two-unit-thick arrow, 2px at the same size. */
  expand.innerHTML = `<button type="button" data-player-expand aria-expanded="false">${icon('player-expand')}</button><span class="vjs-peach-hover" aria-hidden="true"></span>`;
  group.prepend(expand);
  const expandButton = expand.querySelector('button')!;
  const syncExpandTooltip = playerControlTooltip(expandButton, 'Expand controls');
  const setExpanded = (open: boolean) => {
    player.el().classList.toggle('vjs-peach-right-expanded', open);
    expandButton.setAttribute('aria-expanded', String(open)); syncExpandTooltip(open ? 'Collapse controls' : 'Expand controls');
  };
  expandButton.onclick = (event) => { event.stopPropagation(); setExpanded(!player.el().classList.contains('vjs-peach-right-expanded')) };
  const syncWidthMode = () => {
    const box = player.el(), narrow = box.clientWidth < 528;
    /* The settings panel must size its top against the player's height, but its positioned ancestor is only 36 px tall, so percentages cannot reach the player. */
    box.style.setProperty('--peach-player-h', `${box.clientHeight}px`);
    box.classList.toggle('vjs-peach-xsmall', narrow);
    if (!narrow) setExpanded(false);
  };
  const widthObserver = new ResizeObserver(syncWidthMode); widthObserver.observe(player.el());
  player.on('dispose', () => widthObserver.disconnect());
  setExpanded(false); syncWidthMode();
}

/** 进度条上的拖动预览：时间与那一秒的画面，取图与夹边见 `seek-preview.ts`。
 *
 *  有可用图时鼠标悬停显示；触屏按住拖动时显示、松手收起。没有可用图时不显示浮层。 */
export function mountPlayerSeekPreview(player: VjsPlayer, item: PlayerItem | null, options: { thumbnail?: boolean } = {}): void {
  const progress = player.el().querySelector<HTMLElement>('.vjs-control-bar .vjs-progress-control');
  if (!progress || progress.querySelector('[data-player-seek-preview]')) return;
  const preview = createSeekPreview(progress, item, options);
  const move = (event: PointerEvent) => {
    const duration = realDuration(player.duration()) || realDuration(item?.duration);
    if (!duration) return;
    const rect = progress.getBoundingClientRect();
    preview.prime();
    preview.show((event.clientX - rect.left) / rect.width, duration);
  };
  const hide = () => preview.hide();
  const lift = (event: PointerEvent) => { if (event.pointerType !== 'mouse') preview.hide() };
  const listeners: [string, (event: PointerEvent) => void][] = [
    ['pointerdown', move], ['pointermove', move], ['pointerleave', hide], ['pointerup', lift], ['pointercancel', hide],
  ];
  for (const [type, listener] of listeners) progress.addEventListener(type, listener as EventListener);
  player.on('dispose', () => {
    for (const [type, listener] of listeners) progress.removeEventListener(type, listener as EventListener);
    preview.dispose();
  });
}

/** The picture-in-picture window is drawn by the browser, and not one in-site control-bar key reaches into it. Media
 *  Session's action handlers are the only entry: only after registering `seekbackward` and `seekforward` does Chrome draw the
 *  rewind and fast-forward keys in that window, with the step from the settings' seconds; `setPositionState` lets its own
 *  progress bar know the current position, and `seekto` makes dragging it actually work. Without registration there are only
 *  play, pause and close. The in-site mini player is a different thing; those three keys live on the mini player itself. */
export function mountPlayerMediaSession(player: VjsPlayer, item: PlayerItem): void {
  const session = navigator.mediaSession;
  if (!session || typeof session.setActionHandler !== 'function') return;
  const total = () => realDuration(player.duration()) || realDuration(item.duration) || 0;
  const seekTo = (seconds: number) => {
    const duration = total();
    player.currentTime(Math.max(0, duration ? Math.min(duration, seconds) : seconds));
  };
  const step = () => Math.max(1, Number(playerHost().settings().seekSeconds) || 10);
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => { void player.play() }],
    ['pause', () => player.pause()],
    ['seekbackward', (details) => seekTo(player.currentTime() - (details?.seekOffset || step()))],
    ['seekforward', (details) => seekTo(player.currentTime() + (details?.seekOffset || step()))],
    ['seekto', (details) => { if (typeof details?.seekTime === 'number') seekTo(details.seekTime) }],
  ];
  const registered: MediaSessionAction[] = [];
  for (const [action, handler] of handlers) {
    /* Actions the browser does not know throw, known ones register as usual: one big try would let a single unknown action take down all the handlers after it,
       and the mini player would be back to only play and pause. */
    try { session.setActionHandler(action, handler); registered.push(action) } catch { /* Unrecognized action */ }
  }
  const syncPosition = () => {
    const duration = total(), position = Math.max(0, Number(player.currentTime()) || 0);
    if (typeof session.setPositionState !== 'function') return;
    /* Skip the report when duration is unavailable or the progress has run past it: `setPositionState` throws outright on either input,
       and `timeupdate` fires every second, so one throw becomes an error per second. */
    if (!duration || position > duration) return;
    try {
      session.setPositionState({ duration, position, playbackRate: Math.max(.001, Number(player.playbackRate()) || 1) });
    } catch { /* The browser rejected it */ }
  };
  player.on(['timeupdate', 'durationchange', 'ratechange', 'seeked', 'loadedmetadata'], syncPosition);
  syncPosition();
  player.on('dispose', () => {
    registered.forEach((action) => { try { session.setActionHandler(action, null) } catch { /* Withdrawn */ } });
    try { session.setPositionState?.() } catch { /* Withdrawn */ }
  });
}

/** The loading indicator reuses YouTube e937390a's `FsY`: four nested elements and four animations. */
export function mountPlayerSpinner(player: VjsPlayer): void {
  const spinner = player.el().querySelector('.vjs-loading-spinner');
  if (!spinner || spinner.querySelector('.vjs-peach-spinner-container')) return;
  spinner.innerHTML = '<span class="vjs-peach-spinner-container"><span class="vjs-peach-spinner-rotator"><span class="vjs-peach-spinner-left"><span class="vjs-peach-spinner-circle"></span></span><span class="vjs-peach-spinner-right"><span class="vjs-peach-spinner-circle"></span></span></span></span>';
}

/** External subtitles for local assets. The server has already converted srt/ass/ssa to WebVTT; this only attaches it as a text track.
 *  Never set default: auto-opening one track means choosing a language for the user, and one video often has Simplified, Traditional, and Japanese tracks.
 *  The Peach subtitles menu only appears when tracks exist; tracks attach to the native video and are kept with the same element. */
export function mountPlayerSubtitles(player: VjsPlayer, assetId: number): void {
  (api(`/api/assets/${assetId}/subtitles`) as Promise<{ subtitles?: { id: string; legacy_id?: string | null; playable?: boolean; src: string; language?: string; label: string }[] } | null>)
    .then((payload) => {
      if (!player || player.isDisposed()) return;
      (payload?.subtitles || []).filter((track) => track.playable).forEach((track) => {
        player.addRemoteTextTrack({ id: track.id, kind: 'subtitles', src: track.src, srclang: track.language || '', label: track.label, default: false,
          ...(track.legacy_id ? { legacyId: track.legacy_id } : {}) }, true);
      });
    }).catch(() => {});
}
