/** Upgrade repair and program installation display separately; both review and retry are explicitly user-initiated. */
import { useEffect, useState } from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { LinkButton } from '@/components/base/buttons/link-button';
import { REPAIR_CENTER_PATH } from '@peach/history';
import { apiSend } from '../../api';
import { useClientUpdates } from '../client-updates';
import type { ClientUpdates } from '../client-updates';
import { AnimatedNumber } from '../components/animated-number';
import { StatusLabel } from '../components/status-label';
import { ErrorText, ExternalLink, Fact, FactList, Footer, Help, Section, Stack, TaskCenterLink } from './section';
import { useAction } from './use-action';

const LABELS: Record<string, string> = { pending: 'Awaiting repair', running: 'Repairing', failed: 'Needs retry',
  review: 'Needs review', complete: 'Completed', unavailable: 'Not enabled in this deployment' };

export function UpgradeRepairs() {
  const { snapshot } = useClientUpdates();
  const [saved, setSaved] = useState<ClientUpdates['repairs'] | null>(null);
  const action = useAction();
  useEffect(() => setSaved(null), [snapshot]);
  const data = saved ?? snapshot?.repairs;
  const state = data?.state || 'pending';
  const pending = data?.items.reduce((count, row) => count + (row.pending || 0), 0) || 0;
  const failed = data?.items.reduce((count, row) => count + (row.failed || 0), 0) || 0;
  const review = data?.items.reduce((count, row) => count + (row.review_count || 0), 0) || 0;
  const retry = () => void action.run('retry', signal => apiSend<ClientUpdates['repairs']>(
    '/api/configuration/upgrade-repairs/retry', {}, 'POST', signal), next => {
    setSaved(next);
    document.dispatchEvent(new Event('peach:client-updates'));
  });
  return <Section id="upgradeRepairs" title="Auto repair" aside={<StatusLabel
    tone={state === 'failed' ? 'error' : state === 'running' ? 'progress' : state === 'review' ? 'warning'
      : state === 'complete' ? 'success' : 'neutral'}><span key={state}
        data-copy-key={`upgradeRepairs.${state}.status`}>{LABELS[state] || 'Not fetched'}</span></StatusLabel>}>
    <FactList>
      <Fact term="To do"><span><AnimatedNumber value={pending} /> items</span></Fact>
      <Fact term="Failed"><span><AnimatedNumber value={failed} /> items</span></Fact>
      <Fact term="To review"><span><AnimatedNumber value={review} /> items</span></Fact>
    </FactList>
    {data?.message || action.error ? <Stack><ErrorText>{action.error || data?.message}</ErrorText></Stack> : null}
    {state === 'running' ? <Stack><Help>Details and previews are completing in the background.</Help><TaskCenterLink /></Stack> : null}
    <Footer status={review ? <ExternalLink href="/api/configuration/upgrade-repairs/review">Download the review records</ExternalLink> : null}>
      <LinkButton href={REPAIR_CENTER_PATH} size="small" trailingIcon={RiArrowRightLine}>Repairs and migrations</LinkButton>
      <Button size="small" variant="secondary" disabled={!data?.available || state === 'running' || !!action.busy || (!failed && state !== 'failed')}
        onClick={retry}>Retry failed items</Button>
    </Footer>
  </Section>;
}
