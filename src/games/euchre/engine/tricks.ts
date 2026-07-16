import { Card, Played, Suit, effectiveSuit, trickPower } from './types';

/**
 * Index into the trick of the card currently winning. The 24-card deck has
 * no duplicates, so ties are impossible. `trump` null = the No Trump call:
 * nothing ruffs, highest of the led suit wins.
 */
export function winningIndex(trick: Played[], trump: Suit | null): number {
  let wi = 0;
  for (let i = 1; i < trick.length; i++) {
    const w = trick[wi].card;
    const c = trick[i].card;
    if (effectiveSuit(c, trump) === effectiveSuit(w, trump)) {
      if (trickPower(c, trump) > trickPower(w, trump)) wi = i;
    } else if (effectiveSuit(c, trump) === trump) {
      wi = i;
    }
  }
  return wi;
}

/**
 * Euchre's loose table rules (unlike pinochle's strict must-beat/must-trump):
 * follow the led suit if able — the left bower is trump, not its printed
 * suit — and if void, anything goes.
 */
export function legalPlays(hand: Card[], trick: Played[], trump: Suit | null): Card[] {
  if (trick.length === 0) return [...hand];
  const led = effectiveSuit(trick[0].card, trump);
  const follow = hand.filter((c) => effectiveSuit(c, trump) === led);
  return follow.length > 0 ? follow : [...hand];
}
