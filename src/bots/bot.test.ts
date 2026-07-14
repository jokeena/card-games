import { describe, expect, it } from 'vitest';
import { botAction, pickPassToWinner } from './bot';
import { GameState, newGame } from '../engine/game';
import { MODES } from '../engine/modes';
import { Card, Rank, Suit } from '../engine/types';

let uid = 0;
const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}#t${uid++}`, suit, rank });
const key = (hand: Card[], ids: string[]) =>
  ids.map((id) => { const x = hand.find((h) => h.id === id)!; return `${x.suit}${x.rank}`; }).sort();

// These pin the table's passing conventions (John's rules) — don't "optimize".
describe('partner pass to bid winner', () => {
  it('unique non-9 trump first, then the off-suit ace — not the duplicate trump queen', () => {
    // A 10 Q Q 9 of trump plus an off-suit ace: send A, 10, Q of trump and the ace.
    const hand = [
      c('H', 'A'), c('H', '10'), c('H', 'Q'), c('H', 'Q'), c('H', '9'),
      c('S', 'A'), c('C', 'K'), c('D', 'J'),
    ];
    expect(key(hand, pickPassToWinner(hand, 'H', 4)))
      .toEqual(['H10', 'HA', 'HQ', 'SA'].sort());
  });

  it('a non-trump ace outranks a 9 of trump', () => {
    const hand = [
      c('H', 'K'), c('H', '9'), c('H', '9'),
      c('S', 'A'), c('C', 'A'), c('D', 'Q'), c('C', '9'), c('S', 'J'),
    ];
    const sent = key(hand, pickPassToWinner(hand, 'H', 4));
    expect(sent).toContain('SA');
    expect(sent).toContain('CA');
    // Unique trump K goes, but the second slot goes to aces before trump 9s.
    expect(sent).toContain('HK');
    expect(sent.filter((s) => s === 'H9').length).toBeLessThan(2);
  });

  it('one ace of each suit before a second of the same suit', () => {
    const hand = [
      c('S', 'A'), c('S', 'A'), c('C', 'A'), c('D', 'A'),
      c('C', 'Q'), c('D', '9'), c('S', 'K'), c('C', 'J'),
    ];
    // Trump hearts, none held: three unique aces plus one duplicate.
    expect(key(hand, pickPassToWinner(hand, 'H', 4)))
      .toEqual(['CA', 'DA', 'SA', 'SA'].sort());
  });

  it('never follows an ace with its own ace while holding the 10', () => {
    // Regression: holding A-10 of the led suit behind an opponent's ace, the
    // bot must throw the 10 (ties lose, so the kept ace is boss later).
    const mode = MODES.find((m) => m.id === 'p4np')!;
    const base = newGame(mode);
    const oppAce = c('S', 'A');
    for (const [trump, led] of [['H', 'H'], ['H', 'S']] as [Suit, Suit][]) {
      const myAce = c(led, 'A');
      const myTen = c(led, '10');
      const state: GameState = {
        ...base,
        phase: 'play',
        trump,
        bidWinner: 1,
        highBid: 25,
        turn: 2,
        trick: [{ seat: 1, card: { ...oppAce, suit: led } }],
        hands: [
          [c('C', '9')],
          [c('C', 'J')],
          [myAce, myTen, c('C', 'Q'), c('D', '9')],
          [c('D', 'J')],
        ],
      };
      for (const difficulty of ['medium', 'hard'] as const) {
        const action = botAction(state, 2, difficulty);
        expect(action).toEqual({ type: 'PLAY', seat: 2, cardId: myTen.id });
      }
    }
  });

  it('sends the off-trump pinochle leg when trump is spades', () => {
    const hand = [
      c('S', 'A'), c('S', 'K'),
      c('D', 'J'), c('D', '9'), c('C', 'Q'), c('H', 'K'), c('H', '9'), c('C', '9'),
    ];
    const sent = key(hand, pickPassToWinner(hand, 'S', 4));
    expect(sent).toContain('SA');
    expect(sent).toContain('SK');
    expect(sent).toContain('DJ'); // pinochle leg toward the winner's Q♠
  });
});
