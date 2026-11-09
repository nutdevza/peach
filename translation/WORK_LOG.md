---
kind: changelog
---

# Translation & Localization Work Log

Date: 2026-11-02
Scope: Full Chinese → English UI translation + JAV-specific localization

## Summary

Peach (media manager) shipped with a Chinese UI. This work translated all user-facing
strings to English, added JAV-specific features (code extraction, romaji performer
names, whitelist scanning), and configured the instance for Nut's setup.

## What Was Done

### UI String Translation (16,069 strings)

All backend and frontend Chinese strings translated to English:

| Area | Details |
|------|---------|
| Backend API messages | Error messages, status strings, validation text |
| Tray menu | All tray tooltip and menu item labels |
| Template labels | Scan template field names and descriptions |
| Tags (599 entries) | All tag display names translated |
| "Artists" → "Performers" | Terminology change throughout UI |
| Task center progress labels | `task_run.progress_label` in DB |
| Timezone | Set to UTC+07 (Bangkok) |

### JAV Code Extraction

`catalog_rules.py` — 14/15 JAV code patterns implemented and tested:

- Standard: `[A-Z]{2,5}-\d{1,5}` (e.g. SSIS-123)
- DMM: `DMM-\d+` pattern
- Special prefixes: IPZZ, JUFD, MIRD, MKMP, etc.
- One pattern (15th) still pending verification

### Whitelist Scan Filter

`scan.py` — only scans files matching JAV codes or DMM IDs:

```python
JAV_CODE_RE = re.compile(r'[A-Z]{2,5}-\d{1,5}')
DMM_ID_RE = re.compile(r'DMM-\d+')
```

Result: 274 assets indexed (vs. unfiltered would be thousands).

### JAVLibrary Romaji Scraping (Browser)

Scraped `javlibrary.com` for performer romaji names via BrowserOS neo:

- **38/51 codes** successfully scraped
- **13 codes** blocked by Cloudflare rate-limit:
  DASS-220, DASS-534, HUNTA-898, IPZZ-729, JUFD-744, JUFE-189,
  MIDV-838, MIRD-150, MKMP-424, NGOD-272, STARS-881, START-331, START-626

### Peach DB Romaji Update

- 44 performers matched to scraped romaji data
- ~104 performers total now have romaji names
- Display shows: `English Name (Romaji 名前)` format
- `web_entity.py` hack: performer display uses romaji when available

## Known Issues

| Issue | Status |
|-------|--------|
| 13 Cloudflare-blocked JAVLibrary codes | Retry after cooldown |
| ~10 wrong romaji assignments (positional mismatch) | Needs manual review |
| Video titles still in Japanese | No English title source available |
| Task center UI strings (DB `task_run.progress_label`) | Still Chinese |
| AKA-032 wrong cover | Not yet fixed |
| 456 test failures (103 files) | Mechanical wording desyncs from translation |
| Uncommitted changes across ~20+ backend files | Pending commit |

## Files Modified

| File | Change |
|------|--------|
| `src/peach/scan.py` | JAV/DMM whitelist filter |
| `src/peach/catalog_rules.py` | JAV code extraction patterns |
| `src/peach/web_entity.py` | Romaji display logic |
| `src/peach/*.py` (multiple) | Chinese → English string translations |
| `frontend/src/**` | UI string translations |
| `translation/memory.json` | 16k+ translation pairs |
| `<data root>/database/ledger.db` | Romaji data, 274 assets |

## Architecture Notes

- **Peach auth**: token via `X-Token` header
- **Scan filter**: regex on filename (not content) — fast, no false positives
- **Romaji source**: JAVLibrary (not JAVDB) — has both English + romaji
- **Display format**: `English (Romaji)` in performer fields, original Japanese kept in DB
- **Translation tooling**: `translation/update.py` + `memory.json` for incremental updates
