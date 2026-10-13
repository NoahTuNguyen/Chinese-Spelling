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
  picture top-left, 田字格 boxes, pinyin. English only if enabled in Parent corner.
  Playing state: `--pencil` 3 px border, scale 1.03, three animated sound bars top-right.
  Respect `prefers-reduced-motion`.
- **Play all tile**: last cell of the grid, yellow, white circle with play icon, 全部听 / Play all.
- **Bottom tab bar** (phone, < 768 px wide): 学习 Learn, 听写 Dictation, 难词 Tricky, icon above
  label, active tab has a mint pill behind the icon. Tricky shows an orange count badge.
  Fixed to the bottom with safe-area padding.
- **Header tabs** (≥ 768 px): the same three tabs as a segmented pill in the top bar.
- **Title picker** (replaces the sticker strip and the Parent corner list picker): the list
  title is a button inside the page `<h1>`: 听写（十五） in Kai with a small ▾ in a white
  circle, and the date line under it ("Tue 20 Oct · in 7 days"). `aria-label` like
  "听写十五, Tuesday 20 October. Change week"; `aria-haspopup="dialog"`. Opens the week sheet.
- **Sticker count pill**: beside the title, gold sticker circle + number earned (e.g. "3"),
  ≥ 48 px tall; opens the same week sheet (`aria-label` "3 stickers. Choose a week").
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
**1 Learn.** Header: 本周 This week pill (only when showing the next upcoming list),
title picker 听写（N） ▾ with its date line, sticker count pill (+ Back to this week pill when
another list is chosen). No separate sticker strip, so the word cards sit right under the
header. Grid of word cards + Play all tile
(2 columns phone, auto-fill `minmax(176px,1fr)` wider). A "One by one" button opens focus mode.
Tap a card: speak it. Play all: speak each in turn, highlighting the playing card.

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
- How it works (short paragraph) + on iPhone/iPad: "Add to Home Screen so stickers
  aren't cleared" with brief steps.
- Clear tricky words on this device (two-tap confirm). Optionally Reset stickers.
- Real dialog semantics: focus trap, Esc closes, close button.

**6 Focus mode.** One word at a time: picture, huge 田字格, pinyin, yellow 听一听 Listen.
Big prev/next circle buttons (next is dark), swipe on touch, ←/→ keys. Progress dots
(current is a wide green pill). Bottom-right 开始听写 Dictation shortcut. 全部 All words returns
to the grid. Default view on iPad is still the grid; focus is one tap away. The title picker
sits in the top bar (picking a week starts at its first word).

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

## Data changes (`src/data/lists.json`)
Add an optional `pic` per word: a single emoji used as the picture, e.g.
`{"hanzi":"彩虹","pinyin":"cǎi hóng","english":"rainbow","pic":"🌈"}`.
Fill `pic` for every existing word (pick a clear, child-safe emoji; if nothing fits well,
omit it and the card simply shows no picture). Update `scripts/validate_lists.py` to allow
it (optional string). Mockups show hand-drawn SVG pictures; the app uses the emoji.

## Device storage (localStorage, no server)
- `tx-prefs`: `{ slow, py, en, pics }`
- `tx-tricky`: unchanged
- `tx-stickers`: `{ "<listId>": { "best": 4, "total": 5, "perfect": false, "at": "<ISO date>" } }`
  A sticker is earned the first time a dictation of that list is finished (Done pressed);
  keep the best score; `perfect` = all correct (gold star with a ring).
- Call `navigator.storage.persist()` once (ignore failures). Wrap all storage in try/catch.

## Add to Home Screen (PWA basics)
`src/manifest.webmanifest` with name "听写 practice", short_name "听写", `start_url: "./"`,
`scope: "./"` (site lives under `/Chinese-Spelling/` on GitHub Pages), `display: standalone`,
theme `#EEF6F1`, icons 192/512 PNG + a 180 px `apple-touch-icon` (a green 田字格 square
with 听 in it). Add `apple-mobile-web-app-capable` meta and a status-bar style.
A service worker for offline use is optional and comes last.

## Non-negotiables
- No framework, no build step. Relative paths only (GitHub Pages subpath).
- Keep the CSP: no inline scripts or inline `style=""` attributes.
- All controls are real `<button>`/`<a>`, icon-only buttons have `aria-label`,
  text contrast ≥ 4.5:1, works at 320 px wide and with the iPad in both orientations.
