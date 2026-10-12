#!/usr/bin/env python3
"""Validate src/data/lists.json before deploy. Exits non-zero on any problem."""
import json, re, sys
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "lists.json"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HAN = re.compile(r"[\u3400-\u9fff]")
errors = []

try:
    data = json.loads(PATH.read_text(encoding="utf-8"))
except Exception as e:
    sys.exit(f"lists.json is not valid JSON: {e}")

lists = data.get("lists")
if not isinstance(lists, list) or not lists:
    sys.exit('lists.json must have a non-empty "lists" array')

ids, keys = set(), set()
for n, l in enumerate(lists):
    where = f"lists[{n}] ({l.get('id', '?')})"
    if not l.get("id"):
        errors.append(f"{where}: missing id")
    elif l["id"] in ids:
        errors.append(f"{where}: duplicate id")
    ids.add(l.get("id"))
    if not DATE.match(l.get("date", "")):
        errors.append(f"{where}: date must be YYYY-MM-DD")
    key = (l.get("number"), l.get("date"))
    if key in keys:
        errors.append(f"{where}: duplicate number + date")
    keys.add(key)
    words = l.get("words")
    if not isinstance(words, list) or not words:
        errors.append(f"{where}: needs at least one word")
        continue
    for i, w in enumerate(words):
        for f in ("hanzi", "pinyin", "english"):
            if not str(w.get(f, "")).strip():
                errors.append(f"{where} word {i + 1}: missing {f}")
        if w.get("hanzi") and not HAN.search(w["hanzi"]):
            errors.append(f"{where} word {i + 1}: hanzi has no Chinese characters")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(lists)} lists, {sum(len(l['words']) for l in lists)} words")
