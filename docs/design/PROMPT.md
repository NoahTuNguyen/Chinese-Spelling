Implement the kid-friendly redesign of the 听写 practice app.

The design handoff is in docs/design/:
- README.md is the spec (tokens, components, screen behaviour, data and storage changes).
- mockups/*.html are static mockups of 7 screens; screens/*.png are renders of them.
Read README.md fully and open every mockup before writing code. Follow CLAUDE.md for the
project's constraints (vanilla HTML/CSS/JS in src/, no build step, GitHub Pages under a
subpath, relative paths, CSP with no inline styles or scripts).

Work in phases and commit after each one (small, clear commits). Show me a summary and
wait for my OK before starting the next phase.

Phase 1 — Layout and kid view
- Design tokens and fonts from the spec in styles.css (light + dark theme).
- Learn screen as in mockup 1: header, sticker strip, pastel word cards with 田字格,
  Play all tile, playing animation.
- Bottom tab bar under 768 px wide; header segmented tabs at 768 px and wider; desktop
  layout as in mockup 7.
- Parent corner as in mockup 5: press-and-hold on touch, click on desktop, dialog
  semantics. Move the list picker, Pinyin/Pictures/English/Slow switches, how-to and
  "clear tricky words" into it. English defaults to off.
- One short how-to line on every screen (wording in the spec).

Phase 2 — Practice flows
- Dictation (mockup 2), Check your paper with the two faces (mockup 3), Well done with
  stars and sticker book (mockup 4). Keep the existing speech, shuffle and tricky-word logic.
- Stickers in localStorage (tx-stickers) exactly as specified; call navigator.storage.persist().
- Focus mode (mockup 6): one word at a time, swipe and arrow keys, entered from Learn.
- Keyboard shortcuts on desktop: Space, arrows, Enter.

Phase 3 — Pictures and home screen
- Add a "pic" emoji to every word in src/data/lists.json (child-safe, clear meaning;
  leave it out if nothing fits) and update scripts/validate_lists.py to accept it.
  Update CLAUDE.md so future lists from photos get a pic too.
- manifest.webmanifest, app icons (192, 512, 180 apple-touch-icon) and meta tags so
  it installs to the Home Screen; "Add to Home Screen" tip in the Parent corner.

Checks before each commit
- Run the validator. Serve src/ locally and test at 390x844, 820x1180 (iPad portrait),
  1180x820 (iPad landscape) and 1280x800: no horizontal scrolling, nothing clipped,
  tap targets at least 48px for kid controls.
- Keyboard: every control reachable with Tab, visible focus ring, Esc closes the
  Parent corner.
- prefers-reduced-motion turns off the bounce and confetti.
- No console errors; no inline style attributes or inline scripts in the output.

At the end, update CLAUDE.md (design section, storage keys, new files) and give me a
short list of anything you changed from the spec and why.
