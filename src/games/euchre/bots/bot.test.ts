import { describe, expect, it } from 'vitest';
import { GameState, PLAYERS } from '../engine/game';
import { Card, Rank, Suit } from '../engine/types';
import { botAction, pickDiscard } from './bot';

const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}#0`, suit, rank });

function st(over: Partial<GameState>): GameState {
  return {
    phase: 'play',
    scores: [0, 0],
    dealer: 3,
    handNumber: 1,
    drawCards: [],
    hands: [[], [], [], []],
    kitty: [],
    turnCard: null,
    turnedDown: null,
    discard: null,
    upcard: null,
    pickedUp: false,
    played: [],
    turn: 0,
    trump: 'S',
    maker: 0,
    alone: false,
    inactive: null,
    voids: Array.from({ length: PLAYERS }, () => Array(4).fill(false)),
    trick: [],
    trickWinner: -1,
    tricksPlayed: 0,
    tricksTaken: [0, 0],
    handResult: null,
    winnerTeam: null,
    log: [],
    ...over,
  };
}

describe('ordering decisions', () => {
  const order1 = (hand: Card[], seat: number, dealer: number, turnCard: Card) =>
    st({
      phase: 'order1', turn: seat, dealer, turnCard, upcard: turnCard,
      trump: null, maker: -1,
      hands: [[], [], [], []].map((h, i) => (i === seat ? hand : h)),
    });

  it('orders up alone on a monster', () => {
    const hand = [c('S', 'J'), c('C', 'J'), c('S', 'A'), c('S', 'K'), c('H', 'A')];
    const a = botAction(order1(hand, 1, 3, c('S', '9')), 1);
    expect(a).toEqual({ type: 'ORDER_UP', seat: 1, alone: true });
  });

  it('orders up (not alone) on a solid hand', () => {
    const hand = [c('S', 'J'), c('S', 'A'), c('S', 'Q'), c('H', '9'), c('H', '10')];
    const a = botAction(order1(hand, 1, 3, c('S', '9')), 1);
    expect(a).toEqual({ type: 'ORDER_UP', seat: 1, alone: false });
  });

  it('passes junk', () => {
    const hand = [c('H', '9'), c('D', '10'), c('C', 'Q'), c('S', '9'), c('H', '10')];
    const a = botAction(order1(hand, 1, 3, c('S', 'A')), 1);
    expect(a).toEqual({ type: 'PASS', seat: 1 });
  });

  it('round 2: passes junk unless stuck as dealer, who names their least-bad suit', () => {
    const junk = [c('H', '9'), c('D', '10'), c('C', 'Q'), c('S', '9'), c('H', '10')];
    const base = {
      phase: 'order2' as const, turnedDown: 'S' as Suit, trump: null, maker: -1,
      hands: [[], [], [], []].map((h, i) => (i === 3 ? junk : h)),
    };
    expect(botAction(st({ ...base, turn: 3, dealer: 0 }), 3)).toEqual({ type: 'PASS', seat: 3 });
    const stuck = botAction(st({ ...base, turn: 3, dealer: 3 }), 3);
    expect(stuck?.type).toBe('NAME_TRUMP');
    if (stuck?.type === 'NAME_TRUMP') {
      expect(stuck.suit).not.toBe('S');
      expect(stuck.alone).toBe(false);
    }
  });
});

describe('pickDiscard', () => {
  it('sheds a lone low off-suit card to make a void, never an ace', () => {
    const six = [c('S', 'J'), c('S', 'A'), c('S', 'K'), c('S', 'Q'), c('D', '9'), c('H', 'A')];
    expect(pickDiscard(six, 'S').id).toBe(c('D', '9').id);
  });

  it('with only paired off-suits, sheds the lowest non-ace', () => {
    const six = [c('S', 'A'), c('S', 'K'), c('S', 'Q'), c('S', '10'), c('H', 'A'), c('H', 'K')];
    expect(pickDiscard(six, 'S').id).toBe(c('H', 'K').id);
  });

  it('all trump: sheds the weakest trump', () => {
    const six = [c('S', 'J'), c('C', 'J'), c('S', 'A'), c('S', 'K'), c('S', 'Q'), c('S', '10')];
    expect(pickDiscard(six, 'S').id).toBe(c('S', '10').id);
  });
});

describe('card play', () => {
  it('as maker, pulls trump by leading the boss', () => {
    const s = st({
      hands: [[c('S', 'J'), c('H', '9')], [], [], []],
      maker: 0, turn: 0,
    });
    expect(botAction(s, 0)).toEqual({ type: 'PLAY', seat: 0, cardId: c('S', 'J').id });
  });

  it('sloughs the cheapest card when partner has the trick locked', () => {
    const s = st({
      hands: [[c('H', 'A'), c('H', '9')], [], [], []],
      turn: 0, maker: 2,
      trick: [{ seat: 2, card: c('S', 'J') }],
    });
    expect(botAction(s, 0)).toEqual({ type: 'PLAY', seat: 0, cardId: c('H', '9').id });
  });

  it('trumps in cheaply when the opponents are winning', () => {
    const s = st({
      hands: [[c('S', '9'), c('D', '9')], [], [], []],
      turn: 0, maker: 3,
      trick: [{ seat: 3, card: c('H', 'A') }],
    });
    expect(botAction(s, 0)).toEqual({ type: 'PLAY', seat: 0, cardId: c('S', '9').id });
  });

  it('must-follow with one legal card just plays it', () => {
    const s = st({
      hands: [[c('C', 'J'), c('H', 'A'), c('H', 'K')], [], [], []],
      turn: 0, maker: 3,
      trick: [{ seat: 3, card: c('S', '9') }],
    });
    // Spades led: the left bower is the only effective spade.
    expect(botAction(s, 0)).toEqual({ type: 'PLAY', seat: 0, cardId: c('C', 'J').id });
  });

  it('a sitting-out seat never acts', () => {
    const s = st({ inactive: 0, turn: 0, hands: [[c('H', 'A')], [], [], []] });
    expect(botAction(s, 0)).toBeNull();
  });
});
