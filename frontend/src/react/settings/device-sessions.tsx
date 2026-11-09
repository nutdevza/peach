/* Browsers that have logged in with the access password, revoked one at a time.
 *
 * The list is fetched separately: the server needs this request's cookie to recognize which row is the local machine. Revoking shares the same boundary as changing the password,
 * done only on the computer running Peach; opening elsewhere is view-only. Rows follow the BoardUI `SettingsRow` layout, with one extra terminal icon at the row start;
 * in the label, before the browser name is the browser mark (`BrowserIcon`), before the system term is the brand-color platform mark (Remix Icon);
 * `SettingsRow`'s label only takes text and BoardUI source is add-only, so this row is drawn here on its own. The local-machine marker is a `Chip`,
 * the revoke key is a BoardUI `Button`, and confirmation goes through `confirmModal()`. */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RiAndroidFill, RiAppleFill, RiComputerLine, RiDeviceLine, RiSmartphoneLine, RiTabletLine, RiWindowsFill,
} from '@remixicon/react';
import { confirmModal } from '@peach/legacy/ui';

import { Chip } from '@/components/base/badges/chip';
import { Button } from '@/components/base/buttons/button';

import { apiGet, apiSend, errorMessage } from '../../api';
import { BrowserIcon, browserIconId } from '../components/browser-icon';
import { devicesSkeleton, rememberShape } from '../../configuration-skeleton';
import { ErrorText, Footer, Help, Rows, Section, SectionSkeleton, Stack } from './section';
import './device-sessions.css';

const URL = '/api/configuration/access/sessions';

export interface DeviceSession {
  id: string; device: string; network: string; remote: boolean;
  created_at: number; last_seen: number; expires: number; legacy: boolean; current: boolean;
}
export interface DeviceSessionList { revision: string; sessions: DeviceSession[]; manageable: boolean }

const deviceName = (row: DeviceSession) => row.device || 'Unrecognized browser';

type Glyph = typeof RiComputerLine;
/* Platform badges use brand colors, like the adjacent browser badges (values in device-sessions.css); the official Apple badge is monochrome, so use the solid text color;
 * ChromeOS uses Chrome's colored badge directly. The device icon at the start of the row is an interface glyph, kept gray. */
const apple = { glyph: RiAppleFill, brand: 'apple' };
const android = { glyph: RiAndroidFill, brand: 'android' };
type Platform = { glyph: Glyph; brand: string } | { browser: string };

/** The OS token written by the server's `device_name()` → platform badge and device form. No generic Linux badge; only a device icon. */
const SYSTEMS: Record<string, { platform?: Platform; terminal: Glyph }> = {
  iPhone: { platform: apple, terminal: RiSmartphoneLine },
  iPad: { platform: apple, terminal: RiTabletLine },
  Android: { platform: android, terminal: RiSmartphoneLine },
  'Android 平板': { platform: android, terminal: RiTabletLine },
  ChromeOS: { platform: { browser: 'chrome' }, terminal: RiComputerLine },
  Windows: { platform: { glyph: RiWindowsFill, brand: 'windows' }, terminal: RiComputerLine },
  macOS: { platform: apple, terminal: RiComputerLine },
  Linux: { terminal: RiComputerLine },
};

const MARK = 'inline size-4 -mt-0.5 mr-1 align-middle';

function PlatformMark({ platform }: { platform: Platform }) {
  if ('browser' in platform) return <BrowserIcon name={platform.browser} className={MARK} />;
  const { glyph: Glyph, brand } = platform;
  return <Glyph aria-hidden data-platform-mark={brand} className={MARK} />;
}

/** The device name is 'Browser · System': a browser mark before the browser name, a platform mark before the system word; unrecognized words stay as-is, no icon. */
function DeviceLabel({ row }: { row: DeviceSession }) {
  if (!row.device) return deviceName(row);
  const parts = row.device.split(' · ');
  const system = SYSTEMS[parts.at(-1) ?? ''] ? parts.pop()! : '';
  const browser = parts.join(' · ');
  const platform = system ? SYSTEMS[system]!.platform : undefined;
  return (
    <>
      {browser ? <>{browserIconId(browser) ? <BrowserIcon name={browser} className={MARK} /> : null}{browser}</> : null}
      {browser && system ? ' · ' : null}
      {system ? <>{platform ? <PlatformMark platform={platform} /> : null}{system}</> : null}
    </>
  );
}

function TerminalIcon({ row }: { row: DeviceSession }) {
  const Terminal = SYSTEMS[row.device.split(' · ').at(-1) ?? '']?.terminal ?? RiDeviceLine;
  return <Terminal aria-hidden className="size-5 shrink-0 text-foreground-icon-secondary" />;
}

/** Same line spacing, dividers, and text scale as BoardUI's SettingsRow, plus a terminal icon on the left; labels can carry marks. */
function DeviceRow({ row, children }: { row: DeviceSession; children?: ReactNode }) {
  return (
    <div className="flex min-h-13 w-full items-center justify-between gap-4 border-b border-separator-border py-2.5 pr-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <TerminalIcon row={row} />
        <div className="flex min-w-0 flex-col">
          <p className="text-body-regular text-text-primary"><DeviceLabel row={row} /></p>
          <p className="text-body-2-regular text-text-secondary">{describe(row)}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Last activity is stored in minutes, so anything under a minute shows “Just now”. */
export function lastSeen(seconds: number, now = Date.now() / 1000): string {
  const elapsed = Math.max(0, now - seconds);
  if (elapsed < 60) return 'Just now';
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} minutes ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)} hours ago`;
  if (elapsed < 86400 * 30) return `${Math.floor(elapsed / 86400)} days ago`;
  return new Date(seconds * 1000).toLocaleDateString('zh-CN');
}

function origin(row: DeviceSession): string {
  if (row.network === 'loopback') return 'The computer running Peach';
  if (!row.network) return '';
  return row.remote ? `Public entry · ${row.network}` : row.network;
}

const describe = (row: DeviceSession) => [`Last active ${lastSeen(row.last_seen)}`, origin(row)].filter(Boolean).join(' · ');

/** Refetch when the access password changed (`revision` changed): the old rows are all invalidated. */
export function DeviceSessions({ revision, receipt }: { revision: string; receipt(message: string): void }) {
  const query = useQuery({
    queryKey: ['access-sessions', revision], refetchOnMount: 'always',
    queryFn: ({ signal }) => apiGet<DeviceSessionList>(URL, signal),
  });
  if (query.error) {
    return <Section title="Signed-in devices"><Stack><ErrorText>{errorMessage(query.error)}</ErrorText></Stack></Section>;
  }
  if (query.isFetching || !query.data) return <SectionSkeleton label="Reading signed-in devices" html={devicesSkeleton} />;
  return <DeviceList initial={query.data} receipt={receipt} />;
}

function DeviceList({ initial, receipt }: { initial: DeviceSessionList; receipt(message: string): void }) {
  const [list, setList] = useState(initial);
  useEffect(() => setList(initial), [initial]);
  const others = list.sessions.filter(row => !row.current);
  useEffect(() => {
    rememberShape('devices', { rows: Math.min(list.sessions.length, 8), manageable: list.manageable && others.length > 0 });
  }, [list, others.length]);

  const revoke = (row: DeviceSession) => void confirmModal({
    title: 'Sign out this device',
    body: `${deviceName(row)} (${describe(row)}) will need to re-enter the access password next time Peach is opened.`,
    confirmLabel: 'Sign out',
    onConfirm: async () => {
      setList(await apiSend<DeviceSessionList>(`${URL}/revoke`, { revision: list.revision, id: row.id }));
      receipt('Signed out');
    },
  });
  const revokeOthers = () => void confirmModal({
    title: 'Sign out the other devices',
    body: `The ${others.length} devices other than this one will need to re-enter the access password next time Peach is opened.`,
    confirmLabel: 'Sign out',
    onConfirm: async () => {
      const next = await apiSend<DeviceSessionList & { removed: number }>(`${URL}/revoke`, { revision: list.revision, scope: 'others' });
      setList(next);
      receipt(`Signed out ${next.removed} devices`);
    },
  });

  return (
    <Section title="Signed-in devices">
      {list.sessions.length
        ? <Rows>
            {list.sessions.map(row => (
              <DeviceRow key={row.id} row={row}>
                {row.current
                  ? <Chip color="blue" variant="caption">This device</Chip>
                  : list.manageable
                    ? <Button size="small" variant="secondary" aria-label={`Sign out ${deviceName(row)}`}
                        onClick={() => revoke(row)}>Undo</Button>
                    : null}
              </DeviceRow>
            ))}
          </Rows>
        : <Stack><Help>No browser has signed in with the access password yet.</Help></Stack>}
      {!list.manageable && others.length
        ? <Stack divided><Help>You must open this page on the computer running Peach to sign out.</Help></Stack>
        : null}
      {list.manageable && others.length
        ? <Footer status="Changing the access password signs out every device.">
            <Button variant="secondary" onClick={revokeOthers}>Sign out other devices</Button>
          </Footer>
        : null}
    </Section>
  );
}
