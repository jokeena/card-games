import { describe, expect, it } from 'vitest';
import { GameState, HandResult, TARGET, gameReducer, newGame } from '../engine/game';
import { botAction } from './bot';

/** Deterministic rng so sim failures are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function simulate(rng: () => number): { final: GameState; results: HandResult[] } {
  let s = newGame(rng);
  const results: HandResult[] = [];
  let guard = 0;
  while (s.phase !== 'gameOver') {
    if (guard++ > 5000) throw new Error(`game did not terminate (phase ${s.phase}, hand ${s.handNumber})`);
    if (s.phase === 'dealerDraw' || s.phase === 'trickEnd' || s.phase === 'handEnd') {
      if (s.phase === 'handEnd' && s.handResult) results.push(s.handResult);
      s = gameReducer(s, { type: 'CONTINUE' });
      continue;
    }
    const action = botAction(s, s.turn);
    if (!action) throw new Error(`bot returned null in phase ${s.phase}, seat ${s.turn}`);
    const next = gameReducer(s, action);
    if (next === s) throw new Error(`bot chose an illegal action: ${JSON.stringify(action)}`);
    s = next;
  }
  return { final: s, results };
}

describe('bot self-play', () => {
  it('completes 120 full games legally, with sane outcomes', () => {
    let made = 0;
    let euchred = 0;
    let lones = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const { final, results } = simulate(lcg(seed * 7919));
      expect(final.winnerTeam).not.toBeNull();
      expect(final.scores[final.winnerTeam!]).toBeGreaterThanOrEqual(TARGET);
      expect(final.scores[1 - final.winnerTeam!]).toBeLessThan(TARGET);
      expect(results.length).toBeLessThan(40);
      for (const r of results) {
        expect(r.deltas[0] + r.deltas[1]).toBeGreaterThan(0);
        if (r.euchred) euchred++;
        else made++;
        if (r.alone) lones++;
      }
    }
    // Bots that call sanely make their bids far more often than they're set,
    // and the occasional loner shows up. Loose bounds — this guards against
    // broken thresholds, not exact strategy.
    const madeRate = made / (made + euchred);
    expect(madeRate).toBeGreaterThan(0.5);
    expect(madeRate).toBeLessThan(0.98);
    expect(lones).toBeGreaterThan(0);
  });
});
