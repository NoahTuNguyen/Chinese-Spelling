# 听写 practice — project notes for Claude Code

A small static web app that helps children (and their parents) practise weekly
Chinese 听写 (dictation) spelling lists from a Singapore primary school. Parents
open a shared link, tap a word to hear it in Mandarin, and run a mock dictation.

## Stack and constraints
- Plain HTML, CSS and vanilla JS in `src/`. No framework, no build step, no npm.
- Hosted on GitHub Pages from a public repo. `src/` is the deployed folder.
- Deploys automatically on push to `main` via `.github/workflows/deploy.yml`.
- The site lives under a subpath (`/Chinese-Spelling/`), so every URL in `src/`
  must stay relative (`data/lists.json`, not `/data/lists.json`).
- Speech uses the browser's built-in `speechSynthesis` (mainland zh-CN voice preferred).
- Strict CSP in a `<meta http-equiv="Content-Security-Policy">` tag in `src/index.html`
  (Pages can't send custom headers): scripts and styles from the site only (plus
  Google Fonts CSS/fonts). No inline `<script>`, no inline `style=""` attributes,
  no third-party requests. If a feature needs one, update the CSP deliberately.
- The repo is public: never commit photos, children's names or anything personal.
- Per-device state (prefs, tricky words) lives in localStorage under `tx-*` keys.
  Nothing personal is ever sent anywhere.

## Layout
- `src/index.html` — page shell
- `src/app.js` — the whole app (render functions + delegated `data-act` click handlers)
- `src/styles.css` — design tokens on `:root` (light + dark), 田字格 boxes, components
- `src/data/lists.json` — ALL spelling-list data
- `scripts/validate_lists.py` — checks lists.json; CI runs it before deploying

## Run locally
```
python3 -m http.server 8080 -d src     # then open http://localhost:8080
python3 scripts/validate_lists.py      # run after every change to lists.json
```
(Opening index.html directly from disk won't work: it fetches data/lists.json.)

## Data format (`src/data/lists.json`)
```json
{ "lists": [
  { "id": "l14", "number": "十四", "date": "2026-10-13",
    "words": [ { "hanzi": "空气", "pinyin": "kōng qì", "english": "air" } ] }
] }
```
- `id`: "l" + the list number in Arabic numerals (十四 → l14, 二十一 → l21). Must be unique.
- `number`: the Chinese numeral exactly as printed in the heading 听写（十四）.
- `date`: test date as YYYY-MM-DD (the year is printed on the sheet).
- Keep `lists` sorted by date. The app opens on the next upcoming list automatically.

## Adding lists from a photo of the spelling sheet
When the user gives photos of a 听写 sheet:
1. Extract every COMPLETE section (heading 听写（N）, date line, numbered words).
   Skip sections that are cut off at the photo edge and tell the user which were skipped.
2. Copy the characters and the PRINTED hanyu pinyin exactly, tone marks included
   (e.g. keep neutral tones like "xīng xing" as printed). Separate syllables with spaces.
3. Write a short, simple English meaning a 7-year-old understands (1–4 words).
4. Ignore student names, class, school and handwriting. Never commit the photos
   themselves (they're gitignored) and never store a child's name anywhere.
5. If a list with the same number + date exists, replace it; otherwise add it.
6. Run `python3 scripts/validate_lists.py`, show the user the new words for a
   quick check, then commit (`Add 听写（N）`) and push when they confirm.

## Design notes
- Hero is the list title 听写（N） in a Kai (楷体) font stack, like the school sheet.
- Each character sits in a green 田字格 box, like the child's exercise book.
- Palette: mint paper `--paper`, green grid `--grid`, pencil yellow `--pencil` for
  primary actions, red `--red` only for wrong answers. UI font Lexend.
- Every screen starts with a one-line `.howto` instruction; keep these accurate
  when changing a flow.
- Copy is plain, sentence case, written for parents.

## Ideas not built yet
- Pre-generated audio with Azure Speech (neural zh-CN voice, SSML `<phoneme>` with
  the printed pinyin so polyphones like 地 are always right), saved as mp3 per word
  under `src/audio/` and played instead of browser speech when present.
- Stroke-order animation per character.
- Support for several classes or levels (one lists file per class).
