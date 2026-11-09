---
kind: readme
---

# Peach UI Translation (Chinese → English)

All UI copy in `frontend/` has been translated from Chinese to English. This directory
contains the tooling and memory needed to **keep the translation current** when pulling
a new upstream version.

## After pulling an update

```bash
python translation/update.py
```

This will:
1. Extract all CJK-bearing text units from `frontend/` (via oxc-parser AST).
2. Match them against `translation/memory.json` (16k+ known translations).
3. Auto-apply every known translation via global sweep (longest-first, all source files).
4. Write any **new or changed** Chinese units to `translation/delta.json`.
5. Run a parse scan to verify no syntax errors were introduced.

Then translate the delta entries (manually or with an agent), save as
`translation/delta-translated.json` (a JSON object mapping raw Chinese → English), and merge:

```bash
python translation/scripts/merge_delta.py
python translation/update.py   # re-run to apply
```

## What's intentionally NOT translated

Performer names, movie titles, and label names in test fixtures and catalog data are
content, not UI. They stay in the original language (Japanese/Chinese) on purpose —
translating them would break fixture ↔ selector consistency. The delta will always
contain these; just re-keep them each update.

## Files

| File | Purpose |
|------|---------|
| `memory.json` | Translation memory: 16k+ raw Chinese → English pairs |
| `update.py` | One-command re-translation after upstream update |
| `delta.json` | New/changed units awaiting translation (auto-generated) |
| `scripts/units-ast.mjs` | AST-exact unit extractor (oxc-parser) |
| `scripts/parse_scan.mjs` | Post-apply syntax verification |
| `scripts/apply_units.py` | Apply a translation map to source files |
| `scripts/validate_maps.py` | Validate map entries (delimiters, CJK, placeholders) |
| `scripts/merge_delta.py` | Merge translated delta back into memory |

## Rules for new translations

1. **Delimiters**: if the source unit starts with `'`, `"`, or `` ` ``, the translation
   must start and end with the same delimiter. JSX text (no quotes) stays unquoted.
2. **Apostrophes**: inside `'…'` values, escape as `\'` (e.g. `'the shell\'s client'`).
   Same for `"` and `` ` ``.
3. **Placeholders**: `${…}` blocks stay byte-identical; only string literals inside
   them may be translated.
4. **Zero CJK** in every English value.
5. **Never** put raw `<` or `>` into JSX-text values.
6. Do not translate Japanese performer names or 蜜桃 in `'Peach · 蜜桃'`.
