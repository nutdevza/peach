"""Apply unit translation maps to source files.

Usage: python -I apply_units.py map1.json [map2.json ...]

Units include their delimiters (quotes/backticks) or are comment/JSX raw slices,
so replacements are exact byte substitutions. Per file: single-pass regex,
alternatives sorted longest-first. Only files listed in units.json for each unit
are touched. Report: out/apply-units-report.json
"""
import json
import os
import re
import sys

BASE = os.path.expanduser(os.path.join("~", "Downloads", "Compressed", "dmm-downloader"))
FRONTEND = os.path.join(BASE, "peach", "frontend")
OUT = os.path.expanduser(os.path.join("~", "Downloads", "dmm-translation-work", "out"))
HAN = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]")

units = json.load(open(os.path.join(OUT, "units.json"), encoding="utf-8"))
unit_files = {}
for u in units:
    unit_files[u["u"]] = u["files"]

translation = {}
for a in sys.argv[1:]:
    translation.update(json.load(open(a, encoding="utf-8")))

skipped = []
for zh in list(translation):
    en = translation[zh]
    if HAN.search(en):
        skipped.append((zh[:40], "translation contains CJK"))
        del translation[zh]
        continue
    if zh not in unit_files:
        skipped.append((zh[:40], "unit not in units.json"))
        del translation[zh]
        continue

file_to_pairs = {}
for zh, en in translation.items():
    for f in unit_files[zh]:
        file_to_pairs.setdefault(f, []).append((zh, en))

report = {}
for rel, pairs in sorted(file_to_pairs.items()):
    path = os.path.join(FRONTEND, rel.replace("/", os.sep))
    if not os.path.isfile(path):
        skipped.append((rel, "file missing"))
        continue
    src = open(path, encoding="utf-8", newline="").read()
    pairs = sorted(set(pairs), key=lambda p: len(p[0]), reverse=True)
    pattern = re.compile("|".join(re.escape(zh) for zh, _ in pairs))
    lookup = dict(pairs)
    count = 0
    def sub(m, lookup=lookup):
        global count
        count += 1
        return lookup[m.group(0)]
    out = pattern.sub(sub, src)
    if out != src:
        open(path, "w", encoding="utf-8", newline="").write(out)
        report[rel] = count

json.dump({"files_changed": len(report), "replacements": report, "skipped": skipped},
          open(os.path.join(OUT, "apply-units-report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("files changed:", len(report))
print("total replacements:", sum(report.values()))
print("skipped:", len(skipped))
for s in skipped[:10]:
    print("  SKIP:", s)
