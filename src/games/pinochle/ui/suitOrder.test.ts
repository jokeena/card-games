import { describe, expect, it } from 'vitest';
import { suitOrder } from './GameTable';
import { Card, Rank, Suit, isRed } from '../engine/types';

let uid = 0;
const c = (suit: Suit, rank: Rank): Card => ({ id: `${suit}${rank}#t${uid++}`, suit, rank });

const noColorTouch = (order: Suit[], present: Set<Suit>) => {
  const vis = order.filter((s) => present.has(s));
  for (let i = 1; i < vis.length; i++) {
    if (isRed(vis[i]) === isRed(vis[i - 1])) return false;
  }
  return true;
};

// John's rule: dividing the colors outranks trump-first.
describe('hand suit order', () => {
  it('spades trump with S/H/D held: reds never touch, even if trump leaves the left edge', () => {
    const basis = [c('S', 'A'), c('H', 'K'), c('D', 'Q')];
    const order = suitOrder('S', basis);
    expect(noColorTouch(order, new Set(['S', 'H', 'D']))).toBe(true);
    // The only alternating arrangements put spades in the middle.
    expect(order[1]).toBe('S');
  });

  it('all four suits: perfectly alternating AND trump first', () => {
    const basis = [c('S', '9'), c('H', '9'), c('D', '9'), c('C', '9')];
    for (const trump of ['S', 'H', 'D', 'C'] as Suit[]) {
      const order = suitOrder(trump, basis);
      expect(order[0]).toBe(trump);
      expect(noColorTouch(order, new Set(['S', 'H', 'D', 'C']))).toBe(true);
    }
  });

  it('two suits of the same color: order is stable and deterministic', () => {
    const basis = [c('H', '9'), c('D', '9')];
    expect(suitOrder('H', basis)).toEqual(suitOrder('H', basis));
  });
});
