import { buildDeck } from '../../../cards/deck';
import { GameAction, GameState, TEAM_OF, activePlayers, partnerOf } from '../engine/game';
import { legalPlays, winningIndex } from '../engine/tricks';
import { Card, RANK_POWER, SUITS, Suit, effectiveSuit, isLeftBower, isRightBower, trickPower } from '../engine/types';

/**
 * Heuristic euchre bot. Like the pinochle bot it reads the shared GameState
 * but only uses what a player at the table would know: its own hand, the
 * upcard's fate, completed tricks (`played`), and observed voids.
 */

/** Worth of a card as trump in suit `s`, in "trump points" (right bower = 3). */
function trumpValue(c: Card, s: Suit): number {
  if (isRightBower(c, s)) return 3;
  if (isLeftBower(c, s)) return 2.5;
  if (c.suit !== s) return 0;
  return { A: 2, K: 1.5, Q: 1.25, '10': 1, '9': 1, J: 0 }[c.rank];
}

/**
 * Strength of `hand` if `s` were trump: trump points + off-suit aces + a
 * little for voids (ruffing power). ~5.5 is a sound call; ~8.5 plays alone.
 */
export function handScore(hand: Card[], s: Suit): number {
  let score = 0;
  for (const c of hand) {
    const tv = trumpValue(c, s);
    if (tv > 0) score += tv;
    else if (c.rank === 'A') score += 1;
  }
  for (const suit of SUITS) {
    if (suit === s) continue;
    if (!hand.some((c) => effectiveSuit(c, s) === suit)) score += 0.6;
  }
  return score;
}

const CALL = 5.5;
const ALONE = 8.5;

/**
 * Strength of `hand` played at No Trump: aces are unbeatable, kings nearly,
 * and nothing ruffs. Scaled to the same CALL/ALONE thresholds.
 */
export function ntScore(hand: Card[]): number {
  let score = 0;
  for (const c of hand) {
    if (c.rank === 'A') score += 2.2;
    else if (c.rank === 'K') score += 1.1;
    else if (c.rank === 'Q') score += 0.5;
  }
  return score;
}

export interface BotOptions {
  /** House rule: No Trump may be called in round 2. */
  noTrump?: boolean;
}

/** The dealer's best discard from 6 cards: shed a lone low off-suit card, else the lowest. */
export function pickDiscard(hand: Card[], trump: Suit): Card {
  const offSuit = hand.filter((c) => effectiveSuit(c, trump) !== trump);
  if (offSuit.length === 0) {
    return hand.reduce((lo, c) => (trickPower(c, trump) < trickPower(lo, trump) ? c : lo));
  }
  // Prefer creating a void: a suit holding exactly one non-ace card.
  const singletons = offSuit.filter((c) =>
    c.rank !== 'A' && offSuit.filter((o) => o.suit === c.suit).length === 1);
  const pool = singletons.length > 0 ? singletons : offSuit;
  return pool.reduce((lo, c) => {
    if ((c.rank === 'A') !== (lo.rank === 'A')) return c.rank === 'A' ? lo : c;
    return RANK_POWER[c.rank] < RANK_POWER[lo.rank] ? c : lo;
  });
}

/** Cards not in my hand, not seen on the table, and not known dead. */
function unseen(state: GameState, seat: number): Card[] {
  const gone = new Set([
    ...state.hands[seat].map((c) => c.id),
    ...state.played.map((c) => c.id),
    ...state.trick.map((t) => t.card.id),
  ]);
  // A turned-down upcard is buried in the kitty; a picked-up one is live.
  if (state.upcard && !state.pickedUp) gone.add(state.upcard.id);
  return buildDeck(1).filter((c) => !gone.has(c.id));
}

/** True when no card still unaccounted for beats `card` in its own lane. */
function isBoss(state: GameState, seat: number, card: Card): boolean {
  const trump = state.trump;
  const mySuit = effectiveSuit(card, trump);
  return !unseen(state, seat).some((c) =>
    effectiveSuit(c, trump) === mySuit && trickPower(c, trump) > trickPower(card, trump));
}

/** Sort key that spends plain cards before trump, and low before high. */
function spendCost(c: Card, trump: Suit | null): number {
  return (effectiveSuit(c, trump) === trump ? 100 : 0) + trickPower(c, trump);
}

function cheapest(cards: Card[], trump: Suit | null): Card {
  return cards.reduce((lo, c) => (spendCost(c, trump) < spendCost(lo, trump) ? c : lo));
}

function chooseLead(state: GameState, seat: number): Card {
  const trump = state.trump;
  const hand = state.hands[seat];
  const makers = TEAM_OF[state.maker] === TEAM_OF[seat];
  const trumps = hand.filter((c) => effectiveSuit(c, trump) === trump);
  const plain = hand.filter((c) => effectiveSuit(c, trump) !== trump);
  const enemyTrumpLive = unseen(state, seat).some((c) => effectiveSuit(c, trump) === trump);

  // A boss trump is a guaranteed trick: makers lead it to pull the
  // opponents' trump, and once no enemy trump is live ANYONE cashes it —
  // banking the sure winner first can promote a weak off-suit card as
  // the others discard. (Defenders don't lead trump into live enemy trump.)
  if (trumps.length > 0 && (makers || !enemyTrumpLive)) {
    const best = trumps.reduce((hi, c) => (trickPower(c, trump) > trickPower(hi, trump) ? c : hi));
    if (isBoss(state, seat, best)) return best;
  }
  // A boss plain card (an ace, or promoted by play) cashes now.
  const bossPlain = plain.filter((c) => isBoss(state, seat, c));
  if (bossPlain.length > 0) {
    return bossPlain.reduce((hi, c) => (RANK_POWER[c.rank] > RANK_POWER[hi.rank] ? c : hi));
  }
  // Nothing good: lead the cheapest plain card; all-trump hands lead low trump.
  return plain.length > 0 ? cheapest(plain, trump) : cheapest(trumps, trump);
}

function chooseFollow(state: GameState, seat: number, legal: Card[]): Card {
  const trump = state.trump;
  const wi = winningIndex(state.trick, trump);
  const winner = state.trick[wi];
  const partnerWinning = TEAM_OF[winner.seat] === TEAM_OF[seat] && winner.seat !== seat;
  const lastToAct = state.trick.length === activePlayers(state) - 1;

  // Partner has it locked (or nobody is left to beat them): save everything.
  if (partnerWinning && (lastToAct || isBoss(state, seat, winner.card))) {
    return cheapest(legal, trump);
  }

  const winners = legal.filter((c) => {
    const suitOk = effectiveSuit(c, trump) === effectiveSuit(winner.card, trump)
      ? trickPower(c, trump) > trickPower(winner.card, trump)
      : effectiveSuit(c, trump) === trump;
    return suitOk;
  });
  if (winners.length > 0 && !partnerWinning) {
    // Take it as cheaply as possible; when not last, prefer a boss winner if one exists.
    if (!lastToAct) {
      const bossWinners = winners.filter((c) => isBoss(state, seat, c));
      if (bossWinners.length > 0) return cheapest(bossWinners, trump);
    }
    return cheapest(winners, trump);
  }
  return cheapest(legal, trump);
}

export function botAction(state: GameState, seat: number, opts: BotOptions = {}): GameAction | null {
  if (seat === state.inactive) return null;
  const hand = state.hands[seat];

  switch (state.phase) {
    case 'order1': {
      if (seat !== state.turn || !state.turnCard) return null;
      const s = state.turnCard.suit;
      let score: number;
      if (seat === state.dealer) {
        const six = [...hand, state.turnCard];
        const kept = six.filter((c) => c.id !== pickDiscard(six, s).id);
        score = handScore(kept, s);
      } else {
        score = handScore(hand, s);
        // Ordering up hands the dealer a trump: good for their partner, bad for their opponents.
        const gift = trumpValue(state.turnCard, s) / 2;
        score += TEAM_OF[seat] === TEAM_OF[state.dealer] ? gift : -gift;
      }
      if (score >= CALL) {
        return { type: 'ORDER_UP', seat, alone: score >= ALONE };
      }
      return { type: 'PASS', seat };
    }

    case 'order2': {
      if (seat !== state.turn) return null;
      let bestSuit: Suit | 'NT' | null = null;
      let bestScore = -1;
      for (const s of SUITS) {
        if (s === state.turnedDown) continue;
        const sc = handScore(hand, s);
        if (sc > bestScore) {
          bestScore = sc;
          bestSuit = s;
        }
      }
      if (opts.noTrump) {
        const nt = ntScore(hand);
        if (nt > bestScore) {
          bestScore = nt;
          bestSuit = 'NT';
        }
      }
      if (seat === state.dealer || bestScore >= CALL) {
        // Stuck dealers name their least-bad call and play it straight.
        return { type: 'NAME_TRUMP', seat, suit: bestSuit!, alone: bestScore >= ALONE };
      }
      return { type: 'PASS', seat };
    }

    case 'discard': {
      if (seat !== state.dealer || seat !== state.turn) return null;
      return { type: 'DISCARD', seat, cardId: pickDiscard(hand, state.trump!).id };
    }

    case 'play': {
      if (seat !== state.turn) return null;
      const legal = legalPlays(hand, state.trick, state.trump);
      const card = legal.length === 1
        ? legal[0]
        : state.trick.length === 0
          ? chooseLead(state, seat)
          : chooseFollow(state, seat, legal);
      return { type: 'PLAY', seat, cardId: card.id };
    }

    default:
      return null;
  }
}
