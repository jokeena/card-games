# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                        # Vite dev server
npm test                           # run all tests (vitest run)
npx vitest run -t "double run"     # run a single test by name
npx vitest run src/engine/engine.test.ts   # run one test file
npm run build                      # tsc type-check + vite build to dist/
```

Deployed to GitHub Pages via `.github/workflows/` — `vite.config.ts` sets `base: '/pinochle/'`, so asset paths assume that subpath in production.

## Architecture

Browser-only pinochle game vs bots. No backend, no state libraries — everything flows through one reducer.

**`src/engine/`** — pure, UI-agnostic game logic:
- `game.ts` is the heart: `GameState` + `gameReducer`, a strict phase machine (`bidding → trump → discard|pass1/pass2 → meld → play ⇄ trickEnd → handEnd → gameOver`). Every action validates phase and seat and returns the state unchanged if illegal — the reducer is the rules enforcement, not the UI.
- `modes.ts` — all six game variants (3–6 players) are data in `MODES`, not code branches. `ModeConfig` (hand size, kitty, bid start, stuck bid, teams as a seat→team array, pass count) drives the reducer generically. New variants should be new `ModeConfig` entries.
- `meld.ts` / `tricks.ts` — meld scoring and trick legality.
- The only randomness is the deal (`deck.ts`, injectable rng); the reducer itself is deterministic.

**`src/bots/bot.ts`** — pure function `botAction(state, seat, difficulty)` returning a `GameAction` for any phase. Bots read the same `GameState` (including other hands — they only look at their own by convention).

**`src/App.tsx`** — glue. `useReducer(gameReducer)`; a single `useEffect` drives bots: whenever `actorFor(state)` is a non-zero seat, it dispatches that bot's action after a delay. Bot throw-in strategy (conceding a hopeless bid at meld) lives here, not in `bot.ts`. **Seat 0 is always the human.**

**`src/ui/`** — `GameTable.tsx` (table, hands, bid/discard/pass controls), `Modals.tsx` (meld reveal, hand summary, game over), all styled by hand-rolled `styles.css` (no CSS framework).

## House rules — do not "correct" to standard pinochle

Scoring intentionally deviates from standard rules (documented in `meld.ts` header comment and README):
- Counters (A/10/K) are worth **1 point each**, +1 for last trick → 25 trick points per hand.
- Run = 15; each extra trump K or Q alongside a run = +2 (no separate trump marriage with a run).
- Doubles (double run, double arounds) = **10×** the single value.
- Strict must-beat/must-trump play: `legalPlays` makes reneging impossible, including beating over a partner.
- A side keeps its meld only if it takes at least one trick; going set subtracts the bid; bidder goes out first at the target score.

Tests in `src/engine/engine.test.ts` pin these house rules — a "wrong-looking" expected value is probably intentional.
