import { Card, Rank, Suit } from '../../../cards/types';

export * from '../../../cards/types';

/** The other suit of the same color — where the left bower lives. */
export const SAME_COLOR: Record<Suit, Suit> = { S: 'C', C: 'S', H: 'D', D: 'H' };

export const isRightBower = (c: Card, trump: Suit) => c.rank === 'J' && c.suit === trump;
export const isLeftBower = (c: Card, trump: Suit) => c.rank === 'J' && c.suit === SAME_COLOR[trump];

/**
 * The suit a card plays as: the left bower counts as trump — for following
 * suit, for voids, for everything. Every other card is its printed suit.
 */
export const effectiveSuit = (c: Card, trump: Suit): Suit =>
  isLeftBower(c, trump) ? trump : c.suit;

/** Natural (no-trump) rank order within a suit. */
export const RANK_POWER: Record<Rank, number> = {
  A: 6, K: 5, Q: 4, J: 3, '10': 2, '9': 1,
};

/**
 * Trick strength given trump: right bower > left bower > A-K-Q-10-9 of trump,
 * all above every plain-suit card (A-K-Q-J-10-9). Only comparable between
 * cards that can contest the same trick — winningIndex handles the led suit.
 */
export function trickPower(c: Card, trump: Suit): number {
  if (isRightBower(c, trump)) return 20;
  if (isLeftBower(c, trump)) return 19;
  return c.suit === trump ? 12 + RANK_POWER[c.rank] : RANK_POWER[c.rank];
}

export const isBlackJack = (c: Card) => c.rank === 'J' && (c.suit === 'S' || c.suit === 'C');
