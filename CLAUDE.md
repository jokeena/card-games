# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                        # Vite dev server
npm test                           # run all tests (vitest run)
npx vitest run -t "double run"     # run a single test by name
npx vitest run src/games/pinochle/engine/engine.test.ts   # run one test file
npm run build                      # tsc type-check + vite build to dist/
```

Deployed to GitHub Pages via `.github/workflows/` — `vite.config.ts` sets `base: '/card-games/'`, so asset paths assume that subpath in production.

## Architecture

Browser-only card games vs bots (currently Pinochle; Euchre planned). No backend, no state libraries — each game flows through one reducer.

**`src/App.tsx`** — game picker. Renders the chosen game's app component (e.g. `PinochleApp`); each game owns its own menu, engine, bots, and table UI under `src/games/<game>/`.

**`src/cards/`** — shared across games:
- `types.ts` — `Card`/`Suit`/`Rank` (both games use 9–A four suits), suit symbols/names, `Played`. Game-specific rank power and scoring live in each game's engine, not here (euchre's bowers reorder ranks per trump).
- `deck.ts` — `buildDeck(copies)` (1 = 24-card euchre deck, 2 = 48-card pinochle deck), `shuffle` (injectable rng), generic `deal`.
- `CardView.tsx` — hand-drawn card faces (pips + court art). All card styling in `src/styles.css` (hand-rolled, no CSS framework, shared by all games).

**`src/games/pinochle/`** — everything pinochle:
- `engine/` — pure, UI-agnostic game logic:
  - `game.ts` is the heart: `GameState` + `gameReducer`, a strict phase machine (`bidding → trump → discard|pass1/pass2 → meld → play ⇄ trickEnd → handReview → handEnd → gameOver`). Every action validates phase and seat and returns the state unchanged if illegal — the reducer is the rules enforcement, not the UI.
  - `modes.ts` — all six game variants (3–6 players) are data in `MODES`, not code branches. `ModeConfig` (hand size, kitty, bid start, stuck bid, teams as a seat→team array, pass count) drives the reducer generically. New variants should be new `ModeConfig` entries.
  - `meld.ts` / `tricks.ts` — meld scoring and trick legality.
  - `types.ts` — re-exports `src/cards/types` plus pinochle-specific `RANK_POWER` and `isCounter`.
  - The only randomness is the deal (`deck.ts`, injectable rng); the reducer itself is deterministic.
- `bots/bot.ts` — pure function `botAction(state, seat)` returning a `GameAction` for any phase (single always-hard skill level). Bots read the same `GameState` (including other hands — they only look at their own by convention). Tests: `bot.test.ts` (unit) and `bot.sim.test.ts` (full-game simulations).
- `PinochleApp.tsx` — glue. `useReducer` over a history wrapper (`histReducer`: undo to human-decision points) around `gameReducer`; a single `useEffect` drives bots: whenever `actorFor(state)` is a non-zero seat, it dispatches that bot's action after a delay. Bot throw-in strategy (conceding a hopeless bid at meld), saved-game persistence, and lifetime stats (localStorage) live here, not in `bot.ts`. **Seat 0 is always the human.**
- `ui/` — `GameTable.tsx` (table, hands, bid/discard/pass controls), `Modals.tsx` (meld reveal, hand summary, game over).

**`src/games/euchre/`** — standard 4-player partnership euchre:
- `engine/types.ts` — re-exports `src/cards/types` plus bower logic: `effectiveSuit` (the left bower IS trump — for following suit, voids, everything), `trickPower`, `isBlackJack`.
- `engine/tricks.ts` — follow-suit-only legality (no must-beat/must-trump, unlike pinochle) and trick winner.
- `engine/game.ts` — phase machine `dealerDraw → order1 → (discard | order2) → play ⇄ trickEnd → handReview → handEnd → gameOver` (`handReview` = every hand + the kitty and burial face up). `newGame(rng)` runs the opening ritual: cards dealt around until the first **black** jack; that seat deals, and the sequence is kept in `drawCards` for the UI to animate. Stick the dealer (round-2 PASS by the dealer is rejected). Going alone: partner's seat is `inactive`, tricks complete with 3 cards; if the dealer is the one sitting out, the turn card stays with the kitty (no pickup/discard). Scoring: 1 / 2 (march) / 4 (lone march) / 2 to defenders on a euchre; first team to 10.
- **No Trump house rule**: `NAME_TRUMP` with suit `'NT'` in round 2 → `trump: null`, `noTrump: true` — aces high, no bowers, nothing ruffs (`effectiveSuit`/`trickPower` take `Suit | null`). Gated by a persisted top-bar toggle (`euchre-notrump` in localStorage) that both shows the NT call button and passes `{ noTrump }` to the bots. John's family says "**euched**", not "euchred", in player-facing text.
- `bots/bot.ts` — pure `botAction(state, seat, opts?)` mirroring the pinochle bot contract. Hand evaluation in "trump points" (`handScore`; ~5.5 calls, ~8.5 goes alone); play tracks boss cards from public info only (`played`, the upcard's fate, own hand). Tests: `bot.test.ts` (decisions) + `bot.sim.test.ts` (120 seeded self-play games).
- `EuchreApp.tsx` + `ui/` — same glue pattern as `PinochleApp` (undo history, `euchre-save`/`euchre-stats` localStorage, bot-driver effect). `ui/EuchreTable.tsx` renders the felt (sorts hands by EFFECTIVE suit — the left bower files with trump), the kitty/upcard, order-up and name-trump panels with an Alone toggle, and the dealer-draw animation (drives itself, then dispatches CONTINUE). `ui/ScoreFives.tsx` keeps each team's score as two 5s in the top-left of the felt (yours by your partner, theirs below the scoreboard) — a real bicycle-style 2-1-2 quincunx face, with the cover laid the way a table does it: 45° over all-but-one pip for 1, crosswise for 2 and 3, 45° over just the bottom-right pip for 4 (0 = crossed face down … 10 = side by side; red 5s = your team, black = theirs). The `COVER_POSE` transforms are worked out against the pip grid — don't eyeball-edit them. Visit `/#fives` on the landing page for a gallery of all eleven states. Euchre styles are an appended, clearly-marked section of `styles.css`.

Do not generalize either game's engine to serve the other (bowers break pinochle's trick-legality and rank assumptions).

## Pinochle house rules — do not "correct" to standard pinochle

Scoring intentionally deviates from standard rules (documented in `meld.ts` header comment and README):
- Counters (A/10/K) are worth **1 point each**, +1 for last trick → 25 trick points per hand.
- Run = 15; each extra trump K or Q alongside a run = +2 (no separate trump marriage with a run).
- Doubles (double run, double arounds) = **10×** the single value.
- Strict must-beat/must-trump play: `legalPlays` makes reneging impossible, including beating over a partner.
- A side keeps its meld only if it takes at least one trick; going set subtracts the bid; bidder goes out first at the target score.

Tests in `src/games/pinochle/engine/engine.test.ts` pin these house rules — a "wrong-looking" expected value is probably intentional.
