/* The standalone pages bundle's build entry (`web/dist/peach-pages.js`).
 *
 * The first-run, login and error pages share the server-provided HTML template with a single mount point `#peach-page` in
 * the shell: `data-page` says which page, and the other `data-*` attributes are variables only the server knows, passed
 * through as-is. This output depends on no module of the main UI: it does not load the main bundle, carries no Query cache,
 * and shared controls (collapse, source site marks) are bundled in directly by `vite.pages.config.ts`. All three pages use
 * the browser's native scrollbar. Popovers land on body, and body itself is the `.peach-react` container.
 *
 * This bundle is fetchable without a session (ADR-0094): it must not import other outputs, and must not embed data derived
 * from the database, configuration or credentials. */
import './pages.css';
import { installErrorReporting } from '../../error-reporting';

import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

import { ErrorPage } from './error/error-page';
import { LoginPage } from './login/login-page';
import type { PageData } from './page-data';
import { SetupPage } from './setup/setup-page';

const PAGES: Readonly<Record<string, ComponentType<{ data: PageData }>>> = {
  setup: SetupPage,
  login: LoginPage,
  error: ErrorPage,
};

installErrorReporting();
const mount = document.getElementById('peach-page');
const Page = mount ? PAGES[mount.dataset.page ?? ''] : undefined;
if (mount && Page) createRoot(mount).render(<Page data={{ ...mount.dataset }} />);
