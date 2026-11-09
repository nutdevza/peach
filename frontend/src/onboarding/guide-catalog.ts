import { PREFERENCE_SECTIONS, CONFIGURATION_SECTIONS } from '../history/settings-route';
import type { RegisteredRoutePath } from '../history/route-meta';
import { javPath } from '../react/jav/jav-navigation';

/** Reuse the app's route types; removing or renaming a page is flagged by type-checking as a stale link in the tutorial. */
type GuidePath = RegisteredRoutePath;
export type GuideRoute = GuidePath | `${GuidePath}?${string}` | `${GuidePath}#${string}`;
export interface GuideStep { id: string; title: string; body: string; route?: GuideRoute | undefined; target?: string | undefined; surface?: 'detail' | 'player' | 'subtitles'; scope?: string | undefined; details?: readonly [string, string][] | undefined }
export interface GuideChapter { id: string; title: string; summary: string; kind: 'interface' | 'settings'; steps: GuideStep[] }
const step = (id: string, title: string, body: string, route?: GuideRoute, target?: string, scope?: string): GuideStep => ({ id, title, body, route, target, scope });
const page = (id: string, title: string, body: string, route: GuideRoute, target?: string) => step(id, title, body, route, target);

export const INTERFACE_CHAPTERS: GuideChapter[] = [
  { id: 'basics', kind: 'interface', title: 'Meet the interface', summary: 'Four steps through search, navigation, title details, and settings.', steps: [
    page('search', 'Search the library', 'Type a title, code, performer, label, or tag. Results come from what is already ingested.', '/', '#q, #searchBtn'),
    page('navigation', 'Switch browsing entries', 'Browse by people, labels, and tags in the sidebar. On a phone use the navigation button to expand it; entries and their order are adjustable in settings.', '/', '#filterBtn, [data-sidebar-nav]'),
    page('cards', 'Open title details', 'Open a title to see details, versions, and play entries. If the first scan has not ingested anything yet, keep exploring the navigation for now.', '/', '[data-media-grid] > [data-id], [data-catalog-row], [data-media-empty]'),
    page('preferences', 'Make the interface yours', 'The settings at the bottom of the sidebar hold display and playback preferences; expand the sidebar first on a phone. Media directories, network, and background services live in its Peach configuration entry.', '/', '#settingsBtn, #filterBtn'),
  ] },
  { id: 'find-play', kind: 'interface', title: 'Find and play', summary: 'Search, filters, details, versions, subtitles, and the player.', steps: [
    page('library', 'Select library', 'The top of the navigation switches between all libraries and a single one; expand the sidebar first on a phone. A library groups different directories together.', '/', '#brandHome, #filterBtn'),
    page('search', 'Find content by keyword', 'Type a title, code, or person name and combine filters and sorting to pin down what you want. How many searches are remembered is set under Search and recommendations.', '/', '#q, #searchBtn'),
    page('filter', 'Filter and clear', 'Several filters narrow results together. When nothing turns up, check the library scope and filters first.', '/', '[data-catalog-frame]'),
    { ...step('detail', 'Video details', 'This shows the current title\'s heading and source-file tools. Ratings, people, and tags sit below; titles with parts or versions open their queues from the library card.', '/', '[data-item-title]'), surface: 'detail' },
    { ...step('player', 'Player controls', 'The bottom control bar covers play, progress, volume, and fullscreen. The gear on the right opens playback speed, subtitles, rotation, quality, and more.', '/', '#stage .vjs-control-bar'), surface: 'player' },
    { ...step('subtitles', 'Subtitles and playback options', 'Open subtitles from the player\'s gear menu to pick an existing subtitle track, load a local subtitle file, or search for subtitles; playback speed and quality live in the same menu.', '/', '#stage [data-player-subtitles]'), surface: 'subtitles' },
    { ...step('external', 'External player', 'Pick a local player, an M3U playlist, or a network play URL here, then press Open. The other device must be able to reach the current Peach address.', '/', '#stage [data-local-playback-row]'), surface: 'detail' },
  ] },
  { id: 'save', kind: 'interface', title: 'Save what you like', summary: 'Ratings, marks, playlists, and the current playback queue.', steps: [
    { ...page('marks', 'Rating', 'Click the stars to rate a title; the like, watch-later, and add-to-playlist actions below save what interests you.', '/', '#stage [data-item-rating]'), surface: 'detail' },
    { ...page('mark-actions', 'Mark and add to lists', 'Likes steer taste recommendations, watch-later makes titles easy to find again, and playlists organize titles into your own lists.', '/', '#stage [data-item-feedback]'), surface: 'detail' },
    page('lists', 'Create a playlist', 'Type a name here to create your own playlist. Add titles later from the Add to playlist button on a title\'s details page.', '/playlists', '[data-playlist-create]'),
    page('queue', 'Start playing from a list', 'Open a playlist card to reach its queue and review or reorder the playback. With no list yet, create one first, then add titles.', '/playlists', '[data-playlist-card]'),
  ] },
  { id: 'entities', kind: 'interface', title: 'Browse by people and theme', summary: 'Keep discovering related library items through people, labels, and tags.', steps: [
    page('people', 'Performers and creators', 'Open a person card to reach their profile with related titles, photos, and connected sources. The tabs above switch between performers, sellers, and online people.', '/performers', '[data-index-body] [data-index-cell], [data-index-body] [data-empty-state]'),
    page('studios', 'Labels', 'Open a label card to browse its titles in one place. Titles inside still follow the current library scope.', '/studios', '[data-index-body] [data-index-cell], [data-index-body] [data-empty-state]'),
    page('tags', 'Tags and themes', 'Pick a tag to keep browsing the related library; local and online use different tag vocabularies.', '/tags', '[data-index-body] [data-alpha-tag], [data-index-body] [data-tag-chip], [data-index-body] [data-empty-state]'),
    page('manage-tags', 'Manage tags', 'The pencil button opens tag management to tidy tag names and relations; click again to return to browsing.', '/tags', '[data-tag-mode]'),
  ] },
  { id: 'jav', kind: 'interface', title: 'JAV and new-release follows', summary: 'Library, new releases, want list, and better versions.', steps: [
    page('library', 'JAV library', 'Find ingested titles by code, cast, or label, choosing between the official cover and a preview image.', javPath('library') as GuideRoute, '[data-catalog-frame]'),
    page('new', 'Discover recommendations', 'Discover recommends titles by taste. Switch between library and external content here and filter by tag.', javPath('discover') as GuideRoute, '[data-jav-filter] [data-catalog-views]'),
    page('wants', 'View the want list', 'External titles you like can join the want list; switch between library, discover, and wants here.', javPath('discover') as GuideRoute, '[aria-label="JAV section"]'),
    page('quality', 'HD version', 'The upgrade-pending card lists the current version and why it was flagged, with links to view the version or hunt for resources; with no target it shows an empty state.', '/quality-goals', '[data-goal-id], #main [data-empty-state]'),
  ] },
  { id: 'follow', kind: 'interface', title: 'Follow creator', summary: 'Multi-source updates, same-title merging, and source status.', steps: [
    page('feed', 'See followed updates in one place', 'Creator updates from every source gather here; open an update to read it. With no sources followed yet, use the empty state\'s entry to add some.', '/follow', '[data-follow-item], [data-follow-empty] [data-empty-state]'),
    page('sources', 'Manage followed sources', 'The list shows enablement, collection results, and failure reasons; switch to the add area to add creators or subscription sources.', '/subscriptions', '[aria-label="Follows management area"]'),
    page('credentials', 'Configure credentials as needed', 'Some sources need login credentials; confirm which sources to enable first, then expand those sites and fill in what they ask for.', '/settings/subscriptions', '[data-guide-target="credentials"]'),
  ] },
  { id: 'viewing', kind: 'interface', title: 'Focused watching', summary: 'The video wall, immersive mode, and the details mini-player.', steps: [
    page('wall', 'Playback wall', 'The video wall offers a multi-screen watching entry. After the tour, click in and pick what to play.', '/', '#wallBtn'),
    page('immerse', 'Immersive mode', 'Immersive mode suits back-to-back watching. Its entry starts the watching flow, so use it when you are ready to play.', '/', '#immerseBtn'),
    page('mini', 'Keep watching after leaving details', 'With mini-player on, playback keeps going after you leave the details page. Autoplay, the mini-player, and the fast-forward step all live in Browse and playback settings.', '/settings/playback', '#miniplayerSetting'),
  ] },
  { id: 'maintenance', kind: 'interface', title: 'Organize and maintain', summary: 'Scanning, detail backfill, review, file organizing, and the trash.', steps: [
    page('scan', 'Scan and backfill details', 'Choose the scan and metadata scope in the library processing area. The read policy follows the library configuration; the tour never starts tasks.', '/data-cleanup', '#libraryProcessing'),
    page('review', 'Manual review', 'First locate pending details by category, then read each item\'s sources and evidence before deciding.', '/review', '[aria-labelledby="reviewcategories"]'),
    page('organize', 'File organizing', 'File organizing previews first; confirm the naming and target directory before running it. Metadata organizing and real file operations have different blast radii.', '/data-cleanup', '[data-cleanup-organize]'),
    page('trash', 'Trash', 'Review titles moved to the trash and restore or process them as needed. Read the confirmation dialog\'s scope carefully before permanent deletion.', '/trash', '[data-media-grid] > [data-id], [data-catalog-row], [data-media-empty]'),
    page('tasks', 'Tasks and failure reasons', 'Task records show processing status; expand a record for details and failure reasons. With no tasks yet, this explains which actions leave records.', '/tasks', '[data-run-id], #main [data-empty-state]'),
  ] },
  { id: 'insights', kind: 'interface', title: 'Know your own library', summary: 'Statistics, taste, plus browsing history and bookmark sources.', steps: [
    page('stats', 'Library statistics', 'Pick a statistics view for library, storage, and watching overviews; entries inside each view keep leading to the related titles.', '/stats', '[aria-label="Statistics views"]'),
    page('taste', 'Taste and history', 'Switch between browser history and Peach watch ratings here; each is analyzed for taste on its own.', '/taste', '[aria-label="Taste analysis data sources"]'),
    page('import', 'Gets browsing history and bookmarks', 'Reading browser history happens on the computer running Peach; the More ways menu imports history or bookmark files, which suits other devices.', '/taste', '[data-guide-target="history-import"]'),
    page('history', 'Manage record sources', 'The record sources gathered so far are listed here; you can disable local browser reading or remove imported data sources. The tour does not change these.', '/taste', 'section[aria-label="Data sources"]'),
  ] },
  { id: 'external', kind: 'interface', title: 'Bring content in from outside', summary: 'Cloud downloads, directory mapping, and browser additions.', steps: [
    page('downloads', 'Configure download channels', 'Connect a supported channel first, then set the cloud target directory and the local media directory. After download, ingestion follows the directory rules.', '/settings/downloads', '[data-guide-target="download"]'),
    page('search', 'Search resources', 'Resource search uses the configured indexers. Once results appear, choosing to download stays in your hands.', '/settings/subscriptions', '[data-guide-target="indexers"]'),
    page('browser', 'Add JAV via browser', 'Once paired with Peach, the userscript adds titles from the browser. The dedicated token, default channel, and switch are managed under Download channels.', '/settings/downloads', '[data-guide-target="browser"]'),
  ] },
  { id: 'devices', kind: 'interface', title: 'Phones and other devices', summary: 'Access address, password, LAN, and public entry.', steps: [
    page('address', 'Find the access address', 'Devices on the same LAN use Peach\'s LAN address. With local-only access, other devices cannot connect.', '/settings/network', '[data-guide-target="port"]'),
    page('password', 'Access password', 'Devices that can reach Peach sign in with the access password. Display preferences and access permission are separate settings.', '/settings/network', '[data-guide-target="access"]'),
    page('tunnel', 'Enable the public entry when needed', 'The Cloudflare public entry suits access from outside the LAN and needs connection details matching the real deployment.', '/settings/network', '[data-guide-target="tunnel"]'),
  ] },
];

const local = 'This browser · changes save automatically';
const shared = 'Follows the library · changes save automatically';
const saved = 'The computer running Peach · confirm to save the configuration';
type Field = [string, string, string, string?, string?];
const fields = (route: keyof typeof PREFERENCE_SECTIONS | keyof typeof CONFIGURATION_SECTIONS, entries: Field[], scope = local): GuideStep[] => entries.map(([id, title, body, target, override]) => step(id, title, body, `/settings/${route}`, target || `[data-guide-target="${id}"]`, override || scope));
export const SETTING_CHAPTERS: GuideChapter[] = [
  { id: 'appearance', kind: 'settings', title: PREFERENCE_SECTIONS.appearance, summary: 'Theme, glow, and navigation entries.', steps: fields('appearance', [
    ['theme', 'Theme', 'Pick light, dark, or follow the system; each reads well under different lighting.', '#themeSetting'],
    ['contrast', 'Increase contrast', 'Turn on when text needs to stand out more clearly from the background.', '#glassContrastSetting'],
    ['sounds', 'Interface sounds', 'Controls interface feedback sounds; choose for your own environment.', '#uiSoundsSetting'],
    ['glow', 'Sidebar glow', 'Controls the sidebar background glow. When on, the color presets and parameters appear below; adjust color, intensity, grain, drift speed, softness, and size, or restore defaults. Glass original shows only the parameters that apply.', '#homeGlowSetting'],
    ['sidebar', 'Navigation entries and order', 'Puts your common entries in the sidebar; drag to reorder them.', '[data-sidebar-setting]', shared],
  ]) },
  { id: 'playback', kind: 'settings', title: PREFERENCE_SECTIONS.playback, summary: 'List presentation, hover previews, and playback behavior.', steps: fields('playback', [
    ['batch', 'Videos per batch', 'Decides how many items a list loads at once. Turn it down if lists feel slow.', '#batchSizeSetting'],
    ['sort', 'Default sort and direction', 'Decides what you see first when opening a list; random order ignores ascending and descending.', '[data-setting-sort-controls]'],
    ['size', 'Video card size', 'Large images show covers off; the dense grid shows more titles at once.', '#javSizeSetting'],
    ['versions', 'Merging parts and versions', 'Groups a title\'s parts and versions together; pick one on the details page when playing.', '#groupCollapseSetting'],
    ['hover', 'Hover preview delay', 'How long the pointer rests before a preview starts, in seconds. Raise the delay when it triggers by accident.', '#hoverDelaySetting'],
    ['autoplay', 'Playing details opens autoplay', 'Decides whether opening a title plays it right away. Turn off for quiet browsing.', '#detailAutoplaySetting'],
    ['miniplayer', 'Plays in the mini-player after leaving details', 'Keeps watching in the mini-player when you leave the details page; turn it off for focused browsing.', '#miniplayerSetting'],
    ['seek', 'Skip forward / back', 'Sets the seconds per skip; adjust to your own watching habits.', '#seekSecondsSetting'],
  ]) },
  { id: 'jav-settings', kind: 'settings', title: PREFERENCE_SECTIONS.jav, summary: 'Covers and new-release filters.', steps: fields('jav', [
    ['names', 'Performer names', 'Choose the Chinese or Japanese name.', '#performerNameLanguageSetting', shared],
    ['image', 'Default image', 'Choose the official cover or a preview image as the card\'s default picture.', '#javImageSetting'],
    ['limit', 'New-releases count', 'Controls how many items the new-releases area shows at once.', '#feedLimitSetting'],
    ['scroll', 'Auto-scroll', 'Controls whether the new-releases area scrolls by itself.', '#feedAutoScrollSetting'],
    ['compilations', 'Hide large compilations', 'Filters large compilations out of new releases; it only affects the new-release view and the library stays searchable.', '#feedHideGroupSetting', shared],
    ['solo-compilations', 'Hide solo compilations', 'Filters single-performer compilations out of new releases; it only affects the new-release view and the library stays searchable.', '#feedHideSoloSetting', shared],
    ['excerpts', 'Hide clips', 'Filters clips out of new releases; it only affects the new-release view and the library stays searchable.', '#feedHideExcerptSetting', shared],
  ]) },
  { id: 'search-settings', kind: 'settings', title: PREFERENCE_SECTIONS.search, summary: 'Search history, recommendation counts, and the taste entry.', steps: [
    ...fields('search', [['history', 'Search history', 'Caps how many searches are remembered; 0 means none.', '#searchHistoryLimitSetting']], shared),
    ...fields('search', [['related', 'Related recommendation count', 'Decides how many related recommendations the details page shows. Taste and record sources are managed on the taste page.', '#relatedLimitSetting']]),
  ] },
  { id: 'content', kind: 'settings', title: PREFERENCE_SECTIONS.content, summary: 'SFW mode and how images display.', steps: fields('content', [
    ['sfw', 'SFW mode', 'Hides sensitive frames and stops hover previews, for environments where the screen must stay covered. Set a separate access password for access control.', '#censorSetting'],
  ]) },
  { id: 'library', kind: 'settings', title: CONFIGURATION_SECTIONS.library, summary: 'Libraries, directories, reading, and processing modes.', steps: fields('library', [
    ['media', 'Library name and appearance', 'Name, icon, and source color tell libraries apart. One library can hold several folders; the folder rows below configure local or cloud mount paths.', '[data-guide-target="media"] [data-library-head]'],
    ['folders', 'Media folders', 'Fill in the media directory path and pick a source. When replacing a saved path, follow the page prompt to relocate the original directory or add another one; with several libraries you can move a folder between them.', '[data-guide-target="media"] [data-folder-row]'],
    ['policy', 'Library processing mode', 'This picks the processing mode for the whole library. Custom processing lets you choose probing, details, covers, people, and previews separately.', '[data-guide-target="library-policy"]'],
    ['read-policy', 'Folder read policy', 'Pick a read policy per folder. Normal reading allows video reads per the processing rules; proxy protection suits metered mounts and limits automatic video reads.', '[data-guide-target="media"] [data-media-read-policy]'],
    ['mounts', 'Mount state', 'The saved directory\'s mount status shows beside the folder path; a new directory may have no status until saved. When a cloud mount is unavailable, restore the mount before running a scan.', '[data-guide-target="media"] [data-folder-row]:has([data-mount]), [data-guide-target="mounts"]'],
    ['cloud-proxy', 'CloudDrive proxy', 'The data proxy covers file content requests and the API proxy covers API requests. Pick a mode, address, and port for each, filling in username and password when authentication needs them; they are configured separately from the Peach proxy.'],
    ['discovery', 'Auto-discover new files', 'Watch local folders or receive CloudDrive2 notifications. A webhook receives events, and the path prefix mapping lines notification paths up with media directories.'],
    ['codes', 'Code detection rules', 'When a filename is not recognized, review or extend the recognition rules. Rules affect later recognition, so check the samples first.'],
    ['preview', 'Video previews', 'Generating video previews reads the videos and builds a cache. The timeline preview switch and sampling interval control this machine\'s thumbnails; the frame-extraction decoder decides which decoder preview generation uses. Changes save automatically and stay subject to the library processing mode and read policy.'],
  ], saved) },
  { id: 'subscriptions', kind: 'settings', title: CONFIGURATION_SECTIONS.subscriptions, summary: 'Detail sources, follows, indexers, and site entries.', steps: fields('subscriptions', [
    ['sources', 'Collection sources and login state', 'This entry shows where title details come from and their login state. Follow credentials are managed separately below; enable sources as needed.', '[data-guide-target="sources"]'],
    ['credentials', 'Source credentials', 'Expand the sites you use and fill in the login details they ask for. Saved fields may be left empty to keep them; actions take effect through each site form\'s save button.'],
    ['follow-options', 'Follows scrape', 'The first-collection range decides how far back to look. Automatic update checks and the interval govern later queries; feed pulls and avatar and favicon refreshes are shown on their pages.'],
    ['indexers', 'Resource search', 'Fill in a name, Torznab address, and API key per indexer; sources can be added or removed. Resource search offers candidate results, and you confirm the download separately.'],
    ['entry-links', 'Video profile sites', 'Configure the details sites and mirror entries used to open related title pages. Addresses and login credentials are managed separately.'],
  ], saved) },
  { id: 'downloads', kind: 'settings', title: CONFIGURATION_SECTIONS.downloads, summary: 'Cloud download directories, accounts, and browser pairing.', steps: fields('downloads', [
    ['download', 'Cloud download', 'The CloudDrive2 address and API token connect the service and can auto-discover or test the connection. The 115 and PikPak target directories decide where files land in the cloud, and the local media directory mapping ingests them after download; the wait cap bounds how long downloads may wait.'],
    ['pikpak', 'PikPak account', 'Choose account-and-password or browser sign-in per the page; the connection status tells you whether it works. Signing in is always your call.'],
    ['browser', 'Add JAV via browser', 'Install the userscript and pair it with Peach. The default channel decides where submissions go; the enable switch controls the feature, the dedicated token can be updated or turned off, and the script check confirms the pairing.'],
  ], saved) },
  { id: 'network', kind: 'settings', title: CONFIGURATION_SECTIONS.network, summary: 'Access port, proxy, password, and public entry.', steps: fields('network', [
    ['port', 'Access address and port', 'See the addresses available on this machine, the LAN, and other devices. Keep the current port setting as is; after saving a port change, use the new address the page shows.'],
    ['proxy', 'Peach proxy', 'Source networking can use the system proxy, a direct connection, or a custom proxy address. When a connection fails, check the current mode and address first.'],
    ['access', 'Access password', 'Set or change the password for reaching Peach; with it off, any device that can connect gets in directly.'],
    ['tunnel', 'Cloudflare public entry', 'A temporary link serves one-off connections; a named tunnel uses a hostname and tunnel token. The connection status shows whether it is ready; enable as needed.'],
  ], saved) },
  { id: 'app-maintenance', kind: 'settings', title: CONFIGURATION_SECTIONS.maintenance, summary: 'Updates, storage, data choices, and app maintenance.', steps: fields('maintenance', [
    ['updates', 'Check for updates', 'Checks the currently available version. Downloading and the restart install run separately; follow the page state.'],
    ['automatic-updates', 'Auto-update', 'Choose automatic checks, automatic downloads, and the check interval. After a download, confirm the restart install when prompted.'],
    ['startup', 'Start at sign-in', 'Sets launch at login, tray-only startup, and desktop shortcuts. Available options vary by platform.'],
    ['transcode', 'Video playback', 'The playback transcode mode decides how compatible playback is processed; frame-extraction decoding is configured separately under library and ingestion. Changes save automatically.'],
    ['storage', 'Storage', 'Review usage and clean the cache and old backups as needed. Moving the data directory relocates details and cache; media file directories are managed separately.'],
    ['ledger-backups', 'Ledger backup', 'Back up the current ledger now, or restore from a backup in the list. Restoring replaces the current ledger; a copy is saved first before replacing. Only the write side can restore.'],
    ['reporting', 'Data upload', 'Version statistics and error diagnostics, and library and taste details, are separate choices. Details can be previewed before upload; enable them on your own terms.'],
    ['facts', 'Runtime info and the guided tour', 'Runtime info checks the environment. The guided tour can be reopened anytime, and reading progress follows this machine\'s ledger across devices.'],
    ['uninstall', 'Uninstall Peach', 'Uninstall removes the program; full uninstall also removes settings, the library, history, credentials, and the cache. Check the data directory and confirmation text the page lists before running it.'],
  ], saved) },
  { id: 'diagnostics', kind: 'settings', title: CONFIGURATION_SECTIONS.diagnostics, summary: 'When something breaks, review the checks and the diagnostic report.', steps: fields('diagnostics', [
    ['attention', 'Checks that need attention', 'Attention-needed items open the reason and recovery entries; with nothing wrong, review the library health instead.', '[data-guide-target="attention"], [data-guide-target="health"]'],
    ['system-checks', 'Other system checks', 'Expand the other checks, grouped by system, configuration, and more, to see the current state. Checks needing attention are listed separately at the top of the page.', 'section[aria-label="System checks"]'],
    ['sessions', 'Source sessions', 'See each source\'s session state, failure reasons, and the last successful resolve time to diagnose connection and detail-fetch problems.'],
    ['report', 'Re-checks and the diagnostic report', 'After addressing the reason, the check can run again. When troubleshooting material is needed, you click to download the diagnostic report.'],
  ], 'Read-only check · re-checking and downloading are yours to trigger') },
];

/** Item-by-item explanations for complex settings stay in the expandable directory; the short tour covers only the key choices. */
const FIELD_DETAILS: Record<string, readonly [string, string][]> = {
  glow: [
    ['Color presets', 'Applies one set of colors and parameters at a time — good for picking an overall look first.'],
    ['Intensity', 'Controls how bright the glow is; lower it when it competes for attention.'],
    ['Grain', 'Controls the grain in the glow texture; lower it for a smoother background.'],
    ['Drift speed', 'Controls how fast the background glow drifts.'],
    ['Softness', 'Controls how soft the glow\'s edges are.'],
    ['Size', 'Controls how much area the glow covers.'],
    ['Three custom colors', 'Sets the three glow colors separately to compose your own scheme.'],
    ['Restore defaults', 'Restores the glow colors and parameters to their defaults.'],
  ],
  media: [
    ['Library name, icon, and source color', 'Helps tell content apart in the sidebar and on cards; the name never changes file paths.'],
    ['Folders and their library', 'Folders are where media actually lives; several folders can belong to one library.'],
    ['Source', 'States whether a directory is a local disk or a cloud mount, which picks the right read behavior.'],
    ['Directory change method', 'When replacing a saved directory path, choose to relocate the original directory or add another one.'],
  ],
  policy: [
    ['Auto-complete', 'Reads local details and fills in what is missing — details, covers, and people images — from the network; local videos can generate contact-sheet previews.'],
    ['Use local profiles only', 'Uses local NFO and images and reads video information per the read policy; local videos can generate contact-sheet previews.'],
    ['Custom steps', 'Choose probing duration and resolution, detail backfill, cover fetching, performer profile backfill, and video preview generation separately.'],
  ],
  'read-policy': [
    ['Normal read', 'Allows reading video information and generating previews per the processing rules; suits local disks or unmetered mounts.'],
    ['Proxy protection', 'Limits automatic video reads, suiting mounts where reading burns metered traffic.'],
  ],
  preview: [
    ['Generate video previews', 'Controls contact-sheet and preview cache generation; read behavior also follows the library rules.'],
    ['Timeline preview', 'Shows thumbnails along the playback timeline of local-disk videos.'],
    ['Thumbnail sampling interval', 'Sets the time between adjacent timeline thumbnails; denser spacing generates more cache.'],
    ['Frame extraction decode method', 'Picks the decoder used to generate previews; playback transcoding is set separately.'],
  ],
  'cloud-proxy': [
    ['Data proxy', 'Controls the network connection used to read file contents.'], ['API proxy', 'Controls the network connection used for CloudDrive API requests.'],
    ['Mode, address, and port', 'The mode picks how to connect; the custom mode needs a valid proxy address and port.'],
    ['Username and password', 'Fill in only when the proxy asks for authentication.'],
  ],
  discovery: [
    ['Auto-intake after finding new files', 'Lets discovery events trigger ingestion; with it off, scan manually as needed.'],
    ['Watch local folders', 'Receives this machine\'s filesystem changes to discover new content.'],
    ['Receive CloudDrive2 notifications', 'Pushes directory changes through CloudDrive2.'],
    ['Webhook', 'The receiving endpoint source services push change events to.'],
    ['Path prefix mapping', 'Translates paths from source notifications into media directory paths Peach can reach.'],
  ],
  'follow-options': [
    ['First scrape scope', 'Decides how far back newly followed sources look; saved with the library.'],
    ['Automatically check for updates', 'Decides whether enabled sources are polled for new content on a schedule; changes save automatically.'],
    ['Auto-check interval', 'Sets the time between scheduled queries; changes save automatically.'],
    ['Follow source fetching', 'Controls how subscription content is fetched; the real state and actions live on the current page.'],
    ['Avatar and favicon refresh', 'The page shows the current refresh details; avatars identify creators and favicons identify sites.'],
  ],
  download: [
    ['CloudDrive2 address and API token', 'The address locates the service; the token authorizes Peach to call its API.'],
    ['Auto-discover and check', 'Finds connectable services or verifies the current connection.'],
    ['115 target folder', 'Decides which cloud directory 115 submissions land in.'],
    ['PikPak target folder', 'Decides which cloud directory PikPak submissions land in.'],
    ['Media directory mapping', 'Maps the cloud target onto a mount path Peach can scan, so downloads ingest smoothly.'],
    ['Wait cap', 'Caps how long to wait for a download result.'],
  ],
  browser: [
    ['Script check and pairing', 'Confirms the userscript is installed and connected to the current Peach service.'],
    ['Default channel', 'Decides the default download channel for browser additions.'],
    ['Enabled', 'Controls whether the browser-add feature accepts requests.'],
    ['Dedicated token', 'Authorizes the userscript to connect; a pairing redo is needed after updates, and turning it off stops the feature.'],
  ],
  'automatic-updates': [
    ['Auto-check for new versions', 'Asks on a schedule whether a new version exists.'], ['Automatically download updates', 'Downloads first when an update is found; installing still waits for your confirmation.'],
    ['Check frequency', 'Sets the interval between new-version queries.'],
  ],
  storage: [
    ['Usage statistics', 'See the space details, cache, and backups take up.'],
    ['Clean the cache and old backups', 'Removes generated files or old backups inside the confirmed scope; read the list before running.'],
    ['Migrate the data directory', 'Change where details and the cache live and follow the flow to migrate and restart. Media file directories are configured separately.'],
  ],
  codes: [
    ['Recognition rules', 'Fill it in using the format shown to extract codes from filenames; verify the rule and the resulting filename before saving.'],
  ],
  indexers: [
    ['Name', 'Tells resource-search sources apart.'], ['Torznab address', 'The query endpoint address the indexer provides.'],
    ['API key', 'Authorizes Peach to use that indexer; fill in what the indexer gives you.'],
  ],
  proxy: [
    ['System proxy', 'Uses the proxy configuration from the computer running Peach.'], ['Direct', 'Connect to sources directly.'],
    ['Custom proxy address', 'Sets the proxy Peach uses; leave empty to keep the saved address.'],
  ],
  access: [
    ['Current access password', 'Used to verify the current password when changing the access password.'],
    ['New access password and confirmation', 'Enter the same password twice; sign in with the new one after saving.'],
    ['Disable access password', 'Once saved, any device that can reach Peach gets in directly.'],
  ],
  tunnel: [
    ['Temporary link', 'A public access entry meant for temporary use.'], ['Named tunnel', 'Connects through the configured fixed public entry.'],
    ['Public hostname', 'Fill in the access hostname for the named tunnel.'], ['Tunnel token', 'Authorizes this machine to connect to the named tunnel.'],
    ['Connection status', 'Tells whether the public entry is reachable yet.'],
  ],
  startup: [
    ['Start Peach after sign-in', 'Starts the app after system login; availability depends on the platform.'],
    ['Start the tray only, without opening the web app', 'Launch at login keeps running in the background; open the page when you need it.'],
    ['Create desktop shortcut', 'Provides a desktop entry for opening Peach.'],
  ],
  reporting: [
    ['Sends version statistics and error diagnostics', 'Uploads version, system info, failure type, code location, and occurrence count.'],
    ['Upload library and taste details', 'Controls library and taste detail uploads independently; review the current upload preview and confirm before enabling.'],
    ['Upload preview', 'See exactly what an upload would include before deciding to enable detail uploads.'],
  ],
};
for (const chapter of SETTING_CHAPTERS) for (const item of chapter.steps) {
  item.details = FIELD_DETAILS[item.id];
  if (item.id === 'preview' || item.id === 'transcode') item.scope = 'The computer running Peach · changes save automatically';
  if (item.id === 'follow-options' || item.id === 'sources' || item.id === 'reporting' || item.id === 'storage'
    || item.id === 'ledger-backups') item.scope = 'Takes effect through each item\'s own save or confirm action on the page';
}
export const GUIDE_CHAPTERS = [...INTERFACE_CHAPTERS, ...SETTING_CHAPTERS];

export interface GuideTopic { id: string; kind: GuideChapter['kind']; title: string; summary: string; chapters: string[] }
/** The directory is organized by intended use; small sections can be read on their own, and the setup steps correspond to the actual settings sections. */
export const GUIDE_TOPICS: GuideTopic[] = [
  { id: 'browse', kind: 'interface', title: 'Search and discover', summary: 'Search and play, people tags, JAV new-release follows', chapters: ['find-play', 'entities', 'jav'] },
  { id: 'collect', kind: 'interface', title: 'Favorites and follows', summary: 'Marked lists, creator updates, taste statistics', chapters: ['save', 'follow', 'insights'] },
  { id: 'watch', kind: 'interface', title: 'Watching and devices', summary: 'Video wall, immersive watching, phone access', chapters: ['viewing', 'devices'] },
  { id: 'manage', kind: 'interface', title: 'Importing and organizing', summary: 'Download intake, scan maintenance, manual review', chapters: ['external', 'maintenance'] },
  { id: 'experience', kind: 'settings', title: 'Appearance and playback', summary: 'Interface styling, playback behavior, content display', chapters: ['appearance', 'playback', 'content'] },
  { id: 'discovery', kind: 'settings', title: 'Search and sources', summary: 'Search suggestions, new releases, followed sources', chapters: ['search-settings', 'jav-settings', 'subscriptions'] },
  { id: 'storage', kind: 'settings', title: 'Media and downloads', summary: 'Libraries, directories, reading, and download channels', chapters: ['library', 'downloads'] },
  { id: 'system', kind: 'settings', title: 'Connection and maintenance', summary: 'Network access, app maintenance, system diagnostics', chapters: ['network', 'app-maintenance', 'diagnostics'] },
];
export function contextualChapter(path: string): GuideChapter {
  if (path === '/') return INTERFACE_CHAPTERS[0]!;
  return SETTING_CHAPTERS.find(chapter => chapter.steps[0]?.route === path)
    || INTERFACE_CHAPTERS.find(chapter => chapter.id !== 'basics' && chapter.steps.some(item => item.route === path))
    || INTERFACE_CHAPTERS[0]!;
}
