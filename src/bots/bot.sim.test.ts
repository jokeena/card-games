import { describe, expect, it } from 'vitest';
import { botAction, Difficulty } from './bot';
import { GameState, gameReducer, newGame } from '../engine/game';
import { MODES, partnerOf } from '../engine/modes';

function actorFor(state: GameState): number | null {
  switch (state.phase) {
    case 'bidding':
    case 'play':
      return state.turn;
    case 'trump':
    case 'discard':
    case 'pass2':
      return state.bidWinner;
    case 'pass1':
      return partnerOf(state.mode, state.bidWinner);
    default:
      return null;
  }
}

interface SimResult {
  state: GameState;
  handsPlayed: number;
  setsSeen: number;
}

/** Bots play every seat until the game ends. Throws if the reducer ever stalls. */
function playGame(modeId: string, difficulty: Difficulty): SimResult {
  const mode = MODES.find((m) => m.id === modeId)!;
  let state = newGame(mode);
  let handsPlayed = 0;
  let setsSeen = 0;

  for (let steps = 0; steps < 60000; steps++) {
    if (state.phase === 'gameOver') return { state, handsPlayed, setsSeen };

    if (state.phase === 'meld' || state.phase === 'trickEnd' ||
        state.phase === 'handReview' || state.phase === 'handEnd') {
      if (state.phase === 'handEnd') {
        handsPlayed++;
        if (!state.handResult!.made) setsSeen++;
      }
      const next = gameReducer(state, { type: 'CONTINUE' });
      if (next === state) throw new Error(`CONTINUE stalled in ${state.phase}`);
      state = next;
      continue;
    }

    const actor = actorFor(state);
    if (actor === null) throw new Error(`no actor in phase ${state.phase}`);
    const action = botAction(state, actor, difficulty);
    if (!action) throw new Error(`bot returned no action in ${state.phase}`);
    const next = gameReducer(state, action);
    if (next === state) {
      throw new Error(`illegal bot action ${action.type} in ${state.phase} by seat ${actor}`);
    }
    state = next;
  }
  throw new Error(`game did not finish (${modeId}, ${difficulty})`);
}

describe('bot simulation — full games complete legally in every mode', () => {
  for (const mode of MODES) {
    for (const difficulty of ['medium', 'hard'] as Difficulty[]) {
      it(`${mode.id} / ${difficulty}`, () => {
        let hands = 0;
        let sets = 0;
        const games = 12;
        for (let g = 0; g < games; g++) {
          const r = playGame(mode.id, difficulty);
          expect(r.state.phase).toBe('gameOver');
          expect(r.state.winnerTeam).not.toBeNull();
          hands += r.handsPlayed;
          sets += r.setsSeen;
        }
        // Sanity: bids are neither always made nor always set.
        expect(hands).toBeGreaterThan(0);
        expect(sets).toBeLessThan(hands);
      });
    }
  }
});
