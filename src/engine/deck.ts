import { Card, RANKS, SUITS } from './types';

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (let copy = 0; copy < 2; copy++) {
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

export function dealHands(
  players: number,
  handSize: number,
  kittySize: number,
  rng: () => number = Math.random,
): { hands: Card[][]; kitty: Card[] } {
  const deck = shuffle(makeDeck(), rng);
  const hands: Card[][] = [];
  for (let p = 0; p < players; p++) {
    hands.push(deck.slice(p * handSize, (p + 1) * handSize));
  }
  const kitty = deck.slice(players * handSize, players * handSize + kittySize);
  return { hands, kitty };
}
