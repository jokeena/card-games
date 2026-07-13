import { dealHands } from './deck';
import { computeMeld, MeldResult } from './meld';
import { ModeConfig, partnerOf } from './modes';
import { legalPlays, winningIndex } from './tricks';
import { Card, isCounter, Played, Suit, SUIT_NAME } from './types';

export type Phase =
  | 'bidding'
  | 'trump'    // bid winner names trump
  | 'discard'  // kitty modes: bid winner buries kittySize cards
  | 'pass1'    // partner sends passCount cards to bid winner
  | 'pass2'    // bid winner returns passCount cards
  | 'meld'     // melds revealed, waiting for continue
  | 'play'
  | 'trickEnd' // completed trick shown, waiting for continue
  | 'handEnd'  // hand summary shown, waiting for continue
  | 'gameOver';

export interface TeamHandResult {
  meld: number;
  meldKept: boolean;
  trickPoints: number;
  tookTrick: boolean;
  delta: number;
}

export interface HandResult {
  bidTeam: number;
  bid: number;
  made: boolean;
  wasStuck: boolean;
  perTeam: TeamHandResult[];
}

export interface GameState {
  mode: ModeConfig;
  phase: Phase;
  scores: number[];
  dealer: number;
  handNumber: number;

  hands: Card[][];
  kitty: Card[];
  discard: Card[];

  turn: number;
  passed: boolean[];
  /** Last amount each seat bid this auction; null = hasn't bid yet. */
  bids: (number | null)[];
  highBid: number;
  highSeat: number;
  wasStuck: boolean;
  bidWinner: number;
  trump: Suit | null;

  melds: (MeldResult | null)[];
  passBuffer: Card[];

  trick: Played[];
  trickWinner: number;
  tricksPlayed: number;
  captured: Card[][]; // per team
  teamTookTrick: boolean[];
  lastTrickTeam: number;

  handResult: HandResult | null;
  winnerTeam: number | null;
  log: string[];
}

export type GameAction =
  | { type: 'BID'; seat: number; amount: number }
  | { type: 'PASS_BID'; seat: number }
  | { type: 'NAME_TRUMP'; seat: number; suit: Suit }
  | { type: 'DISCARD'; seat: number; cardIds: string[] }
  | { type: 'PASS_CARDS'; seat: number; cardIds: string[] }
  | { type: 'PLAY'; seat: number; cardId: string }
  | { type: 'THROW_IN'; seat: number }
  | { type: 'CONTINUE' };

const log = (state: GameState, msg: string): string[] => [...state.log.slice(-60), msg];

export function seatLabel(state: GameState, seat: number, names: string[]): string {
  return seat === 0 ? 'You' : names[seat];
}

function freshHand(state: GameState, dealer: number): GameState {
  const { mode } = state;
  const { hands, kitty } = dealHands(mode.players, mode.handSize, mode.kittySize);
  return {
    ...state,
    phase: 'bidding',
    dealer,
    handNumber: state.handNumber + 1,
    hands,
    kitty,
    discard: [],
    turn: (dealer + 1) % mode.players,
    passed: Array(mode.players).fill(false),
    bids: Array(mode.players).fill(null),
    highBid: 0,
    highSeat: -1,
    wasStuck: false,
    bidWinner: -1,
    trump: null,
    melds: Array(mode.players).fill(null),
    passBuffer: [],
    trick: [],
    trickWinner: -1,
    tricksPlayed: 0,
    captured: Array.from({ length: mode.teamCount }, () => []),
    teamTookTrick: Array(mode.teamCount).fill(false),
    lastTrickTeam: -1,
    handResult: null,
    log: [...state.log.slice(-60), `— Hand ${state.handNumber + 1} —`],
  };
}

export function newGame(mode: ModeConfig): GameState {
  const base: GameState = {
    mode,
    phase: 'bidding',
    scores: Array(mode.teamCount).fill(0),
    dealer: Math.floor(Math.random() * mode.players),
    handNumber: 0,
    hands: [],
    kitty: [],
    discard: [],
    turn: 0,
    passed: [],
    bids: [],
    highBid: 0,
    highSeat: -1,
    wasStuck: false,
    bidWinner: -1,
    trump: null,
    melds: [],
    passBuffer: [],
    trick: [],
    trickWinner: -1,
    tricksPlayed: 0,
    captured: [],
    teamTookTrick: [],
    lastTrickTeam: -1,
    handResult: null,
    winnerTeam: null,
    log: [],
  };
  return freshHand(base, base.dealer);
}

function nextActiveBidder(state: GameState, from: number): number {
  const n = state.mode.players;
  let seat = (from + 1) % n;
  while (state.passed[seat]) seat = (seat + 1) % n;
  return seat;
}

function activeBidders(state: GameState): number {
  return state.passed.filter((p) => !p).length;
}

/** After the auction resolves: winner takes kitty (if any), then names trump. */
function startDeclaration(state: GameState, winner: number, bid: number, stuck: boolean): GameState {
  const hands = state.hands.map((h, i) =>
    i === winner && state.mode.kittySize > 0 ? [...h, ...state.kitty] : h,
  );
  return {
    ...state,
    hands,
    bidWinner: winner,
    highBid: bid,
    highSeat: winner,
    wasStuck: stuck,
    phase: 'trump',
    turn: winner,
    log: log(state, stuck
      ? `Everyone passed — dealer is stuck at ${bid}.`
      : `Seat ${winner} wins the bid at ${bid}.`),
  };
}

function enterMeld(state: GameState): GameState {
  const melds = state.hands.map((h) => computeMeld(h, state.trump!));
  return { ...state, phase: 'meld', melds };
}

function removeByIds(hand: Card[], ids: string[]): { kept: Card[]; taken: Card[] } {
  const idSet = new Set(ids);
  const kept: Card[] = [];
  const taken: Card[] = [];
  for (const c of hand) (idSet.has(c.id) ? taken : kept).push(c);
  return { kept, taken };
}

function scoreHand(state: GameState): GameState {
  const { mode } = state;
  const bidTeam = mode.teams[state.bidWinner];
  const perTeam: TeamHandResult[] = [];

  for (let team = 0; team < mode.teamCount; team++) {
    const meld = state.melds.reduce(
      (sum, m, seat) => (mode.teams[seat] === team ? sum + (m?.total ?? 0) : sum), 0);
    let trickPoints = state.captured[team].filter(isCounter).length;
    if (state.lastTrickTeam === team) trickPoints += 1;
    if (team === bidTeam) trickPoints += state.discard.filter(isCounter).length;
    const tookTrick = state.teamTookTrick[team];
    const meldKept = tookTrick;
    perTeam.push({ meld, meldKept, trickPoints, tookTrick, delta: 0 });
  }

  const bidderTotal = (perTeam[bidTeam].meldKept ? perTeam[bidTeam].meld : 0) + perTeam[bidTeam].trickPoints;
  const made = bidderTotal >= state.highBid;

  const scores = [...state.scores];
  for (let team = 0; team < mode.teamCount; team++) {
    const r = perTeam[team];
    if (team === bidTeam) {
      r.delta = made ? bidderTotal : -state.highBid;
    } else {
      r.delta = r.tookTrick ? r.meld + r.trickPoints : 0;
    }
    scores[team] += r.delta;
  }

  // Bidder goes out first: the bidding side wins if it crosses the target,
  // regardless of other sides' totals.
  let winnerTeam: number | null = null;
  if (scores[bidTeam] >= mode.target) {
    winnerTeam = bidTeam;
  } else {
    let best = -1;
    for (let team = 0; team < mode.teamCount; team++) {
      if (scores[team] >= mode.target && (best === -1 || scores[team] > scores[best])) best = team;
    }
    if (best !== -1) {
      const tied = scores.filter((s) => s === scores[best]).length;
      if (tied === 1) winnerTeam = best; // exact tie: play another hand
    }
  }

  return {
    ...state,
    scores,
    phase: 'handEnd',
    handResult: { bidTeam, bid: state.highBid, made, wasStuck: state.wasStuck, perTeam },
    winnerTeam,
    log: log(state, made
      ? `Bid of ${state.highBid} made with ${bidderTotal}.`
      : `Set! Bid of ${state.highBid}, only ${bidderTotal}.`),
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const { mode } = state;
  const n = mode.players;

  switch (action.type) {
    case 'BID': {
      if (state.phase !== 'bidding' || action.seat !== state.turn) return state;
      const min = state.highSeat === -1 ? mode.bidStart : state.highBid + 1;
      if (action.amount < min) return state;
      const bids = [...state.bids];
      bids[action.seat] = action.amount;
      const next = { ...state, bids, highBid: action.amount, highSeat: action.seat };
      next.log = log(state, `Seat ${action.seat} bids ${action.amount}.`);
      if (activeBidders(next) === 1 && !next.passed[action.seat]) {
        // Everyone else already passed; this bid ends it.
        return startDeclaration(next, action.seat, action.amount, false);
      }
      next.turn = nextActiveBidder(next, action.seat);
      return next;
    }

    case 'PASS_BID': {
      if (state.phase !== 'bidding' || action.seat !== state.turn) return state;
      const passed = [...state.passed];
      passed[action.seat] = true;
      const next = { ...state, passed, log: log(state, `Seat ${action.seat} passes.`) };
      const remaining = passed.filter((p) => !p).length;

      if (remaining === 0) {
        // Everyone passed with no bid: dealer is stuck.
        return startDeclaration(next, state.dealer, mode.stuck, true);
      }
      if (remaining === 1 && state.highSeat !== -1 && !passed[state.highSeat]) {
        return startDeclaration(next, state.highSeat, state.highBid, false);
      }
      next.turn = nextActiveBidder(next, action.seat);
      return next;
    }

    case 'NAME_TRUMP': {
      if (state.phase !== 'trump' || action.seat !== state.bidWinner) return state;
      const next: GameState = {
        ...state,
        trump: action.suit,
        log: log(state, `Trump is ${SUIT_NAME[action.suit]}.`),
      };
      if (mode.kittySize > 0) return { ...next, phase: 'discard' };
      if (mode.passCount > 0) return { ...next, phase: 'pass1', turn: partnerOf(mode, state.bidWinner)! };
      return enterMeld(next);
    }

    case 'DISCARD': {
      if (state.phase !== 'discard' || action.seat !== state.bidWinner) return state;
      if (action.cardIds.length !== mode.kittySize) return state;
      const { kept, taken } = removeByIds(state.hands[action.seat], action.cardIds);
      if (taken.length !== mode.kittySize) return state;
      const hands = state.hands.map((h, i) => (i === action.seat ? kept : h));
      const counters = taken.filter(isCounter).length;
      const next: GameState = {
        ...state,
        hands,
        discard: taken,
        log: log(state, `Bid winner buries ${mode.kittySize} cards${counters ? ` (${counters} counter${counters > 1 ? 's' : ''})` : ''}.`),
      };
      return enterMeld(next);
    }

    case 'PASS_CARDS': {
      if (action.cardIds.length !== mode.passCount) return state;
      if (state.phase === 'pass1') {
        const partner = partnerOf(mode, state.bidWinner)!;
        if (action.seat !== partner) return state;
        const { kept, taken } = removeByIds(state.hands[partner], action.cardIds);
        if (taken.length !== mode.passCount) return state;
        const hands = state.hands.map((h, i) =>
          i === partner ? kept : i === state.bidWinner ? [...h, ...taken] : h);
        return {
          ...state,
          hands,
          passBuffer: taken,
          phase: 'pass2',
          turn: state.bidWinner,
          log: log(state, `Partner passes ${mode.passCount} cards to the bid winner.`),
        };
      }
      if (state.phase === 'pass2') {
        if (action.seat !== state.bidWinner) return state;
        const partner = partnerOf(mode, state.bidWinner)!;
        const { kept, taken } = removeByIds(state.hands[state.bidWinner], action.cardIds);
        if (taken.length !== mode.passCount) return state;
        const hands = state.hands.map((h, i) =>
          i === state.bidWinner ? kept : i === partner ? [...h, ...taken] : h);
        return enterMeld({
          ...state,
          hands,
          passBuffer: taken,
          log: log(state, `Bid winner returns ${mode.passCount} cards.`),
        });
      }
      return state;
    }

    case 'PLAY': {
      if (state.phase !== 'play' || action.seat !== state.turn) return state;
      const hand = state.hands[action.seat];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) return state;
      const legal = legalPlays(hand, state.trick, state.trump!);
      if (!legal.some((c) => c.id === card.id)) return state;

      const hands = state.hands.map((h, i) =>
        i === action.seat ? h.filter((c) => c.id !== card.id) : h);
      const trick = [...state.trick, { seat: action.seat, card }];

      if (trick.length < n) {
        return { ...state, hands, trick, turn: (action.seat + 1) % n };
      }

      const wi = winningIndex(trick, state.trump!);
      const winnerSeat = trick[wi].seat;
      const winnerTeam = mode.teams[winnerSeat];
      const captured = state.captured.map((pile, t) =>
        t === winnerTeam ? [...pile, ...trick.map((p) => p.card)] : pile);
      const teamTookTrick = [...state.teamTookTrick];
      teamTookTrick[winnerTeam] = true;

      return {
        ...state,
        hands,
        trick,
        phase: 'trickEnd',
        trickWinner: winnerSeat,
        captured,
        teamTookTrick,
        tricksPlayed: state.tricksPlayed + 1,
        lastTrickTeam: winnerTeam,
      };
    }

    case 'THROW_IN': {
      // Bid winner concedes at meld: eats the bid, everyone else keeps their meld.
      if (state.phase !== 'meld' || action.seat !== state.bidWinner) return state;
      const bidTeam = mode.teams[state.bidWinner];
      const perTeam: TeamHandResult[] = [];
      const scores = [...state.scores];
      for (let team = 0; team < mode.teamCount; team++) {
        const meld = state.melds.reduce(
          (sum, m, seat) => (mode.teams[seat] === team ? sum + (m?.total ?? 0) : sum), 0);
        const isBid = team === bidTeam;
        const delta = isBid ? -state.highBid : meld;
        perTeam.push({ meld, meldKept: !isBid, trickPoints: 0, tookTrick: false, delta });
        scores[team] += delta;
      }
      let winnerTeam: number | null = null;
      let best = -1;
      for (let team = 0; team < mode.teamCount; team++) {
        if (team === bidTeam) continue;
        if (scores[team] >= mode.target && (best === -1 || scores[team] > scores[best])) best = team;
      }
      if (best !== -1 && scores.filter((s) => s === scores[best]).length === 1) winnerTeam = best;
      return {
        ...state,
        scores,
        phase: 'handEnd',
        handResult: { bidTeam, bid: state.highBid, made: false, wasStuck: state.wasStuck, perTeam },
        winnerTeam,
        log: log(state, `Hand thrown in — bid of ${state.highBid} goes set.`),
      };
    }

    case 'CONTINUE': {
      if (state.phase === 'meld') {
        return { ...state, phase: 'play', turn: state.bidWinner, trick: [] };
      }
      if (state.phase === 'trickEnd') {
        if (state.tricksPlayed === mode.handSize) return scoreHand(state);
        return { ...state, phase: 'play', trick: [], turn: state.trickWinner };
      }
      if (state.phase === 'handEnd') {
        if (state.winnerTeam !== null) return { ...state, phase: 'gameOver' };
        return freshHand(state, (state.dealer + 1) % n);
      }
      return state;
    }

    default:
      return state;
  }
}
