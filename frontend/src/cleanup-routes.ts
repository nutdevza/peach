/** 数据管理各工具的地址，以及旧锚点到工具页的重定向。
 *  只放地址、不带文案：e2e 用 Node 直接加载这张表，历史模块规范化地址时也不必为它装载翻译资源。 */
export const CLEANUP_TOOL_PATHS = {
  organize: '/data-cleanup/organize',
  'resource-sync': '/data-cleanup/resource-sync',
  'orphan-records': '/data-cleanup/orphan-records',
  'media-repair': '/data-cleanup/media-repair',
  links: '/data-cleanup/links',
  'batch-delete': '/data-cleanup/batch-delete',
} as const;

export type CleanupToolKey = keyof typeof CLEANUP_TOOL_PATHS;
export type CleanupToolPath = typeof CLEANUP_TOOL_PATHS[CleanupToolKey];

/** Shared anchors can still reach their corresponding tools; scanning and collection remain on the home page. */
export const CLEANUP_HASH_REDIRECTS: Readonly<Record<string, CleanupToolPath>> = {
  '#organize': CLEANUP_TOOL_PATHS.organize,
  '#mediaRepair': CLEANUP_TOOL_PATHS['media-repair'],
  '#link-manager': CLEANUP_TOOL_PATHS.links,
  '#resource-sync': CLEANUP_TOOL_PATHS['resource-sync'],
  '#orphan-records': CLEANUP_TOOL_PATHS['orphan-records'],
  '#batch-delete': CLEANUP_TOOL_PATHS['batch-delete'],
};
