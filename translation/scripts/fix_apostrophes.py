"""Auto-fix apostrophe escaping in rejected map values: for keys delimited by
', escape unescaped ' inside the value body. Then re-validate all maps.
"""
import json
import os
import re

OUT = os.path.expanduser(os.path.join("~", "Downloads", "dmm-translation-work", "out"))
APO = re.compile(r"(?<!\\)'")
fixed_total = 0
for name in os.listdir(os.path.join(OUT, "maps")):
    p = os.path.join(OUT, "maps", name)
    try:
        mp = json.load(open(p, encoding="utf-8"))
    except Exception:
        continue
    changed = False
    for k in list(mp):
        v = mp[k]
        if k[:1] == "'":
            body = v[1:-1]
            if APO.search(body):
                v = "'" + APO.sub(r"\\'", body) + "'"
                mp[k] = v
                changed = True
    if changed:
        json.dump(mp, open(p, "w", encoding="utf-8"), ensure_ascii=False)
        fixed_total += 1
print("maps with apostrophe fixes:", fixed_total)
