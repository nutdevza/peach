/* Type contracts for internal resident components and pages.
 * application-residents.ts and entry.tsx compose these interfaces within the main UI's single source graph; no standalone runtime bridge package is published.
 * Configuration data defers to /api/configuration (src/peach/routes_configuration.py). */
import type { QualityGoal } from './quality-goals/quality-goals';
import type { IndexProps } from './index/index-data';
import type { CatalogGridProps } from './catalog-grid/types';
import type { JunkQueueProps } from './junk-queue/junk-queue';
import type { EntityPageProps } from './entity-page/entity-page';
import type { FeedNewProps } from './feed-new/feed-new';
import type { CatalogFilterProps, CatalogView } from './catalog-filter/catalog-filter';
import type { SearchProps } from './search/search';
import type { FollowDetailProps } from './follow-detail/follow-detail';
import type { ItemDetailProps } from './item-detail/item-detail';
import type { StageApi, StageHost } from './stage/stage-api';
import type { SettingsPanelApi, SettingsPanelHost } from './settings-panel/settings-panel-api';
import type { ImmerseApi, ImmerseHost } from './immerse/immerse-api';
import type { SidebarApi, SidebarHost } from './sidebar/sidebar-api';
import type { ManageHeaderApi, ManageHeaderHost } from './manage-header/manage-header-api';
import type { BatchDockApi, BatchDockHost } from './batch-dock/batch-dock-api';
import type { GlowPickerHost } from './glow-picker/glow-picker-api';
import type { CoverItem, FaceRef } from '@peach/card-art';

export type { IndexProps };
export type { CatalogGridProps };
export type { JunkQueueProps };
export type { EntityPageProps };
export type { FeedNewProps };
export type { CatalogFilterProps, CatalogView };
export type { SearchProps };
export type { FollowDetailProps };
export type { ItemDetailProps };

export interface AccessState { mode: 'open' | 'password' | 'legacy' | 'locked'; revision: string }

export interface TunnelState {
  enabled: boolean;
  state: 'stopped' | 'starting' | 'running' | 'error';
  url: string;
  error: string;
  available: boolean;
  mode: 'quick' | 'named';
  /** The public hostname the named tunnel is bound to; empty in temporary link mode. */
  hostname: string;
  /** Whether a tunnel token was ever saved. The token itself is not returned; the page only uses this to show 'saved'. */
  token_set: boolean;
  /** Whether this deployment can use named tunnels; false for the standalone package, and that whole block does not render. */
  named_available: boolean;
}

export interface AccessSettingsProps {
  initial: AccessState;
  receipt(message: string): void;
  /** The device list right below the password section when login is required; after changing the password, a new revision is fetched and redrawn. */
  devices?(state: AccessState): import('react').ReactNode;
  /** 不论访问方式都跟在后面的分区（访问口令）；确认文案随当前访问方式变。 */
  after?(state: AccessState): import('react').ReactNode;
}

export interface StartupState {
  available: boolean; enabled: boolean; silent: boolean; message: string; desktop: boolean; desktop_message: string;
}

export interface UninstallState {
  available: boolean; full_available: boolean; message: string; data_root: string; directories: string[];
}

/** One category in the data catalog. `reclaimable` is the bytes cleaning this category would free. */
export interface StorageCategory {
  key: string; label: string; description: string; note: string; cleanable: boolean;
  bytes: number; files: number; reclaimable: number;
}

export interface StorageRelocation { state: 'done' | 'error'; message: string; notes?: string[]; finished_at: number }

export interface StorageState {
  data_root: string;
  free_bytes: number | null;
  total_bytes: number | null;
  system_drive: boolean;
  budget?: { policy: StoragePolicy | null; error: string; recommendation_state?: string; last_check: {
    checked_at: number; paused: boolean; reasons: string[]; freed_bytes: number;
    cache_bytes: number | null; data_bytes: number | null; external_cache_bytes: number | null;
  } | null };
  usage: { measured_at: number; total_bytes: number; total_files: number; categories: StorageCategory[];
    allocated_bytes?: number | null; managed_cache_bytes?: number | null; external_cache_bytes?: number | null;
    capacity_error?: string } | null;
  job: { state: 'idle' | 'measuring' | 'cleaning'; category?: string; categories?: string[]; message: string; error?: boolean;
    files?: number; bytes?: number; expected_files?: number | null };
  relocation: { available: boolean; message: string; steps?: { text: string; command: string }[]; last: StorageRelocation | null };
}

export interface StoragePolicy {
  enabled: boolean;
  minimum_free_gib: number;
  data_max_gib: number;
  cache_max_gib: number;
  auto_clean: boolean;
  external_cache_path: string;
  external_cache_max_gib: number;
}

export interface PeachProxyState { mode: string; proxy_saved: boolean; needs_selection: boolean }

/** An external entry site whose mirror domain can be switched. An empty `host` means never switched; use `default_host`. */
export interface EntryLinkSite {
  key: string;
  label: string;
  host: string;
  default_host: string;
}

export interface EntryLinksState { sites: EntryLinkSite[] }

/** A mapping from a path prefix in CloudDrive2 to which media root. */
export interface PushDiscoveryPrefix { prefix: string; root: string }

export interface PushDiscoveryQueue {
  pending: number; submitted: number; ingested: number; missing: number;
  dropped: number; timed_out: number; failed: number;
  last_path?: string; last_ingested_at?: number; last_error?: string;
}

export interface PushDiscoveryState {
  enabled: boolean;
  watch_local: boolean;
  cloud: boolean;
  prefixes: PushDiscoveryPrefix[];
  /** True only when this machine is the database write side; the read-only side starts no listeners at all. */
  available: boolean;
  secret: string;
  secret_set: boolean;
  endpoint: string;
  local_running: boolean;
  local_message: string;
  local_roots: string[];
  queue: PushDiscoveryQueue;
  /** The optional media root; the prefix table's dropdown takes its options from here. */
  media_roots: string[];
  /** The address CloudDrive2 should push to. An empty string when TLS is off or this machine does not know its own address. */
  origin: string;
  /** The TOML block to paste whole into CloudDrive2's "config content"; empty string when the address or the secret is missing. */
  config_toml: string;
}

export interface AutomaticUpdateState {
  mode: string; interval_hours: number; available: boolean; download_available: boolean; error?: string;
}

/** The direct channels available in the media library and CloudDrive2 path channels. */
export type DownloadProviderKey = '115' | 'pikpak' | `clouddrive:${string}:${string}`;

export interface DownloadConfig {
  clouddrive_address: string;
  targets: Record<string, string>;
  /** The database path prefix matching the PikPak root directory; an empty string means nothing is chosen yet. */
  pikpak_root: string;
  wait_hours: number;
}

export type PikPakBrowserState = 'idle' | 'waiting' | 'done' | 'cancelled' | 'timeout' | 'failed';

/** The cloud drive download block on the settings page. Credentials only report whether one was ever saved, never the value. */
export interface DownloadSettingsState {
  problems?: string[];
  media_sources: string[];
  available: boolean;
  config: DownloadConfig;
  token_set: boolean;
  /** `method`: `browser` is a web session obtained through browser sign-in, `password` is a token exchanged for account and password. */
  pikpak: { logged_in: boolean; username: string; remember: boolean; method: 'browser' | 'password' };
  /** Browser sign-in (ADR-0093): whether this machine has Chrome or Edge, and which step the sign-in window is at right now. */
  pikpak_browser: { available: boolean; state: PikPakBrowserState; message: string };
  pikpak_roots: string[];
  providers: { key: DownloadProviderKey; label: string }[];
  max_wait_hours: number;
}

/** The "save config" response: the settings block plus a check report built from the saved config, null when there is no token. */
export interface DownloadSaveResult extends DownloadSettingsState {
  report?: DownloadCheckReport | null;
}

/** The check results: each item reports on its own, and one failure does not block the others. */
export interface DownloadCheckReport {
  ok: boolean;
  /** The CloudDrive2 address actually queried. When the form is left empty, the detected local address; an empty string when detection fails. */
  address: string;
  permissions: { name: string; label: string; granted: boolean }[];
  missing: string[];
  root: string;
  folder: { path: string; can_offline: boolean; cloud: string } | null;
  quota: { total: number; used: number; left: number } | null;
  /** The 115 target folder when left empty is the folder pushed by push discovery; `exists` false means CloudDrive2 does not have it yet. */
  suggested_target: { path: string; exists: boolean } | null;
  /** When no PikPak folder is selected, suggests a database path prefix from push-discovered configuration; an empty string when it cannot be determined. */
  suggested_pikpak_root: string;
  problems: string[];
}

export interface PikPakLoginResult {
  ok: boolean;
  /** When a captcha is required, hand over the challenge page URL and have the user log in again after finishing it in the browser. */
  captcha_url?: string;
  message?: string;
  settings: DownloadSettingsState;
}

export interface DownloadTask {
  id: number;
  info_hash: string | null;
  provider: DownloadProviderKey;
  provider_label: string;
  source_uri: string;
  display_name: string;
  target: string;
  code: string | null;
  title: string | null;
  origin: string | null;
  display_code?: string | null;
  display_title?: string | null;
  artwork?: (CoverItem & { performer_entities?: (FaceRef & { name: string })[]; performer_total?: number }) | null;
  state: string;
  state_label: string;
  failure: string | null;
  failure_label: string | null;
  failure_detail: string | null;
  progress: number | null;
  remote_name: string | null;
  ledger_path: string | null;
  asset_id: number | null;
  submitted_at: string | null;
  updated_at: string;
  finished_at: string | null;
  blocked: boolean;
  cancellable: boolean;
  resubmittable: boolean;
  postprocess_state: string;
  postprocess_label: string;
  postprocess_detail: string | null;
  postprocess_run_id: number | null;
  postprocessed_at: string | null;
  postprocess_active: boolean;
  postprocess_retryable: boolean;
}

export interface DownloadsSnapshot {
  total?: number;
  page?: number;
  available: boolean;
  providers: { key: DownloadProviderKey; label: string; configured: boolean; target: string }[];
  tasks: DownloadTask[];
  has_more?: boolean;
  next_before_id?: number | null;
}

export interface DownloadSubmitResult {
  ok: boolean;
  outcome: 'submitted' | 'adopted' | 'adopted_remote' | 'deferred' | 'refused' | 'failed';
  task: DownloadTask;
}

export interface ReleaseState {
  current_version: string;
  latest_version: string | null;
  channel: string;
  installation: string;
  state: string;
  message: string;
  release_url: string;
  checked_at?: number;
  /** The installer is macOS's DMG: there's no in-app installation; after downloading, replace it manually. */
  package_kind?: 'update' | 'full' | 'installer';
  asset_url?: string;
  asset_size?: number;
  /** 能在页面里下载并重启安装；只有 Windows 独立包是 true。 */
  in_app_update?: boolean;
  /** 容器换新版要在宿主机上做的几步；其他安装方式是空表。 */
  steps?: { text: string; command: string }[];
  /** Docker 镜像检查到新镜像时才有：能否经 Watchtower 一键更新（ADR-0140），不能时 `reason` 说明为什么。 */
  one_click?: { available: boolean; reason: string };
}

export interface UpdateJob {
  state: string; progress: number; message?: string; downloaded?: number; total?: number; version?: string;
}

export interface MediaSource {
  transport?: 'filesystem' | 'smb'; smb_username?: string; smb_password_saved?: boolean; smb_encrypt?: boolean;
  root_id?: string; library_id?: string;
  /** `online`：挂载可达性快照，`null` 是检测超时或还没检测（`media_configuration.reachability_states`）。 */
  location: string; root: string; path: string; online?: boolean | null; library?: string; library_icon?: string; cost?: 'free' | 'metered';
  /** Library source color (accent color key name, empty string means no tint) and handling; `library_stages` holds the steps chosen for custom, comma separated. */
  library_color?: string; library_policy?: 'auto' | 'local' | 'custom'; library_stages?: string;
}

export interface ConfigurationFact {
  term: string;
  value: string;
  download_url?: string;
  download_label?: string;
  /** 能由 Peach 装进数据目录的缺失工具（`ffmpeg`、`untrunc`），有它就不给下载外链。 */
  install_tool?: string;
}

export interface ConfigurationData {
  section_errors?: Record<string, { title: string; message: string; error_id: string }>;
  remote_reporting?: import('./settings/remote-reporting-settings').RemoteReportingState;
  library_sharing?: import('./settings/library-sharing-settings').LibrarySharingState;
  ledger_read_only?: boolean;
  startup?: StartupState;
  uninstall?: UninstallState;
  storage?: StorageState;
  peach_proxy?: PeachProxyState;
  entry_links?: EntryLinksState;
  push_discovery?: PushDiscoveryState;
  downloads?: DownloadSettingsState;
  updates?: ReleaseState;
  update_job?: UpdateJob;
  automatic_updates?: AutomaticUpdateState;
  access?: AccessState;
  api_token?: import('./settings/api-token-settings').ApiTokenState;
  /** 没有 HTTPS 服务或没有本机 CA 时为 null，那一块整个不渲染。 */
  certificate?: import('./settings/certificate-trust').CertificateState | null;
  tunnel?: TunnelState;
  editable: boolean;
  /** The reason shown to the user when editing is unavailable; empty when editable. */
  notice: string;
  /** The settings file's fingerprint, sent back on save so the server can refuse to overwrite changes made elsewhere. */
  revision: string;
  media_dirs: string[];
  media_sources?: MediaSource[];
  /** The media library count, grouped and tallied server-side by the sidebar's library switcher copy (same-named folders count as one). */
  library_count: number;
  windows?: boolean;
  port: number;
  port_editable?: boolean;
  network?: {
    editable: boolean; host: string; mdns_name: string; scope: 'local' | 'lan';
    local_url: string; lan_url: string; ip_url: string;
  };
  mount_dependencies?: { name: string; available: boolean; download_url: string }[];
  facts: ConfigurationFact[];
}

/** The config page only needs the legacy layer's Toast: saving is a write, and the receipt belongs to the site-wide one. */
export interface ConfigurationProps {
  /** The past-tense receipt after a successful save (the legacy layer's Toast). */
  receipt(message: string): void;
  /** Make the setup guide reappear: reset skip and collapse, and withdraw the database marker. */
  reopenTutorial(): Promise<void>;
  /** The tab group name selected on the first frame (entered by clicking "manage libraries", "add media folder", and the like elsewhere); when unrecognized or absent, select the first group. */
  section?: string;
}

/** Attributes for a group's root node as the `index`-th tab panel when the configuration page switches groups by tabs; `active` is the currently selected group. */
export interface ConfigurationPanel {
  index: number;
  id: string;
  labelledBy: string;
  active: boolean;
}

/** Groups of the Peach configuration: library and adding to library, sources and subscriptions, download channels, network and access, app and maintenance.
 *  `panel` is only provided on the configuration page, absent when mounting a single group. */
export interface ConfigurationGroupProps extends Pick<ConfigurationProps, 'receipt'> {
  data: ConfigurationData;
  panel?: ConfigurationPanel;
  issues?: import('react').ReactNode;
}

/** Capabilities the HD edition target page still gets from the legacy layer. All pure functions or navigation; the page holds none of their state. */
export interface QualityGoalsProps {
  /** The past-tense receipt after the write operation landed on the server. */
  toast(message: string): void;
  /** Open video details (the legacy layer's full-page view, including the player and the queues). */
  openItem(id: number): void;
  /** HTML of code + edition badge + title. Non-JAV entries degrade to the escaped file name. */
  javTitleHtml(item: QualityGoal): string;
  /** The plain text form of the same entry, for the accessible name. */
  javDisplayName(item: QualityGoal): string;
  /** The HTML of the source badge (including the paid marker). */
  srcBadge(location: string, cost: string): string;
}

/** Capabilities the stats page still gets from the legacy layer. All pure functions or navigation; the page holds no state for them. */
export interface StatsProps {
  /** Tag key to display name (`tagLabel` in `core/tags.ts`). */
  tagLabel(key: string): string;
  /** Clicking a content tag: return to the catalog filtered by it. Swapping the whole page to catalog is the legacy shell's job. */
  onTag(key: string): void;
}

/** Capabilities the taste page still gets from the legacy layer. All of them are navigation, lookups or receipts; the page holds no state for them. */
export interface TasteProps {
  /** Clicking a ranking entry returns to the catalog and filters by it. `kind` is `tag` / `creator` / `performer`. */
  onSignal(kind: string, name: string): void;
  /** Open the page the taste summary points to. */
  navigate(route: string): void;
  /** The past-tense receipt after the write operation landed on the server. */
  toast(message: string): void;
  /** Arrived from onboarding (`?onboarding=1`): the browse history import guide starts expanded. */
  onboarding: boolean;
}

/** The sources and credentials page uses only the legacy Toast: save and undo are writes, and receipts belong to the site-wide one. */
export interface ScrapingProps {
  /** The past-tense receipt after the write operation landed on the server. */
  toast(message: string): void;
}

/** Follows management page.
 *
 *  The address bar and personal preferences split into two groups here: `tab`/`page`/`sort`/`dir` can be linked from outside and follow the
 *  address; `pageSize`/`layout` are this browser's habits and follow `appSettings`. Both groups are held by the shell for storage and
 *  React for live state, each with only one copy. */
export interface FollowManageProps {
  /** The tab the address bar currently carries (`list` / `add` / `feeds`). */
  tab: string;
  page: number;
  sort: string;
  dir: string;
  /** Writes these four items back to the address bar. An empty string means the item currently equals its default, and the shell omits it. */
  route(params: { tab: string; page: number; sort: string; dir: string }): void;
  /** The current value of this browser's preference. */
  pageSize: number;
  layout: string;
  /** Preferences changed: storage belongs to the shell (`appSettings`), and the page does not keep its own copy. */
  savePreference(patch: { pageSize?: number; layout?: string }): void;
  /** The past-tense receipt after the write operation landed on the server. */
  toast(message: string): void;
  /** Go to the 'view updates' page (`/follow`). Which screen the full page becomes is still the legacy shell's call. */
  openFollow(): void;
  /** The database is read-only: this machine can only browse, and every write action is unclickable. */
  readOnly: boolean;
  readOnlyMessage: string;
  /** This page's address on the write side. When it cannot be fetched, the gate offers no destination. */
  writerUrl: string;
}

/** Manual review page.
 *
 *  `category` is the only thing entering the address bar: the ten categories are a fixed set of identities; "which queue is being viewed" can be
 *  linked and must survive refresh. Grouping, filter, and page are this moment's view, and the queue is consumable (deciding one removes one), so writing
 *  it into the address to share would only point at a different batch. */
export interface ReviewProps {
  /** The category the address bar currently carries. An unrecognized value falls back to the default tier. */
  category: string;
  queue?: string;
  /** Writes the category back to the address bar. An empty string means the item currently equals its default, and the shell omits it. */
  route(params: { category: string; queue?: string }): void;
  /** Open video details (the legacy layer's full-page view, including the player and the queues). */
  openItem(id: number): void;
  /** Opens an entity profile page. `kind` is `creator`/`performer`. */
  openEntity(kind: string, name: string): void;
  /** Shows this file in the file manager. Success sends its own receipt from the legacy layer; failure returns a one-line reason. */
  revealSource(id: number): Promise<string>;
  /** The past-tense receipt after the write operation landed on the server. */
  toast(message: string): void;
  /** Database is read-only: this machine can only browse, judging and claiming are all unclickable, and entering the page does not fire that automatic database write. */
  readOnly: boolean;
  readOnlyMessage: string;
  /** This page's address on the write side. When it cannot be fetched, the gate offers no destination. */
  writerUrl: string;
}

/** Scan and scrape. Two readers of the same data, so one name carries two shapes: the card on the data management page,
 *  and the banner at the top of the catalog page (`mode: 'notice'`). */
export interface LibraryProcessingProps {
  /** A one-time notification when a job finishes. One run reports once per `job_id`; whoever sees the end first reports it. */
  toast(message: string): void;
  /** This run went from running to a final state: have the legacy layer redraw the data management page's counts. */
  onComplete?(): void;
    /** The compact task panel keeps watching background state. */
  mode?: 'notice';
  /** The card keeps asking while idle: the task starts on its own in the background, and the page must recognize 'it is running now'. */
  monitor?: boolean;
}

/** Avatar change: the plus sign at the corner of the profile page's round frame, together with the candidate screen it opens. The profile card (`entity-hero`) renders it directly
 *  on its own avatar frame, no separate mount. */
export interface AvatarPickerProps {
  /** Entity type (`performer` or `creator`). */
  kind: string;
  entityId: number;
  /** The person's name as shown on the page, used in the accessible name and the description sentence. */
  name: string;
  /** After a successful swap, have the host redraw the avatar. The legacy layer passes 're-enter this page'. */
  onPicked(): void;
}

/** Crop cover: the button next to the title on the video detail page, together with the framing screen it opens. */
export interface CoverCropProps {
  /** The code before normalization, passed back to the write endpoint as is. */
  code: string;
  /** The original cover's address (`/cover?code=`). The frame measures this image's pixels. */
  coverUrl: string;
  /** The currently active framing box, null when none. Same shape as the API's `poster_box`. */
  box: { x0: number; y0: number; x1: number; y1: number; px: number[] } | null;
  /** After saving, have the host repaint the cover; `box` is the new box the write endpoint returned (same shape as `box`): the video details refetches this entry,
   *  and the card with the same code in the grid behind swaps it in place. */
  onSaved(box: CoverCropProps['box']): void;
}

/** Where each stat card at the top of the data management page leads. `ads` is junk files. */
export type DataCleanupSection = 'review' | 'quality' | 'duplicates' | 'ads' | 'trash';

/** Capabilities the data management page still gets from the legacy layer: receipts and pagination. */
export interface DataCleanupProps {
  navigate(path: string): void;
  /** Action receipt (legacy `actionReceipt`). `warning` means finished but partly worth attention, and plays the warning sound effect. */
  toast(message: string, options?: { warning?: boolean }): void;
  /** Failure receipt (legacy layer `actionFailure`): `action` is the thing that failed. */
  failure(action: string, error: unknown): void;
  /** Click a stats card: switch to that page. */
  open(section: DataCleanupSection): void;
}

/** Capabilities the duplicate files page still gets from the legacy layer. */
export interface DuplicatesProps {
  /** Opens the video details (the legacy layer's full page view). */
  openItem(id: number): void;
  /** The operation receipt; when `undo` is provided, an undo button comes with it. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  failure(action: string, error: unknown): void;
}

/** Capabilities the playlist page still gets from the legacy layer. */
export interface PlaylistsProps {
  /** Opens a list's play queue, resuming from the `resumeAssetId` item. */
  openPlaylist(id: number, resumeAssetId: number): void;
  /** Click the avatar on the byline row: go to that person's profile page. `kind` is `performer` or `creator`. */
  openEntity(kind: string, name: string): void;
  /** Whether hover paging is allowed right now: returns false during shell multi-select, occlusion, reduced motion and scrolling. */
  canFlip(): boolean;
  /** The action receipt (legacy `actionReceipt`); with `undo` given it carries an undo key. When undo throws, the receipt itself
   *  switches to "Undo failed" and the page does not report it a second time. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  /** Refresh epoch. Incremented when the shell asks this page to re-read (top bar "shuffle", or returning after a write elsewhere); the page refetches on it without remounting. */
  revision?: number;
}

/** The two glyphs of the site-wide Toast, SVG snippets pre-drawn by the legacy layer's `icon()`. */
export interface ToastIcons { success: string; error: string }

/** One receipt. `html` was already escaped or passed through as-is by the legacy layer's `toastBody`, per the call site's declaration. */
export interface ToastRequest {
  html: string;
  alert: boolean;
  /** Milliseconds; 0 and negatives use the default 6 seconds, `Infinity` means it never dismisses itself. */
  timeout: number;
  action: { label: string; run(button: HTMLButtonElement): void } | null;
}

export type { StageApi, StageHost, StagePatch, StageRequest } from './stage/stage-api';

/** Wire up the host the shell provides and take back the stage's imperative entry (`stage/stage.tsx`). Called once; this surface is opened in the route tree by `application-residents.ts`'s
 *  `loadStage` via `openResidentSurface` from the resident table. */
export declare function configureStage(host: StageHost): StageApi;

export type {
  SettingsEffect, SettingsPanelApi, SettingsPanelHost,
} from './settings-panel/settings-panel-api';

/** Wire up the host the shell provides and take back the settings panel's imperative entry (`settings-panel/settings-panel.tsx`). Called once; this surface is then
 *  opened in the route tree by `application-residents.ts`'s `loadSettingsPanel` via `openResidentSurface` from the resident table. */
export declare function configureSettingsPanel(host: SettingsPanelHost): SettingsPanelApi;

export type { ImmerseApi, ImmerseHost } from './immerse/immerse-api';

/** Wire up the host the shell provides and take back immersive mode's imperative entry (`immerse/immerse-island.tsx`). Called once; this surface is then
 *  opened in the route tree by `application-residents.ts`'s `loadImmerse` via `openResidentSurface` from the resident table. */
export declare function configureImmerse(host: ImmerseHost): ImmerseApi;

export type {
  SidebarApi, SidebarChip, SidebarContent, SidebarDot, SidebarFacets, SidebarHost, SidebarProps,
} from './sidebar/sidebar-api';

/** Wire up the host the shell provides and take back the sidebar's imperative entry (`sidebar/sidebar-island.tsx`). Called once; this surface is opened in the route tree by `application-residents.ts`'s
 *  `loadSidebar` via `openResidentSurface` from the resident table. */
export declare function configureSidebar(host: SidebarHost): SidebarApi;

export type {
  ManageEntry, ManageHeaderApi, ManageHeaderHost, ManageHeaderProps, TrashCount,
} from './manage-header/manage-header-api';

/** Wire up the host the shell provides and take back the manage header's imperative entry (`manage-header/manage-header-island.tsx`). Called once; this surface is then
 *  opened in the route tree by `application-residents.ts`'s `loadManageHeader` via `openResidentSurface` from the resident table. */
export declare function configureManageHeader(host: ManageHeaderHost): ManageHeaderApi;

export type {
  BatchAction, BatchContext, BatchDockApi, BatchDockHost, BatchDockProps, BatchGroup,
} from './batch-dock/batch-dock-api';

/** Wire up the host the shell provides and take back the batch dock's imperative entry (`batch-dock/batch-dock-island.tsx`). Called once; this surface is then
 *  opened in the route tree by `application-residents.ts`'s `loadBatchDock` via `openResidentSurface` from the resident table. */
export declare function configureBatchDock(host: BatchDockHost): BatchDockApi;

export type { GlowPickerHost } from './glow-picker/glow-picker-api';

/** Wire up the host the shell provides (`glow-picker/glow-picker-island.tsx`). Called once; the card's content is drawn in the route tree by `application-residents.ts`'s
 *  `loadGlowPicker` via `openResidentSurface` from the resident table. */
export declare function configureGlowPicker(host: GlowPickerHost): void;

export type { ManagedOpenProps, ManagedPath, ShellActions } from './router/shell-actions';

/** First-screen fetching for the router tree's pages (`openManagedRoute` in `@peach/history` calls it through `connectManagedRoutes`). */
export declare function prefetchManagedRoute(path: string, open: object, signal: AbortSignal): Promise<void>;

/** Mounts the site-wide single Toaster on `host`; repeat calls are no-ops. */
export declare function mountToaster(host: Element, icons: ToastIcons): void;
/** Emit one receipt; calling again with the same `id` rewrites that entry. */
export declare function showToast(id: string, request: ToastRequest): void;
