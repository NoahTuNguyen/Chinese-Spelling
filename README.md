# 听写 practice

Tap-to-hear practice for weekly Chinese 听写 spelling lists. Pick a list by test
date, tap words to hear them in Mandarin, run a mock dictation, and revisit tricky words.

- Live site: _add your Azure Static Web Apps URL here_
- Link to a specific list: `https://<site>/?list=l15`

## Updating lists
Edit `src/data/lists.json` (or ask Claude Code to add a list from a photo of the
sheet; see `CLAUDE.md`), run `python3 scripts/validate_lists.py`, then commit and
push to `main`. GitHub Actions validates the data and deploys to GitHub Pages automatically.

## Local preview
```
python3 -m http.server 8080 -d src
```
