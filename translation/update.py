#!/usr/bin/env python3
"""Re-apply known translations after pulling a new peach version.

Workflow:
  1. Extracts all Chinese text units from frontend sources (via oxc-parser).
  2. Matches them against translation/memory.json (the accumulated memory).
  3. Applies every known translation via global sweep (longest-first, all source files).
  4. Writes the unmatched (new/changed) units to translation/delta.json for a follow-up pass.
  5. Runs the parse scan to verify no syntax breakage.

Usage:  python translation/update.py
Afterwards: translate translation/delta.json entries (manually or with an agent),
merge them back with  python translation/scripts/merge_delta.py, re-run update.py.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
FRONTEND = os.path.join(ROOT, "frontend")
TRANSLATION = os.path.join(ROOT, "translation")
SCRIPTS = os.path.join(TRANSLATION, "scripts")
sys.path.insert(0, SCRIPTS)
from normalize_value import normalize_value
MEMORY = os.path.join(TRANSLATION, "memory.json")
DELTA = os.path.join(TRANSLATION, "delta.json")
HAN = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")

def main():
    # 1. extract units
    print("== extracting units ==")
    subprocess.run(["node", os.path.join(SCRIPTS, "units-ast.mjs")], check=True,
                   cwd=FRONTEND, env={**os.environ, "UNITS_OUT": TRANSLATION})

    # units-ast.mjs writes to a fixed path; read it
    units_path = os.path.join(TRANSLATION, "units.json")
    if not os.path.isfile(units_path):
        # fallback: the script writes to the old work path; relocate
        print("NOTE: check units-ast.mjs output path; expected", units_path)
        return 1
    units = json.load(open(units_path, encoding="utf-8"))
    print(f"extracted {len(units)} units")

    # 2. match against memory
    memory = json.load(open(MEMORY, encoding="utf-8"))
    known, delta = {}, []
    for u in units:
        text = u["u"]
        if text in memory:
            known[text] = normalize_value(text, memory[text])
        else:
            delta.append(u)
    print(f"known: {len(known)}, new/changed: {len(delta)}")

    # 3. apply known translations via sweep
    pairs = sorted(known.items(), key=lambda kv: -len(kv[0]))
    pattern = re.compile("|".join(re.escape(zh) for zh, _ in pairs))
    lookup = dict(pairs)
    files_changed, total = 0, 0
    for dirpath, _, names in os.walk(FRONTEND):
        if "node_modules" in dirpath or ".git" in dirpath:
            continue
        for name in names:
            if not name.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs")):
                continue
            p = os.path.join(dirpath, name)
            src = open(p, encoding="utf-8", newline="").read()
            if not HAN.search(src):
                continue
            out = pattern.sub(lambda m: lookup.get(m.group(0), m.group(0)), src)
            if out != src:
                open(p, "w", encoding="utf-8", newline="").write(out)
                files_changed += 1
                total += 1  # approximate
    print(f"sweep: {files_changed} files changed")

    # 4. write delta
    json.dump(delta, open(DELTA, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"delta written: {DELTA} ({len(delta)} units need translation)")

    # 5. parse scan
    print("== parse scan ==")
    result = subprocess.run(["node", os.path.join(SCRIPTS, "parse_scan.mjs")],
                            capture_output=True, text=True, cwd=FRONTEND)
    print(result.stdout, result.stderr)
    return 0 if result.returncode == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
