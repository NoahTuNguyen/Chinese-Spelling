# 听写 practice — project notes for Claude Code

A small static web app that helps children (and their parents) practise weekly
Chinese 听写 (dictation) spelling lists from a Singapore primary school. Parents
open a shared link, tap a word to hear it in Mandarin, and run a mock dictation.

## Stack and constraints
- Plain HTML, CSS and vanilla JS in `src/`. No framework, no build step, no npm.
- Hosted on GitHub Pages from a public repo. `src/` is the deployed folder.
- Deploys automatically on push to `main` via `.github/workflows/deploy.yml`.
- Every URL in `src/` must stay relative (`data/lists.json`, not `/data/lists.json`)
  so the site works both on the custom domain and under the github.io subpath.
- Speech uses the browser's built-in `speechSynthesis` (mainland zh-CN voice preferred).
- Strict CSP in a `<meta http-equiv="Content-Security-Policy">` tag in `src/index.html`
  (Pages can't send custom headers): scripts and styles from the site only (plus
  Google Fonts CSS/fonts). No inline `<script>`, no inline `style=""` attributes,
  no third-party requests. If a feature needs one, update the CSP deliberately.
- The repo is public: never commit photos, children's names or anything personal.
- Per-device state lives in localStorage under `tx-*` keys (see Device storage).
  Nothing personal is ever sent anywhere.

## Layout
- `src/index.html` — page shell: CSP + PWA meta tags, `#root`, and the Parent corner `<dialog id="parent">`
- `src/app.js` — the whole app (render functions + delegated `data-act` click handlers)
- `src/styles.css` — design tokens on `:root` (light; dark under `[data-theme="dark"]`), 田字格 boxes, components
- `src/data/lists.json` — ALL spelling-list data
- `src/data/lookalikes.json` — character → 2–4 look-alike characters (first = most common mix-up), for 缺字
- `src/img/` — one 640×480 WebP illustration per word, named by toneless pinyin (`caihong.webp`)
- `src/img/brand/` — brand artwork (see Brand): `banner-phone.webp` (1036×676), `banner-wide.webp`
  (1024×338) for the welcome screen, `og-image.jpg` (1200×630) for link previews
- `src/manifest.webmanifest`, `src/icons/` — Add to Home Screen (icons 192, 512 incl. maskable,
  180 apple-touch-icon). `*.png` is gitignored except `src/icons/*.png`.
- `src/lists-logic.js` — date rules: `pickDefaultList(lists, now)`, `nextUpcoming`, `isPast`,
  `TEST_DAY_CUTOFF_HOUR` (loaded before app.js as `window.TXLists`; also `require`-able in Node)
- `scripts/validate_lists.py` — checks lists.json; CI runs it before deploying
- `scripts/test_default_list.js` — checks `pickDefaultList` (`node scripts/test_default_list.js`)
- `src/vendor/hanzi-writer/` — Hanzi Writer 3.7.3 (MIT), unmodified minified build + LICENSE.txt +
  VERSION (sha256). Loaded by a `<script>` tag; create writers only via `hanziWriter()` in app.js
  (its `charDataLoader` reads the local stroke files; the library's default would use a CDN).
- `src/vendor/hanzi-writer-data/` — stroke JSON for ONLY the characters in the lists (+ ARPHICPL.TXT),
  from hanzi-writer-data 2.0.1 via `scripts/fetch_strokes.py`. The validator fails if one is missing.

## Run locally
```
python3 -m http.server 8080 -d src     # then open http://localhost:8080
python3 scripts/validate_lists.py      # run after every change to lists.json
node scripts/test_default_list.js      # run after changing src/lists-logic.js
```
(Opening index.html directly from disk won't work: it fetches data/lists.json.)
On this Windows machine `python3` is only the Store stub; use `py -3` instead.

## Deployment
- Host: GitHub Pages, source "GitHub Actions" (no Azure, no secrets needed).
- Repo: `NoahTuNguyen/Chinese-Spelling` (public). Live: https://chinese-spelling.manhtu.dev/
  (the old https://noahtunguyen.github.io/Chinese-Spelling/ redirects there).
- Custom domain: set in the repo's Pages settings (no CNAME file; Actions deploys
  ignore it). DNS is on Cloudflare: CNAME `chinese-spelling` → `noahtunguyen.github.io`,
  must stay **DNS only** (grey cloud) or GitHub can't renew the HTTPS certificate.
  `manhtu.dev` is verified on the NoahTuNguyen account (TXT `_github-pages-challenge-NoahTuNguyen`).
- Workflow `.github/workflows/deploy.yml`: on push to `main` (or manual run) it
  validates `lists.json`, uploads `src/` and deploys. A failed validation blocks the deploy.
- Pages sends every file with `Cache-Control: max-age=600` (can't be changed). To get around it,
  a TEMPORARY network-first service worker is in place (see below), so after a device's first
  visit each open fetches the newest files. lists.json is also fetched with `no-cache`.

### Service worker (temporary)
- `src/sw.js`, registered at the end of `app.js` with `updateViaCache: "none"`. Same-site GETs
  go to the network with `cache: "no-store"`; the last good copy (cache `tx-offline-v1`) is used
  only when offline, so pictures and the app still open without a connection. Cross-site
  requests (Google Fonts) are not touched.
- A device that last visited before the worker existed still gets one more cached load (up to
  10 min) before the worker installs. An open page keeps its old code until it is reloaded.
- To remove it later, in two deploys:
  1. Replace `src/sw.js` with a worker that unregisters itself and clears its cache:
     `self.addEventListener("install", () => self.skipWaiting());`
     `self.addEventListener("activate", e => e.waitUntil(caches.delete("tx-offline-v1").then(() => self.registration.unregister())));`
     Keep the registration in app.js so devices fetch this version. Push and leave it a few weeks.
  2. Delete `src/sw.js` and the registration block in `app.js`; push.
- Status: `gh run list --workflow deploy.yml` and `gh run watch <run-id>`
  (or the repo's Actions tab).
- Re-run: `gh workflow run deploy.yml` deploys the current `main`;
  `gh run rerun <run-id>` repeats a specific run.
- Roll back: `git revert <bad-commit>` and push (preferred, since it sticks).
  For a quick fix, `gh run rerun <older-successful-run-id>` redeploys that older
  commit until the next push to `main`.

## Data format (`src/data/lists.json`)
```json
{ "lists": [
  { "id": "l14", "number": "十四", "date": "2026-10-13",
    "words": [ { "hanzi": "彩虹", "pinyin": "cǎi hóng", "english": "rainbow", "pic": "🌈",
                 "img": "img/caihong.webp",
                 "explain": "A rainbow is the colourful arch you see in the sky after rain.",
                 "sentence": "雨后，天上有一道彩虹。",
                 "sentencePinyin": "yǔ hòu, tiān shàng yǒu yí dào cǎi hóng." } ] }
] }
```
- `id`: "l" + the list number in Arabic numerals (十四 → l14, 二十一 → l21). Must be unique.
- `number`: the Chinese numeral exactly as printed in the heading 听写（十四）.
- `date`: test date as YYYY-MM-DD (the year is printed on the sheet).
- `pic` (optional): ONE emoji shown as the word's picture. Child-safe, clear meaning, and
  widely supported (Unicode 13 or older so older iPads show it). Leave it out if nothing fits
  well. It's the fallback picture when there's no `img`.
- `img` (optional): `img/<toneless-pinyin>.webp`, relative to `src/`. The validator fails if the
  file is missing and only warns for words without `img`.
- `explain` (optional): one short, simple English sentence a 6–8 year old understands.
- `sentence` + `sentencePinyin` (optional): one short Primary 1–2 level example sentence using
  the word, and its pinyin (syllables separated by spaces, tone changes of 一/不 marked as in
  school books, e.g. "yí dào", "bú luàn"; Western punctuation).
- Keep `lists` sorted by date. The app opens on the default list: on a test day before 15:00
  that day's list, otherwise the first list dated after today, else the latest list
  (`pickDefaultList` in `src/lists-logic.js`). `?list=l15` overrides it; the last-viewed list
  is deliberately not remembered.

## Pictures (`src/img/`)
- AI illustrations (Gemini), one per word, 640×480 WebP (~quality 82, centre-crop to 4:3),
  named by toneless pinyin, no spaces (望远镜 → `wangyuanjing.webp`). If two words share the
  same toneless pinyin, prefix the list id: `l21-shixian.webp`.
- Never any text, letters, numbers or characters in a picture; child-safe; meaning only.
- Within one list pictures must look clearly different (a picture → word game will use
  wrong answers from the same list). Known look-alikes: 环境/郊外/树林, 宇宙/夜空,
  月亮/月球/神话, 晴朗/刮风.
- Style: flat children's picture-book illustration, soft rounded shapes, thick soft outlines,
  pastel mint/yellow/sky blue/peach/lilac, one clear subject on a plain light background
  (dark blue only for night or space). The full Gemini style prompt (sent once at the start of
  a chat) is in `docs/design/picture-pack.md`.
- One Gemini message per word: `Image: <scene description>. One picture only, no text.`
- Only the current list's pictures are preloaded; all other `<img>` use `loading="lazy"`.
  The temporary service worker keeps the last good copy of each picture for offline use.

## Brand (`src/img/brand/`)
- Same illustration style as the word pictures: starry night-blue sky, pencil-yellow star,
  children in yellow and blue. Generated artwork, never photos.
- `banner-phone.webp` (1036×676) and `banner-wide.webp` (1024×338): the welcome screen's banner,
  chosen with `<picture>` + `<source media="(min-width:600px)">`, `width`/`height` always set
  (no layout shift), capped at `max-width: 720px` so it is never upscaled.
- **Never put text over the banner**; the welcome screen's words go under it.
- `og-image.jpg` (1200×630): link previews only — it has "听写 practice" drawn into the image.
  The `og:*` / `twitter:card` tags in `src/index.html` must use absolute
  `https://chinese-spelling.manhtu.dev/…` URLs (WhatsApp and iMessage don't resolve relative ones);
  they are metadata, so the CSP is not involved. `.gitignore` excludes `*.jpg` but allows
  `src/img/brand/*.jpg`. After deploying a change here, re-check the preview by pasting the URL
  into WhatsApp (previews are cached by each service).

## Adding lists from a photo of the spelling sheet
When the user gives photos of a 听写 sheet:
1. Extract every COMPLETE section (heading 听写（N）, date line, numbered words).
   Skip sections that are cut off at the photo edge and tell the user which were skipped.
2. Copy the characters and the PRINTED hanyu pinyin exactly, tone marks included
   (e.g. keep neutral tones like "xīng xing" as printed). Separate syllables with spaces.
3. Write a short, simple English meaning a 7-year-old understands (1–4 words).
4. Pick a `pic` emoji for each word (see Data format); leave it out if nothing fits.
5. Draft `explain`, `sentence` and `sentencePinyin` for each word (see Data format).
   Add `src/data/lookalikes.json` entries for any NEW characters: 3 look-alikes each, the first
   being the most common real-life confusion for children (similar shape or same sound),
   preferring characters a Primary 1–2 child knows, and never one that forms a real word with
   the rest of the word (e.g. not 雪 for 雨 in 下雨, because 下雪 is a word). The validator
   requires an entry for every character and rejects swaps that spell another list word.
   Show the new entries in a table for review before committing.
   Run `python3 scripts/fetch_strokes.py` to download stroke data for the new characters
   (it only fetches what's missing) and commit the new `src/vendor/hanzi-writer-data/*.json`.
6. Write one Gemini image line per word for the user to generate
   (`Image: <scene description>. One picture only, no text.`), naming the file each one
   becomes (`src/img/<toneless-pinyin>.webp`) and avoiding look-alikes within the list.
   Leave `img` out until the user has added the file; the emoji shows meanwhile.
7. Ignore student names, class, school and handwriting. Never commit the photos
   themselves (they're gitignored) and never store a child's name anywhere.
8. If a list with the same number + date exists, replace it; otherwise add it.
9. Run `python3 scripts/validate_lists.py`, show the user the new words, emoji,
   explanations and sentences in a table for a check, then commit (`Add 听写（N）`)
   and push when they confirm. When the pictures arrive, check each one has no text,
   add `img`, validate, commit and push.

## Design
Kid-first screens for a 6–8 year old, with parent controls tucked into the Parent corner.
- Fonts: UI **Baloo 2** (Google Fonts); characters and list titles in a Kai (楷体) stack, like the school sheet.
- Tokens on `:root`: mint paper `--paper`, green grid `--grid`, pencil yellow `--pencil`
  (+ `--pencil-shadow` under yellow buttons) for primary actions, blue `--good` for "got it",
  orange `--again` for "practise again". **No red for mistakes.** Card tints `--t0`…`--t4` cycle per word.
- Light theme (the mockups) is the default on every device. Dark is opt-in from the Parent
  corner (`data-theme="dark"` on `<html>`), never from the device setting.
- Each character sits in a green 田字格 box (`.tzg`); boxes size to their card with a container query.
- Navigation: four tabs, always in this order: 学习 Learn, 玩一玩 Play, 听写 Dictation, 难词 Tricky.
  Bottom tab bar under 768px (fits at 320px), segmented tabs in a top app bar from 768px.
  Dictation, Check, Well done, focus mode, the picture card, the Write view and a game round
  are full screen (`body.full`: no bars).
- Full-screen views are `min-height:100vh` → `100dvh` → `100svh` (three lines, each used only where
  the unit is known) and pad the bottom with `env(safe-area-inset-bottom)` + `--fsbot` (52px on
  phones, 0 from 768px and 0 in `display-mode: standalone`, where there is no browser toolbar),
  so nothing sits under iOS Safari's collapsed toolbar. Heights in `vh`
  (bubble field, drawing box) get an `svh` line after the `vh` one. Essential controls never live in
  the bottom ~80px of a scrolling view.
- Word cards: a wrapper `.word` with `.word-main` (whole card, plays the word) and, in Learn,
  a small `看 Look` button (magnifier icon, `aria-label` "Look at <word> bigger") that opens the
  picture card (a button can't sit inside a button). Picture above the 田字格 when the Pictures
  switch is on: 4:3 `img`, else emoji, else none; 16:10 under 600px so more cards fit.
- Learn bar: the how-to line plus 一个一个 One by one and 写一写 Write on one row. Under 600px the
  buttons drop their English, the how-to uses a shorter English wording, the sticker pill stays on
  the title's row and pictures are 16:10 — four cards show below the header at 390×844.
- Picture card (`S.pic`, from `看 Look` or focus mode's 看图 More): big picture, then pinyin directly
  above the 田字格 boxes, 听一听 Listen and 写一写 Write side by side, English explanation, example
  sentence + pinyin with its own play button; prev/next (in the gutters beside the card on phones,
  vertically centred), swipe, ←/→, Esc or ✕ closes back to where it was opened.
- Write view (`S.write = { wi, ci, step, from, done }`): one character at a time in a big 田字格
  drawing box (`.hw-box`, the only place with `touch-action: none`); steps 看一看 Watch / 描一描
  Trace / 写一写 Write; prev/next character, then next word (the last one says 完成 Done); ←/→,
  Space = hear, Esc or ✕ goes back where it was opened. `from` = `"pic"` / `"focus"` (one word,
  opened from the picture card or focus mode) or `"learn"` — a session over the whole list from the
  Learn bar, with word dots and, after the last word (`done`), a finish screen with 再写一次 Write
  again / 回到学习 Back to Learn. No scores or Tricky entries here.
- Stroke-order writers: there is only ever ONE live writer (`WR`). `render()` mounts it into
  `.hw-target` (`mountWriterForView`) and drops it on every other screen, so any re-render
  restarts the current step; it is rebuilt when the box width changes. Colours come from tokens
  (`writerOptions`: `--ink`, `--grid` for correct quiz strokes, `--pencil` highlight,
  `--hw-outline`), leniency `LENIENCY` = 1.3.
- Title picker: the list title (`.title-btn` inside the `<h1>`, 听写（N） ▾ + date line) and the
  sticker count pill (`.stk-pill`) open the week sheet `<dialog id="weeks">` ("选一周 Choose a
  week": one row per list with date, 听写（N）, Next tag, sticker state; past dimmed). It is the
  only way to choose a list; picking stays on the same tab. Shown on Learn, focus mode, the
  Dictation start screen, Play's game picker and Tricky; hidden while a dictation or game round
  runs and on the picture card.
  "回到本周 Back to this week" shows when the chosen list isn't the default.
- Welcome screen (`S.welcome`): first visit on a device (`tx-welcomed`) and from Parent corner →
  About this app. Full screen, no bars, shown even while lists.json is still loading: brand banner
  (`<picture>`, phone crop under 600px, wide crop above, max-width 720px), 欢迎！ / Welcome to 听写
  practice, one line, big yellow 开始 Start (Esc does the same) which sets `tx-welcomed` and opens
  Learn. Never write text over the banner. Banner + words + button are one centred block (auto
  margins top and bottom), never pinned to the bottom of the view: a `dvh`/`vh` container can be
  taller than what iOS Safari shows, which hid the Start button. Under 600px tall the banner is
  capped at `30svh` (cover crop) and the type tightens so nothing has to be scrolled to.
- Screens: Learn (title picker, word cards, Play all tile, One by one → focus mode,
  Write → a Write session over the list),
  Dictation (Hear again, empty 田字格, Next), Check your paper (two faces per word; Done
  once all are marked), Well done (stars scaled to 5, sticker + sticker book), Tricky.
- Play: game picker built from the `GAMES` registry in app.js, grouped by `GROUPS` under three
  headings (`<section>` + `<h2>`, a Kai character in a green box): 听 Listen (听音选字, 泡泡, 接一接),
  认 Read (看图选词, 翻翻乐, 句子填空, 小故事), 写 Write (缺字, 找错字, 写一写). An id in `GROUPS` that
  isn't in `GAMES` yet is skipped, so a new game shows once it's registered. Under 600px the cards
  are compact, two per row (picture on top, no description line) (see docs/design/README.md). Shared engine (`G` state): `startGame`,
  `gameTop` (✕, dots, "2 / 5"), `choiceView`/`gamePick`/`gameNext` for choice games (a game
  supplies `build`, `media`, `onShow`, `how`, `hint`), `gameFinish`/`gameEndView`, `saveBest`,
  distractors via `otherWords` (same list first, then nearest lists). Right = blue + tick +
  bounce + chime + spoken word; wrong = boop + wobble + disabled (never red); keys 1/2/3.
  First-try misses go to Tricky (`applyTricky`, shared with Dictation). Chime/boop are Web
  Audio tones (no files), off via the Sounds switch.
  - 看图选词 Picture quiz: words with an `img`; Hint = pinyin under the choices; needs ≥ 3 pictures.
  - 听音选字 Listen & pick: every word; spoken on show, 🔊 Hear again; Hint = the picture/emoji.
  - 缺字 Missing character: the word in 田字格 with one dashed gap (random position), whole word
    spoken on show and after the right character drops in; Hint = that character's pinyin.
    Wrong choices (`missingChoices`): always the FIRST look-alike from `data/lookalikes.json`,
    one more at random, never one that spells another list word; fallback = characters from
    the list's other words.
  - 翻翻乐 Memory match (`kind: "memory"`, `G.mm`): picture card ↔ characters card for up to 6
    words with an `img` or emoji; flips update the cards in place (no re-render) so the flip
    animates and focus stays. Score = moves (best = fewest, `saveBest(..., lower)`); stars
    ≤ pairs+1 → 5, +3 → 4, +5 → 3, else 2. No Tricky entries.
  - 泡泡 Bubble pop (`kind: "bubbles"`): start screen with 慢 Slow / 中 Normal (`bubbleSpeed`,
    not the Slow voice switch); 8 rounds, 4 bubbles (right + 3 from the list). `render()` starts
    the `requestAnimationFrame` float (`bubbleStart`) and stops it on every other screen; it
    pauses while the tab is hidden. Bubbles are moved with `element.style.transform` (CSSOM,
    allowed by the CSP; no `style=""` in markup). Taps update the bubbles in place. Reduced
    motion: a still row that fades in. Score = rounds right on the first tap.
  - 写一写 Write it (`kind: "write"`): each word once; spoken on show, 🔊 Hear again (Space).
    Small 田字格 row (current box yellow) + drawing box with NO outline. `G.ci` = character,
    `G.strokes` = strokes done, `G.cm` = misses, `G.ch` = needed help. 3 misses on a stroke →
    outline for 1.5 s; 💡 提示 animates the strokes, then the quiz carries on from the same
    stroke (`quizStartStrokeNum`). A character is right with no help and ≤ 2 misses; a word is
    right when all its characters are. Stars/best = words right; words where a character
    needed help go to Tricky.
- Parent corner: `<dialog>`; press-and-hold 1.5 s on touch, click/keyboard elsewhere.
  Holds the Pinyin/Pictures/English/Slow voice + Sounds/Dark theme switches, how it
  works + About this app (reopens the welcome screen), Add to Home Screen tip (phones/tablets),
  Credits (Hanzi Writer MIT, stroke data Arphic Public License, links to both licence files),
  clear tricky words, reset stickers.
- Every screen has one short `.howto` line (bilingual on kid screens); keep them accurate
  when changing a flow. Labels are simple Chinese + small English.
- Keyboard: Space hears, ←/→ move between words, Enter is next in dictation. Visible
  4px `--grid` focus ring. Kid tap targets ≥ 48px. `prefers-reduced-motion` turns off
  bounce, confetti, star pop and pulsing.
- Calm and positive: no timers, no harsh fail sounds (the quiz's wrong-answer "boop" is soft);
  0 correct still says "Good try!".

## Device storage (localStorage, wrapped in try/catch)
- `tx-welcomed`: `true` once 开始 Start on the welcome screen has been tapped on this device.
- `tx-prefs`: `{ slow, py, en, pics, dark, sound }` (English and dark default off, sound on).
- `tx-games`: `{ "pictureQuiz": { "<listId>": { best, total } } }`; best first-try score per list.
- `tx-tricky`: `{ "<hanzi>": { misses, streak, pinyin, english, pic, img } }`; a word leaves
  after it's marked right twice in a row.
- `tx-stickers`: `{ "<listId>": { best, total, perfect, at } }`; earned the first time a full
  dictation of that list is finished; keeps the best score; practising missed words again
  doesn't change it. `navigator.storage.persist()` is requested once, at the first sticker.

## Ideas not built yet
- Pre-generated audio with Azure Speech (neural zh-CN voice, SSML `<phoneme>` with
  the printed pinyin so polyphones like 地 are always right), saved as mp3 per word
  under `src/audio/` and played instead of browser speech when present.
- Stroke-order animation per character.
- A proper offline-first service worker (precache the current list) to replace the temporary
  network-first one.
- Self-hosted LXGW WenKai subset so Android shows a Kai font too.
- Support for several classes or levels (one lists file per class).
