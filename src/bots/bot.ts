import { GameAction, GameState } from '../engine/game';
import { computeMeld } from '../engine/meld';
import { partnerOf } from '../engine/modes';
import { legalPlays, winningIndex } from '../engine/tricks';
import { Card, isCounter, RANK_POWER, RANKS, Suit, SUITS } from '../engine/types';

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
      // Passing is worth a lot: partner ships trump and aces, the exchange
      // often completes a run, and the consolidated hand controls the play.
      if (mode.passCount > 0) ceiling += 6.5;
    }
    ceiling -= shortTrumpPenalty;
    return { suit, meld, trumpLen, ceiling };
  }).sort((a, b) => b.ceiling - a.ceiling);
}

function maxBidFor(state: GameState, seat: number): number {
  const best = evaluateSuits(state, seat)[0];
  // Going set costs the whole bid, so discipline beats aggression: the bots
  // win through play, not by outbidding their own hands.
  return Math.round(best.ceiling - 1);
}

function pickBidAction(state: GameState, seat: number): GameAction {
  const partner = partnerOf(state.mode, seat);
  const min = state.highSeat === -1 ? state.mode.bidStart : state.highBid + 1;

  // Partner holds the high bid: only take the contract off them with an
  // easy-make hand — clearing the price by a point isn't a reason to bid.
  if (partner !== null && state.highSeat === partner) {
    if (min <= maxBidFor(state, seat) - 3) return { type: 'BID', seat, amount: min };
    return { type: 'PASS_BID', seat };
  }

  // A partner who has voluntarily bid is promising real help.
  const partnerSupport = partner !== null && state.bids[partner] !== null ? 2 : 0;
  const max = maxBidFor(state, seat) + partnerSupport;
  // Jump bids only raise the bot's own make-threshold — always bid the minimum.
  if (min <= max) return { type: 'BID', seat, amount: min };
  // In passing modes a contract is strong (partner consolidates the winner's
  // hand), so don't hand one to an opponent cheap: with a tolerable hand,
  // push an opposing high bidder toward a fair price before dropping out,
  // accepting the risk of getting stuck. In other modes contracts are
  // fragile and bidding up just eats sets. (Partner holding the high bid
  // already returned above, so any high bidder here is an opponent.)
  if (state.mode.passCount > 0 && state.highSeat !== -1) {
    const fairPrice = state.mode.bidStart + 7;
    if (min <= fairPrice && max >= min - 4) {
      return { type: 'BID', seat, amount: min };
    }
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

/**
 * What the partner ships to the bid winner, in table priority order:
 * distinct non-9 trump ranks first, then off-trump aces (one per suit before
 * a second of the same suit), the off-trump pinochle leg when trump is
 * spades or diamonds, duplicate trump, trump 9s, then whatever's best left.
 * A non-trump ace always outranks a 9 of trump.
 */
export function pickPassToWinner(hand: Card[], trump: Suit, count: number): string[] {
  const chosen: Card[] = [];
  const used = new Set<string>();
  const take = (cards: Card[]) => {
    for (const c of cards) {
      if (chosen.length >= count) return;
      if (!used.has(c.id)) {
        used.add(c.id);
        chosen.push(c);
      }
    }
  };

  const trumps = hand.filter((c) => c.suit === trump)
    .sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
  const uniqueTrump: Card[] = [];
  const dupTrump: Card[] = [];
  const seenRank = new Set<string>();
  for (const c of trumps) {
    if (c.rank === '9') continue;
    if (seenRank.has(c.rank)) dupTrump.push(c);
    else { seenRank.add(c.rank); uniqueTrump.push(c); }
  }
  const trumpNines = trumps.filter((c) => c.rank === '9');

  const firstAces: Card[] = [];
  const dupAces: Card[] = [];
  const aceSuits = new Set<Suit>();
  for (const a of hand.filter((c) => c.rank === 'A' && c.suit !== trump)) {
    if (aceSuits.has(a.suit)) dupAces.push(a);
    else { aceSuits.add(a.suit); firstAces.push(a); }
  }

  const leg = trump === 'S' ? { suit: 'D' as Suit, rank: 'J' }
    : trump === 'D' ? { suit: 'S' as Suit, rank: 'Q' } : null;
  const legs = leg ? hand.filter((c) => c.suit === leg.suit && c.rank === leg.rank) : [];

  take(uniqueTrump);
  take(firstAces);
  take(legs);
  take(dupAces);
  take(dupTrump);
  take(trumpNines);
  take([...hand].filter((c) => !used.has(c.id))
    .sort((a, b) => passValue(b, trump) - passValue(a, trump)));
  return chosen.map((c) => c.id);
}

/**
 * The bid winner's return pass: try every discard set and keep the hand with
 * the most meld and playing strength, preferring to ship meld-makers
 * (kings/queens) to the partner and to come out two or three suited.
 */
function pickReturn(hand: Card[], trump: Suit, count: number): string[] {
  let best: Card[] = hand.slice(0, count);
  let bestScore = -Infinity;
  const n = hand.length;
  const idx = Array.from({ length: count }, (_, i) => i);

  while (true) {
    const discard = idx.map((i) => hand[i]);
    const discardIds = new Set(discard.map((c) => c.id));
    const kept = hand.filter((c) => !discardIds.has(c.id));

    let score = computeMeld(kept, trump).total * 3;
    for (const c of kept) {
      if (c.suit === trump) score += 2;
      if (c.rank === 'A') score += 2.5;
      score += RANK_POWER[c.rank] * 0.3;
    }
    score += (4 - new Set(kept.map((c) => c.suit)).size) * 2.5;
    for (const c of discard) {
      if (c.rank === 'K' || c.rank === 'Q') score += 1.2; // meld makers for partner
      if (c.suit === trump) score -= 6;
      if (c.rank === 'A') score -= 4;
    }
    if (score > bestScore) { bestScore = score; best = discard; }

    // next combination
    let i = count - 1;
    while (i >= 0 && idx[i] === n - count + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < count; j++) idx[j] = idx[j - 1] + 1;
  }
  return best.map((c) => c.id);
}

function pickPlay(state: GameState, seat: number): Card {
  const hand = state.hands[seat];
  const trump = state.trump!;
  const legal = legalPlays(hand, state.trick, trump);

  const { mode } = state;
  const myTeam = mode.teams[seat];
  const bidTeam = mode.teams[state.bidWinner];
  const iAmBidTeam = myTeam === bidTeam;
  // Everyone not on the bidding side is trying to set the bid — defenders
  // treat each other as allies even in cutthroat modes.
  const isFriendly = (s: number) =>
    mode.teams[s] === myTeam || (!iAmBidTeam && mode.teams[s] !== bidTeam);
  const byPowerAsc = [...legal].sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank]);
  const trumpIdx = SUITS.indexOf(trump);

  // Leading a trick.
  if (state.trick.length === 0) {
    // Count every card this seat has legitimately seen: captured piles, its
    // own hand, and — for the bid winner only — its own buried kitty cards.
    // (The original kitty was flipped publicly, but cards the bidder KEPT are
    // still live, so only the bidder may count the burial.)
    const seen = new Map<string, number>();
    const note = (c: Card) => seen.set(`${c.suit}${c.rank}`, (seen.get(`${c.suit}${c.rank}`) ?? 0) + 1);
    state.captured.forEach((pile) => pile.forEach(note));
    hand.forEach(note);
    if (seat === state.bidWinner) state.discard.forEach(note);

    const myTrumps = legal.filter((c) => c.suit === trump)
      .sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
    const topTrumpIsBoss = myTrumps.length > 0 && (myTrumps[0].rank === 'A' ||
      (seen.get(`${trump}A`) ?? 0) === 2);
    const ruffSafe = (c: Card) => {
      const suitIdx = SUITS.indexOf(c.suit);
      return !Array.from({ length: mode.players }, (_, s) => s).some((s) =>
        s !== seat && !isFriendly(s) &&
        state.voids[s]?.[suitIdx] && !state.voids[s]?.[trumpIdx]);
    };

    // The bidding side pulls trump before cashing side aces — but only while
    // pulling still buys something (points live in the late tricks, so keep
    // some trump home), and never by donating a counter to an outstanding ace.
    let wantPull = false;
    if (iAmBidTeam) {
      const oppsWithTrump = Array.from({ length: mode.players }, (_, s) => s)
        .filter((s) => s !== seat && !isFriendly(s) && !state.voids[s]?.[trumpIdx]).length;
      const outstanding = 12 - RANKS.reduce((sum, r) => sum + (seen.get(`${trump}${r}`) ?? 0), 0);
      // Trump concentrated in one hand isn't worth digging out.
      const worthPulling = oppsWithTrump >= 2 ? outstanding > 2 : outstanding > 3;
      wantPull = myTrumps.length >= 3 && oppsWithTrump > 0 && worthPulling;
    }

    // A boss trump lead keeps the lead, so it risks nothing — and every
    // trump stripped protects the lone aces below from a future ruff.
    if (wantPull && topTrumpIsBoss) return myTrumps[0];

    // A lone off-suit ace is cashed before any lead that could LOSE the lead
    // (a forcing low trump, a junk lead) — surrender the lead once and the
    // opponents cash their copy first, killing yours to a forced follow.
    const loneAces = legal.filter((c) =>
      c.rank === 'A' && c.suit !== trump &&
      hand.filter((x) => x.suit === c.suit).length === 1 && ruffSafe(c));
    if (loneAces.length > 0) return loneAces[0];

    // Non-boss pull: flush the ace with a cheap trump instead of feeding it
    // a 10 — safe now that the perishable aces are cashed.
    if (wantPull && myTrumps.length >= 4) {
      const low = myTrumps[myTrumps.length - 1];
      if (!isCounter(low)) return low;
    }
    // Cash aces — defenders especially, before the bidder strips their trump.
    // Shortest suits first: those aces are the most perishable.
    const aces = legal.filter((c) => c.rank === 'A' && c.suit !== trump)
      .sort((a, b) =>
        hand.filter((x) => x.suit === a.suit).length -
        hand.filter((x) => x.suit === b.suit).length);
    for (const ace of aces) {
      const otherAceOut = (seen.get(`${ace.suit}A`) ?? 0) < 2;
      if (!otherAceOut || Math.random() < 0.9) return ace;
    }
    // A short trump holding topped by the boss gets cashed before the bidder
    // draws it out — an unprotected trump ace (or boss 10) mustn't die in hand.
    if (!iAmBidTeam && myTrumps.length > 0 && myTrumps.length <= 2 && topTrumpIsBoss) {
      return myTrumps[0];
    }
    // A counter made boss by the fallen higher cards (both aces gone → the 10
    // runs the suit) gets cashed like an ace — unless an unfriendly seat is
    // known void there and may still hold trump to ruff it.
    const bossCash = legal
      .filter((c) => c.suit !== trump && c.rank !== 'A' && isCounter(c))
      .filter((c) => RANKS
        .filter((r) => RANK_POWER[r] > RANK_POWER[c.rank])
        .every((r) => (seen.get(`${c.suit}${r}`) ?? 0) === 2))
      .filter((c) => {
        const suitIdx = SUITS.indexOf(c.suit);
        return !Array.from({ length: mode.players }, (_, s) => s).some((s) =>
          s !== seat && !isFriendly(s) &&
          state.voids[s]?.[suitIdx] && !state.voids[s]?.[trumpIdx]);
      })
      .sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank]);
    if (bossCash.length > 0) return bossCash[0];
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
    !unfriendlyBehind ||
    (winningCard.suit === trump && RANK_POWER[winningCard.rank] >= 4) ||
    (winningCard.rank === 'A' && winningCard.suit === ledSuit);

  // House scoring makes every counter worth 1, so smear the weakest one:
  // Kings before 10s, off-trump before trump, and never an ace.
  const smearCard = () => {
    const smears = nonWinners
      .filter((c) => isCounter(c) && c.rank !== 'A')
      .sort((a, b) =>
        (Number(a.suit === trump) - Number(b.suit === trump)) ||
        (RANK_POWER[a.rank] - RANK_POWER[b.rank]));
    return smears[0] ?? null;
  };

  // A weak trump lead with my partner still to play: must-beat forces any
  // trump holder to overtrump, so unless partner is known out of trump,
  // treat this as their trick and bank a counter on it.
  const partnerBehind = Array.from({ length: mode.players }, (_, s) => s)
    .find((s) => s !== seat && mode.teams[s] === myTeam && !playedSeats.has(s));
  const weakTrumpLead =
    ledSuit === trump && winningCard.suit === trump &&
    RANK_POWER[winningCard.rank] <= 2 && !isFriendly(winnerSeat);
  if (weakTrumpLead && partnerBehind !== undefined &&
      !state.voids[partnerBehind]?.[SUITS.indexOf(trump)]) {
    const smear = smearCard();
    if (smear) return smear;
  }

  if (isFriendly(winnerSeat) && secure) {
    const smear = smearCard();
    if (smear) return smear;
    return nonWinners.sort((a, b) => RANK_POWER[a.rank] - RANK_POWER[b.rank])[0];
  }

  // The bid side has the trick (or it's not safe): dump the least valuable
  // card. Within a suit, strictly lowest first — following an ace with your
  // own ace when you hold the 10 hands the opponents a whole trick. Across
  // suits, prefer short or hopeless suits, and don't strip a small card
  // (9/J/Q only — never a counter) that lets an ace duck the other ace later.
  const suitLen = (s: Suit) => hand.filter((c) => c.suit === s).length;
  const guardsAce = (c: Card) =>
    !isCounter(c) &&
    hand.some((x) => x.suit === c.suit && x.rank === 'A') &&
    hand.filter((x) => x.suit === c.suit && x.rank !== 'A').length <= 2;
  const lowestPerSuit = new Map<Suit, Card>();
  for (const c of nonWinners) {
    const cur = lowestPerSuit.get(c.suit);
    if (!cur || RANK_POWER[c.rank] < RANK_POWER[cur.rank]) lowestPerSuit.set(c.suit, c);
  }
  const junk = [...lowestPerSuit.values()].sort((a, b) =>
    (Number(isCounter(a)) - Number(isCounter(b))) ||
    (Number(guardsAce(a)) - Number(guardsAce(b))) ||
    ((suitLen(a.suit) * 3 + RANK_POWER[a.rank]) - (suitLen(b.suit) * 3 + RANK_POWER[b.rank])));
  return junk[0] ?? byPowerAsc[0];
}

/** Decide the acting bot's move for the current phase. */
export function botAction(state: GameState, seat: number): GameAction | null {
  const { mode } = state;

  switch (state.phase) {
    case 'bidding':
      return pickBidAction(state, seat);
    case 'trump':
      return { type: 'NAME_TRUMP', seat, suit: evaluateSuits(state, seat)[0].suit };
    case 'discard':
      return { type: 'DISCARD', seat, cardIds: pickWorst(state.hands[seat], state.trump!, mode.kittySize, buryScore) };
    case 'pass1':
      return { type: 'PASS_CARDS', seat, cardIds: pickPassToWinner(state.hands[seat], state.trump!, mode.passCount) };
    case 'pass2':
      return { type: 'PASS_CARDS', seat, cardIds: pickReturn(state.hands[seat], state.trump!, mode.passCount) };
    case 'play':
      return { type: 'PLAY', seat, cardId: pickPlay(state, seat).id };
    default:
      return null;
  }
}
