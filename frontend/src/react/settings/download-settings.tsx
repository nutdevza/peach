/* "Cloud download": hand magnet links to 115 or PikPak for offline download; files land in the mounted cloud drive directory
 * and are added to the library by push discovery.
 *
 * Two cards. The first is the address, token, target directory and wait limit: 115 goes through CloudDrive2's gRPC, and the
 * token is generated in CloudDrive2 under "Settings, API tokens". The check asks CloudDrive2 whether offline access is
 * granted, whether the target directory can go offline, and how much 115 quota remains; read-only, nothing is submitted: when
 * address and token are already saved, opening the card queries once per the saved configuration, the "Save configuration"
 * response also carries a copy, and the "Check" button re-queries with the values currently filled in. When the 115 target
 * directory is saved empty, the server picks a directory per push discovery, or stores directly if one already exists. When
 * the address, an unsaved target directory, or the PikPak root is empty, the check fills the detected, push-discovery-derived
 * values back into the form; they only persist on "Save configuration". If the derived directory does not exist, a "Create
 * this directory" button appears and only clicking it creates it in CloudDrive2. The second card is the PikPak account,
 * offering username-plus-password and browser login.
 *
 * Tokens and passwords are only written to the local credential file, and the read endpoint only says whether anything was
 * saved, so the token box clears after saving and the hint becomes "Saved; leave empty to keep". When PikPak requires a human
 * verification, the server returns a verification page address; here it is offered as a link for the user to complete in the
 * browser. Peach does not pass the verification for them. */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { StatusLabel } from '../components/status-label';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';

import { apiGet, apiSend, errorMessage } from '../../api';
import type {
  ConfigurationPanel, DownloadCheckReport, DownloadConfig, DownloadSaveResult, DownloadSettingsState, PikPakLoginResult,
} from '../bundle';
import { LoadingDots } from '../components/loading-dots';
import { Note } from '../components/note';
import { SourceLabel, providerIcon } from '../components/source-label';
import { groupRoot } from './configuration-panel';
import {
  ErrorText, ExternalLink, Fact, FactList, FieldLabel, Footer, Help, Section, Stack,
} from './section';
import { busyProps, useAction } from './use-action';
import { JavBrowserSettings } from './jav-browser-settings';
import { CLOUD_LOCATIONS } from '../../core/media-sources';

export const DOWNLOADS_URL = '/api/configuration/downloads';
const CHECK_URL = '/api/configuration/downloads/check';
const FOLDER_URL = '/api/configuration/downloads/folder';
const LOGIN_URL = '/api/configuration/downloads/pikpak/login';
const LOGOUT_URL = '/api/configuration/downloads/pikpak/logout';
const BROWSER_URL = '/api/configuration/downloads/pikpak/browser-login';
const POLL_MS = 2000;
const PikPakIcon = providerIcon('pikpak');

/** The "Download channels" group: CloudDrive2 and PikPak accounts. */
export function DownloadGroup({ initial, receipt, panel, issues }: {
  initial?: DownloadSettingsState;
  receipt(message: string): void;
  panel?: ConfigurationPanel;
  issues?: ReactNode;
}) {
  return (
    <div {...groupRoot(panel)}>
      {issues}
      {initial ? <DownloadSettings initial={initial} receipt={receipt} /> : null}
    </div>
  );
}

export function DownloadSettings({ initial, receipt }: {
  initial: DownloadSettingsState;
  receipt(message: string): void;
}) {
  const [state, setState] = useState(initial);
  // The account box sits in this upper layer: the cloud download card needs to know whether the user is on PikPak, and skips the PikPak root notice when they are not.
  const [username, setUsername] = useState('');
  useEffect(() => {
    setState(current => ({ ...current, media_sources: initial.media_sources, pikpak_roots: initial.pikpak_roots }));
  }, [initial.media_sources, initial.pikpak_roots]);
  const sources = state.media_sources ?? [];
  const hasPikPak = sources.includes('pikpak');
  const hasCloud = sources.some(source => CLOUD_LOCATIONS.includes(source));
  const pikpakAccount = hasPikPak && (state.pikpak.logged_in || Boolean(username.trim()));
  return (
    <>
      {hasCloud ? <DownloadForm state={state} settle={setState} receipt={receipt} pikpakAccount={pikpakAccount} /> : null}
      {hasPikPak ? <PikPakAccount state={state} settle={setState} receipt={receipt} username={username} setUsername={setUsername} /> : null}
      <JavBrowserSettings receipt={receipt} refreshKey={JSON.stringify([
        state.media_sources, state.config, state.token_set, state.pikpak.logged_in,
      ])} />
    </>
  );
}

interface CardProps {
  state: DownloadSettingsState;
  settle(next: DownloadSettingsState): void;
  receipt(message: string): void;
}

function DownloadForm({ state, settle, receipt, pikpakAccount }: CardProps & { pikpakAccount: boolean }) {
  const [config, setConfig] = useState<DownloadConfig>(state.config);
  const [token, setToken] = useState('');
  const [hours, setHours] = useState(String(state.config.wait_hours));
  const [report, setReport] = useState<DownloadCheckReport | null>(null);
  const [detected, setDetected] = useState('');
  const [suggested, setSuggested] = useState<Suggestions>(NO_SUGGESTIONS);
  const [failure, setFailure] = useState('');
  const [saveBlocked, setSaveBlocked] = useState(false);
  const action = useAction();
  const sources = state.media_sources ?? [];
  const has115 = sources.includes('115');
  const hasPikPak = sources.includes('pikpak');
  const target = (key: '115' | 'pikpak') => config.targets[key] ?? '';
  const setTarget = (key: '115' | 'pikpak', value: string) =>
    setConfig({ ...config, targets: { ...config.targets, [key]: value } });
  // Check the directory marked nonexistent that the user never touched: saving and submitting would only report 'no such folder'.
  const missing = has115 && Boolean(suggested.target && !suggested.target.exists && target('115') === suggested.target.path);

  // Applies a check report onto the form: suggested values fill an empty address, 115 target folder, and PikPak root, without overwriting anything the user entered.
  // `saved` is the 115 target folder the server already stored when saving; it is no longer filled back in, and the "takes effect after saving" line is gone.
  const show = (next: DownloadCheckReport, blank: Blanks, saved = '') => {
    const folder = blank.target ? next.suggested_target : null;
    const stored = Boolean(folder && saved && folder.path === saved);
    const root = blank.root ? next.suggested_pikpak_root : '';
    setConfig((current) => ({
      ...current,
      clouddrive_address: blank.address && next.address ? next.address : current.clouddrive_address,
      targets: folder && !stored ? { ...current.targets, '115': folder.path } : current.targets,
      pikpak_root: root || current.pikpak_root,
    }));
    setReport(next);
    setDetected(blank.address ? next.address : '');
    setSuggested({ target: folder, root, saved: stored });
    setSaveBlocked(false);
    setFailure('');
  };

  // When both address and token are saved, opening the card runs a check against the saved config right away; the token is fetched server-side only and never passes through the page.
  useEffect(() => {
    if (!state.available || !state.config.clouddrive_address || !state.token_set) return;
    const blank = { address: false, target: !state.config.targets['115'], root: !state.config.pikpak_root };
    void action.run('auto', (signal) => apiGet<DownloadCheckReport>(CHECK_URL, signal),
      (next) => show(next, blank), (cause) => setFailure(errorMessage(cause)));
    // Queried only once on mount; "Save configuration" and "Check" take over after that.
  }, []);

  // The save response carries a check report built from the saved configuration, rendered directly; when the 115 target folder was left empty, the server has already filled it in from push discovery.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (missing) {
      setSaveBlocked(true);
      return;
    }
    const blankTarget = !target('115').trim();
    const body = { ...config, wait_hours: hours, token, pikpak_account: pikpakAccount };
    void action.run('save', (signal) => apiSend<DownloadSaveResult>(DOWNLOADS_URL, body, 'POST', signal),
      (next) => {
        const { report: checked, ...settings } = next;
        settle(settings);
        setConfig(settings.config);
        setHours(String(settings.config.wait_hours));
        setToken('');
        if (checked) {
          show(checked, { address: !settings.config.clouddrive_address, target: blankTarget,
            root: !settings.config.pikpak_root }, settings.config.targets['115'] ?? '');
        } else {
          setReport(null);
          setDetected('');
          setSuggested(NO_SUGGESTIONS);
          setSaveBlocked(false);
          setFailure('');
        }
        receipt('Configuration saved');
      }, (cause) => setFailure(errorMessage(cause)));
  };

  // "Check" re-queries with the values filled right now: an empty address has the server probe local ports, an empty catalog takes suggested values from push discovery.
  const check = () => {
    const blank = { address: !config.clouddrive_address.trim(), target: !target('115').trim(),
      root: !config.pikpak_root };
    const body = { clouddrive_address: config.clouddrive_address, token, target: target('115'),
      pikpak_root: config.pikpak_root, pikpak_account: pikpakAccount };
    void action.run('check', (signal) => apiSend<DownloadCheckReport>(CHECK_URL, body, 'POST', signal),
      (next) => show(next, blank), (cause) => setFailure(errorMessage(cause)));
  };

  // CloudDrive2 creates the folder only when the user clicks "create this folder"; once created, the server checks again against that folder.
  const create = (path: string) => {
    const body = { clouddrive_address: config.clouddrive_address, token, path, pikpak_root: config.pikpak_root,
      pikpak_account: pikpakAccount };
    void action.run('folder', (signal) => apiSend<DownloadCheckReport>(FOLDER_URL, body, 'POST', signal),
      (next) => {
        setReport(next);
        setSuggested((current) => ({ ...current, target: { path, exists: true } }));
        setSaveBlocked(false);
        setFailure('');
        receipt('Catalog created');
      }, (cause) => setFailure(errorMessage(cause)));
  };

  return (
    <Section guide="download" title="Cloud download" onSubmit={submit}>
      {state.problems?.length ? <Stack><Note tone="error" title="Cloud download configuration needs checking">{state.problems.join('\n')}</Note></Stack> : null}
      <Stack>
        <Input label="CloudDrive2 address" placeholder="Leave empty to look up automatically" autoComplete="off" maxLength={200}
          value={config.clouddrive_address} isDisabled={!state.available}
          onChange={(value) => setConfig({ ...config, clouddrive_address: value })} />
        <Input label="CloudDrive2 API token" type="password" autoComplete="off" maxLength={400}
          placeholder={state.token_set ? 'Saved; leave empty to keep' : 'Generated in CloudDrive2 under "Settings → API tokens"'}
          hint="Offline task permission required."
          value={token} isDisabled={!state.available} onChange={setToken} />
        {has115 ? <Input label={<SourceLabel source="115" label="115 target folder" />} placeholder="Left empty, filled automatically from the library folder" autoComplete="off" maxLength={300}
          validationBehavior="aria" isInvalid={missing}
          hint={missing ? (saveBlocked ? 'Create this folder first, or fill in an existing one.' : 'This folder does not exist.') : 'Should sit inside the auto-intake cloud path prefix.'}
          value={target('115')} isDisabled={!state.available} onChange={(value) => setTarget('115', value)} /> : null}
        {hasPikPak ? <><Input label={<SourceLabel source="pikpak" label="PikPak target folder" />} placeholder="A drive path starting with /" autoComplete="off" maxLength={300}
          hint="The folder must already exist."
          value={target('pikpak')} isDisabled={!state.available} onChange={(value) => setTarget('pikpak', value)} />
        <div className="flex flex-col gap-1">
          <FieldLabel><SourceLabel source="pikpak" label="Media folder matching the PikPak root" /></FieldLabel>
          {state.pikpak_roots.length ? (
            <Select aria-label="Media folder matching the PikPak root" selectedKey={config.pikpak_root || null}
              isDisabled={!state.available} placeholder="Checking picks folders based on the library directories"
              onSelectionChange={(key) => setConfig({ ...config, pikpak_root: key === null ? '' : String(key) })}>
              {state.pikpak_roots.map((root) => <SelectItem key={root} id={root}>{root}</SelectItem>)}
            </Select>
          ) : (
            <Help>Add the PikPak mount folder under "Libraries and intake" first.</Help>
          )}
        </div></> : null}
        <Input label="Wait cap (hours)" type="number" inputMode="numeric" autoComplete="off"
          hint={`Timeouts are marked stalled; enter 1–${state.max_wait_hours} hours.`}
          value={hours} isDisabled={!state.available} onChange={setHours} />
      </Stack>
      {action.busy === 'auto' ? <Stack divided><LoadingDots label="Checking CloudDrive2" /></Stack> : null}
      {report ? (
        <CheckReport report={report} detected={detected} suggested={suggested}
          create={state.available ? create : undefined} creating={action.busy === 'folder'} />
      ) : null}
      {failure || action.error ? <Stack divided><ErrorText>{failure || action.error}</ErrorText></Stack> : null}
      <Footer status={state.available ? undefined : 'Cloud download is only available on devices allowed to modify the database.'}>
        <Button variant="secondary" onClick={check} disabled={!state.available} {...busyProps(action.busy === 'check')}>Check connection</Button>
        <Button type="submit" disabled={!state.available} {...busyProps(action.busy === 'save')}>Save configuration</Button>
      </Footer>
    </Section>
  );
}

/** The suggested values derived by this check. Fill them back in even when the target directory does not exist, and the form marks it invalid; when `saved` is true the target directory
 *  has already been stored by saving the configuration. */
interface Suggestions {
  target: DownloadCheckReport['suggested_target'];
  root: string;
  saved: boolean;
}

const NO_SUGGESTIONS: Suggestions = { target: null, root: '', saved: false };

/** Which fields to leave empty; only empty ones get suggested values. */
interface Blanks {
  address: boolean;
  target: boolean;
  root: boolean;
}

function CheckReport({ report, detected, suggested, create, creating }: {
  report: DownloadCheckReport;
  detected: string;
  suggested: Suggestions;
  create?: (path: string) => void;
  creating: boolean;
}) {
  const folder = suggested.target;
  const hasFacts = Boolean(detected || folder || suggested.root || report.permissions.length || report.folder || report.quota);
  if (!hasFacts && !report.problems.length) return null;
  return (
    <Stack divided>
      {hasFacts ? <FactList>
        {detected ? <Fact term="CloudDrive2 address">{`Detected ${detected}; it takes effect once the configuration is saved`}</Fact> : null}
        {folder?.exists ? (
          <Fact term={<SourceLabel source="115" label="115 target folder" />}>
            {suggested.saved ? `Filled from the library folder as ${folder.path}` : `Filled from the library folder as ${folder.path}; it takes effect once the configuration is saved`}
          </Fact>
        ) : null}
        {folder && !folder.exists ? (
          <Fact term={<SourceLabel source="115" label="115 target folder" />}>
            {`${folder.path} does not exist`}
            {create ? <Button variant="secondary" size="small" onClick={() => create(folder.path)} {...busyProps(creating)}>Create this folder</Button> : null}
          </Fact>
        ) : null}
        {suggested.root ? <Fact term={<SourceLabel source="pikpak" label="PikPak root" />}>{`Filled from the library folder as ${suggested.root}; it takes effect once the configuration is saved`}</Fact> : null}
        {report.permissions.length ? (
          <Fact term="Offline permission">
            {report.missing.length
              ? report.missing.map(permission => <Chip key={permission} variant="caption" color="yellow">{`Missing ${permission}`}</Chip>)
              : <Chip variant="caption" color="lime">Complete</Chip>}
          </Fact>
        ) : null}
        {report.folder ? (
          <Fact term="Target folder">{report.folder.can_offline ? `${report.folder.path} supports offline download` : `${report.folder.path} does not support offline download`}</Fact>
        ) : null}
        {report.quota ? (
          <Fact term={<SourceLabel source="115" label="115 offline quota" />}>{`${report.quota.left} of ${report.quota.total} left this month`}</Fact>
        ) : null}
      </FactList> : null}
      {report.problems.map((problem) => <ErrorText key={problem}>{problem}</ErrorText>)}
    </Stack>
  );
}

/** PikPak account card. The main path is "sign in with a browser" (ADR-0093): the server launches a Peach-dedicated browser window,
 *  the user signs in inside it, Peach takes over the web session and closes the window, and only Peach renews afterwards. This polls status every two seconds after launching,
 *  until signed in, canceled, timed out, or failed. The username and password form is shown directly; the sign-in method is chosen in the bottom bar. */
function PikPakAccount({ state, settle, receipt, username, setUsername }: CardProps & {
  username: string;
  setUsername(value: string): void;
}) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [failure, setFailure] = useState('');
  // Only report how the login initiated from this page ended; the previous result kept server-side is not treated as a new message.
  const [outcome, setOutcome] = useState('');
  const action = useAction();
  const account = state.pikpak;
  const browser = state.pikpak_browser;
  const waiting = browser.state === 'waiting';

  useEffect(() => {
    if (!waiting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await apiGet<DownloadSettingsState>(BROWSER_URL, controller.signal);
        if (controller.signal.aborted) return;
        settle(next);
        if (next.pikpak_browser.state === 'done') receipt('Signed in to PikPak');
        else if (next.pikpak_browser.state !== 'waiting') setOutcome(next.pikpak_browser.message);
        if (next.pikpak_browser.state !== 'waiting') return;
      } catch (cause) {
        if (controller.signal.aborted) return;
        setFailure(errorMessage(cause));
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [waiting]);

  const openBrowser = () => {
    setOutcome('');
    void action.run('browser', (signal) => apiSend<DownloadSettingsState>(BROWSER_URL, {}, 'POST', signal),
      (next) => { settle(next); setFailure(''); }, (cause) => setFailure(errorMessage(cause)));
  };

  const cancelBrowser = () => {
    void action.run('cancel', (signal) => apiSend<DownloadSettingsState>(`${BROWSER_URL}/cancel`, {}, 'POST', signal),
      (next) => { settle(next); setFailure(''); setOutcome(next.pikpak_browser.message); },
      (cause) => setFailure(errorMessage(cause)));
  };

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (account.logged_in) return;
    const body = { username, password, remember };
    void action.run('login', (signal) => apiSend<PikPakLoginResult>(LOGIN_URL, body, 'POST', signal),
      (result) => {
        settle(result.settings);
        setFailure('');
        if (!result.ok) {
          setCaptcha(result.captcha_url ?? '');
          return;
        }
        setCaptcha('');
        setPassword('');
        receipt('Signed in to PikPak');
      }, (cause) => setFailure(errorMessage(cause)));
  };

  const logout = () => {
    void action.run('logout', (signal) => apiSend<DownloadSettingsState>(LOGOUT_URL, {}, 'POST', signal),
      (next) => { settle(next); setFailure(''); receipt('Signed out of PikPak'); },
      (cause) => setFailure(errorMessage(cause)));
  };

  const passwordForm = (
    <>
      <Input label="Account" placeholder="Email or phone" autoComplete="username" maxLength={200}
        value={username} isDisabled={!state.available} onChange={setUsername} />
      <Input label="Password" type="password" autoComplete="current-password" maxLength={200}
        value={password} isDisabled={!state.available} onChange={setPassword} />
      <Checkbox isSelected={remember} isDisabled={!state.available} onChange={setRemember}>
        Save the password and re-sign in automatically when the session expires
      </Checkbox>
      {captcha ? (
        <Note tone="warning" title="A human check is required"
          extra={<div className="pt-2"><ExternalLink href={captcha}>Open the PikPak verification page</ExternalLink></div>}>
          After finishing verification in the browser, come back here and click Sign in again.
        </Note>
      ) : null}
    </>
  );
  const passwordLogin = (
    <Button type="submit" variant="primary" disabled={!state.available || waiting} {...busyProps(action.busy === 'login')}>Sign in</Button>
  );
  const outcomeFailed = browser.state === 'timeout' || browser.state === 'failed';

  return (
    <Section guide="pikpak" title="PikPak account" icon={<PikPakIcon />} onSubmit={login}
      aside={<StatusLabel tone={account.logged_in ? 'success' : waiting ? 'progress' : outcomeFailed ? 'error' : 'neutral'}>
        {account.logged_in ? 'Logged in' : waiting ? 'Waiting for sign-in' : outcomeFailed ? 'Sign-in not completed' : 'Login pending'}</StatusLabel>}>
      {account.logged_in ? (
        <FactList>
          <Fact term="Account">{account.username || 'Logged in'}</Fact>
          {account.method === 'browser' ? (
            <Fact term="Sign-in method">Browser sign-in, renewed by Peach</Fact>
          ) : (
            <Fact term="Password">{account.remember ? 'Saved; re-signs-in automatically when the session expires' : 'Not saved; after the session expires you must return here to sign in again'}</Fact>
          )}
        </FactList>
      ) : (
        <Stack>
          {outcome ? (outcomeFailed ? <ErrorText>{outcome}</ErrorText> : <Help role="status">{outcome}</Help>) : null}
          {passwordForm}
        </Stack>
      )}
      {failure || action.error ? <Stack divided><ErrorText>{failure || action.error}</ErrorText></Stack> : null}
      <Footer status={!account.logged_in && waiting
        ? <LoadingDots label={browser.message || 'Waiting for you to sign in to PikPak in the browser window'} /> : null}>
        {account.logged_in ? (
          <Button variant="secondary" onClick={logout} disabled={!state.available} {...busyProps(action.busy === 'logout')}>Sign out</Button>
        ) : <>{!browser.available ? null : waiting ? (
          <Button variant="secondary" type="button" onClick={cancelBrowser} {...busyProps(action.busy === 'cancel')}>Cancel</Button>
        ) : (
          <Button variant="secondary" type="button" onClick={openBrowser} disabled={!state.available}
            {...busyProps(action.busy === 'browser')}>Sign in with browser</Button>
        )}{passwordLogin}</>}
      </Footer>
    </Section>
  );
}
