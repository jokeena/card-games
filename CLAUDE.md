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

**`src/games/euchre/`** — standard 4-player partnership euchre (engine + bots built; UI pending):
- `engine/types.ts` — re-exports `src/cards/types` plus bower logic: `effectiveSuit` (the left bower IS trump — for following suit, voids, everything), `trickPower`, `isBlackJack`.
- `engine/tricks.ts` — follow-suit-only legality (no must-beat/must-trump, unlike pinochle) and trick winner.
- `engine/game.ts` — phase machine `dealerDraw → order1 → (discard | order2) → play ⇄ trickEnd → handEnd → gameOver`. `newGame(rng)` runs the opening ritual: cards dealt around until the first **black** jack; that seat deals, and the sequence is kept in `drawCards` for the UI to animate. Stick the dealer (round-2 PASS by the dealer is rejected). Going alone: partner's seat is `inactive`, tricks complete with 3 cards; if the dealer is the one sitting out, the turn card stays with the kitty (no pickup/discard). Scoring: 1 / 2 (march) / 4 (lone march) / 2 to defenders on a euchre; first team to 10.
- `bots/bot.ts` — pure `botAction(state, seat)` mirroring the pinochle bot contract. Hand evaluation in "trump points" (`handScore`; ~5.5 calls, ~8.5 goes alone); play tracks boss cards from public info only (`played`, the upcard's fate, own hand). Tests: `bot.test.ts` (decisions) + `bot.sim.test.ts` (120 seeded self-play games).
- House flavor to build in the UI: each team's score shown with two 5s on the felt (0 = crossed face down; 1–4 = face-down card slid to expose N pips; 5 = fully exposed; 6–9 = both face up, top full 5 + N−5 pips; 10 = both face up side by side). Red 5s for one team, black for the other (conjured — the 24-card deck has no 5s).

Do not generalize either game's engine to serve the other (bowers break pinochle's trick-legality and rank assumptions).

## Pinochle house rules — do not "correct" to standard pinochle

Scoring intentionally deviates from standard rules (documented in `meld.ts` header comment and README):
- Counters (A/10/K) are worth **1 point each**, +1 for last trick → 25 trick points per hand.
- Run = 15; each extra trump K or Q alongside a run = +2 (no separate trump marriage with a run).
- Doubles (double run, double arounds) = **10×** the single value.
- Strict must-beat/must-trump play: `legalPlays` makes reneging impossible, including beating over a partner.
- A side keeps its meld only if it takes at least one trick; going set subtracts the bid; bidder goes out first at the target score.

Tests in `src/games/pinochle/engine/engine.test.ts` pin these house rules — a "wrong-looking" expected value is probably intentional.
