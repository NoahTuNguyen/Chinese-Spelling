# 听写 practice — kid-friendly redesign (design handoff)

The source of truth for the redesign. Mockups are in `mockups/` (open in a browser)
and `screens/` (PNG, rendered without the web fonts, so the type looks plainer than intended).
Mockups use list 听写（十五） as sample content.

| # | Screen | Mockup | Size |
|---|--------|--------|------|
| 1 | Learn, kid view | `1-learn-phone` | phone 390×844 |
| 2 | Dictation in progress | `2-dictation-phone` | phone |
| 3 | Check your paper (self-marking) | `3-check-phone` | phone |
| 4 | Well done + sticker book | `4-well-done-phone` | phone |
| 5 | Parent corner (bottom sheet) | `5-parent-corner-phone` | phone |
| 6 | Focus mode, one word at a time | `6-focus-ipad` | iPad landscape 1180×820 |
| 7 | Learn on desktop | `7-learn-desktop` | 1280 wide, fluid |

The mockups use inline styles for speed. The real app must NOT copy them: the site's
CSP blocks inline `style=""`. Turn them into classes and tokens in `styles.css`.

## Principles
- Used by a 6–8 year old alone AND by a parent sitting with her. Kid-first screen,
  parent controls tucked into the Parent corner.
- Labels are icon + simple Chinese + small English (e.g. 再听一次 / Hear again).
- Every screen keeps one short how-to line (bilingual on kid screens), e.g.
  Learn: 点一点，听一听 · Tap a word to hear it.
  Dictation: 听一听，写一写 · Listen, then write it on your paper.
  Check: For each word, tap the happy face if you wrote it right, or the other face to practise it again.
  Tricky: 再练一练 · Words to practise again.
- Calm and encouraging: no timers, no fail sounds, no red for mistakes (orange instead).
- Touch targets ≥ 48 px for kid controls (≥ 44 px minimum anywhere).
- Full-screen views (dictation, check, well done, focus mode, the picture card, Write, games) are sized
  `min-height: 100vh` → `100dvh` → `100svh` (each line only applies where the browser knows the unit), so
  the view fits the viewport *with* the browser bars showing. They also add
  `env(safe-area-inset-bottom)` plus `--fsbot` at the bottom (52 px on phones; 0 from 768 px and 0 in
  `display-mode: standalone`, where a Home Screen app has no browser toolbar — the safe-area padding
  still keeps the home indicator clear), so no button ends up in the strip iOS Safari's collapsed
  toolbar draws over at the end of a scrolling page.
  Same rule for heights measured in `vh` (bubble field, drawing box): give an `svh` line after the `vh` one.

## Brand
Three generated illustrations in `src/img/brand/` (flat children's picture-book style, same palette
as the word pictures: starry night-blue sky, pencil-yellow star, children in yellow and blue):

| File | Size | Used for |
|---|---|---|
| `banner-phone.webp` | 1036×676 | welcome screen under 600 px (taller crop) |
| `banner-wide.webp` | 1024×338 | welcome screen from 600 px (wide crop) |
| `og-image.jpg` | 1200×630 | link preview only (has the title drawn into it) |

- **Never put text over the banner.** The welcome screen writes everything under it; only `og-image.jpg`
  carries lettering, because a link preview is one flat image.
- The banner is a `<picture>`: `<source media="(min-width:600px)">` for the wide crop, the phone crop as
  the `<img>` fallback. Both carry `width`/`height` so the page doesn't jump while it loads, and the
  element is capped at `max-width: 720px`, under each file's natural width, so it never looks soft.
- `alt="Cartoon children under a starry sky pointing at a big star"`.
- **Link preview** (`src/index.html` head): `og:title` 听写 practice, `og:description` "Tap-to-hear
  practice for weekly Chinese 听写 spelling lists", `og:type` website, `og:url` and `og:image` as
  absolute `https://chinese-spelling.manhtu.dev/…` URLs (WhatsApp and iMessage won't follow relative
  ones), `og:image:width`/`height` 1200×630, `og:image:alt`, `twitter:card` summary_large_image.
  These are metadata, not requests from the page, so the CSP (`img-src 'self' data:`) is unaffected.
- `*.jpg` is gitignored (spelling-sheet photos); `!src/img/brand/*.jpg` lets the preview image in.

## Design tokens
Colors (light theme; add a dark theme with the same roles, tuned for contrast):

| Token | Value | Use |
|---|---|---|
| `--paper` | `#EEF6F1` | page background (mint exercise-book paper) |
| `--card` | `#FFFFFF` | surfaces, 田字格 fill |
| `--ink` | `#1D2B36` | text, dark buttons (Next) |
| `--muted` | `#4F5F6B` | secondary text |
| `--line` | `#D0E2D7` | borders, inactive dots |
| `--grid` | `#2F9461` | 田字格 border, active tab, selection ring |
| `--grid-dash` | `rgba(47,148,97,.45)` | 田字格 dashed cross |
| `--pencil` | `#F6C343` | primary action (Play all, Hear again, Done), "Next" tag |
| `--pencil-shadow` | `#D9A51F` | 3D bottom shadow under yellow buttons |
| `--good` | `#2F6FDB` | "I got it" face (selected) |
| `--again` | `#C4570F` | "Practise again" face (selected), tricky badge `#E07A1F` |
| `--danger-text` | `#A8401A` | "Clear tricky words" text |

Card tints, cycling per word in order: lemon `#FFF4C7`, lilac `#ECE6FF`, sky `#E2EFFF`,
peach `#FFE7D6`, mint `#DDF3E6`.

Type:
- UI: **Baloo 2** (Google Fonts, 500–800), fallback `system-ui, sans-serif`.
- Chinese characters and list titles: `'Kaiti SC','STKaiti','KaiTi',serif` (楷体, like the
  school sheet). Later option: self-host an LXGW WenKai subset for Android consistency.
- Sizes: list title 42 px (phone) / 56 px (desktop); card characters 42 px in a 56 px box
  (phone), 54/70 (desktop), 156/200 (focus mode); pinyin 18 px bold.

Shape: cards radius 24 (phone) / 28 (desktop) / 40 (focus card); buttons pill-shaped;
yellow buttons have a 4–5 px solid bottom shadow (`--pencil-shadow`) for a tactile feel.

## Components
- **田字格 box**: square, 2 px `--grid` border, white fill, dashed centre cross
  (`::before`/`::after`). Adjacent boxes share a border. Box size shrinks for 3+ chars.
- **Word card** (button): tinted background, white 2 px border, soft bottom shadow,
  picture on top (4:3; 16:10 under 600 px so more cards fit), 田字格 boxes, pinyin. English only if
  enabled in Parent corner. Playing state: `--pencil` 3 px border, scale 1.03, three animated sound
  bars top-right. Respect `prefers-reduced-motion`.
  Top-right corner: a **看 Look** button (magnifier-with-plus icon + 看 Look, white pill, 48 px tap
  target, `aria-label` "Look at 彩虹 bigger") that opens the picture card. It is a separate button
  from the card, which plays the word.
- **Play all tile**: last cell of the grid, yellow, white circle with play icon, 全部听 / Play all.
- **Bottom tab bar** (phone, < 768 px wide): four tabs, in this order everywhere:
  学习 Learn (book), 玩一玩 Play (puzzle piece), 听写 Dictation (pencil), 难词 Tricky (star).
  Icon above label, active tab has a mint pill behind the icon. Tricky shows an orange count
  badge. Fixed to the bottom with safe-area padding. All four fit at 320 px.
- **Header tabs** (≥ 768 px): the same four tabs, same order, as a segmented pill in the top
  bar. 768–1023 px: each tab stacks 中文 over English so logo + tabs + Parent corner fit.
- **Title picker** (replaces the sticker strip and the Parent corner list picker): the list
  title is a button inside the page `<h1>`: 听写（十五） in Kai with a small ▾ in a white
  circle, and the date line under it ("Tue 20 Oct · in 7 days"). `aria-label` like
  "听写十五, Tuesday 20 October. Change week"; `aria-haspopup="dialog"`. Opens the week sheet.
- **Sticker count pill**: beside the title, gold sticker circle + number earned (e.g. "3"),
  ≥ 48 px tall (44 px under 600 px); opens the same week sheet (`aria-label` "3 stickers. Choose a
  week"). It stays on the title's row at every phone size: the title shrinks first, and only the
  longer "Back to this week" pill may wrap to a second line.
- **Week sheet**: bottom sheet on phones, centred dialog on iPad/desktop (same component as
  the Parent corner). Title 选一周 Choose a week, close button, how-to line
  点一周来练习 · Tap a week to practise it. One row per list in date order, each a button
  ≥ 56 px tall: short date, 听写（N）, Next tag (yellow) on the next upcoming list, and the
  sticker state (gold circle with white star = earned, plus a `--pencil-ring` ring = perfect,
  dashed empty circle = not yet). Selected row: `--grid` ring and mint fill. Past lists
  slightly dimmed (`--row-past`, muted text). Opens scrolled to the selected row with focus on
  it. Picking a row selects that list, closes the sheet and stays on the same tab (Dictation
  goes back to its start screen). Real dialog: focus trap, Esc and ✕ close, focus returns to
  the title.
- **Back to this week**: small pill 回到本周 Back to this week next to the title, shown only
  when the selected list isn't the default list (see Default list); it jumps back to it.
- **Parent button**: gear, 48 px circle, caption "Parents: hold".

## Screens and behaviour
**0 Welcome.** First visit on a device only (`tx-welcomed` in localStorage), before Learn, full screen
with no tab bar: the brand banner, then 欢迎！ / "Welcome to 听写 practice", one line
("Listen, learn and practise your weekly 听写 words") and a big yellow 开始 Start button that
remembers the device and opens Learn (Esc does the same). It needs no list data, so it shows while
`lists.json` is still loading. Parent corner → "About this app" brings it back at any time.
On phones the button sits low (thumb reach); from 768 px the whole block is centred.

**1 Learn.** Header: 本周 This week pill (only when showing the next upcoming list),
title picker 听写（N） ▾ with its date line, sticker count pill (+ Back to this week pill when
another list is chosen). No separate sticker strip, so the word cards sit right under the
header. Grid of word cards + Play all tile
(2 columns phone, auto-fill `minmax(176px,1fr)` wider). Tap a card: speak it. Play all: speak each
in turn, highlighting the playing card.
One bar under the heading holds the how-to line and two buttons: **一个一个 One by one** (opens focus
mode) and **写一写 Write** (pencil; starts a Write session over the whole list, see 14).
Under 600 px that bar stays one row — the buttons shrink to icon + Chinese and the how-to takes the
rest of the width with a shorter English wording ("Tap to hear"), wrapping inside its own column;
only on very narrow phones does the row wrap. With the compact header, 16:10 pictures and that one-row
bar, four word cards are visible below the header on a 390×844 phone.

**2 Dictation.** Full screen, tab bar hidden. Top: close (✕ = stop), 听写（N）, "2 / 5".
Stepping stones: done = green check, current = yellow ring, rest grey. Heading 听一听，写一写.
Big yellow 再听一次 button (~176 px). Empty 田字格 boxes showing how many characters,
caption "2 个字 · 2 characters". Bottom: dark pill 下一个 Next → (last word: 看答案 Check).
Each word is spoken twice automatically, random order (keep current logic).

**3 Check your paper.** Heading 看答案 / Check your paper + how-to line. One row per word:
speaker button, characters + pinyin, two face buttons (happy = got it, blue when selected;
other face = practise again, orange when selected; selected row gets an orange ring).
"3 of 5 checked", then yellow 完成 Done. Practise-again words go to Tricky (existing logic).

**4 Well done.** Shown after Done. Five stars (one per correct word; for lists ≠ 5 words,
scale to 5 stars), 做得好！ / Well done! 4 out of 5. Sticker card: big tilted sticker for this
list with 新贴纸！ New sticker for this week, then the sticker book (all lists, 4 per row,
labelled with the list number). Buttons: 再练一次 Practise <missed words> again (only if any
missed), 回到单词 Back to words. Light confetti shapes (static or a short animation,
reduced-motion safe). Copy stays positive even at 0 correct ("Good try!").

**5 Parent corner.** Bottom sheet over a dimmed page (centered dialog on desktop).
Opens by press-and-hold on the gear for ~1.5 s with a filling ring on touch devices
(`pointer: coarse`); a normal click on desktop. Lists are chosen from the title picker, not here.
Contents:
- On the word cards: switches Pinyin (on), Pictures (on), English (off), Slow voice (off).
- Sound and screen: Sounds (on; game chime/boop only, words are still spoken), Dark theme (off).
- How it works (short paragraph) + on iPhone/iPad: "Add to Home Screen so stickers
  aren't cleared" with brief steps.
- "About this app": reopens the welcome screen (screen 0).
- Clear tricky words on this device (two-tap confirm). Optionally Reset stickers.
- Credits: Hanzi Writer (MIT) and the stroke data (Make Me a Hanzi / Arphic Technology, Arphic
  Public License), with links to both licence files.
- Real dialog semantics: focus trap, Esc closes, close button.

**6 Focus mode.** One word at a time: picture, huge 田字格, pinyin, yellow 听一听 Listen.
Big prev/next circle buttons (next is dark), swipe on touch, ←/→ keys. Progress dots
(current is a wide green pill). Bottom-right 开始听写 Dictation shortcut. 全部 All words returns
to the grid. Default view on iPad is still the grid; focus is one tap away. The title picker
sits in the top bar (picking a week starts at its first word).

**6b Picture card.** Opened by 看 Look on a word card or 看图 More in focus mode; full screen
(✕, list title, "2 / 5", one how-to line). One card: big 4:3 picture (emoji if there is no `img`),
then the word — **pinyin directly above the 田字格 boxes, centred on the characters** — then
听一听 Listen and 写一写 Write side by side, the English explanation and the example sentence with
its own 听句子 button. Prev/next, swipe, ←/→, Esc or ✕ closes back to where it was opened.
On phones the prev/next circles sit in the gutters left and right of the card, vertically centred,
so they stay on screen instead of under the browser's bottom bar; from 768 px they are the big
circles beside the card. On phones both buttons under the characters keep their Chinese label only
(the aria-labels stay full).

The title picker (with sticker pill and Back to this week) is shown on Learn (grid and focus
mode), the Dictation start screen and Tricky, at every size; it is hidden while a dictation
runs (dictation, check, well done) and on the picture card.

## Default list
One function, `pickDefaultList(lists, now)` in `src/lists-logic.js`, with
`TEST_DAY_CUTOFF_HOUR = 15` (local time):
- On a test day before 15:00: that day's list.
- From 15:00 on a test day, and on any other day: the first list dated after today.
- If there is no future list: the latest list.
- A `?list=l15` URL parameter overrides the default. The last-viewed list is NOT remembered
  across visits; the app always opens on the default.
- "Next" tags, the 本周 pill and dimming of past lists use the same rule
  (`nextUpcoming`, `isPast`). `node scripts/test_default_list.js` checks it.

**7 Desktop.** Header bar: logo square 听 + "听写 practice", segmented tabs, Parent corner
button. Centered max-width 1200. Keyboard hints strip: Space = hear, ←/→ = move,
Enter = next in dictation. Visible focus ring (`--grid`, 4 px) on the focused card.

**8 Play: game picker.** Tab 玩一玩 Play. Title picker (as on other tabs), how-to
选一个游戏 · Pick a game, then one card per game from a registry (`GAMES` in app.js) so more
games can be added. Each card: picture, Chinese + English name, one-line description, and a
note pill ("Best this week: 4 / 5", "5 pictures to play", or why it can't be played).

**9 看图选词 Picture quiz.** Uses the selected list. Questions = every word with an `img`, once
each, random order; words without `img` are skipped. Fewer than 3 pictures → the card says
"This week needs more pictures to play" and doesn't start. Full screen (no tab bar):
- Top: ✕ (back to the picker), progress dots (done green, current wide yellow), "2 / 5".
- Big 4:3 rounded picture with `alt=""`; the question region (`<section>`) has
  `aria-label="Which word matches this picture?"` so the alt never gives the answer away.
- Prompt 这是什么？ Which word is this? Three choice buttons (≥ 72 px tall, characters only in
  Kai, large): the right word + 2 other words from the same list, shuffled. Stacked full width
  on phones/iPad portrait; to the right of the picture from 1000 px (iPad landscape, desktop).
  Keys 1/2/3 answer (number badges show on devices with a mouse).
- 💡 提示 Hint: shows pinyin under all three choices for this question.
- Right: button turns `--good` with a white tick, small bounce, chime, the word is spoken,
  pinyin + English appear under the picture, next question after ~1.5 s (plus a Next button).
- Wrong: soft boop, short wobble, that choice fades and is disabled; keep trying. No red,
  no "wrong" text.
- Chime and boop are made with the Web Audio API (no files); Parent corner → Sounds turns
  them off. `prefers-reduced-motion` turns off bounce and wobble.
- End: stars = right on the first try, scaled to 5; 做得好！ "4 / 5 first try!" (加油！ Good try!
  at 0, 太棒了！ when all first try). Best for this list, how many words went to Tricky.
  Buttons 再玩一次 Play again (new order and choices), 回到游戏 Back to games. Words not right
  first time go to Tricky (same rules as dictation).

**Shared game engine (all Play games).** Game picker order: 看图选词, 听音选字, 缺字, 翻翻乐, 泡泡.
Every game uses the selected list; wrong-answer choices come from the same list and are topped up
from the nearest other lists (by date) only when the list is too short. Same feedback as the
Picture quiz (right: `--good` blue, tick, bounce, chime, word spoken; wrong: soft boop, wobble,
fade + disable, try again; never red, never "wrong"), Web Audio sounds behind the Sounds switch,
`prefers-reduced-motion` respected. Same top bar (✕, progress dots, "2 / 5") and end screen
(stars, positive headline, 再玩一次 Play again, 回到游戏 Back to games). First-try misses go to
Tricky (except Memory match). Best score per game per list in `tx-games`, shown on the game card.
One bilingual how-to line on every game screen. Choice buttons ≥ 72 px; keys 1/2/3(/4) answer;
everything works by keyboard.

**10 听音选字 Listen & pick.** Every word in the list once, random order. The word is spoken when
the question appears; a big 🔊 再听一次 Hear again button replays it. 3 choices, characters only.
💡 提示 Hint shows the word's picture (emoji if it has no `img`; no hint if it has neither), never
the pinyin. How-to: 听一听，选一选 · Listen, then pick the word.

**11 缺字 Missing character.** Data: `src/data/lookalikes.json` maps every character used in the
lists to 2–4 visually similar characters a child might confuse (validated by
`scripts/validate_lists.py`). Each question shows the word in 田字格 boxes with one character
(random position) replaced by an empty dashed box; the whole word is spoken at the start and 🔊
replays it. 3 choices: the missing character + 2 look-alikes (fallback: characters from other
words in the list); a distractor that would spell another word from any list is never offered.
Hint shows the pinyin of the missing character only. On a right answer the character drops into
the box, then the whole word is spoken. How-to: 找一找，缺了哪个字？ · Which character is missing?

**12 翻翻乐 Memory match.** Pairs of picture card ↔ characters card (emoji if no `img`), up to 6
pairs, shuffled face down. Grid: 3 columns on phones, 4–6 on iPad/desktop, cards ≥ 88 px, last
row centred. Tap to flip (flip animation; a plain swap with reduced motion); flipping a characters
card speaks the word. Two cards up: a match stays face up with a blue ring and a chime; otherwise
both flip back after ~1 s. No timer. Score = moves; stars: moves ≤ pairs + 1 → 5, ≤ pairs + 3 → 4,
≤ pairs + 5 → 3, otherwise 2. Best = fewest moves. No Tricky entries. Cards are buttons with
`aria-label`s ("Card 4, face down"). How-to: 翻一翻，配一配 · Flip two cards to find a pair.

**13 泡泡 Bubble pop.** Start screen with a speed choice 慢 Slow (default) / 中 Normal (the Slow
voice switch doesn't affect this). 8 rounds (words repeat if the list is short). Each round the
word is spoken, then 4 bubbles (right word + 3 from the list), characters large inside, float
slowly up from the bottom with a gentle side-to-side drift; a bubble leaving the top re-enters at
the bottom, so there is no failing. Right bubble: burst animation + pop sound + chime, next round.
Wrong bubble: wobble + boop, turns grey and keeps floating. 🔊 replays the word. Bubbles are real
buttons (Tab/Enter, keys 1–4). `requestAnimationFrame` + transforms; paused while the tab is
hidden. Reduced motion: bubbles sit still in a row and fade in. Score = rounds right on the first
tap. How-to: 听一听，戳泡泡 · Listen, then pop the right bubble.

**Stroke order (Hanzi Writer), self-hosted.** Hanzi Writer 3.7.3 (MIT) lives in
`src/vendor/hanzi-writer/` (unmodified minified UMD build, its `LICENSE.txt`, a `VERSION` file with
the SHA-256) and is loaded with a normal `<script>` tag from our own domain. Stroke data for only
the characters in the lists is in `src/vendor/hanzi-writer-data/<char>.json` (from
hanzi-writer-data 2.0.1, via `scripts/fetch_strokes.py`), with its licence `ARPHICPL.TXT`. Every
writer is created through `hanziWriter()` in app.js, whose `charDataLoader` fetches from that local
folder, so nothing loads from another domain. The validator requires a stroke file for every
character. Parent corner → Credits: "Stroke order: Hanzi Writer (MIT). Stroke data: Make Me a
Hanzi / Arphic Technology, Arphic Public License." with links to both licence files.

**14 写一写 Write (Learn).** A 写一写 Write button on the picture card and in focus mode opens the
Write view at that word; the 写一写 Write button in the Learn bar starts a **session over the whole
list**, from its first word, and steps through every word in order (the last character of a word
leads to 下一个词 Next word; a row of word dots under the top bar shows how far along it is).
After the last character of the last word a finish screen appears: 写完了！, "You wrote all N words
of 听写（N）", 再写一次 Write again and 回到学习 Back to Learn. Nothing is scored and no Tricky
words are added. Closing (✕ or Esc) goes back where it started: the Learn grid, the picture card or
focus mode. ‹ steps back across words too.
One character at a time: each character sits in a large 田字格 box (the
grid is drawn behind the Hanzi Writer SVG): about 300 px on phones (250 px on short ones), 420 px on
iPad, never overflowing. Colours from tokens: strokes `--ink`, outline light grey, highlight `--pencil`,
correct stroke `--grid`. Three steps with big buttons: 1 看一看 Watch (stroke-order animation,
replay, slow speed); 2 描一描 Trace (quiz with the outline visible, hint after 2 misses);
3 写一写 Write (quiz with no outline, hint after 3 misses). Pinyin, a 🔊 button for the word,
prev/next character and next word. Only the drawing box disables page scroll and zoom
(`touch-action: none`), so finger and Apple Pencil strokes don't move the page. Quiz leniency a
little above default (1.3) for young children. How-to: 看一看，描一描，写一写 · Watch, trace, then
write. Built as: the word's characters across the top (current one underlined in pencil yellow),
pinyin of the current character and a 🔊 pill with the word above the box, a status line under it
(描一描 Now trace it / 太棒了！ Perfect! / 做得好！ Well done!, with a chime), then the three step
buttons, 再看一次 Watch again / 再写一次 Try again, ‹ and 下一个字 Next character → 下一个词 Next
word → 完成 Done on the last word. A new character starts at Watch; a new word is spoken. From
1000 px wide the steps sit beside the box. Keys: ←/→ characters, Space hears the word, Esc closes.
Nothing is scored here.

**15 写一写 Write it (Play).** Game card after 泡泡: 写一写 Write it — Hear the word, write it. Every
word in the list once, random order; the word is spoken at the start (🔊 replays it). Empty 田字格
boxes show how many characters; each character is written in quiz mode with NO outline. After 3
misses the outline shows briefly as a hint; 💡 提示 plays the stroke-order animation once. A
character counts as correct when written with no hints and ≤ 2 missed strokes. After each word the
whole word is shown with pinyin and a chime. End screen like the other games: stars = words fully
correct, 再玩一次 Play again / 回到游戏 Back to games. Characters that needed hints go to Tricky
words (their word). Best score per list in `tx-games`. How-to: 听一听，写一写 · Listen, then write
the word. Built as: 再听一次 Hear again, a row of small 田字格 boxes (the one being written is
yellow; finished characters appear in them, orange if they needed help), the drawing box, a
status line and 💡 提示 Hint. The hint resumes from the stroke the child was on. Help = the
outline flash or 💡. When the word is done the row grows to show it with pinyin and English, the
word is spoken again, and 下一个 Next / 看结果 Finish moves on (no auto-advance, so there is time
to look). Space hears the word again.

## Data changes (`src/data/lists.json`)
Add an optional `pic` per word: a single emoji used as the picture, e.g.
`{"hanzi":"彩虹","pinyin":"cǎi hóng","english":"rainbow","pic":"🌈"}`.
Fill `pic` for every existing word (pick a clear, child-safe emoji; if nothing fits well,
omit it and the card simply shows no picture). Update `scripts/validate_lists.py` to allow
it (optional string). Mockups show hand-drawn SVG pictures; the app uses the emoji.

## Device storage (localStorage, no server)
- `tx-welcomed`: `true` once the welcome screen's 开始 Start has been tapped on this device
- `tx-prefs`: `{ slow, py, en, pics, dark, sound }`
- `tx-tricky`: unchanged (Dictation and the picture quiz both add to it)
- `tx-games`: `{ "pictureQuiz": { "<listId>": { "best": 4, "total": 5 } } }`: best first-try
  score per game and list
- `tx-stickers`: `{ "<listId>": { "best": 4, "total": 5, "perfect": false, "at": "<ISO date>" } }`
  A sticker is earned the first time a dictation of that list is finished (Done pressed);
  keep the best score; `perfect` = all correct (gold star with a ring).
- Call `navigator.storage.persist()` once (ignore failures). Wrap all storage in try/catch.

## Add to Home Screen (PWA basics)
`src/manifest.webmanifest` with name "听写 practice", short_name "听写", `start_url: "./"`,
`scope: "./"` (site lives under `/Chinese-Spelling/` on GitHub Pages), `display: standalone`,
theme `#EEF6F1`, icons 192/512 PNG + a 180 px `apple-touch-icon` (a green 田字格 square
with 听 in it). Add `apple-mobile-web-app-capable` meta and a status-bar style.
A service worker for offline use is optional and comes last. For now a temporary
network-first worker (`src/sw.js`) is in place so updates show up despite GitHub Pages'
10-minute cache; it keeps the last good copy of each file for offline use (see CLAUDE.md).

## Non-negotiables
- No framework, no build step. Relative paths only (GitHub Pages subpath).
- Keep the CSP: no inline scripts or inline `style=""` attributes.
- All controls are real `<button>`/`<a>`, icon-only buttons have `aria-label`,
  text contrast ≥ 4.5:1, works at 320 px wide and with the iPad in both orientations.
