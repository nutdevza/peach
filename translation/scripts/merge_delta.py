"""Merge a delta translation file (raw unit -> english) into memory.json.
Usage: python translation/scripts/merge_delta.py [delta-file]
"""
import json
import os
import sys

import normalize_value

TRANSLATION = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMORY = os.path.join(TRANSLATION, "memory.json")
DELTA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(TRANSLATION, "delta-translated.json")

memory = json.load(open(MEMORY, encoding="utf-8"))
delta = json.load(open(DELTA, encoding="utf-8"))
if isinstance(delta, list):
    delta = {u["u"]: u.get("en", "") for u in delta if u.get("en")}
added = 0
for k, v in delta.items():
    if k not in memory:
        memory[k] = normalize_value(k, v)
        added += 1
json.dump(memory, open(MEMORY, "w", encoding="utf-8"), ensure_ascii=False)
print(f"merged {added} new entries; memory now {len(memory)}")
