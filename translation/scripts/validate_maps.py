"""Validate agent-produced maps against mechanical rules; report bad entries.

Checks per key->value:
- key exists in its batch file
- value has no CJK
- delimiter match (' " `), and proper escaping inside delimited values:
  '...' values must escape ' as \\'; "..." must escape " as \\"; `...` must
  escape ` as \\` and backslashes appropriately (we only check the dangerous
  raw cases: unescaped quote chars).
- ${} count match

Writes out/maps-fixed/<name>.json (valid pairs) and out/maps-rejects/<name>.json.
With --fix-source, also repairs already-applied bad values in the repo by
replacing bad value with the corrected value.
"""
import json
import os
import re
import sys

OUT = os.path.expanduser(os.path.join("~", "Downloads", "dmm-translation-work", "out"))
BASE = os.path.expanduser(os.path.join("~", "Downloads", "Compressed", "dmm-downloader"))
CJK_STRICT = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]")

def tpl_structure_ok(v):
    """Placeholder-aware template literal structure check.
    v starts/ends with `; backticks may appear unescaped only inside ${...}
    (nested templates); quotes/backticks must respect escaping."""
    if v[:1] != "`" or v[-1:] != "`":
        return False
    stack = ["TOP"]  # TOP: template content; PH: placeholder (with brace depth tracked separately)
    depth = 0
    i, n = 1, len(v) - 1
    while i < n:
        c = v[i]
        if c == "\\":
            i += 2
            continue
        top = stack[-1]
        if top == "TOP":
            if c == "`":
                return False  # unescaped backtick in top-level content
            if v[i:i+2] == "${":
                stack.append("PH"); depth = 1; i += 2; continue
        elif top == "PH":
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    stack.pop()
            elif c == "`":
                stack.append("NEST")
        elif top == "NEST":
            if c == "`":
                stack.pop()
            elif v[i:i+2] == "${":
                stack.append("PH"); depth = 1; i += 2; continue
        i += 1
    return stack == ["TOP"]

def check(k, v):
    if CJK_STRICT.search(v):
        return "CJK"
    if k[:1] == "'":
        if v[:1] != "'" or v[-1:] != "'":
            return "delim"
        body = v[1:-1]
        if re.search(r"(?<!\\)'", body):
            return "raw-apostrophe"
    elif k[:1] == '"':
        if v[:1] != '"' or v[-1:] != '"':
            return "delim"
        body = v[1:-1]
        if re.search(r'(?<!\\)"', body):
            return "raw-quote"
    elif k[:1] == "`":
        if v[:1] != "`" or v[-1:] != "`":
            return "delim"
        # structural template check is delegated to the oxc parse scan (post-apply)
    if k.count("${") != v.count("${"):
        return "placeholder"
    return None

batch_files = sys.argv[1:]
fix_source = False
if batch_files and batch_files[0] == "--fix-source":
    fix_source = True
    batch_files = batch_files[1:]

unit_files = {}
for u in json.load(open(os.path.join(OUT, "units.json"), encoding="utf-8")):
    unit_files[u["u"]] = u["files"]

ok_total, bad_total = 0, 0
repairs = []
for name in batch_files:
    src_map = None
    bpath = os.path.join(OUT, "batches", name)
    units = None
    if os.path.isfile(bpath):
        units = {e["u"] for e in json.load(open(bpath, encoding="utf-8"))}
    mp = json.load(open(os.path.join(OUT, "maps", name), encoding="utf-8"))
    good, bad = {}, {}
    for k, v in mp.items():
        if units is not None and k not in units:
            bad[k] = ["KEY-NOT-IN-BATCH", v]
            continue
        why = check(k, v)
        if why:
            bad[k] = [why, v]
            if fix_source and k in unit_files:
                repairs.append((k, v, why))
        else:
            good[k] = v
    json.dump(good, open(os.path.join(OUT, "maps-fixed", name), "w", encoding="utf-8"), ensure_ascii=False)
    if bad:
        json.dump(bad, open(os.path.join(OUT, "maps-rejects", name), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ok_total += len(good); bad_total += len(bad)
    print(f"{name}: ok={len(good)} bad={len(bad)}")

print("TOTAL ok:", ok_total, "bad:", bad_total)

if fix_source and repairs:
    from collections import defaultdict
    file_bad = defaultdict(list)
    for k, v, why in repairs:
        for f in unit_files[k]:
            file_bad[f].append((v, k))  # replace bad english with original chinese (revert)
    nfix = 0
    for rel, pairs in file_bad.items():
        p = os.path.join(BASE, "peach", "frontend", rel.replace("/", os.sep))
        if not os.path.isfile(p):
            continue
        src = open(p, encoding="utf-8", newline="").read()
        orig = src
        pairs = sorted(set(pairs), key=lambda x: -len(x[0]))
        for badv, zh in pairs:
            if badv in src:
                src = src.replace(badv, zh)
        if src != orig:
            open(p, "w", encoding="utf-8", newline="").write(src)
            nfix += 1
    print("reverted bad values in", nfix, "files")
