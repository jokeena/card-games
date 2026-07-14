# Verify pinochle changes

Browser-only Vite React game; verify by driving it in headless Chrome.

## Launch

```bash
npm run dev   # NOTE: ports 5173/5174 are often taken by other projects —
              # read the vite output for the real port. Base path is /pinochle/.
```

## Drive

No Playwright installed; use `puppeteer-core` pointed at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

A generic driver loop that plays full games via the DOM (selectors that matter):

- `.mode-card` — menu mode buttons (match by label text)
- `.bid-pass` / `.bid-main` — bidding panel
- `.suit-btn` — trump naming (appears if human wins bid / gets stuck)
- `.pass-tray` + `.hand-cards .card-clickable` + `.btn-confirm` — discard/pass
- `.btn-gold` — all primary buttons; distinguish by text ("Play hand",
  "OK — show the meld", "Show the score", "Next hand", "Final result")
- `.received-ack` — returned-cards acknowledgment overlay
- `.review-row` — end-of-hand face-up hands
- `.bar-btn` containing "Undo" — undo button
- `.modal h2` matching /wins|You win/ — game over

Undo check: count `.hand-cards .card` before playing, play, undo, count again.

Bot-quality changes: don't eyeball — run a temp vitest sim (bots on all seats
via `botAction` + `gameReducer`, CONTINUE through meld/trickEnd/handReview/handEnd)
and compare hard-vs-medium win rates per mode against team-count chance baseline.
`src/bots/bot.sim.test.ts` has the loop to copy.
