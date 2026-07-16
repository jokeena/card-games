import { describe, expect, it } from 'vitest';
import { GameState, PLAYERS, TEAM_OF, gameReducer, newGame } from './game';
import { legalPlays, winningIndex } from './tricks';
import { Card, Played, Rank, Suit, effectiveSuit, isBlackJack, trickPower } from './types';

const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}#0`, suit, rank });
const p = (seat: number, card: Card): Played => ({ seat, card });

/** Deterministic rng for seeded deals. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A game state mid-play with everything irrelevant zeroed out. */
function playState(over: Partial<GameState>): GameState {
  return {
    phase: 'play',
    scores: [0, 0],
    dealer: 3,
    handNumber: 1,
    drawCards: [],
    hands: [],
    kitty: [],
    turnCard: null,
    turnedDown: null,
    discard: null,
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

/** Play out the rest of the hand: each seat plays its first legal card. */
function playOut(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'play' || s.phase === 'trickEnd') {
    if (guard++ > 100) throw new Error('hand did not terminate');
    if (s.phase === 'trickEnd') {
      s = gameReducer(s, { type: 'CONTINUE' });
      continue;
    }
    const legal = legalPlays(s.hands[s.turn], s.trick, s.trump!);
    s = gameReducer(s, { type: 'PLAY', seat: s.turn, cardId: legal[0].id });
  }
  return s;
}

describe('bowers', () => {
  it('left bower counts as trump suit, right stays trump', () => {
    expect(effectiveSuit(c('C', 'J'), 'S')).toBe('S');
    expect(effectiveSuit(c('S', 'J'), 'S')).toBe('S');
    expect(effectiveSuit(c('D', 'J'), 'H')).toBe('H');
    expect(effectiveSuit(c('H', 'J'), 'S')).toBe('H'); // wrong color: plain jack
  });

  it('trump ranking: right > left > A > K > Q > 10 > 9, all above plain suits', () => {
    const order = [c('S', 'J'), c('C', 'J'), c('S', 'A'), c('S', 'K'), c('S', 'Q'), c('S', '10'), c('S', '9')];
    for (let i = 1; i < order.length; i++) {
      expect(trickPower(order[i - 1], 'S')).toBeGreaterThan(trickPower(order[i], 'S'));
    }
    expect(trickPower(c('S', '9'), 'S')).toBeGreaterThan(trickPower(c('H', 'A'), 'S'));
  });

  it('black jack detection for the dealer draw', () => {
    expect(isBlackJack(c('S', 'J'))).toBe(true);
    expect(isBlackJack(c('C', 'J'))).toBe(true);
    expect(isBlackJack(c('H', 'J'))).toBe(false);
    expect(isBlackJack(c('S', 'A'))).toBe(false);
  });
});

describe('winningIndex', () => {
  it('right bower beats left bower beats trump ace', () => {
    expect(winningIndex([p(0, c('S', 'A')), p(1, c('C', 'J')), p(2, c('S', 'J')), p(3, c('S', '9'))], 'S')).toBe(2);
    expect(winningIndex([p(0, c('S', 'A')), p(1, c('C', 'J'))], 'S')).toBe(1);
  });

  it('any trump beats the led suit; highest of led wins otherwise', () => {
    expect(winningIndex([p(0, c('H', 'A')), p(1, c('S', '9')), p(2, c('H', 'K'))], 'S')).toBe(1);
    expect(winningIndex([p(0, c('H', '10')), p(1, c('H', 'A')), p(2, c('D', 'A'))], 'S')).toBe(1);
  });

  it('the left bower led counts as a trump lead', () => {
    // J♣ led with spades trump: following spade beats it only if higher trump.
    expect(winningIndex([p(0, c('C', 'J')), p(1, c('S', 'A'))], 'S')).toBe(0);
    expect(winningIndex([p(0, c('C', 'J')), p(1, c('S', 'J'))], 'S')).toBe(1);
  });
});

describe('legalPlays', () => {
  it('must follow the led suit, and the left bower is trump — not its printed suit', () => {
    const hand = [c('C', 'J'), c('H', 'A'), c('C', '9')];
    // Spades led, spades trump: the left bower is the only "spade" held.
    const legal = legalPlays(hand, [p(3, c('S', 'A'))], 'S');
    expect(legal.map((x) => x.id)).toEqual([c('C', 'J').id]);
    // Clubs led: the left bower is NOT a club — only the 9♣ follows.
    const clubs = legalPlays(hand, [p(3, c('C', 'A'))], 'S');
    expect(clubs.map((x) => x.id)).toEqual([c('C', '9').id]);
  });

  it('void in the led suit: anything goes — no must-trump, no must-beat', () => {
    const hand = [c('S', '9'), c('H', '9')];
    const legal = legalPlays(hand, [p(3, c('D', 'A'))], 'S');
    expect(legal).toHaveLength(2); // may slough the heart instead of trumping
  });

  it('leading: whole hand is legal', () => {
    const hand = [c('S', '9'), c('H', '9')];
    expect(legalPlays(hand, [], 'S')).toHaveLength(2);
  });
});

describe('dealer draw', () => {
  it('deals around until the first black jack; that seat deals', () => {
    for (const seed of [1, 2, 42, 1234]) {
      const g = newGame(lcg(seed));
      expect(g.phase).toBe('dealerDraw');
      const last = g.drawCards[g.drawCards.length - 1];
      expect(isBlackJack(last.card)).toBe(true);
      expect(g.drawCards.slice(0, -1).some((d) => isBlackJack(d.card))).toBe(false);
      expect(g.dealer).toBe(last.seat);
      expect(last.seat).toBe((g.drawCards.length - 1) % PLAYERS);
    }
  });

  it('continue deals a full hand: 4×5 cards, 3-card kitty, turn card, all 24 distinct', () => {
    const g = gameReducer(newGame(lcg(7)), { type: 'CONTINUE' });
    expect(g.phase).toBe('order1');
    expect(g.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(g.kitty).toHaveLength(3);
    expect(g.turnCard).not.toBeNull();
    const ids = new Set([...g.hands.flat(), ...g.kitty, g.turnCard!].map((x) => x.id));
    expect(ids.size).toBe(24);
    expect(g.turn).toBe((g.dealer + 1) % PLAYERS);
  });
});

describe('ordering up', () => {
  function freshOrder1(seed = 7): GameState {
    return gameReducer(newGame(lcg(seed)), { type: 'CONTINUE' });
  }

  it('order up: trump is the turn card suit, dealer picks up and must discard', () => {
    const g = freshOrder1();
    const turnSuit = g.turnCard!.suit;
    const s = gameReducer(g, { type: 'ORDER_UP', seat: g.turn, alone: false });
    expect(s.trump).toBe(turnSuit);
    expect(s.phase).toBe('discard');
    expect(s.turn).toBe(s.dealer);
    expect(s.hands[s.dealer]).toHaveLength(6);
    expect(s.turnCard).toBeNull();

    const buried = s.hands[s.dealer][0];
    const after = gameReducer(s, { type: 'DISCARD', seat: s.dealer, cardId: buried.id });
    expect(after.phase).toBe('play');
    expect(after.discard!.id).toBe(buried.id);
    expect(after.hands[s.dealer]).toHaveLength(5);
    expect(after.turn).toBe((after.dealer + 1) % PLAYERS);
  });

  it('all four pass: turn card flips down and round 2 opens left of dealer', () => {
    let g = freshOrder1();
    const turnSuit = g.turnCard!.suit;
    for (let i = 0; i < 4; i++) g = gameReducer(g, { type: 'PASS', seat: g.turn });
    expect(g.phase).toBe('order2');
    expect(g.turnedDown).toBe(turnSuit);
    expect(g.turnCard).toBeNull();
    expect(g.kitty).toHaveLength(4);
    expect(g.turn).toBe((g.dealer + 1) % PLAYERS);
  });

  it('round 2: cannot name the turned-down suit; naming another starts play', () => {
    let g = freshOrder1();
    for (let i = 0; i < 4; i++) g = gameReducer(g, { type: 'PASS', seat: g.turn });
    const bad = gameReducer(g, { type: 'NAME_TRUMP', seat: g.turn, suit: g.turnedDown!, alone: false });
    expect(bad).toBe(g);
    const other: Suit = g.turnedDown === 'S' ? 'H' : 'S';
    const s = gameReducer(g, { type: 'NAME_TRUMP', seat: g.turn, suit: other, alone: false });
    expect(s.phase).toBe('play');
    expect(s.trump).toBe(other);
    expect(s.maker).toBe(g.turn);
  });

  it('stick the dealer: the dealer cannot pass in round 2', () => {
    let g = freshOrder1();
    for (let i = 0; i < 4; i++) g = gameReducer(g, { type: 'PASS', seat: g.turn });
    for (let i = 0; i < 3; i++) g = gameReducer(g, { type: 'PASS', seat: g.turn });
    expect(g.turn).toBe(g.dealer);
    expect(gameReducer(g, { type: 'PASS', seat: g.dealer })).toBe(g);
  });

  it('dealer sits out when their partner orders up alone: no pickup, straight to play', () => {
    let g = freshOrder1();
    const partner = (g.dealer + 2) % PLAYERS;
    while (g.turn !== partner) g = gameReducer(g, { type: 'PASS', seat: g.turn });
    const s = gameReducer(g, { type: 'ORDER_UP', seat: partner, alone: true });
    expect(s.phase).toBe('play');
    expect(s.inactive).toBe(s.dealer);
    expect(s.hands[s.dealer]).toHaveLength(5);
    expect(s.kitty).toHaveLength(4);
  });

  it('actions from the wrong seat or phase change nothing', () => {
    const g = freshOrder1();
    expect(gameReducer(g, { type: 'ORDER_UP', seat: (g.turn + 1) % 4, alone: false })).toBe(g);
    expect(gameReducer(g, { type: 'NAME_TRUMP', seat: g.turn, suit: 'S', alone: false })).toBe(g);
    expect(gameReducer(g, { type: 'PLAY', seat: g.turn, cardId: g.hands[g.turn][0].id })).toBe(g);
  });
});

describe('play and scoring', () => {
  // Seat 0 holds the five unbeatable spades; everyone else can never win a trick.
  const dominantHands = () => [
    [c('S', 'J'), c('C', 'J'), c('S', 'A'), c('S', 'K'), c('S', 'Q')],
    [c('H', 'A'), c('H', 'K'), c('H', 'Q'), c('H', '10'), c('H', '9')],
    [c('D', 'A'), c('D', 'K'), c('D', 'Q'), c('D', '10'), c('D', '9')],
    [c('C', 'A'), c('C', 'K'), c('C', 'Q'), c('C', '10'), c('C', '9')],
  ];

  it('march: makers take all five for 2 points', () => {
    const s = playOut(playState({ hands: dominantHands(), maker: 0, dealer: 3, turn: 0 }));
    expect(s.phase).toBe('handEnd');
    expect(s.handResult!.march).toBe(true);
    expect(s.handResult!.deltas).toEqual([2, 0]);
    expect(s.scores).toEqual([2, 0]);
  });

  it('lone march scores 4, partner sits out, tricks complete with 3 cards', () => {
    const hands = dominantHands();
    hands[2] = []; // loner's partner: hand set aside
    const s = playOut(playState({ hands, maker: 0, alone: true, inactive: 2, dealer: 3, turn: 0 }));
    expect(s.handResult!.deltas).toEqual([4, 0]);
    expect(s.tricksTaken).toEqual([5, 0]);
  });

  it('euchred: makers under 3 tricks give the defenders 2 points', () => {
    // Seat 1 named trump but seat 0 owns the hand.
    const s = playOut(playState({ hands: dominantHands(), maker: 1, dealer: 3, turn: 0 }));
    expect(s.handResult!.euchred).toBe(true);
    expect(s.handResult!.deltas).toEqual([2, 0]);
  });

  it('makers with 3 or 4 tricks score 1', () => {
    // Seat 0 wins the three top-trump tricks, then leads 9♥ and 9♦ which lose.
    const hands = [
      [c('S', 'J'), c('C', 'J'), c('S', 'A'), c('H', '9'), c('D', '9')],
      [c('H', 'A'), c('H', 'K'), c('H', 'Q'), c('H', '10'), c('C', '9')],
      [c('D', 'K'), c('D', 'Q'), c('D', '10'), c('C', 'K'), c('C', 'Q')],
      [c('D', 'A'), c('C', 'A'), c('C', '10'), c('H', 'J'), c('D', 'J')],
    ];
    const s = playOut(playState({ hands, maker: 0, dealer: 3, turn: 0 }));
    expect(s.handResult!.euchred).toBe(false);
    expect(s.handResult!.march).toBe(false);
    expect(s.handResult!.deltas).toEqual([1, 0]);
  });

  it('first team to 10 wins, and the reducer moves to gameOver', () => {
    const s = playOut(playState({ hands: dominantHands(), maker: 0, dealer: 3, turn: 0, scores: [8, 9] }));
    expect(s.scores).toEqual([10, 9]);
    expect(s.winnerTeam).toBe(0);
    expect(gameReducer(s, { type: 'CONTINUE' }).phase).toBe('gameOver');
  });

  it('a completed non-final hand rotates the deal clockwise', () => {
    const s = playOut(playState({ hands: dominantHands(), maker: 0, dealer: 3, turn: 0 }));
    const next = gameReducer(s, { type: 'CONTINUE' });
    expect(next.phase).toBe('order1');
    expect(next.dealer).toBe(0);
    expect(next.handNumber).toBe(2);
  });

  it('following the effective suit is enforced by the reducer', () => {
    // Spades led; seat 1 holds the left bower and must play it.
    const hands = [
      [c('S', 'A'), c('S', 'K'), c('S', 'Q'), c('S', '10'), c('S', '9')],
      [c('C', 'J'), c('H', 'K'), c('H', 'Q'), c('H', '10'), c('H', '9')],
      [c('D', 'A'), c('D', 'K'), c('D', 'Q'), c('D', '10'), c('D', '9')],
      [c('C', 'A'), c('C', 'K'), c('C', 'Q'), c('C', '10'), c('C', '9')],
    ];
    let s = playState({ hands, maker: 0, dealer: 3, turn: 0 });
    s = gameReducer(s, { type: 'PLAY', seat: 0, cardId: c('S', 'A').id });
    const illegal = gameReducer(s, { type: 'PLAY', seat: 1, cardId: c('H', 'K').id });
    expect(illegal).toBe(s);
    const legal = gameReducer(s, { type: 'PLAY', seat: 1, cardId: c('C', 'J').id });
    expect(legal.trick).toHaveLength(2);
  });

  it('sloughing off-suit marks a public void in the led suit', () => {
    const hands = dominantHands();
    let s = playState({ hands, maker: 0, dealer: 3, turn: 0 });
    s = gameReducer(s, { type: 'PLAY', seat: 0, cardId: c('S', 'J').id });
    s = gameReducer(s, { type: 'PLAY', seat: 1, cardId: c('H', '9').id });
    expect(s.voids[1][0]).toBe(true); // SUITS[0] === 'S'
    expect(TEAM_OF[1]).toBe(1);
  });
});
