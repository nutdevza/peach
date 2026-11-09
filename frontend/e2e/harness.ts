/* Fixtures for real-browser smoke tests: open pages, collect runtime problems, measure layout geometry.
 *
 * Only playwright-core driving the machine's installed Chrome, no browser downloads; the path is probed by
 * `tests/test_web_e2e.py` and passed in via PEACH_E2E_CHROME. The service, database and demo library are also prepared on the
 * Python side; this only accepts PEACH_E2E_ORIGIN.
 *
 * Cases write only semantic assertions (no horizontal overflow, wait states end, no console errors) and do no screenshot
 * comparison: in a single-person deployment, maintaining baseline images costs more than it catches. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright-core';

export interface Viewport {
  name: string;
  width: number;
  height: number;
  mobile: boolean;
}

export const VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

export interface Visit {
  page: Page;
  /** Page exceptions, console.error, same-origin 4xx/5xx, and failed requests, in the order they happened. */
  problems: string[];
  close(): Promise<void>;
}

export interface Layout {
  viewportWidth: number;
  scrollWidth: number;
  /** Visible elements whose right edge crosses the viewport and that no ancestor clips horizontally, at most 5 listed. */
  offenders: string[];
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set: start the server with \`tests/test_web_e2e.py\` and run again`);
  return value;
}

export async function launch(): Promise<Browser> {
  // 界面语言默认跟浏览器语言走（ADR-0156）；用例断言的是中文文案，浏览器语言固定成简体中文，CI 上的 en-US 不影响结果。
  // Chromium 572515601 的回环随机端口缺陷（WSAENOBUFS 10055）由 Playwright 默认禁用的
  // `TcpPortRandomizationWin` 规避；这里不另传 --disable-features，否则会整串覆盖默认值。
  const args: string[] = ['--lang=zh-CN'];
  const networkLogs = process.env.PEACH_E2E_NET_LOG_DIR;
  if (networkLogs) {
    mkdirSync(networkLogs, { recursive: true });
    const filename = `network-${process.pid}-${randomUUID()}.json`;
    args.push(`--log-net-log=${join(networkLogs, filename)}`, '--net-log-capture-mode=HeavilyRedacted');
    console.info(`Browser network event log: ${filename}`);
  }
  return chromium.launch({
    headless: true,
    executablePath: requiredEnv('PEACH_E2E_CHROME'),
    args,
    // Windows gives first-time browser and system component loads a separate startup budget; page waits are bounded by each test.
    timeout: 60_000,
  });
}

/** On failure, keep the focus, input and popover scene intact; the success path makes no extra page query. */
export async function withPageDiagnostics<T>(page: Page, where: string | (() => string), action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const state = await page.evaluate(() => ({
      path: location.pathname + location.search,
      ready: document.readyState,
      focus: document.activeElement?.outerHTML.slice(0, 600),
      query: document.querySelector<HTMLInputElement>('#q')?.value,
      layers: [...document.querySelectorAll('dialog,[role="dialog"],#searchMenu')].slice(0, 12).map(node => ({
        tag: node.tagName, id: node.id, hidden: (node as HTMLElement).hidden,
        expanded: node.getAttribute('aria-expanded'), text: node.textContent?.slice(0, 600),
      })),
      busy: [...document.querySelectorAll('[aria-busy="true"],[data-skeleton]')]
        .filter(node => !node.closest('[data-content-skeleton][aria-hidden="true"]'))
        .slice(0, 12).map(node => ({ tag: node.tagName, id: node.id, label: node.getAttribute('aria-label') })),
    })).catch(() => 'Not fetched');
    const tree = await page.locator('body').ariaSnapshot({ timeout: 2000 }).catch(() => 'Not fetched');
    throw new Error(`${typeof where === 'function' ? where() : where}: ${String(error)}
Page state: ${JSON.stringify(state)}
Accessibility tree:
${tree.slice(0, 4000)}`,
      { cause: error });
  }
}

/** Wait states are judged by `aria-busy="true"` and `data-skeleton`; a timeout means a wait state is stuck.
 * Both markers are written by the page itself: islands, legacy templates and React subtrees must all emit them for this to
 * see anything.
 *
 * It only proves "nothing is waiting", not that the page rendered: it also holds immediately when the body rendered nothing
 * at all. So callers wait for the target page's own body to appear first, then call this.
 *
 * `except` is a wait the case itself pins and that will never end (a next page intentionally not answered, for example),
 * excluded by selector. */
export async function settle(page: Page, scope = 'body', { except = '' }: { except?: string } = {}): Promise<void> {
  /* The activity page and library page keep polling task status and never guarantee entering `networkidle`. Navigation is awaited by
     `visit()` until load, and the body is verified by the caller's `expectBody()`; here we only wait for Peach's own
     public waiting states to end. */
  try {
    await page.waitForFunction(
      ({ selector, except }) => {
        const root = document.querySelector(selector);
        const waiting = (node: Element) => node.matches('[aria-busy="true"],[data-skeleton]')
          && !node.closest('[data-content-skeleton][aria-hidden="true"]') && !(except && node.matches(except));
        return !!root && !waiting(root) && ![...root.querySelectorAll('[aria-busy="true"],[data-skeleton]')].some(waiting);
      },
      { selector: scope, except }, { timeout: 15_000 });
  } catch (error) {
    const pending = await page.evaluate(({ selector, except }) => {
      const root = document.querySelector(selector);
      if (!root) return { missing_scope: selector };
      const waiting = (node: Element) => node.matches('[aria-busy="true"],[data-skeleton]')
        && !node.closest('[data-content-skeleton][aria-hidden="true"]') && !(except && node.matches(except));
      const nodes = [...root.querySelectorAll('[aria-busy="true"],[data-skeleton]')].filter(waiting);
      if (waiting(root)) nodes.unshift(root);
      return nodes.slice(0, 12).map(node => {
        const box = node.getBoundingClientRect();
        return { tag: node.tagName, id: node.id, skeleton: node.getAttribute('data-skeleton'),
          label: node.getAttribute('aria-label'), scope: node.closest('dialog')?.id || 'page',
          width: box.width, height: box.height };
      });
    }, { selector: scope, except }).catch(() => 'Not fetched');
    throw new Error(`Page waiting state did not finish: ${JSON.stringify(pending)}\n${(error as Error).message}`);
  }
}

/** Wait for the target page's own body to appear: every locator must be visible before `settle` gets its turn.
 * On timeout, fail with the accessibility tree of the current `#main`: on CI this output is all there is, showing whether it stuck on skeleton,
 * an empty state's changed copy, or a block that never painted. */
export async function expectBody(page: Page, where: string, body: readonly Locator[], problems: readonly string[] = []): Promise<void> {
  for (const locator of body) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 15_000 });
    } catch (error) {
      const snapshot = await page.locator('#main').ariaSnapshot({ timeout: 5_000 }).catch(() => 'Not fetched');
      assert.fail(`${where}: the page body never appeared, timed out waiting for ${locator}\n${(error as Error).message}\n`
        + `Page: ${page.url()}; closed: ${page.isClosed()}; runtime problems: ${JSON.stringify(problems)}\n`
        + `The accessibility tree of #main at that moment:\n${snapshot.slice(0, 3000)}`);
    }
  }
}

/** The Peach config page body: the title and the default library section. */
export function configurationBody(page: Page): Locator[] {
  return [
    page.locator('#main').getByRole('heading', { name: 'Peach configuration', exact: true }),
    page.locator('#stats').getByRole('tab', { name: 'Library and imports' }),
  ];
}

export async function visit(browser: Browser, path: string, viewport: Viewport,
  prepare?: (page: Page) => Promise<void>): Promise<Visit> {
  const origin = requiredEnv('PEACH_E2E_ORIGIN');
  const context: BrowserContext = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
    reducedMotion: 'reduce',
  });
  // Detail pages autoplay by default; someone sits next to this machine, so the smoke test stays silent.
  await context.addInitScript(() => {
    localStorage.setItem('peach.settings.v1', JSON.stringify({ detailAutoplay: false }));
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      problems.push(`${response.status()} ${response.url().slice(origin.length)}`);
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (request.url().startsWith(origin) && !reason.includes('ERR_ABORTED')) {
      problems.push(`failed ${request.url().slice(origin.length)} ${reason}`);
    }
  });
  /* `route.fetch` and `route.continue` in stub callbacks may not have returned by the time the context is closed; afterwards they fail with
   * "Request context disposed"; nobody is awaiting them, so it becomes a whole-file unhandledRejection.
   * `ignoreErrors` first removes all the stubs, so the few in-flight ones silently return when they fail. */
  const close = async () => {
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  };
  // Opens only up to load: which body to wait for and when to settle is up to the test case, see the `settle` docs.
  try {
    await prepare?.(page);
    await page.goto(origin + path, { waitUntil: 'load' });
  } catch (error) {
    await close();
    throw error;
  }
  return { page, problems, close };
}

/** Stubs for the timeline preview: `/api/timeline` returns self-captured contact sheets at a fixed interval, and `/timeline` returns a composited 10×10 grid,
 * each cell labeled with its "page-cell" index, so a screenshot shows which cell was fetched. Returns the number of requests per page. */
export async function stubTimelineSheets(page: Page, { frames, interval }: { frames: number; interval: number }) {
  const requested = new Map<number, number>();
  await page.route((url) => url.pathname === '/api/timeline', (route) => route.fulfill({
    json: { source: 'peach', frames, interval, sheets: Math.ceil(frames / 100), columns: 10, rows: 10, frame_width: 160 },
  }));
  await page.route((url) => url.pathname === '/timeline', (route) => {
    const sheet = Number(new URL(route.request().url()).searchParams.get('s'));
    requested.set(sheet, (requested.get(sheet) ?? 0) + 1);
    const count = Math.min(100, frames - sheet * 100), rows = Math.ceil(count / 10);
    const cells = Array.from({ length: count }, (_, slot) => {
      const x = slot % 10 * 160, y = Math.floor(slot / 10) * 90;
      return `<rect x="${x}" y="${y}" width="160" height="90" fill="hsl(${(sheet * 100 + slot) * 7 % 360} 40% 35%)"/>`
        + `<text x="${x + 80}" y="${y + 58}" font-size="36" font-family="sans-serif" fill="#fff" text-anchor="middle">${sheet}-${slot}</text>`;
    }).join('');
    return route.fulfill({ contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${rows * 90}">${cells}</svg>` });
  });
  return requested;
}

/* The overflow list reports root causes only: once a page is stretched wide, the mobile viewport widens with it, and `fixed` top bars and Toasts stretch out
 *  together; truncating the first few in document order would leave only symptoms. So skip `fixed` and its descendants, keeping only
 *  layers whose parent itself does not overflow. */
/** Check whether actually scrollable areas are taken over by the unified slider or a horizontal gesture. */
export async function unmanagedScrollers(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')].flatMap(node => {
    if (!(node instanceof HTMLElement) || node.closest('.ovtrack,.ui-ov-edges,[data-skeleton],[inert]')) return [];
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') return [];
    const vertical = /^(auto|scroll)$/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    const horizontal = /^(auto|scroll)$/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
    if (!vertical && !horizontal) return [];
    if (node.hasAttribute('data-overlay-scrollbar')) return [];
    if (!vertical && (node.hasAttribute('data-horizontal-scroll') || node.hasAttribute('data-scroll-gesture'))) return [];
    return [`${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}.${String(node.className).slice(0, 120)}`];
  }));
}

export async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const excused = (element: Element): boolean => {
      if (getComputedStyle(element).position === 'fixed') return true;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowX !== 'visible' || style.position === 'fixed') return true;
      }
      return false;
    };
    const label = (element: Element): string => {
      const id = element.id ? `#${element.id}` : '';
      const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const overflowing = new Set<Element>();
    for (const element of document.body.querySelectorAll('*')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || box.right <= width + 1) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || excused(element)) continue;
      overflowing.add(element);
    }
    const offenders = [...overflowing]
      .filter((element) => !element.parentElement || !overflowing.has(element.parentElement))
      .slice(0, 5)
      .map((element) => `${label(element)} right=${Math.round(element.getBoundingClientRect().right)}`);
    return {
      viewportWidth: width,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      offenders,
    };
  });
}
