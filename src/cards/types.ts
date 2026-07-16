export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '10' | 'K' | 'Q' | 'J' | '9';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', '10', 'K', 'Q', 'J', '9'];

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠', H: '♥', D: '♦', C: '♣',
};

export const SUIT_NAME: Record<Suit, string> = {
  S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs',
};

export const isRed = (s: Suit) => s === 'H' || s === 'D';

export interface Played {
  seat: number;
  card: Card;
}
