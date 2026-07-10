import { describe, expect, it } from 'vitest';
import { computeMeld } from './meld';
import { legalPlays, winningIndex } from './tricks';
import { Card, Rank, Suit } from './types';

let uid = 0;
const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}#t${uid++}`, suit, rank });

describe('meld — house rules', () => {
  it('plain run = 15', () => {
    const hand = [c('S', 'A'), c('S', '10'), c('S', 'K'), c('S', 'Q'), c('S', 'J')];
    expect(computeMeld(hand, 'S').total).toBe(15);
  });

  it('run + extra trump K = 17 (house rule)', () => {
    const hand = [c('S', 'A'), c('S', '10'), c('S', 'K'), c('S', 'K'), c('S', 'Q'), c('S', 'J')];
    expect(computeMeld(hand, 'S').total).toBe(17);
  });

  it('run + extra trump Q = 17 (house rule)', () => {
    const hand = [c('S', 'A'), c('S', '10'), c('S', 'K'), c('S', 'Q'), c('S', 'Q'), c('S', 'J')];
    expect(computeMeld(hand, 'S').total).toBe(17);
  });

  it('run + extra K and Q = 19 (house rule)', () => {
    const hand = [c('S', 'A'), c('S', '10'), c('S', 'K'), c('S', 'K'), c('S', 'Q'), c('S', 'Q'), c('S', 'J')];
    expect(computeMeld(hand, 'S').total).toBe(19);
  });

  it('double run = 150', () => {
    const hand = [
      c('S', 'A'), c('S', 'A'), c('S', '10'), c('S', '10'), c('S', 'K'),
      c('S', 'K'), c('S', 'Q'), c('S', 'Q'), c('S', 'J'), c('S', 'J'),
    ];
    expect(computeMeld(hand, 'S').total).toBe(150);
  });

  it('trump marriage without run = 4, off-suit marriage = 2', () => {
    const hand = [c('S', 'K'), c('S', 'Q'), c('H', 'K'), c('H', 'Q')];
    expect(computeMeld(hand, 'S').total).toBe(6);
  });

  it('aces around = 10, double aces = 100 (10x rule)', () => {
    const singles = [c('S', 'A'), c('H', 'A'), c('D', 'A'), c('C', 'A')];
    expect(computeMeld(singles, 'S').total).toBe(10);
    const doubles = [...singles, c('S', 'A'), c('H', 'A'), c('D', 'A'), c('C', 'A')];
    expect(computeMeld(doubles, 'S').total).toBe(100);
  });

  it('pinochle = 4, double pinochle = 30, plus spade marriage interaction', () => {
    expect(computeMeld([c('D', 'J'), c('S', 'Q')], 'H').total).toBe(4);
    expect(computeMeld([c('D', 'J'), c('D', 'J'), c('S', 'Q'), c('S', 'Q')], 'H').total).toBe(30);
    // Pinochle + spade marriage share the Q of spades.
    expect(computeMeld([c('D', 'J'), c('S', 'Q'), c('S', 'K')], 'H').total).toBe(6);
  });

  it('9 of trump = 1 each; off-trump 9s are nothing', () => {
    expect(computeMeld([c('S', '9'), c('S', '9')], 'S').total).toBe(2);
    expect(computeMeld([c('H', '9'), c('H', '9')], 'S').total).toBe(0);
  });
});

describe('trick legality — strict follow/beat/trump rules', () => {
  const trump: Suit = 'H';

  it('must beat the winning card of the led suit when able', () => {
    const trick = [{ seat: 1, card: c('S', 'K') }];
    const hand = [c('S', 'A'), c('S', '9'), c('H', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal.map((x) => x.rank)).toEqual(['A']);
    expect(legal[0].suit).toBe('S');
  });

  it('may play any card of the led suit if unable to beat', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }];
    const hand = [c('S', 'K'), c('S', '9'), c('H', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal).toHaveLength(2);
    expect(legal.every((x) => x.suit === 'S')).toBe(true);
  });

  it('void in led suit: must trump', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }];
    const hand = [c('D', 'A'), c('H', '9'), c('C', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal).toHaveLength(1);
    expect(legal[0].suit).toBe('H');
  });

  it('must overtrump when the trick is already trumped', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }, { seat: 2, card: c('H', 'Q') }];
    const hand = [c('H', 'K'), c('H', '9'), c('D', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal).toHaveLength(1);
    expect(legal[0].rank).toBe('K');
  });

  it('undertrump allowed only when unable to overtrump', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }, { seat: 2, card: c('H', 'K') }];
    const hand = [c('H', 'Q'), c('H', '9'), c('D', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal).toHaveLength(2);
    expect(legal.every((x) => x.suit === 'H')).toBe(true);
  });

  it('following suit when trick was trumped: any card of led suit', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }, { seat: 2, card: c('H', '9') }];
    const hand = [c('S', 'K'), c('S', '9'), c('H', 'A')];
    const legal = legalPlays(hand, trick, trump);
    expect(legal).toHaveLength(2);
    expect(legal.every((x) => x.suit === 'S')).toBe(true);
  });

  it('no led suit, no trump: anything goes', () => {
    const trick = [{ seat: 1, card: c('S', 'A') }];
    const hand = [c('D', 'A'), c('C', '9')];
    expect(legalPlays(hand, trick, trump)).toHaveLength(2);
  });

  it('first-played wins ties; trump beats led suit', () => {
    const a = c('S', 'A');
    const trick = [{ seat: 0, card: a }, { seat: 1, card: c('S', 'A') }];
    expect(winningIndex(trick, trump)).toBe(0);
    const trumped = [...trick, { seat: 2, card: c('H', '9') }];
    expect(winningIndex(trumped, trump)).toBe(2);
  });
});
