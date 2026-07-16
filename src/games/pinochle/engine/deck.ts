import { buildDeck, deal, shuffle } from '../../../cards/deck';
import { Card } from './types';

/** Pinochle deck: two copies of each 9–A card, 48 total. */
export const makeDeck = (): Card[] => buildDeck(2);

export function dealHands(
  players: number,
  handSize: number,
  kittySize: number,
  rng: () => number = Math.random,
): { hands: Card[][]; kitty: Card[] } {
  return deal(shuffle(makeDeck(), rng), players, handSize, kittySize);
}
