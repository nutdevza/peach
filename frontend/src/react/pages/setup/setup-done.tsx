/* Setup complete: whether scanning is queued, the entrance into Peach, and run info collapsed by default. The passphrase does not appear on the page.
 *
 * The standalone-package server gives the entrance URL in `redirect` and jumps there itself after `RESTART_REDIRECT_MS`, the same number as the config page's wait for the tray's process swap after save. */
import { useEffect, useRef } from 'react';

import { ButtonLink } from '@/components/base/buttons/button';

import { RESTART_REDIRECT_MS } from '../../restart-redirect';
import { Disclosure, ExternalLink, Fact, FactList } from '../../settings/section';
import type { SetupDone } from './setup-api';
import { SetupShell } from './setup-scene';

export function SetupDoneView({ done }: { done: SetupDone }) {
  const entry = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    document.title = 'Peach · Setup complete';
    entry.current?.focus();
  }, []);

  useEffect(() => {
    const target = done.redirect;
    if (!target) return undefined;
    const timer = setTimeout(() => location.assign(target), RESTART_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [done.redirect]);

  return (
    <SetupShell step="done">
    <section data-setup-form-panel="" aria-labelledby="auth-card-title">
      <div data-setup-top=""><span className="text-body-2-regular text-text-secondary">Setup complete</span></div>
      <div data-setup-step-scroll=""><div data-setup-step-content="">
      <header data-setup-step-heading="">
        <h1 id="auth-card-title" className="text-title-1-semibold text-text-primary">You are all set</h1>
        <p className="text-body-regular text-text-secondary">Your Peach is ready.</p>
      </header>
      <div>
      <p className="text-body-regular text-text-primary">
        {done.restored ? 'Connected to the existing data directory.' : done.skip_media
          ? 'Add media directories under "Media Library & Ingest" to start scanning.' : done.scan_requested
          ? 'The first scan is queued and will organize the library in the background; Peach stays usable meanwhile.'
          : 'Start scanning the library later from the configuration page.'}
      </p>
      <Disclosure summary="Runtime info">
        <FactList>
          {done.facts.map((fact) => (
            <Fact key={fact.term} term={fact.term}>
              {fact.value}
              {fact.install_tool
                ? <span className="text-text-secondary">You can install it on the configuration page under App and maintenance.</span>
                : fact.download_url
                ? <ExternalLink href={fact.download_url}>{fact.download_label ?? fact.download_url}</ExternalLink>
                : null}
            </Fact>
          ))}
        </FactList>
      </Disclosure>
      </div></div></div>
      <footer data-setup-footer="" data-setup-footer-end="" data-copy-interact>
        <ButtonLink ref={entry} href={done.url}>{done.history_guide ? 'Import browser history' : 'Enter Peach'}</ButtonLink>
      </footer>
    </section>
    </SetupShell>
  );
}
