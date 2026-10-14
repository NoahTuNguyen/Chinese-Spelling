#!/usr/bin/env python3
"""Download stroke-order data for the characters used in src/data/lists.json.

Only the characters we use are fetched (never the whole set), from the pinned
hanzi-writer-data release, into src/vendor/hanzi-writer-data/<char>.json, plus the
data's licence (ARPHICPL.TXT). Existing files are kept unless --force is given.

    python3 scripts/fetch_strokes.py           # fetch what's missing
    python3 scripts/fetch_strokes.py --force   # re-download everything
"""
import json, re, sys, urllib.parse, urllib.request
from pathlib import Path

DATA_VERSION = "2.0.1"  # hanzi-writer-data release (npm), pinned
BASE = f"https://cdn.jsdelivr.net/npm/hanzi-writer-data@{DATA_VERSION}/"
ROOT = Path(__file__).resolve().parent.parent
LISTS = ROOT / "src" / "data" / "lists.json"
OUT = ROOT / "src" / "vendor" / "hanzi-writer-data"
HAN = re.compile(r"[㐀-鿿]")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return r.read()


def main():
    force = "--force" in sys.argv[1:]
    lists = json.loads(LISTS.read_text(encoding="utf-8"))["lists"]
    chars = sorted({c for l in lists for w in l["words"] for c in w["hanzi"] if HAN.match(c)})
    OUT.mkdir(parents=True, exist_ok=True)

    lic = OUT / "ARPHICPL.TXT"
    if force or not lic.exists():
        lic.write_bytes(get(BASE + "ARPHICPL.TXT"))
        print("licence: ARPHICPL.TXT")

    fetched, kept, failed = [], [], []
    for c in chars:
        dest = OUT / f"{c}.json"
        if dest.exists() and not force:
            kept.append(c)
            continue
        try:
            body = get(BASE + urllib.parse.quote(c) + ".json")
            data = json.loads(body.decode("utf-8"))
            if not isinstance(data.get("strokes"), list) or not isinstance(data.get("medians"), list) or len(data["strokes"]) != len(data["medians"]):
                raise ValueError("not stroke data (strokes/medians missing or different lengths)")
            dest.write_bytes(body)
            fetched.append(c)
        except Exception as e:  # report and carry on with the rest
            failed.append(f"{c}: {e}")

    print(f"{len(chars)} characters in the lists: {len(fetched)} downloaded, {len(kept)} already present"
          + (f", {len(failed)} FAILED" if failed else ""))
    if fetched:
        print("downloaded:", "".join(fetched))
    for f in failed:
        print("failed:", f)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
