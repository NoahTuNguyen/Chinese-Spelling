#!/usr/bin/env python3
"""Validate src/data/lists.json before deploy. Exits non-zero on any problem; words without a picture only warn."""
import json, re, sys
from pathlib import Path

# Messages include Chinese words; don't crash on consoles/pipes that default to a legacy encoding (Windows).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "lists.json"
SRC = PATH.parent.parent  # img paths are relative to src/
TEXT_FIELDS = ("img", "explain", "sentence", "sentencePinyin")  # optional strings
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HAN = re.compile(r"[\u3400-\u9fff]")
# Optional "pic": one emoji (a few code points at most, e.g. "\u2600\ufe0f" or "\ud83c\udf27\ufe0f"), no letters, digits or spaces.
PIC_BAD = re.compile(r"[\sA-Za-z0-9\u3400-\u9fff]")
errors, warnings = [], []

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
        if "pic" in w:
            pic = w["pic"]
            if not isinstance(pic, str) or not pic or len(pic) > 8 or PIC_BAD.search(pic):
                errors.append(f"{where} word {i + 1}: pic must be a single emoji (or leave it out)")
        for f in TEXT_FIELDS:
            if f in w and (not isinstance(w[f], str) or not w[f].strip()):
                errors.append(f"{where} word {i + 1}: {f} must be a non-empty string (or leave it out)")
        img = w.get("img")
        if isinstance(img, str) and img.strip():
            p = (SRC / img).resolve()
            if img.startswith("/") or ".." in img.replace("\\", "/").split("/") or SRC.resolve() not in p.parents:
                errors.append(f"{where} word {i + 1}: img must be a relative path inside src/ (e.g. img/caihong.webp)")
            elif not p.is_file():
                errors.append(f"{where} word {i + 1}: img file not found: src/{img}")
        elif "img" not in w:
            warnings.append(f"{where} word {i + 1} ({w.get('hanzi', '?')}): no img yet (the emoji pic is shown instead)")

# ---- lookalikes.json (缺字 Missing character game) ----
# Every character in every word needs an entry: 2–4 single Chinese characters, no duplicates, not the
# character itself. Swapping one character of a word for one of its look-alikes must not spell another
# word from the lists (the game would then offer a second right answer).
LOOK_PATH = PATH.parent / "lookalikes.json"
SINGLE_HAN = re.compile(r"^[㐀-鿿]$")
try:
    look = json.loads(LOOK_PATH.read_text(encoding="utf-8"))
    if not isinstance(look, dict):
        raise ValueError("must be an object of character → [look-alikes]")
except Exception as e:
    errors.append(f"lookalikes.json: {e}")
    look = None

if look is not None:
    all_words = {w.get("hanzi", "") for l in lists for w in (l.get("words") or [])}
    for ch in sorted({c for word in all_words for c in word if HAN.match(c)}):
        if ch not in look:
            errors.append(f"lookalikes.json: no entry for {ch} (used in {', '.join(sorted(w for w in all_words if ch in w))})")
    for ch, alts in look.items():
        where = f"lookalikes.json {ch}"
        if not SINGLE_HAN.match(ch):
            errors.append(f"{where}: key must be one Chinese character")
        if not isinstance(alts, list) or not 2 <= len(alts) <= 4:
            errors.append(f"{where}: needs 2–4 look-alikes")
            continue
        if any(not isinstance(a, str) or not SINGLE_HAN.match(a) for a in alts):
            errors.append(f"{where}: each look-alike must be one Chinese character ({alts})")
        if len(set(alts)) != len(alts):
            errors.append(f"{where}: duplicate look-alikes ({alts})")
        if ch in alts:
            errors.append(f"{where}: lists itself as a look-alike")
    for word in sorted(all_words):
        for i, ch in enumerate(word):
            for a in look.get(ch, []) if isinstance(look.get(ch), list) else []:
                swapped = word[:i] + a + word[i + 1:]
                if swapped != word and swapped in all_words:
                    errors.append(f"lookalikes.json {ch}: swapping {ch}→{a} in {word} gives {swapped}, another word in the lists")

for m in warnings:
    print("warning:", m)
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(lists)} lists, {sum(len(l['words']) for l in lists)} words, {sum(1 for l in lists for w in l['words'] if w.get('img'))} pictures, {len(look)} look-alike entries")
