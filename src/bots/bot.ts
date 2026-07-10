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
    if (isCutthroat) {
      // Alone vs the table: fair share of 25, plus the initiative of naming trump.
      ceiling = meld + 25 / mode.players + 2 + 1.3 * edge;
      if (mode.kittySize > 0) ceiling += 2.5; // kitty meld/counter potential
    } else {
      const teamBaseline = (25 * teamSeats) / mode.players;
      const partnerMeldExp = 4;
      ceiling = meld + partnerMeldExp + teamBaseline + 1.5 + edge;
      if (mode.passCount > 0) ceiling += 3.5; // partner ships trump and aces
    }
    return { suit, meld, trumpLen, ceiling };
  }).sort((a, b) => b.ceiling - a.ceiling);
}

function maxBidFor(state: GameState, seat: number, difficulty: Difficulty): number {
  const best = evaluateSuits(state, seat)[0];
  if (difficulty === 'easy') return Math.round(best.ceiling * 0.85 - 2);
  if (difficulty === 'medium') return Math.round(best.ceiling - 1);
  return Math.round(best.ceiling + 1);
}

function pickBidAction(state: GameState, seat: number, difficulty: Difficulty): GameAction {
  const max = maxBidFor(state, seat, difficulty);
  const min = state.highSeat === -1 ? state.mode.bidStart : state.highBid + 1;
  if (min <= max) {
    // Hard bots occasionally jump to pressure the table when they have room.
    const amount = difficulty === 'hard' && max >= min + 4 && Math.random() < 0.25 ? min + 2 : min;
    return { type: 'BID', seat, amount };
  }
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

function pickWorst(hand: Card[], trump: Suit, count: number): string[] {
  return [...hand]
    .sort((a, b) => keepScore(a, hand, trump) - keepScore(b, hand, trump))
    .slice(0, count)
    .map((c) => c.id);
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
  const byPowerAsc = [...legal].sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);

  // Leading a trick.
  if (state.trick.length === 0) {
    const seen = new Map<string, number>();
    const note = (c: Card) => seen.set(`${c.suit}${c.rank}`, (seen.get(`${c.suit}${c.rank}`) ?? 0) + 1);
    if (difficulty === 'hard') {
      state.captured.forEach((pile) => pile.forEach(note));
      hand.forEach(note);
    }
    // Lead an ace if it's likely to hold up.
    const aces = legal.filter((c) => c.rank === 'A' && c.suit !== trump);
    for (const ace of aces) {
      const otherAceOut =
        difficulty !== 'hard' || (seen.get(`${ace.suit}A`) ?? 0) < 2;
      if (!otherAceOut || difficulty === 'medium' || Math.random() < 0.9) return ace;
    }
    // Bid winner with long trump pulls trump early.
    if (mode.teams[state.bidWinner] === myTeam) {
      const trumps = legal.filter((c) => c.suit === trump).sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
      if (trumps.length >= 4 && RANK_POWER[trumps[0].rank] >= 4) return trumps[0];
    }
    // Otherwise lead low junk.
    const junk = byPowerAsc.filter((c) => !isCounter(c) && c.suit !== trump);
    return junk[0] ?? byPowerAsc[0];
  }

  const wi = winningIndex(state.trick, trump);
  const winnerSeat = state.trick[wi].seat;
  const partnerWinning = mode.teams[winnerSeat] === myTeam;
  const lastToPlay = state.trick.length === mode.players - 1;

  const winners = legal.filter((c) => {
    const trial = [...state.trick, { seat, card: c }];
    return winningIndex(trial, trump) === trial.length - 1;
  });
  const nonWinners = legal.filter((c) => !winners.some((w) => w.id === c.id));

  // Smear: partner has it locked (or we simply can't win) — throw them a counter.
  if (partnerWinning && (lastToPlay || winners.length === 0)) {
    if (nonWinners.length > 0) {
      const counters = nonWinners
        .filter((c) => isCounter(c) && c.rank !== 'A')
        .sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
      if (counters.length > 0) return counters[0];
      return nonWinners.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank])[0];
    }
  }

  if (winners.length > 0) {
    const trickCounters = state.trick.filter((p) => isCounter(p.card)).length;
    const isLastTrick = state.tricksPlayed === mode.handSize - 1;
    const cheapest = winners.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank])[0];
    if (trickCounters > 0 || isLastTrick || lastToPlay || nonWinners.length === 0) return cheapest;
    if (difficulty === 'hard' && !isCounter(cheapest)) return cheapest;
    return cheapest;
  }

  // Can't win: dump the least valuable card.
  const junk = nonWinners
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
      return { type: 'DISCARD', seat, cardIds: pickWorst(state.hands[seat], state.trump!, mode.kittySize) };
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
