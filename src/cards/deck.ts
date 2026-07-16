import { Card, RANKS, SUITS } from './types';

/** All suit/rank combinations, `copies` of each: 1 → 24-card euchre deck, 2 → 48-card pinochle deck. */
export function buildDeck(copies: number): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let copy = 0; copy < copies; copy++) {
        deck.push({ id: `${suit}${rank}#${copy}`, suit, rank });
      }
    }
  }
  return deck;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal a shuffled deck into `players` hands of `handSize`, plus a kitty of `kittySize`. */
export function deal(
  deck: Card[],
  players: number,
  handSize: number,
  kittySize: number,
): { hands: Card[][]; kitty: Card[] } {
  const hands: Card[][] = [];
  for (let p = 0; p < players; p++) {
    hands.push(deck.slice(p * handSize, (p + 1) * handSize));
  }
  const kitty = deck.slice(players * handSize, players * handSize + kittySize);
  return { hands, kitty };
}
