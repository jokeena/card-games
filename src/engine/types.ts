export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '10' | 'K' | 'Q' | 'J' | '9';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', '10', 'K', 'Q', 'J', '9'];

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

/** Higher wins a trick. First-played wins ties. */
export const RANK_POWER: Record<Rank, number> = {
  A: 5, '10': 4, K: 3, Q: 2, J: 1, '9': 0,
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣',
};

export const SUIT_NAME: Record<Suit, string> = {
  S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs',
};

export const isRed = (s: Suit) => s === 'H' || s === 'D';

/** A/10/K captured in tricks are worth 1 point each. */
export const isCounter = (c: Card) => c.rank === 'A' || c.rank === '10' || c.rank === 'K';

export interface Played {
  seat: number;
  card: Card;
}
