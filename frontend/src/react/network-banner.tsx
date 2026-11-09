/** The full-width banner for when the outside internet is unreachable: reads the snapshot the server probed through Peach's proxy, and disappears on its own once back online. */
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api';

export interface NetworkStatus { state: 'checking' | 'online' | 'offline' | 'unknown'; checked_at: number | null }

export const NETWORK_STATUS_KEY = ['network-status'] as const;
export const NETWORK_OFFLINE_TEXT = 'Peach cannot reach the internet, so profile collection, follow updates and online sources are unavailable for now; local media still browses and plays normally.';

/** While the server is online it rechecks only every ten minutes, or every minute when offline or just starting to probe; the page reads at its cadence. */
export function networkPollInterval(data?: NetworkStatus): number {
  return data?.state === 'online' ? 120_000 : 30_000;
}

export function NetworkBanner() {
  const query = useQuery({
    queryKey: NETWORK_STATUS_KEY,
    queryFn: ({ signal }) => apiGet<NetworkStatus>('/api/network-status', signal),
    refetchInterval: current => networkPollInterval(current.state.data),
    retry: false,
  });
  const host = document.querySelector('[data-network-banner]');
  if (query.data?.state !== 'offline' || !host) return null;
  return createPortal(
    <aside className="ui-project-banner ui-project-banner-warning" role="status" data-network-offline="">
      <div><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-alert" /></svg><p>{NETWORK_OFFLINE_TEXT}</p></div>
      <a href="/settings/network#peachProxy">Check Peach proxy</a>
    </aside>,
    host,
  );
}
