import { Card, Played, RANK_POWER, Suit } from './types';

/** Index into the trick of the card currently winning. First-played wins ties. */
export function winningIndex(trick: Played[], trump: Suit): number {
  let wi = 0;
  for (let i = 1; i < trick.length; i++) {
    const w = trick[wi].card;
    const c = trick[i].card;
    if (c.suit === w.suit) {
      if (RANK_POWER[c.rank] > RANK_POWER[w.rank]) wi = i;
    } else if (c.suit === trump) {
      wi = i;
    }
  }
  return wi;
}

/**
 * Strict table rules, enforced so reneging is impossible:
 * - Must follow suit if able.
 * - Must beat the current winning card if able (including over a partner).
 * - Void in the led suit: must trump; must overtrump a trumped trick if able.
 * - Only with no cards of the led suit and no trump may anything be thrown.
 */
export function legalPlays(hand: Card[], trick: Played[], trump: Suit): Card[] {
  if (trick.length === 0) return [...hand];

  const led = trick[0].card.suit;
  const winning = trick[winningIndex(trick, trump)].card;
  const follow = hand.filter((c) => c.suit === led);

  if (follow.length > 0) {
    if (winning.suit === led) {
      const beating = follow.filter((c) => RANK_POWER[c.rank] > RANK_POWER[winning.rank]);
      return beating.length > 0 ? beating : follow;
    }
    // Trick was trumped off-suit; following suit can't win, any card of the suit is fine.
    return follow;
  }

  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length > 0) {
    if (winning.suit === trump) {
      const over = trumps.filter((c) => RANK_POWER[c.rank] > RANK_POWER[winning.rank]);
      return over.length > 0 ? over : trumps;
    }
    return trumps;
  }

  return [...hand];
}
