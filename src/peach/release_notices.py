"""每个发布版本给使用者看的更新公告；不是变更日志的副本。

一版一条，只写使用者需要知道的：新入口、更新后自动进行的事、需要自己动手的事。每条说明一句短话；
修复与完整清单留给 Release 页的变更日志。

条目字段：
- `platforms`：只对这些平台或安装方式显示，取值见 `release_notice.PLATFORM_TOKENS`，`+` 连接表示同时满足（如 `macos+standalone`）；省略表示全部。
- `when`：只在这台机器的数据满足条件时显示，取值见 `release_notice.FACTS`；省略表示总是显示。
- `route`：「查看」跳转的应用内路径。
- `icon`：前端 `release-notice.tsx` 的 `ICONS` 里的键。

`level` 为 `quiet` 的版本不弹窗，只在设置页留记录。只写有制品的版本；minor 版本没有公告时
`scripts/release_tag.py --bump` 拒绝定版。
"""
from __future__ import annotations

NOTICES: dict[str, dict] = {
    "0.57.0": {
        "level": "notice",
        "headline": "Steadier, faster, with capacity protection",
        "features": [
            {"title": "Capacity protection", "icon": "storage", "body": "Set limits for data and caches",
             "route": "/settings/maintenance#storageBudgetSettings"},
            {"title": "Drag to reorder", "icon": "reorder", "body": "The sidebar and every menu reorder by drag"},
            {"title": "Sync one library", "icon": "library", "body": "Scanning and collection can target a single library", "route": "/data-cleanup"},
            {"title": "New-release selection", "icon": "select", "body": "Add many to Wanted or find resources in bulk", "route": "/jav"},
            {"title": "Repairs and migrations", "icon": "refresh", "body": "Watch upgrade repair progress and confirm the cleanup of old follow snapshots",
             "route": "/settings/maintenance/repairs"},
        ],
        "automatic": [
            {"id": "display-dimensions", "icon": "resize", "when": "display_reprobe",
             "title": "Measure video dimensions", "body": "Portrait/landscape detection is corrected in the background"},
            {"id": "system-files", "icon": "server", "when": "system_files",
             "title": "System sidecar files move out", "body": "NAS thumbnails and macOS ._ files no longer count as videos"},
            {"id": "garbled-performers", "icon": "person", "when": "garbled_performers",
             "title": "Garbled performer cleanup", "body": "Performer profiles are refetched"},
            {"id": "javdb-entries", "icon": "switch", "when": "javdb_entries",
             "title": "Mismatched JavDB entries fold away", "body": "People pages no longer show empty pages for old stage names of the same person"},
        ],
        "attention": [
            {"title": "Cloud videos can be measured by hand", "when": "display_cloud_pending",
             "route": "/settings/maintenance/repairs",
             "body": "Cloud-drive videos are not measured automatically to keep the cloud cache small"},
        ],
    },
    "0.56.0": {
        "level": "notice",
        "headline": "JavDB host rotation and faster pages",
        "features": [
            {"title": "Docker first-time setup", "icon": "shield", "platforms": ["docker"], "body": "Set a password or go without sign-in"},
            {"title": "ghcr.io images", "icon": "stack", "platforms": ["docker"], "body": "An alternative while Docker Hub is rate-limited"},
            {"title": "JavDB host rotation", "icon": "switch", "body": "One host down automatically tries the next"},
            {"title": "Faster pages", "icon": "speed", "body": "The task center and statistics pages open faster"},
        ],
    },
    "0.55.1": {"level": "quiet", "headline": "Statistics and the video list open faster the first time"},
    "0.55.0": {
        "level": "notice",
        "headline": "Profile refetching and ledger backups",
        "features": [
            {"title": "Refetch profiles", "icon": "refresh", "body": "Pick fields one by one on the video details"},
            {"title": "One-click Docker update", "icon": "stack", "platforms": ["docker"], "body": "Available once Watchtower is enabled"},
            {"title": "Ledger backups", "icon": "database", "body": "Back up or restore any time"},
        ],
    },
    "0.54.0": {
        "level": "notice",
        "headline": "The JAV new-releases section and faster SMB scans",
        "features": [
            {"title": "JAV new releases", "icon": "sparkle", "body": "Lists followed releases that are not in the library yet"},
            {"title": "In-app macOS updates", "icon": "refresh", "platforms": ["macos+standalone"], "body": "Replace the app right from the update check"},
            {"title": "Faster SMB scans", "icon": "speed", "body": "One shared connection for the whole run"},
        ],
    },
}
