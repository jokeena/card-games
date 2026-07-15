import { useEffect, useMemo, useRef, useState } from 'react';
import { GameAction, GameState } from '../engine/game';
import { partnerOf } from '../engine/modes';
import { legalPlays, winningIndex } from '../engine/tricks';
import { Card, RANK_POWER, Suit, SUITS, SUIT_SYMBOL, isCounter, isRed } from '../engine/types';
import { CardView } from './CardView';

const SEAT_POS: Record<number, [number, number][]> = {
  3: [[50, 100], [10, 52], [90, 52]],
  4: [[50, 100], [8, 50], [50, 16], [92, 50]],
  5: [[50, 100], [7, 64], [22, 15], [78, 15], [93, 64]],
  6: [[50, 100], [7, 62], [26, 14], [50, 14], [74, 14], [93, 62]],
};

/* Portrait phone: the felt is tall and narrow, so seats hug the top arc
   and the sides sit lower where there's width to spare. */
const MOBILE_SEAT_POS: Record<number, [number, number][]> = {
  3: [[50, 100], [14, 34], [86, 34]],
  4: [[50, 100], [11, 44], [50, 18], [89, 44]],
  5: [[50, 100], [9, 54], [26, 19], [74, 19], [91, 54]],
  6: [[50, 100], [9, 58], [26, 19], [50, 18], [74, 19], [91, 58]],
};

export const TEAM_COLORS = ['#53b4e8', '#f0a53c', '#b26fd1', '#6dbf73', '#e06868'];

/**
 * Where each seat's played card rests, in px from the table center.
 * Tight cluster, but spaced so full-size cards (76x108) never overlap.
 */
const TRICK_OFFSET: Record<number, [number, number][]> = {
  3: [[0, 64], [-92, -32], [92, -32]],
  4: [[0, 76], [-94, 0], [0, -52], [94, 0]],
  5: [[0, 86], [-132, 12], [-46, -54], [46, -54], [132, 12]],
  6: [[0, 58], [-90, 58], [-90, -56], [0, -56], [90, -56], [90, 58]],
};

/* Tighter clusters for the smaller mobile cards (58px wide). The 3P trick
   sits low (side seats' fans reach the old height); 5P side cards tuck down
   and inward, clear of the left/right players' fans. */
const MOBILE_TRICK_OFFSET: Record<number, [number, number][]> = {
  3: [[0, 66], [-64, 4], [64, 4]],
  4: [[0, 62], [-68, 0], [0, -46], [68, 0]],
  5: [[0, 66], [-80, 26], [-36, -48], [36, -48], [80, 26]],
  6: [[0, 48], [-66, 48], [-66, -46], [0, -46], [66, -46], [66, 48]],
};

/** True on phone-sized viewports; drives the alternate seat geometry. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 740px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 740px)');
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

interface Props {
  state: GameState;
  names: string[];
  dispatch: (a: GameAction) => void;
}

interface Flight {
  key: number;
  from: number;
  to: number;
  count: number;
}

/**
 * Order the suits actually held so that colors alternate — that outranks
 * everything else, including where trump sits (S-H-D with spades trump must
 * become D-S-H or H-S-D, never reds together). Trump-first is only a
 * tiebreak among perfect arrangements. Decided from `basis` (the full hand
 * at the start of play), so the order never reshuffles mid-round as suits
 * run out.
 */
const SUIT_WHEEL: Suit[] = ['C', 'D', 'S', 'H'];

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

export function suitOrder(trump: Suit | null, basis: Card[]): Suit[] {
  const presentSet = new Set(basis.map((c) => c.suit));
  const present = SUIT_WHEEL.filter((s) => presentSet.has(s));
  let best: Suit[] = present;
  let bestKey = Infinity;
  for (const perm of permutations(present)) {
    let touches = 0;
    for (let i = 1; i < perm.length; i++) {
      if (isRed(perm[i]) === isRed(perm[i - 1])) touches++;
    }
    const trumpFirst = trump && perm[0] === trump ? 0 : 1;
    const key = touches * 10 + trumpFirst;
    if (key < bestKey) {
      bestKey = key;
      best = perm;
    }
  }
  return [...best, ...SUIT_WHEEL.filter((s) => !presentSet.has(s))];
}

function sortHand(hand: Card[], trump: Suit | null, basis: Card[] = hand): Card[] {
  const order = suitOrder(trump, basis.length > 0 ? basis : hand);
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(a.suit);
    const sb = order.indexOf(b.suit);
    if (sa !== sb) return sa - sb;
    if (RANK_POWER[a.rank] !== RANK_POWER[b.rank]) return RANK_POWER[b.rank] - RANK_POWER[a.rank];
    return a.id < b.id ? -1 : 1;
  });
}

export function teamName(state: GameState, names: string[], team: number): string {
  const seats = state.mode.teams
    .map((t, s) => (t === team ? s : -1))
    .filter((s) => s >= 0);
  return seats.map((s) => names[s]).join(' & ');
}

function isActing(state: GameState, seat: number, partner: number | null): boolean {
  switch (state.phase) {
    case 'bidding':
    case 'play':
      return state.turn === seat;
    case 'trump':
    case 'discard':
    case 'pass2':
      return state.bidWinner === seat;
    case 'pass1':
      return partner === seat;
    default:
      return false;
  }
}

/**
 * Jester watermark woven into the felt until trump is named — one connected
 * figure: a three-point belled cap with ridge lines, headband, grinning face,
 * and a ruff collar tucked under the chin, all in the cloth's ghost-white.
 */
function JokerMark() {
  const ink = 'rgba(255, 255, 255, 0.055)';
  const glint = 'rgba(255, 255, 255, 0.09)';
  const shade = 'rgba(0, 40, 10, 0.12)';
  return (
    <svg className="felt-joker" viewBox="0 0 140 150" aria-hidden="true">
      {/* cap: three points rising from the headband as one piece */}
      <path
        d="M52 76
           C38 70 28 58 22 42
           C21 38 24 34 28 37
           C36 44 44 52 50 60
           C50 44 56 26 67 13
           C69 10 71 10 73 13
           C84 26 90 44 90 60
           C96 52 104 44 112 37
           C116 34 119 38 118 42
           C112 58 102 70 88 76
           Q70 84 52 76 Z"
        fill={ink}
      />
      {/* ridge lines marking the three points */}
      <path
        d="M58 70 C48 60 38 50 29 40 M70 74 C70 52 70 32 70 16 M82 70 C92 60 102 50 111 40"
        fill="none" stroke={shade} strokeWidth="1.6"
      />
      {/* bells */}
      <circle cx="26" cy="39" r="5" fill={glint} />
      <circle cx="70" cy="12" r="5" fill={glint} />
      <circle cx="114" cy="39" r="5" fill={glint} />
      {/* headband */}
      <path d="M50 78 Q70 70 90 78 L90 84 Q70 76 50 84 Z" fill={glint} />
      {/* face, tucked under the band */}
      <ellipse cx="70" cy="97" rx="16.5" ry="15.5" fill={ink} />
      <circle cx="63.5" cy="94" r="2" fill={shade} />
      <circle cx="76.5" cy="94" r="2" fill={shade} />
      <path d="M61 102 Q70 109 79 102" fill="none" stroke={shade} strokeWidth="2.2" strokeLinecap="round" />
      {/* ruff collar under the chin, with a hanging bell */}
      <path
        d="M44 116 Q70 106 96 116 L88 128 L79 118 L70 130 L61 118 L52 128 Z"
        fill={glint}
      />
      <circle cx="70" cy="135" r="3.4" fill={ink} />
    </svg>
  );
}

/** Face-down cards strewn about, one per trick taken. */
function Strewn({ count }: { count: number }) {
  const n = Math.min(count, 9);
  return (
    <div className="strewn">
      {Array.from({ length: n }).map((_, i) => (
        <i key={i} style={{
          transform: `translate(${((i * 37) % 30) - 15}px, ${((i * 53) % 18) - 9}px) rotate(${((i * 67) % 52) - 26}deg)`,
        }} />
      ))}
    </div>
  );
}

export function GameTable({ state, names, dispatch }: Props) {
  const { mode } = state;
  const narrow = useIsNarrow();
  const positions = (narrow ? MOBILE_SEAT_POS : SEAT_POS)[mode.players];
  const trickOffsets = (narrow ? MOBILE_TRICK_OFFSET : TRICK_OFFSET)[mode.players];
  const [selection, setSelection] = useState<string[]>([]);
  const [collect, setCollect] = useState(false);
  const [ackReturn, setAckReturn] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const prevPhase = useRef(state.phase);
  const flightKey = useRef(0);

  useEffect(() => setSelection([]), [state.phase, state.handNumber]);
  useEffect(() => {
    if (state.phase !== 'meld') setAckReturn(false);
  }, [state.phase, state.handNumber]);

  // The flipped kitty is pure render state — no timers. The human bidder
  // studies it until they name trump; a bot's kitty parks at the top of the
  // table until the human clicks "Play hand" (mobile hides it once the
  // stacked meld needs the space).
  const kittyUp = mode.kittySize > 0 && state.kitty.length > 0 && state.bidWinner >= 0 &&
    (state.bidWinner === 0
      ? state.phase === 'trump'
      : state.phase === 'trump' || state.phase === 'discard' ||
        (state.phase === 'meld' && !narrow));

  // Trick pickup: let the completed trick sit in the middle, then sweep it to the winner.
  useEffect(() => {
    if (state.phase === 'trickEnd') {
      setCollect(false);
      const t = setTimeout(() => setCollect(true), 750);
      return () => clearTimeout(t);
    }
    setCollect(false);
  }, [state.phase, state.tricksPlayed]);

  // Card-pass flights between partner and bid winner. Removal timers live in
  // a ref cleared only on unmount — an effect-cleanup timer would be cancelled
  // by the next phase change (bots return cards in 500ms) and strand the
  // spent flight in the list forever.
  const flightTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = state.phase;
    if (mode.passCount === 0 || state.bidWinner < 0) return;
    const partnerSeat = partnerOf(mode, state.bidWinner);
    if (partnerSeat === null) return;

    let flight: Flight | null = null;
    if (prev === 'pass1' && state.phase === 'pass2') {
      flight = { key: flightKey.current++, from: partnerSeat, to: state.bidWinner, count: mode.passCount };
    } else if (prev === 'pass2' && state.phase === 'meld') {
      flight = { key: flightKey.current++, from: state.bidWinner, to: partnerSeat, count: mode.passCount };
    }
    if (flight) {
      const f = flight;
      setFlights((fs) => [...fs, f]);
      const t = setTimeout(() => {
        flightTimers.current.delete(t);
        setFlights((fs) => fs.filter((x) => x.key !== f.key));
      }, 1100);
      flightTimers.current.add(t);
    }
  }, [state.phase, state.bidWinner, mode]);
  useEffect(() => {
    const timers = flightTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const partner = state.bidWinner >= 0 ? partnerOf(mode, state.bidWinner) : null;

  const humanNeedsPick =
    (state.phase === 'discard' && state.bidWinner === 0) ||
    (state.phase === 'pass1' && partner === 0) ||
    (state.phase === 'pass2' && state.bidWinner === 0);
  const pickCount = state.phase === 'discard' ? mode.kittySize : mode.passCount;

  const humanTurnToPlay = state.phase === 'play' && state.turn === 0;
  const legal = useMemo(
    () => (humanTurnToPlay ? legalPlays(state.hands[0], state.trick, state.trump!) : []),
    [state, humanTurnToPlay],
  );
  const legalIds = new Set(legal.map((c) => c.id));

  const isReview = state.phase === 'handReview';
  // Suit-order direction is anchored to the full hand at the start of play,
  // so the display never reshuffles as suits run out mid-round.
  const orderBasis = state.playHands[0]?.length ? state.playHands[0] : state.hands[0] ?? [];
  const hand = sortHand((isReview ? state.playHands[0] : state.hands[0]) ?? [], state.trump, orderBasis);
  const humanActive = isActing(state, 0, partner) || humanTurnToPlay;
  // Partner won the bid and returned cards: show those first, meld after "OK".
  const returnPending =
    state.phase === 'meld' && partner === 0 && state.passBuffer.length > 0 && !ackReturn;
  const meldVisible = state.phase === 'meld' && !returnPending;
  const meldKnown = state.melds.some((m) => m !== null);

  const toggleSelect = (id: string) => {
    setSelection((sel) =>
      sel.includes(id) ? sel.filter((s) => s !== id)
        : sel.length < pickCount ? [...sel, id] : sel);
  };

  const confirmPick = () => {
    if (selection.length !== pickCount) return;
    if (state.phase === 'discard') dispatch({ type: 'DISCARD', seat: 0, cardIds: selection });
    else dispatch({ type: 'PASS_CARDS', seat: 0, cardIds: selection });
  };

  const onCardClick = (card: Card) => {
    if (humanNeedsPick) toggleSelect(card.id);
    else if (humanTurnToPlay && legalIds.has(card.id)) {
      dispatch({ type: 'PLAY', seat: 0, cardId: card.id });
    }
  };

  const trickCount = (team: number) =>
    state.captured[team] ? Math.floor(state.captured[team].length / mode.players) : 0;

  const teamMeld = (team: number) =>
    state.melds.reduce((sum, m, seat) => (mode.teams[seat] === team ? sum + (m?.total ?? 0) : sum), 0);

  // Live trick points: captured counters are public. Buried kitty counters
  // are the bidder's secret, so they only show when the human buried them.
  const trickPoints = (team: number) => {
    let pts = state.captured[team]?.filter(isCounter).length ?? 0;
    if (state.bidWinner === 0 && team === mode.teams[0]) {
      pts += state.discard.filter(isCounter).length;
    }
    return pts;
  };
  const showPts = state.phase === 'play' || state.phase === 'trickEnd' || state.phase === 'handReview';
  const showMeld = meldKnown && state.phase !== 'handEnd' && state.phase !== 'gameOver';

  const meldCardsFor = (seat: number): Card[] => {
    const m = state.melds[seat];
    if (!m) return [];
    const idSet = new Set(m.cardIds);
    return sortHand(
      state.hands[seat].filter((c) => idSet.has(c.id)),
      state.trump,
      state.playHands[seat] ?? [],
    );
  };

  const statusText = (() => {
    switch (state.phase) {
      case 'trump':
        return state.bidWinner === 0
          ? `You take the bid at ${state.highBid}. Name trump.`
          : `${names[state.bidWinner]} takes the bid at ${state.highBid} and is naming trump…`;
      case 'discard':
        return state.bidWinner === 0 ? '' : `${names[state.bidWinner]} is burying the kitty…`;
      case 'pass1':
        return partner === 0 ? '' : `${names[partner!]} is passing cards…`;
      case 'pass2':
        return state.bidWinner === 0 ? '' : `${names[state.bidWinner]} is passing back…`;
      case 'play':
        return state.turn === 0 ? 'Your play.' : '';
      case 'trickEnd':
        return `${names[state.trickWinner]} take${state.trickWinner === 0 ? '' : 's'} the trick.`;
      default:
        return '';
    }
  })();

  const isTrickEnd = state.phase === 'trickEnd';
  // Sheet listing order: around the table, the human last.
  const sheetSeats = Array.from({ length: mode.players }, (_, s) => s)
    .filter((s) => s !== 0)
    .concat(0);

  return (
    <div className="table-wrap">
      <div className="felt" data-mark={state.trump ? SUIT_SYMBOL[state.trump] : ''}>
        {!state.trump && <JokerMark />}
        {/* Scoreboard */}
        <div className="board">
          <div className="board-head">
            <span>First to {mode.target}</span>
            {state.trump && (
              <span className={`board-trump ${isRed(state.trump) ? 'suit-red' : ''}`}>
                {SUIT_SYMBOL[state.trump]}
              </span>
            )}
          </div>
          {!narrow && (showMeld || showPts) && (
            <div className="board-row board-labels" aria-hidden="true">
              <span className="team-dot" />
              <span className="board-name" />
              {showMeld && <span className="board-col">Meld</span>}
              {showPts && <span className="board-col board-col-pts">Pts</span>}
              <span className="board-score" />
            </div>
          )}
          {!narrow && state.scores.map((score, team) => (
            <div key={team} className="board-row">
              <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
              <span className="board-name">{teamName(state, names, team)}</span>
              {showMeld && (
                <span className="board-col board-col-meld" title="Meld this hand">{teamMeld(team)}</span>
              )}
              {showPts && (
                <span className="board-col board-col-pts" title="Trick points so far">{trickPoints(team)}</span>
              )}
              <span className="board-score">{score}</span>
            </div>
          ))}
          {/* Phones: one column block per team — meld and points line up
              right under the team's score, labels down the left side. */}
          {narrow && (
            <div className={`board-cols${state.scores.length >= 4 ? ' bc-tight' : ''}`}>
              {(showMeld || showPts) && (
                <span className="bc-labels" aria-hidden="true">
                  <span className="bc-line" />
                  {showMeld && <span className="bc-line bc-lab">Meld</span>}
                  {showPts && <span className="bc-line bc-lab">Pts</span>}
                </span>
              )}
              {state.scores.map((score, team) => (
                <span key={team} className="bc-team">
                  <span className="bc-line">
                    <span className="team-dot" style={{ background: TEAM_COLORS[team] }} />
                    <span className="bc-name">{teamName(state, names, team)}</span>
                    <span className="bc-score">{score}</span>
                  </span>
                  {showMeld && <span className="bc-line bc-val">{teamMeld(team)}</span>}
                  {showPts && <span className="bc-line bc-val bc-pts">{trickPoints(team)}</span>}
                </span>
              ))}
            </div>
          )}
          {state.highSeat >= 0 && state.phase !== 'gameOver' && (
            <div className="board-bid">
              Bid {state.highBid} — {names[state.bidWinner >= 0 ? state.bidWinner : state.highSeat]}
            </div>
          )}
        </div>

        {/* Opponent seats */}
        {positions.map(([x, y], seat) => seat !== 0 && (
          <div key={seat} className="seat" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className={[
              'avatar',
              isActing(state, seat, partner) ? 'avatar-active' : '',
              state.phase === 'bidding' && state.passed[seat] ? 'avatar-passed' : '',
              state.bidWinner === seat && state.phase !== 'bidding' && state.phase !== 'gameOver' ? 'avatar-bid' : '',
            ].filter(Boolean).join(' ')}
              style={{ ['--team' as string]: TEAM_COLORS[mode.teams[seat]] }}>
              {names[seat][0]}
              {state.dealer === seat && <span className="chip chip-dealer">D</span>}
              {state.bidWinner === seat && state.phase !== 'bidding' && state.phase !== 'gameOver' && (
                <span className="chip chip-bid">{state.highBid}</span>
              )}
            </div>
            <div className="seat-name">{names[seat]}</div>
            <div className="seat-fan">
              {state.hands[seat]?.slice(0, narrow ? 10 : 12).map((c, i, arr) => (
                <div key={c.id} className="fan-back"
                  style={{ transform: `rotate(${(i - (arr.length - 1) / 2) * 5}deg)` }} />
              ))}
            </div>
            {state.phase === 'bidding' && (
              state.passed[seat]
                ? <div className="seat-bubble bubble-pass">Passed</div>
                : <div className="seat-bubble">{state.bids[seat] !== null ? `Bid ${state.bids[seat]}` : ''}</div>
            )}
            {trickCount(mode.teams[seat]) > 0 && (
              <div className="seat-strewn"><Strewn count={trickCount(mode.teams[seat])} /></div>
            )}
          </div>
        ))}

        {/* Meld laid out on the table. Six-handed, the three top seats sit so
            close that centered rows collide — spread the side melds outward
            and drop the middle one toward the table center. */}
        {meldVisible && !narrow && positions.map(([sx, sy], seat) => {
          const cards = meldCardsFor(seat);
          if (cards.length === 0) return null;
          const spread = mode.players === 6 ? 0.12 : 0.42;
          const mx = sx + (50 - sx) * spread;
          const deep = mode.players === 6 && seat === 3 ? 1.05 : 0.72;
          const my = sy + (44 - sy) * (seat === 0 ? 0.4 : deep);
          return (
            <div key={`meld-${seat}`} className="meld-row" style={{ left: `${mx}%`, top: `${my}%` }}>
              <span className="meld-row-badge">{state.melds[seat]!.total}</span>
              {cards.map((c) => <CardView key={c.id} card={c} size="mid" />)}
            </div>
          );
        })}

        {/* Portrait phones: meld strewn on a tall narrow felt is unreadable,
            so it opens as a full sheet over the table instead — one row per
            player, Play hand at the bottom. */}
        {meldVisible && narrow && (
          <div className="table-sheet meld-sheet">
            <div className="sheet-title">Meld</div>
            <div className="sheet-body">
              {sheetSeats.map((seat) => {
                const cards = meldCardsFor(seat);
                return (
                  <div key={`msheet-${seat}`} className="sheet-row">
                    <div className="sheet-row-head">
                      <span className="team-dot" style={{ background: TEAM_COLORS[mode.teams[seat]] }} />
                      {seat === 0 ? 'You' : names[seat]}
                      <span className="sheet-total">{state.melds[seat]?.total ?? 0}</span>
                    </div>
                    {cards.length > 0 && (
                      <div className="sheet-cards">
                        {cards.map((c) => <CardView key={c.id} card={c} size="mid" />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bid-controls sheet-actions">
              <button className="btn btn-gold" onClick={() => dispatch({ type: 'CONTINUE' })}>
                Play hand
              </button>
              {state.bidWinner === 0 && (
                <button className="btn btn-muted" onClick={() => dispatch({ type: 'THROW_IN', seat: 0 })}>
                  Go set (−{state.highBid})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Trick */}
        <div className="trick-area">
          {state.trick.map((p, i) => {
            const [sx, sy] = positions[p.seat];
            const [ox, oy] = trickOffsets[p.seat];
            const doCollect = isTrickEnd && collect;
            const [wx, wy] = doCollect ? positions[state.trickWinner] : [0, 0];
            const leading = (state.phase === 'play' || isTrickEnd) &&
              i === winningIndex(state.trick, state.trump!);
            return (
              <div
                key={p.card.id}
                className={[
                  'trick-card',
                  doCollect ? 'trick-collect' : '',
                  leading ? 'trick-leading' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  left: doCollect ? `${wx}%` : `calc(50% + ${ox}px)`,
                  top: doCollect ? `${Math.min(wy, 88)}%` : `calc(52% + ${oy}px)`,
                  ['--fx' as string]: `${sx}%`,
                  ['--fy' as string]: `${Math.min(sy, 96)}%`,
                  ['--rot' as string]: `${((p.seat * 47 + i * 13) % 9) - 4}deg`,
                }}
              >
                <CardView card={p.card} />
              </div>
            );
          })}

          {/* Passed cards in flight */}
          {flights.map((f) =>
            Array.from({ length: f.count }).map((_, i) => (
              <div key={`${f.key}-${i}`} className="flight-card" style={{
                ['--fx' as string]: `${positions[f.from][0]}%`,
                ['--fy' as string]: `${Math.min(positions[f.from][1], 94)}%`,
                ['--tx' as string]: `${positions[f.to][0]}%`,
                ['--ty' as string]: `${Math.min(positions[f.to][1], 94)}%`,
                animationDelay: `${i * 80}ms`,
              }} />
            )))}

          {state.phase === 'bidding' && mode.kittySize > 0 && (
            <div className="kitty-display">
              <div className="kitty-cards">
                {Array.from({ length: mode.kittySize }).map((_, i) => (
                  <div key={i} className="fan-back" />
                ))}
              </div>
              <span>kitty</span>
            </div>
          )}
        </div>

        {/* The kitty, flipped face-up for everyone once the auction ends */}
        {kittyUp && (
          <div className={`kitty-reveal ${state.bidWinner === 0 ? '' : 'kitty-north'}`}>
            <div className="received-label">
              {state.bidWinner === 0 ? 'Your kitty' : `${names[state.bidWinner]} takes the kitty`}
            </div>
            <div className="received-cards">
              {state.kitty.map((c) => (
                <CardView key={c.id} card={c} size={state.bidWinner === 0 ? 'mid' : 'small'} />
              ))}
            </div>
          </div>
        )}

        {/* Cards the human just received from a pass */}
        {state.passBuffer.length > 0 && state.phase === 'pass2' && state.bidWinner === 0 && (
          <div className="received-row">
            <div className="received-label">{names[partner!]} passed you</div>
            <div className="received-cards">
              {state.passBuffer.map((c) => <CardView key={c.id} card={c} size="mid" />)}
            </div>
          </div>
        )}

        {/* Partner returned cards: acknowledge before the meld is revealed */}
        {returnPending && (
          <div className="received-row received-ack">
            <div className="received-label">{names[state.bidWinner]} returned to you</div>
            <div className="received-cards">
              {state.passBuffer.map((c) => <CardView key={c.id} card={c} size="mid" />)}
            </div>
            <button className="btn btn-gold" onClick={() => setAckReturn(true)}>
              OK — show the meld
            </button>
          </div>
        )}

        {/* End of hand: everyone's cards from the start of play, face up. */}
        {isReview && !narrow && positions.map(([sx, sy], seat) => {
          if (seat === 0) return null;
          const cards = sortHand(state.playHands[seat] ?? [], state.trump);
          if (cards.length === 0) return null;
          const rx = sx + (50 - sx) * (mode.players === 6 ? 0.2 : 0.52);
          const ry = sy + (47 - sy) * 0.6;
          return (
            <div key={`review-${seat}`} className="review-row" style={{ left: `${rx}%`, top: `${ry}%` }}>
              <span className="review-name">{names[seat]}</span>
              <div className="review-cards">
                {cards.map((c) => <CardView key={c.id} card={c} size="small" />)}
              </div>
            </div>
          );
        })}
        {isReview && !narrow && (
          <div className="action-panel review-panel">
            <div className="panel-label">
              {state.claimedBy !== null
                ? `${state.claimedBy === 0 ? 'You take' : `${names[state.claimedBy]} takes`} the rest of the tricks`
                : 'The hands, as played this round'}
            </div>
            <button className="btn btn-gold" onClick={() => dispatch({ type: 'CONTINUE' })}>
              Show the score
            </button>
          </div>
        )}

        {/* Portrait phones: the review opens as a full sheet, every hand
            (yours included) listed by player. */}
        {isReview && narrow && (
          <div className="table-sheet review-sheet">
            <div className="sheet-title">The hands, as played</div>
            {state.claimedBy !== null && (
              <div className="sheet-sub">
                {state.claimedBy === 0 ? 'You take' : `${names[state.claimedBy]} takes`} the rest of the tricks
              </div>
            )}
            <div className="sheet-body">
              {sheetSeats.map((seat) => {
                const cards = sortHand(state.playHands[seat] ?? [], state.trump);
                if (cards.length === 0) return null;
                return (
                  <div key={`rsheet-${seat}`} className="sheet-row">
                    <div className="sheet-row-head">
                      <span className="team-dot" style={{ background: TEAM_COLORS[mode.teams[seat]] }} />
                      {seat === 0 ? 'You' : names[seat]}
                    </div>
                    <div className="sheet-cards">
                      {cards.map((c) => <CardView key={c.id} card={c} size="small" />)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bid-controls sheet-actions">
              <button className="btn btn-gold" onClick={() => dispatch({ type: 'CONTINUE' })}>
                Show the score
              </button>
            </div>
          </div>
        )}

        {statusText && <div className="status-bar">{statusText}</div>}

        {state.phase === 'bidding' && state.turn === 0 && (
          <BidPanel state={state} dispatch={dispatch} />
        )}
        {state.phase === 'trump' && state.bidWinner === 0 && (
          <div className="action-panel">
            <div className="panel-label">Name trump</div>
            <div className="suit-buttons">
              {SUITS.map((s) => (
                <button key={s} className={`suit-btn ${isRed(s) ? 'suit-red' : ''}`}
                  onClick={() => dispatch({ type: 'NAME_TRUMP', seat: 0, suit: s })}>
                  {SUIT_SYMBOL[s]}
                </button>
              ))}
            </div>
          </div>
        )}
        {humanNeedsPick && (
          <div className="pass-tray">
            {/* Trump reminder: passing to the winner, you didn't name it */}
            {state.phase === 'pass1' && state.trump && (
              <span className={`tray-trump ${isRed(state.trump) ? 'suit-red' : ''}`}>
                {SUIT_SYMBOL[state.trump]}
              </span>
            )}
            <div className="tray-label">
              {state.phase === 'discard'
                ? `Bury ${pickCount} cards`
                : state.phase === 'pass1'
                  ? `Pass ${pickCount} to ${names[state.bidWinner]}`
                  : `Pass ${pickCount} back to ${names[partner!]}`}
            </div>
            <div className="tray-slots">
              {Array.from({ length: pickCount }).map((_, i) => {
                const id = selection[i];
                const card = id ? state.hands[0].find((c) => c.id === id) : undefined;
                return card ? (
                  <div key={id} className="tray-card" onClick={() => toggleSelect(id!)}>
                    <CardView card={card} size="mid" />
                  </div>
                ) : (
                  <div key={`empty-${i}`} className="tray-empty" />
                );
              })}
            </div>
            <button className="btn btn-confirm" disabled={selection.length !== pickCount} onClick={confirmPick}>
              {state.phase === 'discard' ? 'Bury' : 'Pass'}
            </button>
          </div>
        )}
        {state.phase === 'meld' && !returnPending && !narrow && (
          <div className="action-panel meld-panel">
            <div className="bid-controls">
              <button className="btn btn-gold" onClick={() => dispatch({ type: 'CONTINUE' })}>
                Play hand
              </button>
              {state.bidWinner === 0 && (
                <button className="btn btn-muted" onClick={() => dispatch({ type: 'THROW_IN', seat: 0 })}>
                  Go set (−{state.highBid})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Human hand */}
      <div className="hand-row">
        <div className="hand-side">
          <div className={[
            'avatar avatar-you',
            humanActive ? 'avatar-active' : '',
            state.bidWinner === 0 && state.phase !== 'bidding' && state.phase !== 'gameOver' ? 'avatar-bid' : '',
          ].filter(Boolean).join(' ')}
            style={{ ['--team' as string]: TEAM_COLORS[mode.teams[0]] }}>
            You
            {state.dealer === 0 && <span className="chip chip-dealer">D</span>}
            {state.bidWinner === 0 && state.phase !== 'bidding' && state.phase !== 'gameOver' && (
              <span className="chip chip-bid">{state.highBid}</span>
            )}
          </div>
          {state.phase === 'bidding' && (
            state.passed[0]
              ? <div className="seat-bubble bubble-pass">Passed</div>
              : state.bids[0] !== null && <div className="seat-bubble">Bid {state.bids[0]}</div>
          )}
        </div>
        <div className="hand-cards">
          {(humanNeedsPick ? hand.filter((c) => !selection.includes(c.id)) : hand).map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ ['--i' as string]: i }}>
              <CardView
                card={c}
                selected={selection.includes(c.id)}
                dimmed={humanTurnToPlay && !legalIds.has(c.id)}
                onClick={
                  humanNeedsPick || (humanTurnToPlay && legalIds.has(c.id))
                    ? () => onCardClick(c)
                    : undefined
                }
              />
            </div>
          ))}
        </div>
        {/* Always rendered so the hand row never re-centers when the first trick lands */}
        <div className="hand-side">
          <Strewn count={trickCount(mode.teams[0])} />
        </div>
      </div>
    </div>
  );
}

function BidPanel({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const min = state.highSeat === -1 ? state.mode.bidStart : state.highBid + 1;
  const [amount, setAmount] = useState(min);
  useEffect(() => setAmount(min), [min]);

  return (
    <div className="action-panel bid-panel">
      <div className="bid-controls">
        <button className="bid-pass" onClick={() => dispatch({ type: 'PASS_BID', seat: 0 })}>
          Pass
        </button>
        <button className="bid-step" disabled={amount <= min}
          onClick={() => setAmount((a) => Math.max(min, a - 1))}>−</button>
        <button className="bid-main" onClick={() => dispatch({ type: 'BID', seat: 0, amount })}>
          Bid {amount}
        </button>
        <button className="bid-step" onClick={() => setAmount((a) => a + 1)}>+</button>
      </div>
    </div>
  );
}
