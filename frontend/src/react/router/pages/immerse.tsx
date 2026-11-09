/* Immersive mode's page element (ADR-0031): `/immerse` is in the page group, not an overlay and carries no background.
 *
 * When startup and unclaimed history changes land on `/immerse`, immersive opens on the entry named by the address's `?id=`
 * (`ShellActions.openImmerse`); after the top bar button claims the address write, the element opens it too. Each entry
 * switch inside immersive has the shell claim a replace write of `?id=`; the element keys by page-open epoch, so it neither
 * remounts nor reopens, and the entry count stays.
 *
 * Unmounting does not tear immersive down: navigating back away from `/immerse` leaves it open, dismissed by Escape or the
 * close key, and on dismissal the shell returns home and writes an address. */
import { useContext, type ReactNode } from 'react';

import { peachHistory } from '@peach/history';

import { ShellActionsContext, useOpenEpoch } from '../router';
import { useRouteOpen } from './overlay';

/* The one on the address: `?id=` counts only when numeric, otherwise start from the top. */
function startId(): number | undefined {
  const id = new URLSearchParams(peachHistory.navigation.location.search).get('id');
  return /^\d+$/.test(id || '') ? Number(id) : undefined;
}

function ImmerseOpen() {
  const actions = useContext(ShellActionsContext);
  useRouteOpen(() => { actions?.openImmerse(startId()) }, true);
  return null;
}

/** The `/immerse` element. */
export function ImmerseMatch(): ReactNode {
  return <ImmerseOpen key={useOpenEpoch()} />;
}
