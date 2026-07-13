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
 * True when `seat`, on lead, is guaranteed every remaining trick no matter
 * what order they play their cards. Under strict must-beat/must-trump the
 * leader can only lose a trick to a higher card of the led suit or, on a
 * non-trump lead, to an opponent who is void and still holds trump. So for
 * every other seat P and every suit S in the leader's hand:
 *  - no P card in S outranks the leader's LOWEST S card (ties lose to the
 *    leader, who plays first), and
 *  - if S isn't trump: P has no trump, or P holds at least as many S cards
 *    as the leader. Others only ever follow the leader's suit while they
 *    hold trump (sloughing requires void + no trump), so their S count
 *    drains in lockstep with the leader's and they can never be void in S
 *    while still holding a trump to ruff with.
 */
export function winsRemainingTricks(hands: Card[][], seat: number, trump: Suit): boolean {
  const mine = hands[seat];
  if (mine.length === 0) return false;
  const mySuits = [...new Set(mine.map((c) => c.suit))];

  for (let p = 0; p < hands.length; p++) {
    if (p === seat) continue;
    const theirs = hands[p];
    const theirTrumps = theirs.some((c) => c.suit === trump);
    for (const s of mySuits) {
      const myCards = mine.filter((c) => c.suit === s);
      const myLow = Math.min(...myCards.map((c) => RANK_POWER[c.rank]));
      if (theirs.some((c) => c.suit === s && RANK_POWER[c.rank] > myLow)) return false;
      if (s !== trump && theirTrumps &&
          theirs.filter((c) => c.suit === s).length < myCards.length) return false;
    }
  }
  return true;
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
