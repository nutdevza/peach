/* Stubs and entries for the settings panel island (`settings-panel`): shared by `settings-panel.test.ts` and the design
 * decision cases (`design-*.test.ts`).
 *
 * `/api/settings`, which follows the database, and the two machine states (`/api/follow/schedule`, `/api/thumbnail-jobs`) each
 * get an in-memory stub: reads and writes are caught by it, so what was written can be inspected and "persists after refresh"
 * need not depend on state on a temporary service. */
import type { Browser, Page, Request } from 'playwright-core';

import { settle, visit, VIEWPORTS, type Viewport, type Visit } from './harness.ts';

export const PANEL = '#settingsPanel';
export const ORDER = ['', 'follow', 'jav', 'performers', 'tags', 'studios', 'flagged', 'manage'];
const DESKTOP = VIEWPORTS.find((viewport) => !viewport.mobile)!;

export interface Server {
  settings: Record<string, unknown>;
  schedule: Record<string, unknown>;
  thumbnails: Record<string, unknown>;
  /** Request bodies the three write endpoints received, in arrival order. */
  posts: { path: string; body: Record<string, unknown> }[];
}

const body = (request: Request) => JSON.parse(request.postData() || '{}') as Record<string, unknown>;

export async function stubServer(page: Page): Promise<Server> {
  const server: Server = {
    settings: {
      sidebarOrder: [...ORDER], metadataRefreshDays: 30, followInitialDays: 30, postSetupTutorialDone: true,
      organizeTemplates: {}, feedHideGroupCompilations: true, feedHideSoloCompilations: false, feedHideExcerpts: true,
      searchHistoryLimit: 10,
    },
    schedule: {
      available: true, enabled: true, interval_minutes: 180, running: false, last_error: null,
      last_finished_at: '2026-09-30T08:00:00Z', last_added: 3, next_run_at: null,
    },
    thumbnails: { mode: 'precise', status: 'idle' },
    posts: [],
  };
  const route = (path: string, merge: (sent: Record<string, unknown>) => Record<string, unknown>) =>
    page.route((url) => url.pathname === path, (handled) => {
      const request = handled.request();
      if (request.method() === 'GET') return handled.fulfill({ json: merge({}) });
      const sent = body(request);
      server.posts.push({ path, body: sent });
      return handled.fulfill({ json: merge(sent) });
    });
  await route('/api/settings', (sent) => {
    Object.assign(server.settings, sent);
    return { ok: true, ...server.settings };
  });
  await route('/api/follow/schedule', (sent) => Object.assign(server.schedule, sent));
  await route('/api/thumbnail-jobs', (sent) => Object.assign(server.thumbnails, sent));
  return server;
}

/** The gear opens the panel and stops on the `section` cell. On narrow screens the gear sits at the bottom of the drawer, so a click is dispatched directly; both widths go through the same entry. */
export async function openPanel(page: Page, section = 'Appearance & navigation'): Promise<void> {
  await page.locator('#settingsBtn').evaluate((button: HTMLElement) => button.click());
  await page.locator(`${PANEL}:not([hidden])`).waitFor({ timeout: 10_000 });
  if (section !== 'Appearance & navigation') await page.locator(PANEL).getByRole('tab', { name: section, exact: true }).click();
  await page.locator(PANEL).getByRole('tab', { name: section, exact: true })
    .and(page.locator('[aria-selected="true"]')).waitFor({ timeout: 5_000 });
}

/** Reload the home page once after the stubs are attached; the stubs catch everything from the first settings fetch on. */
export async function openHome(browser: Browser, viewport: Viewport = DESKTOP): Promise<Visit & { server: Server }> {
  const opened = await visit(browser, '/', viewport);
  const server = await stubServer(opened.page);
  await opened.page.reload({ waitUntil: 'load' });
  await opened.page.locator('#settingsBtn').waitFor({ state: 'attached', timeout: 15_000 });
  await settle(opened.page);
  return { ...opened, server };
}
