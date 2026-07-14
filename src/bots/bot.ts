import { GameAction, GameState } from '../engine/game';
import { computeMeld } from '../engine/meld';
import { partnerOf } from '../engine/modes';
import { legalPlays, winningIndex } from '../engine/tricks';
import { Card, isCounter, RANK_POWER, Suit, SUITS } from '../engine/types';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface SuitEval {
  suit: Suit;
  meld: number;
  trumpLen: number;
  ceiling: number; // estimated total points the bot's side scores if it wins the bid
}

/**
 * Estimate what the bot's side would score with this suit as trump:
 * own meld + expected partner meld + expected team trick points (out of 25).
 * Bids are sane only when partner/kitty value is counted — a lone hand
 * almost never justifies a 25 opening on its own.
 */
function evaluateSuits(state: GameState, seat: number): SuitEval[] {
  const { mode } = state;
  const hand = state.hands[seat];
  const aces = hand.filter((c) => c.rank === 'A').length;
  const expAces = mode.handSize / 6;
  const expTrump = mode.handSize / 4;
  const teamSeats = mode.players / mode.teamCount;
  const isCutthroat = teamSeats === 1;

  return SUITS.map((suit) => {
    const meld = computeMeld(hand, suit).total;
    const trumpCards = hand.filter((c) => c.suit === suit);
    const trumpLen = trumpCards.length;
    const highTrump = trumpCards.filter((c) => c.rank === 'A' || c.rank === '10').length;

    // How much better than an average hand is this one at taking tricks?
    const edge = 1.2 * (trumpLen - expTrump) + 1.0 * (aces - expAces) + 0.6 * highTrump;

    let ceiling: number;
    // A short trump suit can't pull trump or protect winners — punish naming it
    // beyond what the linear edge term captures.
    const shortTrumpPenalty = trumpLen < 4 ? (4 - trumpLen) * 1.4 : 0;
    if (isCutthroat) {
      // Alone vs the table: fair share of 25, plus the initiative of naming trump.
      ceiling = meld + 25 / mode.players + 2 + 1.3 * edge;
      if (mode.kittySize > 0) ceiling += 2.5; // kitty meld/counter potential
    } else {
      const teamBaseline = (25 * teamSeats) / mode.players;
      // Short hands meld less — expect roughly a point of meld per three cards.
      const partnerMeldExp = mode.handSize / 3;
      ceiling = meld + partnerMeldExp + teamBaseline + 1.5 + edge;
      if (mode.passCount > 0) ceiling += 3.5; // partner ships trump and aces
    }
    ceiling -= shortTrumpPenalty;
    return { suit, meld, trumpLen, ceiling };
  }).sort((a, b) => b.ceiling - a.ceiling);
}

function maxBidFor(state: GameState, seat: number, difficulty: Difficulty): number {
  const best = evaluateSuits(state, seat)[0];
  if (difficulty === 'easy') return Math.round(best.ceiling * 0.85 - 2);
  // Going set costs the whole bid, so discipline beats aggression: hard wins
  // through play, not by outbidding its own hand.
  return Math.round(best.ceiling - 1);
}

function pickBidAction(state: GameState, seat: number, difficulty: Difficulty): GameAction {
  const max = maxBidFor(state, seat, difficulty);
  const min = state.highSeat === -1 ? state.mode.bidStart : state.highBid + 1;
  // Jump bids only raise the bot's own make-threshold — always bid the minimum.
  if (min <= max) return { type: 'BID', seat, amount: min };
  return { type: 'PASS_BID', seat };
}

/** Lower = more disposable. Used for kitty burial and returning passed cards. */
function keepScore(card: Card, hand: Card[], trump: Suit): number {
  let score = RANK_POWER[card.rank];
  if (card.suit === trump) score += 100;
  if (isCounter(card)) score += 8;
  if (card.rank === 'A') score += 20;
  // Protect meld skeletons: pinochle parts and marriage halves.
  if (card.suit === 'D' && card.rank === 'J') score += 12;
  if (card.suit === 'S' && card.rank === 'Q') score += 12;
  if (card.rank === 'K' && hand.some((c) => c.suit === card.suit && c.rank === 'Q')) score += 10;
  if (card.rank === 'Q' && hand.some((c) => c.suit === card.suit && c.rank === 'K')) score += 10;
  return score;
}

function pickWorst(
  hand: Card[], trump: Suit, count: number,
  scorer: (card: Card, hand: Card[], trump: Suit) => number = keepScore,
): string[] {
  return [...hand]
    .sort((a, b) => scorer(a, hand, trump) - scorer(b, hand, trump))
    .slice(0, count)
    .map((c) => c.id);
}

/**
 * Lower = better to bury in the kitty. Buried counters score for the bid
 * team no matter what (house rule), so a weak unprotected counter — a lone
 * off-trump 10 or K with no ace behind it — banks a sure point in the kitty
 * where in hand it would likely be eaten by an ace.
 */
function buryScore(card: Card, hand: Card[], trump: Suit): number {
  let score = keepScore(card, hand, trump);
  if (isCounter(card) && card.rank !== 'A' && card.suit !== trump) {
    const hasAce = hand.some((c) => c.suit === card.suit && c.rank === 'A');
    const meldLoss = computeMeld(hand, trump).total -
      computeMeld(hand.filter((c) => c.id !== card.id), trump).total;
    if (!hasAce && meldLoss === 0) score -= 14;
  }
  return score;
}

/** Higher = better to send to the bid winner. */
function passValue(card: Card, trump: Suit): number {
  let score = RANK_POWER[card.rank];
  if (card.suit === trump) score += 100;
  if (card.rank === 'A') score += 30;
  else if (isCounter(card)) score += 5;
  return score;
}

function pickPlay(state: GameState, seat: number, difficulty: Difficulty): Card {
  const hand = state.hands[seat];
  const trump = state.trump!;
  const legal = legalPlays(hand, state.trick, trump);

  if (difficulty === 'easy') {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const { mode } = state;
  const myTeam = mode.teams[seat];
  const bidTeam = mode.teams[state.bidWinner];
  const iAmBidTeam = myTeam === bidTeam;
  // Everyone not on the bidding side is trying to set the bid — defenders
  // treat each other as allies even in cutthroat modes.
  const isFriendly = (s: number) =>
    mode.teams[s] === myTeam || (!iAmBidTeam && mode.teams[s] !== bidTeam);
  const byPowerAsc = [...legal].sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);

  // Leading a trick.
  if (state.trick.length === 0) {
    const seen = new Map<string, number>();
    const note = (c: Card) => seen.set(`${c.suit}${c.rank}`, (seen.get(`${c.suit}${c.rank}`) ?? 0) + 1);
    if (difficulty === 'hard') {
      state.captured.forEach((pile) => pile.forEach(note));
      hand.forEach(note);
    }
    // The bidding side pulls trump before cashing side aces: the leader's
    // trump ace is boss (ties lose), and stripping trump protects the winners.
    if (iAmBidTeam) {
      const trumps = legal.filter((c) => c.suit === trump)
        .sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
      const pullFrom = difficulty === 'hard' ? 3 : 4;
      if (trumps.length >= pullFrom && trumps[0].rank === 'A') return trumps[0];
      if (trumps.length >= 4 && RANK_POWER[trumps[0].rank] >= 4) return trumps[0];
    }
    // Cash aces — defenders especially, before the bidder strips their trump.
    const aces = legal.filter((c) => c.rank === 'A' && c.suit !== trump);
    for (const ace of aces) {
      const otherAceOut =
        difficulty !== 'hard' || (seen.get(`${ace.suit}A`) ?? 0) < 2;
      if (!otherAceOut || difficulty === 'medium' || Math.random() < 0.9) return ace;
    }
    // Otherwise lead low junk (never open a trump for the bidder).
    const junk = byPowerAsc.filter((c) => !isCounter(c) && c.suit !== trump);
    return junk[0] ?? byPowerAsc[0];
  }

  const wi = winningIndex(state.trick, trump);
  const winnerSeat = state.trick[wi].seat;
  const winningCard = state.trick[wi].card;
  const lastToPlay = state.trick.length === mode.players - 1;

  const winners = legal.filter((c) => {
    const trial = [...state.trick, { seat, card: c }];
    return winningIndex(trial, trump) === trial.length - 1;
  });
  const nonWinners = legal.filter((c) => !winners.some((w) => w.id === c.id));

  if (winners.length > 0) {
    // Must-beat rules leave no choice about winning — just win as cheaply
    // as possible (equal-power counters: the K goes before the 10).
    return winners.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank])[0];
  }

  // Can't win. Decide between smearing a counter to a friendly winner and
  // dumping junk. Only smear when the trick looks locked up: we're last,
  // no unfriendly seat plays after us, or the winning card is hard to beat.
  const playedSeats = new Set(state.trick.map((p) => p.seat));
  playedSeats.add(seat);
  const unfriendlyBehind = Array.from({ length: mode.players }, (_, s) => s)
    .some((s) => !playedSeats.has(s) && !isFriendly(s));
  const ledSuit = state.trick[0].card.suit;
  const secure =
    lastToPlay ||
    (difficulty === 'hard' && !unfriendlyBehind) ||
    (winningCard.suit === trump && RANK_POWER[winningCard.rank] >= 4) ||
    (winningCard.rank === 'A' && winningCard.suit === ledSuit);

  if (isFriendly(winnerSeat) && secure) {
    // House scoring makes every counter worth 1, so smear the weakest one:
    // Kings before 10s, off-trump before trump, and never an ace.
    const smears = nonWinners
      .filter((c) => isCounter(c) && c.rank !== 'A')
      .sort((a, b) =>
        (Number(a.suit === trump) - Number(b.suit === trump)) ||
        (RANK_POWER[a.rank] - RANK_POWER[b.rank]));
    if (smears.length > 0) return smears[0];
    return nonWinners.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank])[0];
  }

  // The bid side has the trick (or it's not safe): dump the least valuable card.
  const junk = [...nonWinners]
    .sort((a, b) => (Number(isCounter(a)) - Number(isCounter(b))) || (RANK_POWER[a.rank] - RANK_POWER[b.rank]));
  return junk[0] ?? byPowerAsc[0];
}

/** Decide the acting bot's move for the current phase. */
export function botAction(state: GameState, seat: number, difficulty: Difficulty): GameAction | null {
  const { mode } = state;

  switch (state.phase) {
    case 'bidding':
      return pickBidAction(state, seat, difficulty);
    case 'trump':
      return { type: 'NAME_TRUMP', seat, suit: evaluateSuits(state, seat)[0].suit };
    case 'discard':
      return { type: 'DISCARD', seat, cardIds: pickWorst(state.hands[seat], state.trump!, mode.kittySize, buryScore) };
    case 'pass1': {
      const hand = state.hands[seat];
      const ids = [...hand]
        .sort((a, b) => passValue(b, state.trump!) - passValue(a, state.trump!))
        .slice(0, mode.passCount)
        .map((c) => c.id);
      return { type: 'PASS_CARDS', seat, cardIds: ids };
    }
    case 'pass2':
      return { type: 'PASS_CARDS', seat, cardIds: pickWorst(state.hands[seat], state.trump!, mode.passCount) };
    case 'play':
      return { type: 'PLAY', seat, cardId: pickPlay(state, seat, difficulty).id };
    default:
      return null;
  }
}
