import { buildDeck, deal, shuffle } from '../../../cards/deck';
import { legalPlays, winningIndex } from './tricks';
import { Card, Played, Suit, SUITS, SUIT_NAME, effectiveSuit, isBlackJack } from './types';

export const PLAYERS = 4;
export const TARGET = 10;
/** Seat → team. Partners sit across. Seat 0 is always the human. */
export const TEAM_OF = [0, 1, 0, 1];
export const partnerOf = (seat: number): number => (seat + 2) % PLAYERS;

export type Phase =
  | 'dealerDraw' // opening ritual: cards dealt around until the first black jack picks the dealer
  | 'order1'     // round 1: order up the turn card or pass
  | 'order2'     // round 2: name any other suit or pass — dealer is stuck
  | 'discard'    // dealer picked up the turn card, buries one face down
  | 'play'
  | 'trickEnd'   // completed trick shown, waiting for continue
  | 'handEnd'    // hand summary shown, waiting for continue
  | 'gameOver';

export interface HandResult {
  makers: number;      // team that named trump
  maker: number;       // seat that named it
  alone: boolean;
  makerTricks: number;
  euchred: boolean;
  march: boolean;
  deltas: number[];    // per team
}

export interface GameState {
  phase: Phase;
  scores: number[];    // per team, to TARGET
  dealer: number;
  handNumber: number;

  /** The opening black-jack ritual, in deal order; last card is the black jack. */
  drawCards: Played[];

  hands: Card[][];
  /** The three blind kitty cards nobody sees. */
  kitty: Card[];
  /** Face-up card during round 1; null once picked up or turned down. */
  turnCard: Card | null;
  /** Suit flipped down after round 1 — can't be named in round 2. */
  turnedDown: Suit | null;
  /** Dealer's face-down burial after picking up the turn card. */
  discard: Card | null;

  turn: number;
  trump: Suit | null;
  maker: number;       // seat, -1 until trump is named
  alone: boolean;
  /** Seat sitting out (loner's partner), or null. */
  inactive: number | null;

  /**
   * Public knowledge: voids[seat][suitIndex] is true once everyone has seen
   * that seat fail to follow the (effective) suit. Bots may use this — a
   * table would too.
   */
  voids: boolean[][];

  trick: Played[];
  trickWinner: number;
  tricksPlayed: number;
  tricksTaken: number[]; // per team

  handResult: HandResult | null;
  winnerTeam: number | null;
  log: string[];
}

export type GameAction =
  | { type: 'ORDER_UP'; seat: number; alone: boolean }
  | { type: 'NAME_TRUMP'; seat: number; suit: Suit; alone: boolean }
  | { type: 'PASS'; seat: number }
  | { type: 'DISCARD'; seat: number; cardId: string }
  | { type: 'PLAY'; seat: number; cardId: string }
  | { type: 'CONTINUE' };

const log = (state: GameState, msg: string): string[] => [...state.log.slice(-60), msg];

/** Next seat clockwise, skipping a sitting-out loner's partner. */
export function nextActive(state: GameState, from: number): number {
  let seat = (from + 1) % PLAYERS;
  if (seat === state.inactive) seat = (seat + 1) % PLAYERS;
  return seat;
}

export function activePlayers(state: GameState): number {
  return state.inactive === null ? PLAYERS : PLAYERS - 1;
}

function freshHand(state: GameState, dealer: number, rng: () => number = Math.random): GameState {
  const deck = shuffle(buildDeck(1), rng);
  const { hands, kitty } = deal(deck, PLAYERS, 5, 4);
  return {
    ...state,
    phase: 'order1',
    dealer,
    handNumber: state.handNumber + 1,
    hands,
    kitty: kitty.slice(1),
    turnCard: kitty[0],
    turnedDown: null,
    discard: null,
    turn: (dealer + 1) % PLAYERS,
    trump: null,
    maker: -1,
    alone: false,
    inactive: null,
    voids: Array.from({ length: PLAYERS }, () => Array(4).fill(false)),
    trick: [],
    trickWinner: -1,
    tricksPlayed: 0,
    tricksTaken: [0, 0],
    handResult: null,
    log: [...state.log.slice(-60), `— Hand ${state.handNumber + 1} —`],
  };
}

/**
 * Deal cards face up around the table until the first black jack turns up —
 * that player deals. The whole sequence is kept so the UI can animate it.
 */
function dealerDraw(rng: () => number): Played[] {
  const deck = shuffle(buildDeck(1), rng);
  const drawn: Played[] = [];
  for (let i = 0; i < deck.length; i++) {
    drawn.push({ seat: i % PLAYERS, card: deck[i] });
    if (isBlackJack(deck[i])) break;
  }
  return drawn;
}

export function newGame(rng: () => number = Math.random): GameState {
  const drawCards = dealerDraw(rng);
  const dealer = drawCards[drawCards.length - 1].seat;
  return {
    phase: 'dealerDraw',
    scores: [0, 0],
    dealer,
    handNumber: 0,
    drawCards,
    hands: [],
    kitty: [],
    turnCard: null,
    turnedDown: null,
    discard: null,
    turn: 0,
    trump: null,
    maker: -1,
    alone: false,
    inactive: null,
    voids: [],
    trick: [],
    trickWinner: -1,
    tricksPlayed: 0,
    tricksTaken: [],
    handResult: null,
    winnerTeam: null,
    log: [],
  };
}

/** Trump is set; play begins left of the dealer (skipping a sitting-out seat). */
function enterPlay(state: GameState): GameState {
  return { ...state, phase: 'play', trick: [], turn: nextActive(state, state.dealer) };
}

/** Trump named by `seat`: record makers and, if alone, sit the partner out. */
function setTrump(state: GameState, seat: number, suit: Suit, alone: boolean): GameState {
  return {
    ...state,
    trump: suit,
    maker: seat,
    alone,
    inactive: alone ? partnerOf(seat) : null,
    log: log(state, alone
      ? `Seat ${seat} makes it ${SUIT_NAME[suit]} — alone!`
      : `Trump is ${SUIT_NAME[suit]} (seat ${seat}).`),
  };
}

function scoreHand(state: GameState): GameState {
  const makers = TEAM_OF[state.maker];
  const defenders = 1 - makers;
  const makerTricks = state.tricksTaken[makers];
  const euchred = makerTricks < 3;
  const march = makerTricks === 5;

  const deltas = [0, 0];
  if (euchred) deltas[defenders] = 2;
  else if (march) deltas[makers] = state.alone ? 4 : 2;
  else deltas[makers] = 1;

  const scores = state.scores.map((s, t) => s + deltas[t]);
  const winnerTeam = scores[makers] >= TARGET ? makers : scores[defenders] >= TARGET ? defenders : null;

  return {
    ...state,
    scores,
    phase: 'handEnd',
    handResult: { makers, maker: state.maker, alone: state.alone, makerTricks, euchred, march, deltas },
    winnerTeam,
    log: log(state, euchred
      ? `Euchred! Defenders score 2.`
      : march
        ? `March — all five tricks${state.alone ? ' alone, 4 points' : ', 2 points'}.`
        : `Makers take ${makerTricks}, score 1.`),
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ORDER_UP': {
      if (state.phase !== 'order1' || action.seat !== state.turn || !state.turnCard) return state;
      const next = setTrump(state, action.seat, state.turnCard.suit, action.alone);

      // The dealer takes up the turn card and buries one — unless the dealer
      // is the one sitting out (partner went alone), in which case the card
      // stays with the kitty untouched.
      if (next.inactive === state.dealer) {
        return enterPlay({
          ...next,
          kitty: [...state.kitty, state.turnCard],
          turnCard: null,
          log: log(next, `Seat ${action.seat} orders up the ${SUIT_NAME[state.turnCard.suit]} — dealer sits out.`),
        });
      }
      const hands = state.hands.map((h, i) => (i === state.dealer ? [...h, state.turnCard!] : h));
      return {
        ...next,
        hands,
        turnCard: null,
        phase: 'discard',
        turn: state.dealer,
      };
    }

    case 'NAME_TRUMP': {
      if (state.phase !== 'order2' || action.seat !== state.turn) return state;
      if (action.suit === state.turnedDown) return state;
      return enterPlay(setTrump(state, action.seat, action.suit, action.alone));
    }

    case 'PASS': {
      if (action.seat !== state.turn) return state;
      if (state.phase === 'order1') {
        if (action.seat === state.dealer) {
          // Round 1 complete: flip the turn card down, open round 2.
          return {
            ...state,
            phase: 'order2',
            kitty: [...state.kitty, state.turnCard!],
            turnCard: null,
            turnedDown: state.turnCard!.suit,
            turn: (state.dealer + 1) % PLAYERS,
            log: log(state, `Everyone passed — ${SUIT_NAME[state.turnCard!.suit]} is turned down.`),
          };
        }
        return { ...state, turn: (action.seat + 1) % PLAYERS, log: log(state, `Seat ${action.seat} passes.`) };
      }
      if (state.phase === 'order2') {
        // Stick the dealer: the dealer may not pass.
        if (action.seat === state.dealer) return state;
        return { ...state, turn: (action.seat + 1) % PLAYERS, log: log(state, `Seat ${action.seat} passes.`) };
      }
      return state;
    }

    case 'DISCARD': {
      if (state.phase !== 'discard' || action.seat !== state.dealer) return state;
      const hand = state.hands[state.dealer];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card || hand.length !== 6) return state;
      const hands = state.hands.map((h, i) =>
        i === state.dealer ? h.filter((c) => c.id !== card.id) : h);
      return enterPlay({
        ...state,
        hands,
        discard: card,
        log: log(state, `Dealer picks it up and buries a card.`),
      });
    }

    case 'PLAY': {
      if (state.phase !== 'play' || action.seat !== state.turn || action.seat === state.inactive) return state;
      const hand = state.hands[action.seat];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) return state;
      const legal = legalPlays(hand, state.trick, state.trump!);
      if (!legal.some((c) => c.id === card.id)) return state;

      const hands = state.hands.map((h, i) =>
        i === action.seat ? h.filter((c) => c.id !== card.id) : h);
      const trick = [...state.trick, { seat: action.seat, card }];

      let voids = state.voids;
      if (state.trick.length > 0) {
        const led = effectiveSuit(state.trick[0].card, state.trump!);
        if (effectiveSuit(card, state.trump!) !== led) {
          voids = state.voids.map((v) => [...v]);
          voids[action.seat][SUITS.indexOf(led)] = true;
        }
      }

      if (trick.length < activePlayers(state)) {
        return { ...state, hands, trick, voids, turn: nextActive(state, action.seat) };
      }

      const wi = winningIndex(trick, state.trump!);
      const winnerSeat = trick[wi].seat;
      const tricksTaken = [...state.tricksTaken];
      tricksTaken[TEAM_OF[winnerSeat]] += 1;

      return {
        ...state,
        hands,
        trick,
        voids,
        phase: 'trickEnd',
        trickWinner: winnerSeat,
        tricksPlayed: state.tricksPlayed + 1,
        tricksTaken,
      };
    }

    case 'CONTINUE': {
      if (state.phase === 'dealerDraw') {
        return freshHand({ ...state, log: log(state, `Seat ${state.dealer} draws the black jack and deals.`) }, state.dealer);
      }
      if (state.phase === 'trickEnd') {
        if (state.tricksPlayed === 5) return scoreHand(state);
        return { ...state, phase: 'play', trick: [], turn: state.trickWinner };
      }
      if (state.phase === 'handEnd') {
        if (state.winnerTeam !== null) return { ...state, phase: 'gameOver' };
        return freshHand(state, (state.dealer + 1) % PLAYERS);
      }
      return state;
    }

    default:
      return state;
  }
}
